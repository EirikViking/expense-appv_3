import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { verifyJwt } from '../lib/jwt';
import type { Env } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // Try cookie first (same-origin requests)
  let token = getCookie(c, 'auth_token');

  // Fall back to Authorization header (cross-origin requests)
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return c.json({ error: 'Unauthorized: No token provided' }, 401);
  }

  const payload = await verifyJwt(token, c.env.JWT_SECRET);

  if (!payload || !payload.authenticated) {
    return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
  }

  await next();
});
