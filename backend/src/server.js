import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { initializeDatabase } from './db/database.js';

// Route imports
import authRoutes from './routes/auth.js';
import ingestRoutes from './routes/ingest.js';
import researchRoutes from './routes/research.js';
import gamificationRoutes from './routes/gamification.js';
import scheduleRoutes from './routes/schedule.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS Configuration ──────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/+$/, '');
    if (
      allowedOrigins.includes(cleanOrigin) ||
      cleanOrigin.endsWith('.vercel.app') ||
      cleanOrigin.includes('localhost') ||
      cleanOrigin.includes('127.0.0.1') ||
      process.env.CORS_ALLOW_ALL === 'true'
    ) {
      return callback(null, true);
    }
    // Allow by default to prevent deployment lockouts while logging
    console.warn(`[CORS Notice] Unlisted origin allowed: ${origin}`);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Pre-flight for all routes
app.options('*', cors());

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Please try again after 15 minutes.' },
});

// ─── Body Parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Request Logger (Development) ────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ResearchPilot AI API',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
  });
});

app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    message: 'ResearchPilot AI API v1',
    endpoints: {
      auth: '/api/v1/auth',
      ingest: '/api/v1/ingest',
      research: '/api/v1/research',
      course: '/api/v1/course',
      schedule: '/api/v1/schedule',
    },
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/ingest', apiLimiter, ingestRoutes);
app.use('/api/v1/research', apiLimiter, researchRoutes);
app.use('/api/v1/course', apiLimiter, gamificationRoutes);
app.use('/api/v1/schedule', apiLimiter, scheduleRoutes);

// Convenience aliases matching spec
app.use('/api/v1/quiz', apiLimiter, gamificationRoutes);
app.use('/api/v1/focus', apiLimiter, gamificationRoutes);
app.use('/api/v1/league', apiLimiter, gamificationRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found.`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Database Init & Server Start ─────────────────────────────────────────────
const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 ResearchPilot AI Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📡 API Base: http://localhost:${PORT}/api/v1\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received. Closing server...');
  process.exit(0);
});

startServer();

export default app;
