import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { query } from '../db/database.js';
import { generateCourseStructure } from '../services/gemini.js';

const router = express.Router();
router.use(authenticate);

// XP constants
const XP_PER_CORRECT_ANSWER = 15;
const XP_PER_QUIZ_COMPLETION = 50;
const XP_BONUS_PERFECT_SCORE = 100;
const XP_PER_FOCUS_SESSION = 25;
const XP_PER_TREE = 10;

/**
 * Update gamification level based on total XP
 */
const calculateLevel = (totalXp) => {
  // Level formula: each level requires 200 * level XP
  let level = 1;
  let xpThreshold = 0;
  while (xpThreshold + 200 * level <= totalXp) {
    xpThreshold += 200 * level;
    level++;
  }
  return level;
};

/**
 * Calculate league tier based on weekly XP
 */
const calculateLeagueTier = (weeklyXp) => {
  if (weeklyXp >= 2000) return 'Diamond';
  if (weeklyXp >= 1000) return 'Gold';
  if (weeklyXp >= 400) return 'Silver';
  return 'Bronze';
};

/**
 * Add XP to user's gamification profile
 */
const addXP = async (userId, xpAmount) => {
  const result = await query(
    `UPDATE gamification_profiles
     SET total_xp = total_xp + $1,
         weekly_xp = weekly_xp + $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $2
     RETURNING total_xp, weekly_xp, current_level, league_tier`,
    [xpAmount, userId]
  );

  if (result.rows.length === 0) return null;

  const profile = result.rows[0];
  const newLevel = calculateLevel(profile.total_xp);
  const newTier = calculateLeagueTier(profile.weekly_xp);

  // Update level and tier if changed
  if (newLevel !== profile.current_level || newTier !== profile.league_tier) {
    await query(
      `UPDATE gamification_profiles SET current_level = $1, league_tier = $2 WHERE user_id = $3`,
      [newLevel, newTier, userId]
    );
  }

  return { ...profile, current_level: newLevel, league_tier: newTier };
};

// Course generation schema
const courseGenerateSchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters'),
  source_ids: z.array(z.string().uuid()).min(1, 'At least one source required'),
});

/**
 * POST /api/v1/course/generate
 * Generate an adaptive course from selected source materials
 */
router.post('/generate', async (req, res) => {
  const validation = courseGenerateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validation.error.errors,
    });
  }

  const { topic, source_ids } = validation.data;

  try {
    // Fetch source texts
    const placeholders = source_ids.map((_, i) => `$${i + 1}`).join(', ');
    const sourcesResult = await query(
      `SELECT id, title, raw_text FROM uploaded_sources
       WHERE id IN (${placeholders}) AND user_id = $${source_ids.length + 1} AND raw_text IS NOT NULL`,
      [...source_ids, req.user.id]
    );

    if (sourcesResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid sources found. Ensure sources have been processed.',
      });
    }

    const sourceTexts = sourcesResult.rows.map(s => `=== ${s.title} ===\n${s.raw_text.substring(0, 5000)}`);

    // Generate course structure using Gemini
    const courseStructure = await generateCourseStructure(topic, sourceTexts);

    // Store generated course
    const courseResult = await query(
      `INSERT INTO generated_courses (user_id, topic_title, course_structure)
       VALUES ($1, $2, $3) RETURNING id, topic_title, created_at`,
      [req.user.id, courseStructure.title || topic, JSON.stringify(courseStructure)]
    );

    const course = courseResult.rows[0];

    // Award XP for course generation
    const updatedProfile = await addXP(req.user.id, 30);

    res.status(201).json({
      success: true,
      message: 'Course generated successfully!',
      data: {
        course_id: course.id,
        title: course.topic_title,
        created_at: course.created_at,
        structure: courseStructure,
        xp_earned: 30,
        new_profile: updatedProfile,
      },
    });
  } catch (error) {
    console.error('Course generation error:', error.message);
    res.status(500).json({ success: false, message: `Course generation failed: ${error.message}` });
  }
});

/**
 * GET /api/v1/course
 * List all courses for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, topic_title, course_structure, created_at
       FROM generated_courses WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List courses error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
});

/**
 * GET /api/v1/course/:courseId
 * Fetch a specific course with its full structure
 */
