import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectMongoDB } from './config/mongodb';
import authRoutes from './routes/auth';
import applicationRoutes from './routes/applications';
import aiRoutes from './routes/ai';
import gmailRoutes from './routes/gmail';
import analyticsRoutes from './routes/analytics';
import documentRoutes from './routes/documents';
import notificationRoutes from './routes/notifications';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.FRONTEND_URL || 'http://localhost:3000';
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    // Allow if origin matches frontend URL or localhost
    if (origin === allowed || origin.includes('localhost') || origin.includes('vercel.app')) {
      return callback(null, true);
    }
    callback(null, true); // Allow all for now during development
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  const mongoose = require('mongoose');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongoState: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
    env: {
      hasMongoDB: !!process.env.MONGODB_URI,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasGemini: !!process.env.GEMINI_API_KEY,
      frontendUrl: process.env.FRONTEND_URL,
    },
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message, stack: err.stack });
});

// Start server — listen first, then connect DB
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  connectMongoDB()
    .then(() => console.log('MongoDB connected successfully'))
    .catch((err) => {
      console.error('MongoDB connection failed:', err.message);
      // Don't exit — let Railway healthcheck pass, DB will retry
    });
});

export default app;
