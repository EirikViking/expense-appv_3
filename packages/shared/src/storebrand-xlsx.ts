// Storebrand XLSX export helpers.
// These are intentionally dependency-free (no XLSX lib) so they can be used from both web and worker tests.

export interface StorebrandRow5 {
  date: unknown;
  text: unknown;
  amount: unknown;
  balance: unknown;
  currency: unknown;
}

export interface StorebrandParsedRow5 {
  tx_date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  currency: string;
  raw_row: StorebrandRow5;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Excel serial date to ISO (UTC, with Excel leap-year bug).
function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  if (serial < 1 || serial > 100000) return null;

  const adjusted = serial > 60 ? serial - 1 : serial;
  const epoch = Date.UTC(1900, 0, 1);
  const d = new Date(epoch + (adjusted - 1) * 24 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  if (y < 1990 || y > 2050) return null;
  return `${y}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function parseStorebrandDate(value: unknown): string | null {
  if (typeof value === 'number') return excelSerialToIso(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    if (y < 1990 || y > 2050) return null;
    return `${y}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;

  // Numeric stored as string (excel serial)
  const maybeSerial = Number(s);
  if (Number.isFinite(maybeSerial) && maybeSerial > 30000 && maybeSerial < 100000) {
    return excelSerialToIso(maybeSerial);
  }

  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD.MM.YYYY
  const dot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (dot) {
    const day = Number(dot[1]);
    const mon = Number(dot[2]);
    const year = Number(dot[3]);
    if (year < 1990 || year > 2050) return null;
    if (mon < 1 || mon > 12) return null;
    if (day < 1 || day > 31) return null;
    return `${year}-${pad2(mon)}-${pad2(day)}`;
  }

  return null;
}

export function parseStorebrandAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value === null || value === undefined) return null;

  const s0 = String(value).trim();
  if (!s0) return null;

  // Reject obvious date tokens
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s0) || /^\d{4}-\d{2}-\d{2}$/.test(s0)) return null;

  // Remove currency suffix and spaces
  let s = s0.replace(/\s?(kr|nok)$/i, '').trim();
  s = s.replace(/\s/g, '');

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  // If both comma and dot exist, assume dot is thousands separator
  if (hasComma && hasDot) s = s.replace(/\./g, '');
  s = s.replace(',', '.');

  // Must look like a number token (avoid parsing random text)
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function isLikelyStorebrandCurrency(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim().toUpperCase();
  return s.length === 3 && /^[A-Z]{3}$/.test(s);
}

export function parseStorebrandRow5(row: StorebrandRow5): StorebrandParsedRow5 | null {
  const tx_date = parseStorebrandDate(row.date);
  if (!tx_date) return null;

  const description = String(row.text ?? '').replace(/\s+/g, ' ').trim();
  if (!description) return null;

  const amount = parseStorebrandAmount(row.amount);
  if (amount === null) return null;

  const currency = (() => {
    const s = String(row.currency ?? '').trim().toUpperCase();
    return s && isLikelyStorebrandCurrency(s) ? s : 'NOK';
  })();

  return {
    tx_date,
    description,
    amount,
    currency,
    raw_row: row,
  };
}

export function looksLikeStorebrandFiveColRow(values: unknown[]): boolean {
  if (!Array.isArray(values) || values.length !== 5) return false;

  const [d, text, amount, balance, currency] = values;
  if (!parseStorebrandDate(d)) return false;

  const t = String(text ?? '').trim();
  if (t.length < 2) return false;

  const a = parseStorebrandAmount(amount);
  const b = parseStorebrandAmount(balance);
  if (a === null || b === null) return false;

  // Currency is usually NOK; allow missing but prefer present.
  const c = String(currency ?? '').trim().toUpperCase();
  if (c && !isLikelyStorebrandCurrency(c)) return false;

  return true;
}

