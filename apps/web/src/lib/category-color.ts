const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export const DEFAULT_CATEGORY_COLOR = '#3b82f6';

export function resolveCategoryColor(
  color: string | null | undefined,
  parentColor?: string | null,
  fallback: string = DEFAULT_CATEGORY_COLOR
): string {
  if (typeof color === 'string' && HEX_COLOR_RE.test(color)) return color;
  if (typeof parentColor === 'string' && HEX_COLOR_RE.test(parentColor)) return parentColor;
  return fallback;
}
