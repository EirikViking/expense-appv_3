/* eslint-disable no-console */
// Auto-reclassify cat_other transactions in prod using a simple Naive Bayes classifier
// trained on already-categorized transactions.
//
// Guardrails:
// - Never prints JWTs/tokens
// - Dry-run by default; use --apply to write
// - Only touches active non-transfer rows (same scope as analytics)

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.RUN_REBUILD_PASSWORD;

function arg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
    const msg = data && (data.error || data.message) ? String(data.error || data.message) : `HTTP ${res.status}`;
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

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set([
  'notanr',
  'kurs',
  'usd',
  'eur',
  'nok',
  'aud',
  'try',
  'sek',
  'dkk',
  'gbp',
  'chf',
  'payment',
  'betaling',
  'betal',
  'dato',
  'til',
  'fra',
  'as',
  'ab',
  'no',
  'www',
  'http',
  'https',
]);

function tokenize(text) {
  const t = normalizeText(text);
  if (!t) return [];
  const tokens = t
    .split(/[^a-z0-9æøå]+/i)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && x.length <= 32);
  return tokens.filter((x) => !STOP.has(x));
}

function softmaxTop2(logA, logB) {
  // stable softmax for two values
  const m = Math.max(logA, logB);
  const ea = Math.exp(logA - m);
  const eb = Math.exp(logB - m);
  const sum = ea + eb;
  return [ea / sum, eb / sum];
}

function trainNB(examples, { minDocsPerCat = 10, alpha = 1 } = {}) {
  const byCat = new Map();
  const vocab = new Map(); // token -> idx

  for (const ex of examples) {
    const cat = ex.category_id;
    if (!cat || cat === 'cat_other') continue;
    const tokens = tokenize(ex.text);
    if (tokens.length === 0) continue;

    let st = byCat.get(cat);
    if (!st) {
      st = { docs: 0, tokenTotal: 0, tokenCounts: new Map() };
      byCat.set(cat, st);
    }
    st.docs++;
    for (const tok of tokens) {
      st.tokenTotal++;
      st.tokenCounts.set(tok, (st.tokenCounts.get(tok) || 0) + 1);
      if (!vocab.has(tok)) vocab.set(tok, vocab.size);
    }
  }

  // prune small cats
  for (const [cat, st] of [...byCat.entries()]) {
    if (st.docs < minDocsPerCat) byCat.delete(cat);
  }

  const cats = [...byCat.keys()];
  const totalDocs = [...byCat.values()].reduce((a, s) => a + s.docs, 0);
  const V = Math.max(1, vocab.size);

  const model = {
    alpha,
    cats,
    totalDocs,
    V,
    byCat,
  };

  function score(text) {
    const tokens = tokenize(text);
    if (tokens.length === 0) return null;
    const out = [];
    for (const cat of cats) {
      const st = byCat.get(cat);
      const prior = Math.log((st.docs + alpha) / (totalDocs + alpha * cats.length));
      let lp = prior;
      for (const tok of tokens) {
        const c = st.tokenCounts.get(tok) || 0;
        lp += Math.log((c + alpha) / (st.tokenTotal + alpha * V));
      }
      out.push([cat, lp]);
    }
    out.sort((a, b) => b[1] - a[1]);
    const [topCat, topLp] = out[0] || [];
    const [secondCat, secondLp] = out[1] || [null, -Infinity];
    const margin = topLp - (secondLp ?? -Infinity);
    const [pTop] = softmaxTop2(topLp, secondLp ?? -Infinity);
    return { topCat, pTop, margin, secondCat };
  }

  return { model, score };
}

async function fetchAllTransactions(token, query, { hardCap = 20000 } = {}) {
  const limit = toNum(query.limit, 500);
  let offset = 0;
  let all = [];

  while (true) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, limit, offset })) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const res = await jsonRequest(`/transactions?${qs.toString()}`, { token });
    const txs = Array.isArray(res.transactions) ? res.transactions : [];
    all = all.concat(txs);
    const total = Number(res.total || 0);
    if (all.length >= total) break;
    if (txs.length < limit) break;
    offset += limit;
    if (all.length > hardCap) throw new Error('Too many transactions; aborting');
  }
  return all;
}

