import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { verifyJwt } from '../lib/jwt';
import type { Env } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const token = getCookie(c, 'auth_token');

  if (!token) {
    return c.json({ error: 'Unauthorized: No token provided' }, 401);
  }

  const payload = await verifyJwt(token, c.env.JWT_SECRET);

  if (!payload || !payload.authenticated) {
    return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
  }

  await next();
});
