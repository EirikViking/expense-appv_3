import { Hono } from 'hono';
import {
  bootstrapRequestSchema,
  generateId,
  loginRequestSchema,
  resetPasswordRequestSchema,
  setPasswordRequestSchema,
  type AuthMeResponse,
  type BootstrapResponse,
  type LoginResponse,
} from '@expense/shared';
import type { Env } from '../types';
import {
  SESSION_MAX_AGE_LONG_SECONDS,
  SESSION_MAX_AGE_SHORT_SECONDS,
  clearSessionCookie,
  consumePasswordToken,
  countUsers,
  createSession,
  deleteSession,
  getSessionUser,
  getUserByEmail,
  hashPassword,
  normalizeEmail,
  readSessionCookie,
  sanitizeUser,
  setSessionCookie,
  verifyPassword,
} from '../lib/auth';

const auth = new Hono<{ Bindings: Env }>();

auth.post('/bootstrap', async (c) => {
  try {
    const userCount = await countUsers(c.env.DB);
    if (userCount > 0) {
      return c.json({ error: 'Bootstrap is disabled after first user is created' }, 409);
    }

    const body = await c.req.json();
    const parsed = bootstrapRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { email, name, password } = parsed.data;
    const now = new Date().toISOString();
    const userId = generateId();
    const hashed = await hashPassword(password);

    await c.env.DB
      .prepare(
        `INSERT INTO users
          (id, email, name, role, active, password_salt, password_hash, password_iters, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', 1, ?, ?, ?, ?, ?)`
      )
      .bind(
        userId,
        normalizeEmail(email),
        name.trim(),
        hashed.salt,
        hashed.hash,
        hashed.iterations,
        now,
        now
      )
      .run();

    const sessionId = await createSession(c.env.DB, userId, SESSION_MAX_AGE_LONG_SECONDS);
    setSessionCookie(c, sessionId, SESSION_MAX_AGE_LONG_SECONDS);

    const created = await c.env.DB
      .prepare(
        `SELECT id, email, name, role, active, onboarding_done_at, created_at, updated_at
         FROM users WHERE id = ?`
      )
      .bind(userId)
      .first<any>();

    const response: BootstrapResponse = {
      success: true,
      user: sanitizeUser(created),
      bootstrap_required: false,
      needs_onboarding: true,
    };
    return c.json(response, 201);
  } catch (error) {
    console.error('Bootstrap error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

auth.post('/login', async (c) => {
  try {
    const userCount = await countUsers(c.env.DB);
    if (userCount === 0) {
      return c.json({ error: 'Bootstrap required', bootstrap_required: true }, 400);
    }

    const body = await c.req.json();
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { email, password, remember_me } = parsed.data;
    const user = await getUserByEmail(c.env.DB, email);
    if (!user || !user.active) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const valid = await verifyPassword(password, user);
    if (!valid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const maxAge = remember_me ? SESSION_MAX_AGE_LONG_SECONDS : SESSION_MAX_AGE_SHORT_SECONDS;
    const sessionId = await createSession(c.env.DB, user.id, maxAge);
    setSessionCookie(c, sessionId, maxAge);

    const response: LoginResponse = {
      success: true,
      user: sanitizeUser(user),
      needs_onboarding: !user.onboarding_done_at,
    };
    return c.json(response);
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

auth.post('/logout', async (c) => {
  try {
    const sessionId = readSessionCookie(c);
    if (sessionId) {
      await deleteSession(c.env.DB, sessionId);
    }
    clearSessionCookie(c);
    return c.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

auth.get('/me', async (c) => {
  try {
    const userCount = await countUsers(c.env.DB);
    if (userCount === 0) {
      const response: AuthMeResponse = {
        authenticated: false,
        bootstrap_required: true,
      };
      return c.json(response);
    }

    const sessionId = readSessionCookie(c);
    if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

    const user = await getSessionUser(c.env.DB, sessionId);
    if (!user) {
      clearSessionCookie(c);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const response: AuthMeResponse = {
      authenticated: true,
      bootstrap_required: false,
      user,
      needs_onboarding: !user.onboarding_done_at,
    };
    return c.json(response);
  } catch (error) {
    console.error('Me error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

auth.post('/set-password', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = setPasswordRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const used = await consumePasswordToken(c.env.DB, parsed.data.token, 'invite');
    if (!used) {
      return c.json({ error: 'Invalid or expired token' }, 400);
    }

    const hashed = await hashPassword(parsed.data.password);
    const now = new Date().toISOString();
    await c.env.DB
      .prepare(
        `UPDATE users
         SET password_salt = ?, password_hash = ?, password_iters = ?, active = 1, updated_at = ?
         WHERE id = ?`
      )
      .bind(hashed.salt, hashed.hash, hashed.iterations, now, used.user_id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Set password error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

auth.post('/reset-password', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = resetPasswordRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const used = await consumePasswordToken(c.env.DB, parsed.data.token, 'reset');
    if (!used) {
      return c.json({ error: 'Invalid or expired token' }, 400);
    }

    const hashed = await hashPassword(parsed.data.password);
    const now = new Date().toISOString();
    await c.env.DB
      .prepare(
        `UPDATE users
         SET password_salt = ?, password_hash = ?, password_iters = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(hashed.salt, hashed.hash, hashed.iterations, now, used.user_id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

auth.post('/onboarding-complete', async (c) => {
  try {
    const sessionId = readSessionCookie(c);
    if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);
    const user = await getSessionUser(c.env.DB, sessionId);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const now = new Date().toISOString();
    await c.env.DB
      .prepare('UPDATE users SET onboarding_done_at = ?, updated_at = ? WHERE id = ?')
      .bind(now, now, user.id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Onboarding complete error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default auth;