async function main() {
  const apply = hasFlag('--apply');
  const force = hasFlag('--force');
  const minConf = toNum(arg('--min_conf', '0.75'), 0.75);
  const minMargin = toNum(arg('--min_margin', '1.2'), 1.2);
  const minDocsPerCat = toNum(arg('--min_docs', '10'), 10);
  const maxUpdates = toNum(arg('--max_updates', '2000'), 2000);

  const token = await login();

  // Category hierarchy (for force mode we collapse to top-level categories to reduce over-specific misclassifications).
  let parentById = new Map();
  try {
    const flat = await jsonRequest('/categories/flat', { token });
    const cats = Array.isArray(flat?.categories) ? flat.categories : [];
    parentById = new Map(cats.map((c) => [c.id, c.parent_id ?? null]));
  } catch {
    parentById = new Map();
  }

  const KEEP_AS_IS = new Set([
    'cat_food_groceries',
    'cat_bills_tax',
  ]);

  function toTopLevel(catId) {
    if (!catId) return catId;
    if (KEEP_AS_IS.has(catId)) return catId;
    let cur = catId;
    let guard = 0;
    while (guard++ < 8) {
      const p = parentById.get(cur);
      if (!p) return cur;
      cur = p;
    }
    return cur;
  }

  const otherCountRes = await jsonRequest(
    '/transactions?' +
      new URLSearchParams({
        category_id: 'cat_other',
        include_transfers: 'false',
        include_excluded: 'false',
        limit: '1',
        offset: '0',
      }).toString(),
    { token }
  );
  const otherBefore = Number(otherCountRes.total || 0);

  // 1) Training set = active non-transfer, already categorized to something other than cat_other.
  const allActive = await fetchAllTransactions(token, { include_transfers: false, include_excluded: false, limit: 500 });
  const train = allActive
    .filter((t) => t.category_id && t.category_id !== 'cat_other')
    .map((t) => ({
      category_id: t.category_id,
      text: `${t.merchant_name || t.merchant || ''} ${t.description || ''}`.trim(),
    }));

  const { score } = trainNB(train, { minDocsPerCat, alpha: 1 });

  // 2) Target = active cat_other rows.
  const otherTxs = await fetchAllTransactions(token, {
    category_id: 'cat_other',
    include_transfers: false,
    include_excluded: false,
    limit: 500,
    sort_by: 'date',
    sort_order: 'desc',
  });

  const plan = [];
  const dist = new Map();
  let skippedNoScore = 0;
  let skippedByGuard = 0;
  for (const tx of otherTxs) {
    const text = `${tx.merchant_name || tx.merchant || ''} ${tx.description || ''}`.trim();
    const s = score(text);
    if (!s || !s.topCat) {
      skippedNoScore++;
      continue;
    }

    // Guards to prevent obviously wrong assignments in aggressive mode.
    const lower = normalizeText(text);
    const isGroceryHint = /\b(kiwi|rema|meny|coop|extra|obs|spar|joker)\b/.test(lower);
    const isVippsHint = /\bvipps\b/.test(lower);
    const isTaxHint = /\bskatteetaten\b/.test(lower);

    const cat = force ? toTopLevel(s.topCat) : s.topCat;
    const okByGuard =
      (cat !== 'cat_food_groceries' || isGroceryHint) &&
      (cat !== 'cat_other_p2p' || isVippsHint) &&
      (cat !== 'cat_bills_tax' || isTaxHint) &&
      // Don't force "Income" categories onto negative expenses.
      (!String(cat).startsWith('cat_income') || Number(tx.amount) > 0);

    if (!okByGuard) {
      skippedByGuard++;
      continue;
    }

    const passesThresholds = s.pTop >= minConf && s.margin >= minMargin;
    if ((force || passesThresholds) && cat !== 'cat_other') {
      plan.push({ id: tx.id, category_id: cat, prev_notes: tx.notes || null });
      dist.set(cat, (dist.get(cat) || 0) + 1);
      if (plan.length >= maxUpdates) break;
    }
  }

  const wouldUpdate = plan.length;
  const otherAfterEstimate = Math.max(0, otherBefore - wouldUpdate);

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry_run',
        other_before: otherBefore,
        other_candidates_scanned: otherTxs.length,
        would_update: wouldUpdate,
        other_after_estimate: otherAfterEstimate,
        force,
        min_conf: minConf,
        min_margin: minMargin,
        min_docs: minDocsPerCat,
        skipped_no_score: skippedNoScore,
        skipped_by_guard: skippedByGuard,
        top_target_categories: [...dist.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([category_id, count]) => ({ category_id, count })),
      },
      null,
      2
    )
  );

  if (!apply) return;

  let updated = 0;
  for (const item of plan) {
    const stamp = `[auto] other-reclassify: ${new Date().toISOString()}`;
    const nextNotes = item.prev_notes ? `${item.prev_notes}\n${stamp}` : stamp;
    await jsonRequest(`/transaction-meta/${item.id}`, {
      method: 'PATCH',
      token,
      body: { category_id: item.category_id, notes: nextNotes },
    });
    updated++;
  }

  const otherCountAfterRes = await jsonRequest(
    '/transactions?' +
      new URLSearchParams({
        category_id: 'cat_other',
        include_transfers: 'false',
        include_excluded: 'false',
        limit: '1',
        offset: '0',
      }).toString(),
    { token }
  );
  const otherAfter = Number(otherCountAfterRes.total || 0);
  console.log(JSON.stringify({ applied: updated, other_after: otherAfter }, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message || String(err));
  process.exit(1);
});
