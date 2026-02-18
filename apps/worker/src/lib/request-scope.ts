import type { SessionUser } from './auth';

type ContextLike = {
  get: (key: string) => unknown;
};

export function getAuthUser(c: ContextLike): SessionUser | null {
  return (c.get('authUser') as SessionUser | undefined) ?? null;
}

export function getEffectiveUser(c: ContextLike): SessionUser | null {
  return (c.get('effectiveUser') as SessionUser | undefined) ?? null;
}

export function getSessionId(c: ContextLike): string | null {
  return (c.get('sessionId') as string | undefined) ?? null;
}

export function isImpersonating(c: ContextLike): boolean {
  return Boolean(c.get('isImpersonating'));
}

export function getScopeUserId(c: ContextLike): string | null {
  const effectiveUser = getEffectiveUser(c) ?? getAuthUser(c);
  return effectiveUser?.id ?? null;
}

export function applyUserScope(
  conditions: string[],
  params: Array<string | number>,
  scopeUserId: string | null,
  tableAlias: string = 't'
): void {
  if (!scopeUserId) return;
  conditions.push(`${tableAlias}.user_id = ?`);
  params.push(scopeUserId);
}

export function ensureAdmin(c: ContextLike): SessionUser | null {
  const user = getAuthUser(c);
  if (!user || user.role !== 'admin') return null;
  return user;
}
