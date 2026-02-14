import { createMiddleware } from 'hono/factory';
import { clearSessionCookie, getSessionUser, readSessionCookie } from '../lib/auth';
import type { Env } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const sessionId = readSessionCookie(c);
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

  const user = await getSessionUser(c.env.DB, sessionId);
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  (c as any).set('authUser', user);

  await next();
});
