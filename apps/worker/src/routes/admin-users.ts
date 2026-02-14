import { Hono } from 'hono';
import {
  createUserRequestSchema,
  generateId,
  updateUserRequestSchema,
  type AdminUsersResponse,
  type CreateUserResponse,
  type ResetLinkResponse,
} from '@expense/shared';
import type { Env } from '../types';
import { issuePasswordToken, sanitizeUser } from '../lib/auth';
import { ensureAdmin, getSessionId } from '../lib/request-scope';

const adminUsers = new Hono<{ Bindings: Env }>();

adminUsers.get('/users', async (c) => {
  try {
    if (!ensureAdmin(c as any)) return c.json({ error: 'Forbidden' }, 403);

    const result = await c.env.DB
      .prepare(
        `SELECT id, email, name, role, active, onboarding_done_at, created_at, updated_at
         FROM users
         ORDER BY created_at DESC`
      )
      .all<any>();

    const users = (result.results || []).map((row: any) => sanitizeUser(row));
    const response: AdminUsersResponse = { users };
    return c.json(response);
  } catch (error) {
    console.error('List users error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

adminUsers.post('/users', async (c) => {
  try {
    if (!ensureAdmin(c as any)) return c.json({ error: 'Forbidden' }, 403);

    const body = await c.req.json();
    const parsed = createUserRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { email, name, role } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const userId = generateId();

    try {
      await c.env.DB
        .prepare(
          `INSERT INTO users (id, email, name, role, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`
        )
        .bind(userId, normalizedEmail, name.trim(), role, now, now)
        .run();
    } catch (error: any) {
      if (String(error?.message || '').toLowerCase().includes('unique')) {
        return c.json({ error: 'User already exists' }, 409);
      }
      throw error;
    }

    const inviteToken = await issuePasswordToken(c.env.DB, userId, 'invite');
    const user = await c.env.DB
      .prepare(
        `SELECT id, email, name, role, active, onboarding_done_at, created_at, updated_at
         FROM users
         WHERE id = ?`
      )
      .bind(userId)
      .first<any>();

    const response: CreateUserResponse = {
      user: sanitizeUser(user),
      invite_token: inviteToken,
    };
    return c.json(response, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

adminUsers.patch('/users/:id', async (c) => {
  try {
    const authUser = ensureAdmin(c as any);
    if (!authUser) return c.json({ error: 'Forbidden' }, 403);

    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateUserRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const current = await c.env.DB
      .prepare(
        `SELECT id, email, name, role, active, onboarding_done_at, created_at, updated_at
         FROM users
         WHERE id = ?`
      )
      .bind(id)
      .first<any>();
    if (!current) return c.json({ error: 'User not found' }, 404);

    if (authUser.id === id) {
      if (parsed.data.active === false) {
        return c.json({ error: 'Cannot deactivate your own account' }, 400);
      }
      if (parsed.data.role === 'user') {
        return c.json({ error: 'Cannot remove your own admin role' }, 400);
      }
    }

    const updates: string[] = [];
    const params: Array<string | number> = [];

    if (parsed.data.name !== undefined) {
      updates.push('name = ?');
      params.push(parsed.data.name.trim());
    }
    if (parsed.data.role !== undefined) {
      updates.push('role = ?');
      params.push(parsed.data.role);
    }
    if (parsed.data.active !== undefined) {
      updates.push('active = ?');
      params.push(parsed.data.active ? 1 : 0);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await c.env.DB
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();

    const updated = await c.env.DB
      .prepare(
        `SELECT id, email, name, role, active, onboarding_done_at, created_at, updated_at
         FROM users
         WHERE id = ?`
      )
      .bind(id)
      .first<any>();

    return c.json(sanitizeUser(updated));
  } catch (error) {
    console.error('Update user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

adminUsers.post('/users/:id/reset-link', async (c) => {
  try {
    if (!ensureAdmin(c as any)) return c.json({ error: 'Forbidden' }, 403);

    const id = c.req.param('id');
    const existing = await c.env.DB
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(id)
      .first<{ id: string }>();
    if (!existing) return c.json({ error: 'User not found' }, 404);

    const token = await issuePasswordToken(c.env.DB, id, 'reset');
    const response: ResetLinkResponse = { reset_token: token };
    return c.json(response);
  } catch (error) {
    console.error('Create reset link error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

adminUsers.post('/users/:id/impersonate', async (c) => {
  try {
    if (!ensureAdmin(c as any)) return c.json({ error: 'Forbidden' }, 403);

    const sessionId = getSessionId(c as any);
    if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    const existing = await c.env.DB
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(id)
      .first<{ id: string }>();
    if (!existing) return c.json({ error: 'User not found' }, 404);

    await c.env.DB
      .prepare('UPDATE sessions SET impersonated_user_id = ? WHERE id = ?')
      .bind(id, sessionId)
      .run();

    return c.json({ success: true, impersonated_user_id: id });
  } catch (error) {
    console.error('Impersonate user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

adminUsers.post('/impersonation/clear', async (c) => {
  try {
    if (!ensureAdmin(c as any)) return c.json({ error: 'Forbidden' }, 403);

    const sessionId = getSessionId(c as any);
    if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

    await c.env.DB
      .prepare('UPDATE sessions SET impersonated_user_id = NULL WHERE id = ?')
      .bind(sessionId)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error('Clear impersonation error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

adminUsers.delete('/users/:id', async (c) => {
  try {
    const admin = ensureAdmin(c as any);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);

    const id = c.req.param('id');
    if (id === admin.id) {
      return c.json({ error: 'Cannot delete your own admin account' }, 400);
    }

    const existing = await c.env.DB
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(id)
      .first<{ id: string }>();
    if (!existing) return c.json({ error: 'User not found' }, 404);

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM transactions WHERE user_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM ingested_files WHERE user_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM password_tokens WHERE user_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      c.env.DB.prepare('UPDATE sessions SET impersonated_user_id = NULL WHERE impersonated_user_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
    ]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default adminUsers;
