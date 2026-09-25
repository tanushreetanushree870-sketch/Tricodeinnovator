import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { upload, handleMulterError } from '../middleware/upload.js';
import { query } from '../db/database.js';
import {
  generateEmbedding,
  generateBatchEmbeddings,
  extractResearchMetadata,
  summarizeWebContent,
} from '../services/gemini.js';
import { chunkText, extractTextFromPDF, extractTextFromFile } from '../utils/textProcessing.js';

const router = express.Router();

// All ingest routes require authentication
router.use(authenticate);

/**
 * Helper: Store chunks with embeddings for a source
 */
const storeSourceChunks = async (sourceId, chunks, embeddings) => {
  const insertPromises = chunks.map((chunk, i) => {
    const embedding = embeddings[i];
    const embeddingStr = `[${embedding.join(',')}]`;
    return query(
      `INSERT INTO source_embeddings (source_id, chunk_content, page_or_timestamp, embedding)
       VALUES ($1, $2, $3, $4)`,
      [sourceId, chunk.content, chunk.pageRef, embeddingStr]
    );
  });

  await Promise.all(insertPromises);
};

/**
 * POST /api/v1/ingest/file
 * Multi-file upload: PDF, PPT, Audio, Text
 * Processes and vectorizes uploaded research materials
 */
router.post('/file', upload.array('files', 10), handleMulterError, async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded.' });
  }

  const results = [];
  const errors = [];

  for (const file of req.files) {
    let sourceId = null;
    const title = file.originalname.replace(/\.[^/.]+$/, '');
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    let sourceType = 'text';
    if (ext === '.pdf') sourceType = 'pdf';
    else if (['.ppt', '.pptx'].includes(ext)) sourceType = 'ppt';
    else if (['.mp3', '.mp4', '.wav', '.ogg', '.webm'].includes(ext)) sourceType = 'audio';

    try {
      // 1. Create initial source record in "processing" state
      const initialSource = await query(
        `INSERT INTO uploaded_sources (user_id, source_type, title, file_size, processing_status)
         VALUES ($1, $2, $3, $4, 'processing')
         RETURNING id, title, source_type, created_at`,
        [req.user.id, sourceType, title, file.size || 0]
      );
      sourceId = initialSource.rows[0].id;

      // 2. Extract text based on file type
      let rawText = '';
      if (ext === '.pdf') {
        try {
          const pdfData = await extractTextFromPDF(file.buffer);
          rawText = pdfData.text || '';
        } catch (pdfErr) {
          console.warn(`PDF extraction fallback for ${file.originalname}:`, pdfErr.message);
          rawText = file.buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
          if (rawText.length < 50) {
            throw new Error(`PDF parse failed: ${pdfErr.message}`);
          }
        }
      } else if (['.ppt', '.pptx'].includes(ext)) {
        rawText = file.buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
        if (rawText.length < 100) {
          rawText = `Presentation slides: ${file.originalname}. Analysis based on presentation asset.`;
        }
      } else if (['.mp3', '.mp4', '.wav', '.ogg', '.webm'].includes(ext)) {
        rawText = `Audio recording: ${file.originalname}. Audio media research asset.`;
      } else {
        rawText = extractTextFromFile(file.buffer, file.mimetype) || file.buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Document contained no readable text.');
      }

      // 3. Extract structured metadata with timeout & fallback
      let parsedMetadata = {};
      if (rawText.length > 50) {
        try {
          parsedMetadata = await extractResearchMetadata(rawText, title);
        } catch (metaErr) {
          console.warn(`Metadata extraction notice for ${title}:`, metaErr.message);
        }
      }

      // 4. Chunk text and generate embeddings
      const chunks = chunkText(rawText);
      if (chunks.length > 0) {
        const chunkTexts = chunks.map(c => c.content);
        const embeddings = await generateBatchEmbeddings(chunkTexts);
        await storeSourceChunks(sourceId, chunks, embeddings);
      }

      // 5. Update source record to "completed" state
      await query(
        `UPDATE uploaded_sources
         SET raw_text = $1, parsed_metadata = $2, processing_status = 'completed', error_message = NULL
         WHERE id = $3`,
        [rawText, JSON.stringify(parsedMetadata || {}), sourceId]
      );

      results.push({
        id: sourceId,
        title,
        source_type: sourceType,
        created_at: initialSource.rows[0].created_at,
        processing_status: 'completed',
        metadata: parsedMetadata,
        chunks_created: chunks.length,
      });
    } catch (fileError) {
      console.error(`Error processing file ${file.originalname}:`, fileError.message);
      errors.push({ filename: file.originalname, error: fileError.message });

      // If source record was created, mark as failed rather than losing it
      if (sourceId) {
        try {
          await query(
            `UPDATE uploaded_sources
             SET processing_status = 'failed', error_message = $1
             WHERE id = $2`,
            [fileError.message, sourceId]
          );
        } catch (dbErr) {
          console.error('Failed updating source error status:', dbErr.message);
        }
      }
    }
  }

  res.status(201).json({
    success: results.length > 0 || errors.length === 0,
    message: results.length > 0
      ? `Processed ${results.length} file(s) successfully.${errors.length > 0 ? ` ${errors.length} failed.` : ''}`
      : `Processing failed: ${errors[0]?.error || 'Unknown error'}`,
    data: { results, errors },
  });
});

