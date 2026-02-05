import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { loginRequestSchema } from '@expense/shared';
import { signJwt } from '../lib/jwt';
import type { Env } from '../types';

const auth = new Hono<{ Bindings: Env }>();

auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = loginRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.message }, 400);
    }

    const { password } = parsed.data;

    const adminPassword = c.env.ADMIN_PASSWORD;
    const jwtSecret = c.env.JWT_SECRET;

    // Fail loudly (and log) if secrets/vars are missing in production.
    if (!adminPassword || typeof adminPassword !== 'string') {
      console.error('Missing/invalid ADMIN_PASSWORD binding');
      return c.json({ error: 'Server misconfigured' }, 500);
    }
    if (!jwtSecret || typeof jwtSecret !== 'string') {
      console.error('Missing/invalid JWT_SECRET binding');
      return c.json({ error: 'Server misconfigured' }, 500);
    }

    if (password !== adminPassword) {
      return c.json({ error: 'Invalid password' }, 401);
    }

    // Create JWT that expires in 24 hours
    const exp = Date.now() + 24 * 60 * 60 * 1000;
    const token = await signJwt({ authenticated: true, exp }, jwtSecret);

    // Set cookie for same-origin requests (with cross-origin compatible settings)
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 24 * 60 * 60,
      path: '/',
    });

    // Also return token in response body for cross-origin clients to store and send via Authorization header
    return c.json({ success: true, token });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

auth.post('/logout', (c) => {
  setCookie(c, 'auth_token', '', {
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
    maxAge: 0,
    path: '/',
  });

  return c.json({ success: true });
});

export default auth;
