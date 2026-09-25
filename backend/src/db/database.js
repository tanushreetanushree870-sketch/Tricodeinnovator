import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

dotenv.config();

const { Pool } = pg;

// Supabase / any external Postgres always needs SSL; enable it unless
// explicitly disabled (e.g. local Docker without SSL).
const needsSsl =
  process.env.DATABASE_URL?.includes('supabase.co') ||
  process.env.DATABASE_URL?.includes('supabase.in') ||
  process.env.NODE_ENV === 'production';

let activePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

activePool.on('error', (err) => {
  console.warn('PostgreSQL idle client notice:', err.message);
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await activePool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text: text.substring(0, 80), duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error.message, '\nQuery:', text.substring(0, 200));
    throw error;
  }
};

export const getClient = async () => {
  const client = await activePool.connect();
  const release = client.release.bind(client);
  client.release = () => {
    client.release = release;
    return release();
  };
  return client;
};

// Seed initial demo data for immediate exploration
const seedDemoData = async (poolInstance) => {
  try {
    const existing = await poolInstance.query('SELECT id FROM users LIMIT 1');
    if (existing.rows.length === 0) {
      console.log('🌱 Seeding demo user and academic profile...');
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('password123', salt);
      const userRes = await poolInstance.query(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3) RETURNING id`,
        ['demo@researchpilot.ai', hash, 'Dr. Alex Vance']
      );
      const userId = userRes.rows[0].id;

      await poolInstance.query(
        `INSERT INTO gamification_profiles (user_id, total_xp, weekly_xp, current_level, current_streak, league_tier, trees_grown)
         VALUES ($1, 1420, 320, 5, 12, 'Silver', 8)`,
        [userId]
      );

      // Seed sample course
      await poolInstance.query(
        `INSERT INTO generated_courses (user_id, topic_title, course_structure)
         VALUES ($1, $2, $3)`,
        [
          userId,
          'Multimodal Deep Learning Architectures',
          JSON.stringify({
            title: 'Multimodal Deep Learning Architectures',
            description: 'Master cross-attention transformers, contrastive learning (CLIP), and diffusion models.',
            difficulty: 'advanced',
            estimated_hours: 6,
            modules: [
              {
                id: 'mod_1',
                title: 'Foundations of Cross-Modal Alignment',
                description: 'Explore joint vs coordinated representations and contrastive pre-training.',
                order: 1,
                lessons: [
                  {
                    id: 'les_1_1',
                    title: 'Contrastive Language-Image Pretraining (CLIP)',
                    content: 'CLIP trains a vision encoder and text encoder jointly on 400M image-text pairs using a symmetric cross-entropy loss. We examine the mathematical formulation of InfoNCE and zero-shot transfer capabilities.',
                    key_concepts: ['InfoNCE Loss', 'Joint Representation', 'Zero-shot Classification'],
                    order: 1,
                  }
                ],
                flashcards: [
                  {
                    id: 'fc_1_1',
                    front: 'What is the primary loss function used in CLIP?',
                    back: 'Symmetric Cross-Entropy / InfoNCE loss across image and text batches.',
                    difficulty: 'medium'
                  },
                  {
                    id: 'fc_1_2',
                    front: 'What does HNSW stand for in vector retrieval?',
                    back: 'Hierarchical Navigable Small World graphs.',
                    difficulty: 'easy'
                  }
                ],
                quiz: {
                  id: 'quiz_1',
                  name: 'Cross-Modal Alignment Checkpoint',
                  questions: [
                    {
                      id: 'q_1',
                      question: 'Which component computes cross-modal similarity in joint embedding spaces?',
                      options: ['Cosine similarity between normalized vectors', 'Euclidean sum of unnormalized logits', 'Softmax over unprojected tokens', 'Binary cross-entropy on raw pixels'],
                      correct_answer: 0,
                      explanation: 'Joint embedding architectures normalize visual and text feature vectors and compute cosine similarity scaled by a learnable temperature parameter.',
                      xp_reward: 25
                    }
                  ]
                }
              }
            ]
          })
        ]
      );

      // Seed schedule
      const now = new Date();
      const schedules = [
        { title: 'NeurIPS Paper Final Submission', type: 'deadline', start: new Date(now.getTime() + 86400000 * 2), end: new Date(now.getTime() + 86400000 * 2 + 3600000), color: '#ef4444' },
        { title: 'Deep Learning Lab Meeting', type: 'lecture', start: new Date(now.getTime() + 86400000 * 1), end: new Date(now.getTime() + 86400000 * 1 + 7200000), color: '#6366f1' },
        { title: 'RAG Optimization Study Block', type: 'study', start: new Date(now.getTime() + 3600000 * 4), end: new Date(now.getTime() + 3600000 * 6), color: '#10b981' },
      ];

      for (const s of schedules) {
        await poolInstance.query(
          `INSERT INTO academic_schedules (id, user_id, title, event_type, start_time, end_time, color_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [crypto.randomUUID(), userId, s.title, s.type, s.start.toISOString(), s.end.toISOString(), s.color]
        );
      }
      console.log('✅ Demo user seeded: demo@researchpilot.ai / password123');
    }
  } catch (err) {
    console.warn('Notice during demo seeding:', err.message);
  }
};