// URL ingest schema
const urlIngestSchema = z.object({
  url: z.string().url('Invalid URL'),
  source_type: z.enum(['youtube', 'web']).default('web'),
});

/**
 * POST /api/v1/ingest/url
 * Ingest YouTube transcripts or web page content
 */
router.post('/url', async (req, res) => {
  const validation = urlIngestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validation.error.errors,
    });
  }

  const { url, source_type } = validation.data;

  try {
    let rawText = '';
    let title = url;
    let parsedMetadata = {};

    if (source_type === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      // Extract YouTube video ID
      let videoId = '';
      const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      if (ytMatch) videoId = ytMatch[1];

      try {
        const { YoutubeTranscript } = await import('youtube-transcript');
        const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
        rawText = transcriptItems.map(t => t.text).join(' ');
        title = `YouTube: ${videoId}`;
      } catch (ytError) {
        // Fallback: use URL as source with description
        rawText = `YouTube video transcript unavailable for: ${url}. Video ID: ${videoId}`;
        title = `YouTube Video: ${videoId}`;
      }

      parsedMetadata = await extractResearchMetadata(rawText, title);
    } else {
      // Web scraping
      try {
        const axios = (await import('axios')).default;
        const { load } = await import('cheerio');

        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ResearchPilot/1.0; academic research)',
          },
        });

        const $ = load(response.data);

        // Remove scripts, styles, nav, footer
        $('script, style, nav, footer, header, .nav, .footer, .sidebar, .advertisement, .ad').remove();

        // Extract title
        title = $('title').text().trim() || $('h1').first().text().trim() || url;

        // Extract main content
        const contentSelectors = ['article', 'main', '.content', '.post-content', '#content', 'body'];
        let contentText = '';
        for (const selector of contentSelectors) {
          const el = $(selector);
          if (el.length > 0) {
            contentText = el.text().replace(/\s+/g, ' ').trim();
            if (contentText.length > 200) break;
          }
        }

        rawText = contentText || $('body').text().replace(/\s+/g, ' ').trim();
        parsedMetadata = await summarizeWebContent(url, rawText);
        parsedMetadata.methodology = parsedMetadata.methodology || 'N/A';
        parsedMetadata.datasets = parsedMetadata.datasets || 'N/A';
        parsedMetadata.results = parsedMetadata.results || 'N/A';
        parsedMetadata.limitations = parsedMetadata.limitations || 'N/A';
      } catch (scrapeError) {
        return res.status(422).json({
          success: false,
          message: `Failed to scrape URL: ${scrapeError.message}. The page may require authentication or JavaScript.`,
        });
      }
    }

    // Store source
    const sourceResult = await query(
      `INSERT INTO uploaded_sources (user_id, source_type, title, storage_url, raw_text, parsed_metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, title, source_type, created_at`,
      [req.user.id, source_type === 'youtube' ? 'youtube' : 'web', title, url, rawText, JSON.stringify(parsedMetadata)]
    );

    const source = sourceResult.rows[0];

    // Chunk and embed
    const chunks = chunkText(rawText);
    if (chunks.length > 0) {
      const embeddings = await generateBatchEmbeddings(chunks.map(c => c.content));
      await storeSourceChunks(source.id, chunks, embeddings);
    }

    res.status(201).json({
      success: true,
      message: 'URL ingested and vectorized successfully.',
      data: {
        id: source.id,
        title: source.title,
        source_type: source.source_type,
        url,
        chunks_created: chunks.length,
        metadata: parsedMetadata,
      },
    });
  } catch (error) {
    console.error('URL ingest error:', error.message);
    res.status(500).json({ success: false, message: `Failed to process URL: ${error.message}` });
  }
});

// Anki ingest schema
const ankiSchema = z.object({
  deck_name: z.string().min(1),
  cards: z.array(z.object({
    front: z.string(),
    back: z.string(),
  })).min(1),
});

/**
 * POST /api/v1/ingest/anki
 * Ingest Anki flashcard data into vector store
 * Accepts JSON payload with card data (APKG parsing done client-side)
 */
