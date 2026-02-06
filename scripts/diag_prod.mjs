/* eslint-disable no-console */
// Production diagnostics for ingestion vs analytics correctness (no JWT printing).

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.RUN_REBUILD_PASSWORD;

const GROCERY_TERMS = ['REMA', 'KIWI', 'MENY', 'COOP', 'EXTRA', 'OBS', 'SPAR', 'JOKER'];

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const date_from = argValue('--from');
const date_to = argValue('--to');

if (!date_from || !date_to) {
  console.error('Usage: pnpm run diag:prod -- --from YYYY-MM-DD --to YYYY-MM-DD');
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

async function fetchAllTransactions(token, query) {
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
    if (offset > 200000) throw new Error('Too many transactions; aborting');
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

function countPdfRawMatches(txs, term) {
  const needle = term.toLowerCase();
  let count = 0;
  for (const tx of txs) {
    if (!tx || typeof tx.raw_json !== 'string') continue;
    try {
      const obj = JSON.parse(tx.raw_json);
      const hay = [
        obj?.raw_line,
        obj?.raw_block,
        obj?.parsed_description,
        obj?.merchant_hint,
        tx.description,
        tx.merchant,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .join('\n');
      if (hay.includes(needle)) count++;
    } catch {
      // ignore
    }
  }
  return count;
}

async function run() {
  const token = await login();

  const validate = await jsonRequest(
    '/transactions/admin/validate-ingest?' + new URLSearchParams({ date_from, date_to }).toString(),
    { token }
  );

  const byCat = await jsonRequest(
    '/analytics/by-category?' + new URLSearchParams({ date_from, date_to }).toString(),
    { token }
  );
  const cats = Array.isArray(byCat.categories) ? byCat.categories : [];
  const groceriesRow = cats.find((c) => c && c.category_id === 'cat_food_groceries');
  const groceriesAnalytics = groceriesRow ? Number(groceriesRow.total) : 0;

  const groceriesTxs = await fetchAllTransactions(token, {
    date_from,
    date_to,
    category_id: 'cat_food_groceries',
    flow_type: 'expense',
    include_transfers: false,
  });
  const groceriesTxSum = absSumAmounts(groceriesTxs);
  const groceriesDelta = Math.abs(groceriesAnalytics - groceriesTxSum);

  const pdfTxs = await fetchAllTransactions(token, {
    date_from,
    date_to,
    source_type: 'pdf',
    include_transfers: false,
    include_excluded: true,
  });

  const pdfRawMatches = {};
  for (const term of GROCERY_TERMS) {
    pdfRawMatches[term] = countPdfRawMatches(pdfTxs, term);
  }

  console.log(
    JSON.stringify(
      {
        period: { date_from, date_to },
        groceries: {
          analytics_total: groceriesAnalytics,
          tx_abs_sum: groceriesTxSum,
          delta: groceriesDelta,
          tx_count: groceriesTxs.length,
        },
        pdf: {
          tx_count: pdfTxs.length,
          raw_matches: pdfRawMatches,
        },
        zero_amount: {
          total: Number(validate?.counts?.zero_amount?.active || 0) + Number(validate?.counts?.zero_amount?.excluded || 0),
          active: Number(validate?.counts?.zero_amount?.active || 0),
          excluded: Number(validate?.counts?.zero_amount?.excluded || 0),
        },
        validate: {
          ok: Boolean(validate?.ok),
          failures: Array.isArray(validate?.failures) ? validate.failures : [],
        },
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
