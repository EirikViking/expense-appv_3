function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0];
  else if (hh >= 1 && hh < 2) [r, g, b] = [x, c, 0];
  else if (hh >= 2 && hh < 3) [r, g, b] = [0, c, x];
  else if (hh >= 3 && hh < 4) [r, g, b] = [0, x, c];
  else if (hh >= 4 && hh < 5) [r, g, b] = [x, 0, c];
  else if (hh >= 5 && hh < 6) [r, g, b] = [c, 0, x];

  const m = light - c / 2;
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function darkenHexColor(hex: string, factor = 0.24): string {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const mul = 1 - factor;
  return `#${clamp(r * mul).toString(16).padStart(2, '0')}${clamp(g * mul).toString(16).padStart(2, '0')}${clamp(b * mul).toString(16).padStart(2, '0')}`;
}

export function getCategoryChartColor(seed: string): string {
  const hash = hashSeed(seed || 'unknown');
  const hue = hash % 360;
  const saturation = 62 + (hash % 14);
  const lightness = 46 + ((hash >>> 4) % 10);
  return hslToHex(hue, saturation, lightness);
}