router.post('/anki', async (req, res) => {
  const validation = ankiSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validation.error.errors,
    });
  }

  const { deck_name, cards } = validation.data;

  try {
    // Combine all flashcards into a searchable text
    const rawText = cards.map(c => `Q: ${c.front}\nA: ${c.back}`).join('\n\n');

    const parsedMetadata = {
      methodology: 'Flashcard-based learning',
      datasets: `Anki deck: ${deck_name} (${cards.length} cards)`,
      results: 'Spaced repetition flashcard set',
      limitations: 'Flashcard format only',
      keywords: ['anki', 'flashcards', 'spaced repetition'],
      research_type: 'review',
      abstract_summary: `Anki deck "${deck_name}" containing ${cards.length} flashcards for spaced repetition learning.`,
    };

    const sourceResult = await query(
      `INSERT INTO uploaded_sources (user_id, source_type, title, raw_text, parsed_metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, title, source_type, created_at`,
      [req.user.id, 'anki', deck_name, rawText, JSON.stringify(parsedMetadata)]
    );

    const source = sourceResult.rows[0];

    // Embed each card individually for precise retrieval
    const cardChunks = cards.map((c, i) => ({
      content: `Q: ${c.front}\nA: ${c.back}`,
      index: i,
      pageRef: `card_${i + 1}`,
    }));

    if (cardChunks.length > 0) {
      const embeddings = await generateBatchEmbeddings(cardChunks.map(c => c.content));
      await storeSourceChunks(source.id, cardChunks, embeddings);
    }

    res.status(201).json({
      success: true,
      message: `Anki deck "${deck_name}" with ${cards.length} cards ingested successfully.`,
      data: {
        id: source.id,
        title: source.title,
        cards_ingested: cards.length,
      },
    });
  } catch (error) {
    console.error('Anki ingest error:', error.message);
    res.status(500).json({ success: false, message: `Failed to process Anki deck: ${error.message}` });
  }
});

/**
 * GET /api/v1/ingest/sources
 * List all sources for the authenticated user
 */
router.get('/sources', async (req, res) => {
  try {
    const result = await query(
      `SELECT us.id, 
              COALESCE(us.source_type, 'document') as source_type, 
              COALESCE(us.title, 'Untitled Asset') as title, 
              us.storage_url, 
              us.parsed_metadata, 
              COALESCE(us.processing_status, 'completed') as processing_status,
              us.error_message,
              COALESCE(us.file_size, 0) as file_size,
              us.created_at,
              COUNT(se.id)::int as chunk_count
       FROM uploaded_sources us
       LEFT JOIN source_embeddings se ON se.source_id = us.id
       WHERE us.user_id = $1
       GROUP BY us.id, us.source_type, us.title, us.storage_url, us.parsed_metadata, us.processing_status, us.error_message, us.file_size, us.created_at
       ORDER BY us.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('List sources error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch sources.' });
  }
});

/**
 * POST /api/v1/ingest/sources/:sourceId/retry
 * Retry processing an existing failed or un-vectorized source
 */
router.post('/sources/:sourceId/retry', async (req, res) => {
  const { sourceId } = req.params;
  try {
    const sourceRes = await query(
      `SELECT id, user_id, source_type, title, raw_text, parsed_metadata
       FROM uploaded_sources
       WHERE id = $1 AND user_id = $2`,
      [sourceId, req.user.id]
    );

    if (sourceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Source not found.' });
    }

    const source = sourceRes.rows[0];
    if (!source.raw_text || source.raw_text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No extractable text was saved for this document. Please re-upload the file.'
      });
    }

    // Mark as processing
    await query(
      `UPDATE uploaded_sources SET processing_status = 'processing', error_message = NULL WHERE id = $1`,
      [sourceId]
    );

    // Delete any old chunks
    await query(`DELETE FROM source_embeddings WHERE source_id = $1`, [sourceId]);

    // Re-chunk and re-embed
    const chunks = chunkText(source.raw_text);
    if (chunks.length > 0) {
      const chunkTexts = chunks.map(c => c.content);
      const embeddings = await generateBatchEmbeddings(chunkTexts);
      await storeSourceChunks(sourceId, chunks, embeddings);
    }

    // Update to completed
    await query(
      `UPDATE uploaded_sources
       SET processing_status = 'completed', error_message = NULL
       WHERE id = $1`,
      [sourceId]
    );

    res.json({
      success: true,
      message: `Successfully reprocessed "${source.title}". (${chunks.length} chunks generated)`,
      data: {
        id: source.id,
        title: source.title,
        chunks_created: chunks.length,
        processing_status: 'completed'
      }
    });
  } catch (err) {
    console.error(`Retry processing error for source ${sourceId}:`, err.message);
    await query(
      `UPDATE uploaded_sources SET processing_status = 'failed', error_message = $1 WHERE id = $2`,
      [err.message, sourceId]
    );
    res.status(500).json({
      success: false,
      message: `Retry failed: ${err.message}`
    });
  }
});

/**
 * DELETE /api/v1/ingest/sources/:sourceId
 * Delete a source and its embeddings
 */
router.delete('/sources/:sourceId', async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM uploaded_sources WHERE id = $1 AND user_id = $2 RETURNING id, title`,
      [req.params.sourceId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Source not found.' });
    }

    res.json({
      success: true,
      message: `Source "${result.rows[0].title}" deleted successfully.`,
    });
  } catch (error) {
    console.error('Delete source error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete source.' });
  }
});

export default router;
