import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { generateId, sha256Hex, type AppUser, type UserRole } from '@expense/shared';

const WORKER_PBKDF2_MAX_ITERS = 100_000;
export const PASSWORD_ITERS = WORKER_PBKDF2_MAX_ITERS;
export const INVITE_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const SESSION_MAX_AGE_SHORT_SECONDS = 24 * 60 * 60;
export const SESSION_MAX_AGE_LONG_SECONDS = 30 * 24 * 60 * 60;

type PasswordTokenType = 'invite' | 'reset';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: number;
  onboarding_done_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserWithPasswordRow extends UserRow {
  password_salt: string | null;
  password_hash: string | null;
  password_iters: number | null;
}

export interface SessionUser extends AppUser {}

export interface PasswordTokenUsage {
  token_id: string;
  user_id: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  const b64 = btoa(String.fromCharCode(...buffer));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromHex(saltHex),
      iterations,
    },
    keyMaterial,
    256
  );
  return toHex(new Uint8Array(bits));
}

function secureCookie(url: string): boolean {
  return url.startsWith('https://');
}

export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function sanitizeUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active === 1,
    onboarding_done_at: row.onboarding_done_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function hashPassword(password: string): Promise<{
  salt: string;
  hash: string;
  iterations: number;
}> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = toHex(saltBytes);
  const hash = await pbkdf2Hex(password, salt, PASSWORD_ITERS);
  return { salt, hash, iterations: PASSWORD_ITERS };
}

export async function verifyPassword(password: string, user: UserWithPasswordRow): Promise<boolean> {
  if (!user.password_salt || !user.password_hash || !user.password_iters) return false;
  const hash = await pbkdf2Hex(password, user.password_salt, user.password_iters);
  return hash === user.password_hash;
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserWithPasswordRow | null> {
  return db
    .prepare(
      `SELECT id, email, name, role, active, password_salt, password_hash, password_iters, onboarding_done_at, created_at, updated_at
       FROM users
       WHERE email = ?`
    )
    .bind(normalizeEmail(email))
    .first<UserWithPasswordRow>();
}

export async function getUserById(db: D1Database, userId: string): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT id, email, name, role, active, onboarding_done_at, created_at, updated_at
       FROM users
       WHERE id = ?`
    )
    .bind(userId)
    .first<UserRow>();
}

export async function createSession(db: D1Database, userId: string, maxAgeSeconds: number): Promise<string> {
  const sessionId = randomToken(32);
  const now = new Date().toISOString();
  const expiresAt = nowUnixSeconds() + maxAgeSeconds;
  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, userId, expiresAt, now)
    .run();
  return sessionId;
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export function readSessionCookie(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return getCookie(c as any, 'session') ?? null;
}

export function setSessionCookie(
  c: { req: { url: string } },
  sessionId: string,
  maxAgeSeconds: number
): void {
  setCookie(c as any, 'session', sessionId, {
    httpOnly: true,
    secure: secureCookie(c.req.url),
    sameSite: 'Lax',
    maxAge: maxAgeSeconds,
    path: '/',
  });
}

export function clearSessionCookie(c: { req: { url: string } }): void {
  deleteCookie(c as any, 'session', {
    httpOnly: true,
    secure: secureCookie(c.req.url),
    sameSite: 'Lax',
    path: '/',
  });
}

export async function getSessionUser(db: D1Database, sessionId: string): Promise<SessionUser | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.active, u.onboarding_done_at, u.created_at, u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?
         AND s.expires_at > ?
         AND u.active = 1`
    )
    .bind(sessionId, nowUnixSeconds())
    .first<UserRow>();

  if (!row) return null;
  return sanitizeUser(row);
}

export async function issuePasswordToken(
  db: D1Database,
  userId: string,
  type: PasswordTokenType
): Promise<string> {
  const rawToken = randomToken(48);
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date().toISOString();
  const expiresAt = nowUnixSeconds() + INVITE_TOKEN_TTL_SECONDS;
  await db
    .prepare(
      `INSERT INTO password_tokens (id, user_id, token_hash, type, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(generateId(), userId, tokenHash, type, expiresAt, now)
    .run();

  return rawToken;
}

export async function consumePasswordToken(
  db: D1Database,
  rawToken: string,
  type: PasswordTokenType
): Promise<PasswordTokenUsage | null> {
  const tokenHash = await sha256Hex(rawToken);
  const now = nowUnixSeconds();
  const tokenRow = await db
    .prepare(
      `SELECT id, user_id
       FROM password_tokens
       WHERE token_hash = ?
         AND type = ?
         AND used_at IS NULL
         AND expires_at > ?`
    )
    .bind(tokenHash, type, now)
    .first<{ id: string; user_id: string }>();

  if (!tokenRow) return null;

  const usedAt = new Date().toISOString();
  const result = await db
    .prepare('UPDATE password_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .bind(usedAt, tokenRow.id)
    .run();

  if ((result.meta?.changes ?? 0) !== 1) {
    return null;
  }

  return { token_id: tokenRow.id, user_id: tokenRow.user_id };
}
