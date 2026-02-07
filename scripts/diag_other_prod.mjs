/* eslint-disable no-console */
// Prod diagnostic: explain what's inflating "Other" and how much is actually transfer/payment-rail noise.
// No secrets/JWTs are printed.

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.RUN_REBUILD_PASSWORD;

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const date_from = argValue('--from');
const date_to = argValue('--to');

if (!date_from || !date_to) {
  console.error('Usage: pnpm run diag:other:prod -- --from YYYY-MM-DD --to YYYY-MM-DD');
  process.exit(2);
}

async function jsonRequest(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : `HTTP ${res.status}`;
    throw new Error(`${method} ${path} failed: ${msg}`);
  }

  return data;
}

async function login() {
  if (!PASSWORD) throw new Error('Missing RUN_REBUILD_PASSWORD env var');
  const data = await jsonRequest('/auth/login', { method: 'POST', body: { password: PASSWORD } });
  if (!data || typeof data.token !== 'string' || !data.token) throw new Error('Login failed: token missing from response');
  return data.token;
}

async function fetchAllTransactions(token, query, { max = 10000 } = {}) {
  const limit = 500;
  let offset = 0;
  let out = [];

  while (true) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, limit, offset, sort_by: 'date', sort_order: 'desc' })) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const res = await jsonRequest(`/transactions?${qs.toString()}`, { token });
    const txs = Array.isArray(res.transactions) ? res.transactions : [];
    out = out.concat(txs);
    if (txs.length < limit) break;
    offset += limit;
    if (out.length >= max) break;
  }

  return out;
}

function absSumAmounts(txs) {
  let sum = 0;
  for (const tx of txs) {
    const n = Number(tx.amount);
    if (!Number.isFinite(n)) continue;
    sum += Math.abs(n);
  }
  return sum;
}

function groupTopByLabel(txs, { top = 15 } = {}) {
  const map = new Map(); // label -> { count, total_abs }
  for (const tx of txs) {
    const label = String(tx.merchant_name || tx.merchant || tx.description || 'Unknown').trim() || 'Unknown';
    const n = Number(tx.amount);
    if (!Number.isFinite(n)) continue;
    const cur = map.get(label) || { count: 0, total_abs: 0 };
    cur.count += 1;
    cur.total_abs += Math.abs(n);
    map.set(label, cur);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.total_abs - a.total_abs)
    .slice(0, top);
}

const PAYMENT_RAIL_TERMS = [
  'Straksbetaling',
  'SEB Kort',
  'engangsfullmakt',
  'Betaling med engangsfullmakt',
  'Kjøp Kron',
  'Kron - Uttak',
  'betaling av kredittkort',
  'kredittkortregning',
];

async function run() {
  const token = await login();

  const paramsBase = { date_from, date_to, include_transfers: false };
  const overview = await jsonRequest('/analytics/overview?' + new URLSearchParams(paramsBase).toString(), { token });
  const byCategory = await jsonRequest('/analytics/by-category?' + new URLSearchParams(paramsBase).toString(), { token });
  const categories = Array.isArray(byCategory.categories) ? byCategory.categories : [];
  const other = categories.find((c) => c && c.category_id === 'cat_other') || null;

  const otherMerchants = await jsonRequest(
    '/analytics/by-merchant?' + new URLSearchParams({ ...paramsBase, category_id: 'cat_other', limit: '25' }).toString(),
    { token }
  );

  // For deeper diagnosis, fetch "Other" transactions but cap to avoid massive downloads.
  const otherTxs = await fetchAllTransactions(token, {
    date_from,
    date_to,
    category_id: 'cat_other',
    flow_type: 'expense',
    include_transfers: false,
    include_excluded: false,
  }, { max: 8000 });

  const otherTopLabels = groupTopByLabel(otherTxs, { top: 20 });

  const termStats = [];
  for (const term of PAYMENT_RAIL_TERMS) {
    const txs = await fetchAllTransactions(token, {
      date_from,
      date_to,
      search: term,
      include_excluded: true,
      include_transfers: true,
    }, { max: 3000 });

    const active = txs.filter((t) => !t.is_excluded && !t.is_transfer && t.flow_type !== 'transfer');
    const excludedOrTransfer = txs.filter((t) => t.is_excluded || t.is_transfer || t.flow_type === 'transfer');

    termStats.push({
      term,
      total: txs.length,
      active_count: active.length,
      active_abs_sum: Math.round(absSumAmounts(active) * 100) / 100,
      excluded_or_transfer_count: excludedOrTransfer.length,
      excluded_or_transfer_abs_sum: Math.round(absSumAmounts(excludedOrTransfer) * 100) / 100,
    });
  }

  console.log(JSON.stringify({
    period: { date_from, date_to },
    overview: {
      expenses: Number(overview?.expenses || 0),
      income: Number(overview?.income || 0),
      net_spend: Number(overview?.net_spend || 0),
    },
    other: {
      by_category_total: other ? Number(other.total || 0) : 0,
      by_category_count: other ? Number(other.count || 0) : 0,
      ratio_of_expenses: overview?.expenses ? (Number(other?.total || 0) / Number(overview.expenses)) : null,
      top_from_transactions_sample: otherTopLabels,
      top_from_by_merchant: Array.isArray(otherMerchants?.merchants) ? otherMerchants.merchants.slice(0, 25) : [],
      note: otherTxs.length >= 8000 ? 'Other tx sample capped at 8000 for speed; use shorter range for full detail.' : undefined,
    },
    payment_rail_terms: termStats,
  }, null, 2));
}

run().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