router.get('/:courseId', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, topic_title, course_structure, created_at
       FROM generated_courses WHERE id = $1 AND user_id = $2`,
      [req.params.courseId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get course error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch course.' });
  }
});

// Quiz session schema
const startQuizSchema = z.object({
  course_id: z.string().uuid(),
  quiz_name: z.string().min(1),
});

const updateQuizSchema = z.object({
  current_question_index: z.number().int().min(0),
  user_answers: z.array(z.any()),
  is_completed: z.boolean().optional().default(false),
  xp_earned: z.number().int().min(0).optional().default(0),
});

/**
 * POST /api/v1/quiz/start
 * Start a new quiz session
 */
router.post('/quiz/start', async (req, res) => {
  const validation = startQuizSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: validation.error.errors });
  }

  const { course_id, quiz_name } = validation.data;

  try {
    // Verify course belongs to user
    const courseCheck = await query(
      'SELECT id FROM generated_courses WHERE id = $1 AND user_id = $2',
      [course_id, req.user.id]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    const sessionResult = await query(
      `INSERT INTO active_quiz_sessions (user_id, course_id, quiz_name)
       VALUES ($1, $2, $3) RETURNING id, quiz_name, current_question_index, is_completed, xp_earned, updated_at`,
      [req.user.id, course_id, quiz_name]
    );

    res.status(201).json({
      success: true,
      message: 'Quiz session started.',
      data: sessionResult.rows[0],
    });
  } catch (error) {
    console.error('Start quiz error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to start quiz session.' });
  }
});

/**
 * GET /api/v1/quiz/state/:sessionId
 * Get current quiz session state (for cross-device resumption)
 */
router.get('/quiz/state/:sessionId', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, course_id, quiz_name, current_question_index, user_answers, is_completed, xp_earned, updated_at
       FROM active_quiz_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.sessionId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz session not found.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get quiz state error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch quiz state.' });
  }
});

/**
 * PUT /api/v1/quiz/state/:sessionId
 * Update quiz session state (save answers, progress, completion)
 */
router.put('/quiz/state/:sessionId', async (req, res) => {
  const validation = updateQuizSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: validation.error.errors });
  }

  const { current_question_index, user_answers, is_completed, xp_earned } = validation.data;

  try {
    const result = await query(
      `UPDATE active_quiz_sessions
       SET current_question_index = $1,
           user_answers = $2,
           is_completed = $3,
           xp_earned = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING id, quiz_name, current_question_index, user_answers, is_completed, xp_earned, updated_at`,
      [current_question_index, JSON.stringify(user_answers), is_completed, xp_earned, req.params.sessionId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz session not found.' });
    }

    let updatedProfile = null;
    // If quiz just completed, award XP
    if (is_completed && xp_earned > 0) {
      updatedProfile = await addXP(req.user.id, xp_earned);
    }

    res.json({
      success: true,
      message: is_completed ? '🎉 Quiz completed! XP awarded.' : 'Progress saved.',
      data: { session: result.rows[0], gamification: updatedProfile },
    });
  } catch (error) {
    console.error('Update quiz state error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update quiz state.' });
  }
});

/**
 * GET /api/v1/quiz/sessions
 * List all quiz sessions for the user
 */
router.get('/quiz/sessions', async (req, res) => {
  try {
    const result = await query(
      `SELECT aqs.id, aqs.quiz_name, aqs.is_completed, aqs.xp_earned, aqs.updated_at,
              gc.topic_title as course_title
       FROM active_quiz_sessions aqs
       JOIN generated_courses gc ON gc.id = aqs.course_id
       WHERE aqs.user_id = $1
       ORDER BY aqs.updated_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List quiz sessions error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch quiz sessions.' });
  }
});

/**
 * POST /api/v1/focus/complete
 * Log completed focus session and award XP + trees
 */