export const initializeDatabase = async () => {
  let isPostgres = false;
  let client = null;

  try {
    client = await activePool.connect();
    isPostgres = true;
    console.log('⚡ Connected to PostgreSQL instance');
  } catch (connError) {
    console.warn(`⚠️  PostgreSQL connection failed (${connError.message}).`);
    console.log('🔄 Initializing resilient in-memory database adapter (pg-mem) with full SQL support...');

    const { newDb } = await import('pg-mem');
    const db = newDb();

    // Register PostgreSQL built-in functions
    db.public.registerFunction({
      name: 'gen_random_uuid',
      impure: true,
      implementation: () => crypto.randomUUID(),
    });

    const memPg = db.adapters.createPg();
    activePool = new memPg.Pool();
    client = await activePool.connect();
  }

  try {
    if (isPostgres) {
      console.log('🔧 Initializing database schema with pgvector...');
      try {
        await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
      } catch (extErr) {
        console.warn('Notice on pg extensions:', extErr.message);
      }
    }

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Gamification profiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS gamification_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        total_xp INT DEFAULT 0,
        weekly_xp INT DEFAULT 0,
        current_level INT DEFAULT 1,
        current_streak INT DEFAULT 0,
        league_tier VARCHAR(50) DEFAULT 'Bronze',
        trees_grown INT DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Uploaded sources
    await client.query(`
      CREATE TABLE IF NOT EXISTS uploaded_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        source_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        storage_url TEXT,
        raw_text TEXT,
        parsed_metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Source embeddings table
    if (isPostgres) {
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS source_embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source_id UUID REFERENCES uploaded_sources(id) ON DELETE CASCADE,
            chunk_content TEXT NOT NULL,
            page_or_timestamp VARCHAR(50),
            embedding vector(768) NOT NULL
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS source_embeddings_hnsw_idx
          ON source_embeddings USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64);
        `);
      } catch (vecErr) {
        console.warn('Falling back to TEXT embedding column on PostgreSQL:', vecErr.message);
        await client.query(`
          CREATE TABLE IF NOT EXISTS source_embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source_id UUID REFERENCES uploaded_sources(id) ON DELETE CASCADE,
            chunk_content TEXT NOT NULL,
            page_or_timestamp VARCHAR(50),
            embedding TEXT
          );
        `);
      }
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS source_embeddings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_id UUID REFERENCES uploaded_sources(id) ON DELETE CASCADE,
          chunk_content TEXT NOT NULL,
          page_or_timestamp VARCHAR(50),
          embedding TEXT
        );
      `);
    }

    // Generated courses
    await client.query(`
      CREATE TABLE IF NOT EXISTS generated_courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        topic_title VARCHAR(255) NOT NULL,
        course_structure JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Active quiz sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS active_quiz_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        course_id UUID REFERENCES generated_courses(id) ON DELETE CASCADE,
        quiz_name VARCHAR(255) NOT NULL,
        current_question_index INT DEFAULT 0,
        user_answers JSONB DEFAULT '[]'::jsonb,
        is_completed BOOLEAN DEFAULT FALSE,
        xp_earned INT DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Academic schedules
    await client.query(`
      CREATE TABLE IF NOT EXISTS academic_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        color_code VARCHAR(10) DEFAULT '#3B82F6',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Database schema initialized successfully');
    await seedDemoData(activePool);
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  } finally {
    if (client) client.release();
  }
};

export default activePool;
