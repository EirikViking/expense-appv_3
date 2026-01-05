import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import ingestRoutes from './routes/ingest';
import transactionsRoutes from './routes/transactions';

const app = new Hono<{ Bindings: Env }>();

// CORS for local development - allow any localhost port
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return 'http://localhost:5173';
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return origin;
      }
      return 'http://localhost:5173';
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (no auth required)
app.route('/auth', authRoutes);

// Protected routes
app.use('/ingest/*', authMiddleware);
app.use('/transactions/*', authMiddleware);

app.route('/ingest', ingestRoutes);
app.route('/transactions', transactionsRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
