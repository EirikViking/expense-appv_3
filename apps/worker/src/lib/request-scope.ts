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

export function isImpersonating(c: ContextLike): boolean {
  return Boolean(c.get('isImpersonating'));
}

export function getScopeUserId(c: ContextLike): string | null {
  const authUser = getAuthUser(c);
  const effectiveUser = getEffectiveUser(c) ?? authUser;
  const impersonating = isImpersonating(c);
  if (!authUser || !effectiveUser) return null;

  // Admin sees all by default, unless actively impersonating someone.
  if (authUser.role === 'admin' && !impersonating) return null;
  return effectiveUser.id;
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
