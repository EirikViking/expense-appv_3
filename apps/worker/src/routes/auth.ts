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

    if (password !== c.env.ADMIN_PASSWORD) {
      return c.json({ error: 'Invalid password' }, 401);
    }

    // Create JWT that expires in 24 hours
    const exp = Date.now() + 24 * 60 * 60 * 1000;
    const token = await signJwt({ authenticated: true, exp }, c.env.JWT_SECRET);

    // Set HttpOnly cookie
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    });

    return c.json({ success: true });
  } catch (error) {
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
