/* eslint-disable no-console */
// Runs the production rebuild endpoint in a loop (dry run or apply), without printing auth tokens.

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const PASSWORD = process.env.RUN_REBUILD_PASSWORD || process.env.ADMIN_PASSWORD;

function usageAndExit() {
  console.error('Usage: node scripts/run_rebuild.mjs --dry | --apply');
  process.exit(2);
}

const mode = (() => {
  const args = process.argv.slice(2);
  if (args.includes('--dry')) return 'dry';
  if (args.includes('--apply')) return 'apply';
  return null;
})();

if (!mode) usageAndExit();

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
    throw new Error('Missing RUN_REBUILD_PASSWORD (or ADMIN_PASSWORD) env var');
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

function addCounts(total, page) {
  for (const k of Object.keys(page)) {
    if (typeof page[k] !== 'number') continue;
    if (!Object.prototype.hasOwnProperty.call(total, k)) total[k] = 0;
    total[k] += page[k];
  }
}

async function run() {
  const token = await login();
  const dryRun = mode === 'dry';

  const totals = {};
  let cursor = null;
  let pages = 0;

  while (true) {
    const body = {
      dry_run: dryRun,
      limit: 500,
      ...(cursor ? { cursor } : {}),
    };

    const res = await jsonRequest('/transactions/admin/rebuild-flow-and-signs', {
      method: 'POST',
      token,
      body,
    });

    pages += 1;
    addCounts(totals, res);

    const done = Boolean(res.done);
    const next = res.next_cursor ?? null;

    console.log(
      JSON.stringify({
        mode,
        page: pages,
        scanned: res.scanned,
        updated: res.updated,
        flow_changed: res.flow_changed,
        sign_fixed: res.sign_fixed,
        description_updated: res.description_updated,
        merchant_updated: res.merchant_updated,
        transfer_marked: res.transfer_marked,
        excluded_marked: res.excluded_marked,
        excluded_duplicates: res.excluded_duplicates,
        skipped_no_raw: res.skipped_no_raw,
        done,
      })
    );

    if (done) break;
    if (!next || typeof next !== 'string') throw new Error('Rebuild response missing next_cursor');
    cursor = next;
  }

  console.log(JSON.stringify({ mode, pages, totals }));
}

run().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