router.post('/focus/complete', async (req, res) => {
  const focusSchema = z.object({
    duration_minutes: z.number().int().min(1).max(180),
    session_type: z.enum(['pomodoro', 'short_break', 'long_break', 'deep_work']).default('pomodoro'),
  });

  const validation = focusSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: validation.error.errors });
  }

  const { duration_minutes, session_type } = validation.data;

  try {
    const treesEarned = session_type === 'pomodoro' || session_type === 'deep_work' ? 1 : 0;
    const xpEarned = session_type === 'short_break' || session_type === 'long_break'
      ? 5
      : Math.floor(XP_PER_FOCUS_SESSION * (duration_minutes / 25)); // Scale with duration

    // Update gamification: add XP, increment trees, update streak
    await query(
      `UPDATE gamification_profiles
       SET total_xp = total_xp + $1,
           weekly_xp = weekly_xp + $1,
           trees_grown = trees_grown + $2,
           current_streak = current_streak + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $3`,
      [xpEarned, treesEarned, req.user.id]
    );

    // Recalculate level and tier
    const profileResult = await query(
      'SELECT total_xp, weekly_xp, current_level, league_tier FROM gamification_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length > 0) {
      const profile = profileResult.rows[0];
      const newLevel = calculateLevel(profile.total_xp);
      const newTier = calculateLeagueTier(profile.weekly_xp);

      await query(
        'UPDATE gamification_profiles SET current_level = $1, league_tier = $2 WHERE user_id = $3',
        [newLevel, newTier, req.user.id]
      );
    }

    res.json({
      success: true,
      message: `🌳 Focus session complete! +${xpEarned} XP${treesEarned > 0 ? ', tree grown!' : ''}`,
      data: {
        xp_earned: xpEarned,
        trees_earned: treesEarned,
        duration_minutes,
        session_type,
      },
    });
  } catch (error) {
    console.error('Focus complete error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to log focus session.' });
  }
});

/**
 * GET /api/v1/league/leaderboard
 * Returns top users ranked by weekly XP grouped by league tier
 */
router.get('/league/leaderboard', async (req, res) => {
  try {
    const result = await query(
      `SELECT
        u.full_name,
        u.email,
        gp.total_xp,
        gp.weekly_xp,
        gp.current_level,
        gp.current_streak,
        gp.league_tier,
        gp.trees_grown,
        RANK() OVER (PARTITION BY gp.league_tier ORDER BY gp.weekly_xp DESC) as rank_in_tier,
        RANK() OVER (ORDER BY gp.weekly_xp DESC) as global_rank
       FROM gamification_profiles gp
       JOIN users u ON u.id = gp.user_id
       ORDER BY gp.weekly_xp DESC
       LIMIT 100`,
      []
    );

    // Group by tier
    const tiers = { Diamond: [], Gold: [], Silver: [], Bronze: [] };
    for (const row of result.rows) {
      const tier = row.league_tier || 'Bronze';
      if (tiers[tier]) {
        tiers[tier].push({
          full_name: row.full_name,
          email: row.email.replace(/(.{2}).*@/, '$1***@'), // Partially mask email
          total_xp: row.total_xp,
          weekly_xp: row.weekly_xp,
          current_level: row.current_level,
          current_streak: row.current_streak,
          trees_grown: row.trees_grown,
          rank_in_tier: parseInt(row.rank_in_tier),
          global_rank: parseInt(row.global_rank),
        });
      }
    }

    // Find current user's rank
    const userRank = await query(
      `SELECT gp.weekly_xp, gp.league_tier,
              RANK() OVER (ORDER BY gp2.weekly_xp DESC) as global_rank
       FROM gamification_profiles gp
       CROSS JOIN (SELECT weekly_xp FROM gamification_profiles ORDER BY weekly_xp DESC) gp2
       WHERE gp.user_id = $1
       LIMIT 1`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        leaderboard: tiers,
        total_users: result.rows.length,
        current_user_rank: userRank.rows[0] || null,
        tier_thresholds: {
          Bronze: '0 - 399 weekly XP',
          Silver: '400 - 999 weekly XP',
          Gold: '1000 - 1999 weekly XP',
          Diamond: '2000+ weekly XP',
        },
      },
    });
  } catch (error) {
    console.error('Leaderboard error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch leaderboard.' });
  }
});

export default router;
