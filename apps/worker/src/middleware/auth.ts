import { createMiddleware } from 'hono/factory';
import { clearSessionCookie, getSessionUser, getUserById, readSessionCookie, sanitizeUser } from '../lib/auth';
import type { Env } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const sessionId = readSessionCookie(c);
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

  const user = await getSessionUser(c.env.DB, sessionId);
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let effectiveUser = user;
  let impersonating = false;

  if (user.role === 'admin') {
    const sessionRow = await c.env.DB
      .prepare('SELECT impersonated_user_id FROM sessions WHERE id = ?')
      .bind(sessionId)
      .first<{ impersonated_user_id: string | null }>();

    if (sessionRow?.impersonated_user_id) {
      const target = await getUserById(c.env.DB, sessionRow.impersonated_user_id);
      if (target) {
        effectiveUser = sanitizeUser(target);
        impersonating = true;
      } else {
        await c.env.DB
          .prepare('UPDATE sessions SET impersonated_user_id = NULL WHERE id = ?')
          .bind(sessionId)
          .run();
      }
    }
  }

  (c as any).set('authUser', user);
  (c as any).set('effectiveUser', effectiveUser);
  (c as any).set('isImpersonating', impersonating);
  (c as any).set('sessionId', sessionId);

  await next();
});
