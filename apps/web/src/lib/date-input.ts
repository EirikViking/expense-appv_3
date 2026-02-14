export type ParsedDateInput =
  | { ok: true; iso: string }
  | { ok: false; reason: 'invalid_format' | 'invalid_date' };

function toIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function parseDateInput(raw: string): ParsedDateInput {
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'invalid_format' };

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const parsed = toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return parsed ? { ok: true, iso: parsed } : { ok: false, reason: 'invalid_date' };
  }

  const dot = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (dot) {
    const parsed = toIso(Number(dot[3]), Number(dot[2]), Number(dot[1]));
    return parsed ? { ok: true, iso: parsed } : { ok: false, reason: 'invalid_date' };
  }

  const slashNor = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (slashNor) {
    const parsed = toIso(Number(slashNor[3]), Number(slashNor[2]), Number(slashNor[1]));
    return parsed ? { ok: true, iso: parsed } : { ok: false, reason: 'invalid_date' };
  }

  const slashIso = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value);
  if (slashIso) {
    const parsed = toIso(Number(slashIso[1]), Number(slashIso[2]), Number(slashIso[3]));
    return parsed ? { ok: true, iso: parsed } : { ok: false, reason: 'invalid_date' };
  }

  return { ok: false, reason: 'invalid_format' };
}

export function validateDateRange(from: string, to: string): boolean {
  if (!from || !to) return true;
  return from <= to;
}

