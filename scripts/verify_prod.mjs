/* eslint-disable no-console */
// Verifies key production invariants after rebuild, without printing auth tokens/JWTs.

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.RUN_REBUILD_PASSWORD;

const PURCHASE_TERMS = [
  'CUTTERS',
  'XXL',
  'SATS',
  'GOOGLE ONE',
  'GOOGLE *GOOGLE ONE',
  'LOS TACOS',
  'NARVESEN',
  'REMA',
  'KIWI',
  'MENY',
];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  if (!PASSWORD) {
    throw new Error('Missing RUN_REBUILD_PASSWORD env var');
  }
  const data = await jsonRequest('/auth/login', {
    method: 'POST',
    body: { password: PASSWORD },
  });

  if (!data || typeof data.token !== 'string' || !data.token) {
    throw new Error('Login failed: token missing from response');
  }
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

async function run() {
  const token = await login();

  const argValue = (flag) => {
    const idx = process.argv.indexOf(flag);
    if (idx === -1) return null;
    return process.argv[idx + 1] || null;
  };

  const now = new Date();
  const date_from = argValue('--from') || `${now.getFullYear()}-01-01`;
  const date_to = argValue('--to') || isoDate(now);

  // 0) Server-side validation gate (fast fail)
  const validate = await jsonRequest(
    '/transactions/admin/validate-ingest?' + new URLSearchParams({ date_from, date_to }).toString(),
    { token }
  );

  const validatePass = Boolean(validate?.ok);

  // 1) Groceries analytics total vs transactions sum(abs(amount))
  const byCat = await jsonRequest('/analytics/by-category?' + new URLSearchParams({ date_from, date_to }).toString(), { token });
  const cats = Array.isArray(byCat.categories) ? byCat.categories : [];
  const groceriesRow = cats.find((c) => c && c.category_id === 'cat_food_groceries');
  const groceriesAnalytics = groceriesRow ? Number(groceriesRow.total) : 0;

  const groceriesTxs = await fetchAllTransactions(token, {
    date_from,
    date_to,
    category_id: 'cat_food_groceries',
    include_transfers: false,
  });
  const groceriesTxSum = absSumAmounts(
    groceriesTxs.filter((t) => t && (t.flow_type === 'expense' || (t.flow_type === 'unknown' && Number(t.amount) < 0)))
  );
  const groceriesDelta = Math.abs(groceriesAnalytics - groceriesTxSum);
  const groceriesPass = groceriesDelta <= 1.0;

  // 1c) Guard against double-reporting: /analytics/by-category total should match /analytics/summary total_expenses.
  const summary = await jsonRequest(
    '/analytics/summary?' + new URLSearchParams({ date_from, date_to }).toString(),
    { token }
  );
  const summaryExpenses = Number(summary?.total_expenses || 0);
  const byCategoryTotal = Number(byCat?.total || 0);
  const categoryDelta = Math.abs(summaryExpenses - byCategoryTotal);
  const noDoubleCountPass = categoryDelta <= 1.0;

  // 1b) Search should find ingested REMA transactions when PDF raw text contains REMA.
  const pdfTxs = await fetchAllTransactions(token, {
    date_from,
    date_to,
    source_type: 'pdf',
    include_transfers: false,
    include_excluded: true,
  });
  const pdfRemaRawCount = (() => {
    let c = 0;
    for (const tx of pdfTxs) {
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
        if (hay.includes('rema')) c++;
      } catch {
        // ignore
      }
    }
    return c;
  })();
  const pdfRemaSearchTxs = await fetchAllTransactions(token, {
    date_from,
    date_to,
    source_type: 'pdf',
    search: 'REMA',
    include_transfers: false,
    include_excluded: true,
  });
  const remaSearchPass = pdfRemaRawCount === 0 ? true : (pdfRemaSearchTxs.length > 0);

  // 2) Income must not contain obvious purchase merchants (by search)
  const incomeViolations = [];
  for (const term of PURCHASE_TERMS) {
    const txs = await fetchAllTransactions(token, {
      date_from,
      date_to,
      flow_type: 'income',
      search: term,
      include_transfers: false,
    });
    if (txs.length > 0) {
      incomeViolations.push({ term, count: txs.length });
    }
  }
  const incomePass = incomeViolations.length === 0;

  const pass = validatePass && groceriesPass && noDoubleCountPass && remaSearchPass && incomePass;

  console.log(
    JSON.stringify(
      {
        period: { date_from, date_to },
        validate: {
          ok: validatePass,
          failures: Array.isArray(validate?.failures) ? validate.failures : [],
        },
        groceries: {
          analytics_total: groceriesAnalytics,
          tx_abs_sum: groceriesTxSum,
          delta: groceriesDelta,
          pass: groceriesPass,
          tx_count: groceriesTxs.length,
        },
        totals: {
          summary_expenses: summaryExpenses,
          by_category_total: byCategoryTotal,
          delta: categoryDelta,
          pass: noDoubleCountPass,
        },
        search: {
          pdf_rema_raw_count: pdfRemaRawCount,
          pdf_rema_search_count: pdfRemaSearchTxs.length,
          pass: remaSearchPass,
        },
        income: {
          pass: incomePass,
          violations: incomeViolations,
        },
        pass,
      },
      null,
      2
    )
  );

  if (!pass) process.exit(1);
}

run().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
