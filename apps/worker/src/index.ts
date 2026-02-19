import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import ingestRoutes from './routes/ingest';
import transactionsRoutes from './routes/transactions';
import categoriesRoutes from './routes/categories';
import tagsRoutes from './routes/tags';
import merchantsRoutes from './routes/merchants';
import rulesRoutes from './routes/rules';
import transactionMetaRoutes from './routes/transaction-meta';
import budgetsRoutes from './routes/budgets';
import recurringRoutes from './routes/recurring';
import analyticsRoutes from './routes/analytics';
import adminUsersRoutes from './routes/admin-users';
import { createErrorResponse } from './lib/error-contract';

const app = new Hono<{ Bindings: Env }>();

// CORS - allow localhost and Cloudflare Pages
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return 'http://localhost:5173';
      // Allow localhost
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return origin;
      }
      // Allow this Cloudflare Pages project (prod + preview branches)
      if (
        origin === 'https://expense-appv-3.pages.dev' ||
        origin.endsWith('.expense-appv-3.pages.dev')
      ) {
        return origin;
      }
      return 'http://localhost:5173';
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check (no auth required)
app.get('/health', (c) => {
  const environment = c.env.ENVIRONMENT ?? 'unknown';
  const versionId = c.env.CF_VERSION_METADATA?.id ?? 'unknown';
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment,
    version_id: versionId,
  });
});

// Lightweight observability for slow endpoints.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;
  c.header('X-Response-Time', `${durationMs}ms`);
  if (durationMs >= 800 && c.req.path !== '/health') {
    console.warn(
      `[perf] ${c.req.method} ${c.req.path} ${durationMs}ms status=${c.res.status}`
    );
  }
});

// Standardize JSON error responses to { error, message, code, ... }.
app.use('*', async (c, next) => {
  await next();

  const originalResponse = c.res;
  const status = originalResponse.status;
  if (status < 400) return;

  const contentType = originalResponse.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return;

  try {
    const rawBody = await originalResponse.text();
    const body = JSON.parse(rawBody) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      c.res = createErrorResponse(
        status,
        { message: originalResponse.statusText || 'Request failed' },
        originalResponse.headers
      );
      return;
    }
    c.res = createErrorResponse(status, body as Record<string, unknown>, originalResponse.headers);
  } catch {
    // Ignore parse failures; keep original response untouched.
    c.res = originalResponse;
  }
});

// Auth routes (no auth required)
app.route('/auth', authRoutes);

// Protected routes - apply auth middleware
app.use('/ingest/*', authMiddleware);
app.use('/transactions/*', authMiddleware);
app.use('/categories/*', authMiddleware);
app.use('/tags/*', authMiddleware);
app.use('/merchants/*', authMiddleware);
app.use('/rules/*', authMiddleware);
app.use('/transaction-meta/*', authMiddleware);
app.use('/budgets/*', authMiddleware);
app.use('/recurring/*', authMiddleware);
app.use('/analytics/*', authMiddleware);
app.use('/admin/*', authMiddleware);

// Mount routes
app.route('/ingest', ingestRoutes);
app.route('/transactions', transactionsRoutes);
app.route('/categories', categoriesRoutes);
app.route('/tags', tagsRoutes);
app.route('/merchants', merchantsRoutes);
app.route('/rules', rulesRoutes);
app.route('/transaction-meta', transactionMetaRoutes);
app.route('/budgets', budgetsRoutes);
app.route('/recurring', recurringRoutes);
app.route('/analytics', analyticsRoutes);
app.route('/admin', adminUsersRoutes);

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
