/* eslint-disable no-console */
// Backfills normalized merchant + merchant_raw using the worker's deterministic normalization endpoint.
// Requires an authenticated admin session cookie.

const API_BASE = (process.env.EXPENSE_API_BASE_URL || 'https://expense-api.cromkake.workers.dev').replace(/\/$/, '');
const SESSION_COOKIE = process.env.EXPENSE_SESSION_COOKIE;

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

async function request(path, body) {
  if (!SESSION_COOKIE) {
    throw new Error('Missing EXPENSE_SESSION_COOKIE env var');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session=${SESSION_COOKIE}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(`${path} failed: ${msg}`);
  }
  return data;
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const limit = Number(arg('--limit', '300'));

  let cursor = '';
  let loops = 0;
  let totalScanned = 0;
  let totalWouldUpdate = 0;
  let totalUpdated = 0;

  while (loops < 1000) {
    loops++;
    const data = await request('/transactions/admin/normalize-merchants', {
      cursor,
      limit,
      dry_run: dryRun,
    });

    totalScanned += Number(data.scanned || 0);
    totalWouldUpdate += Number(data.would_update || 0);
    totalUpdated += Number(data.updated || 0);

    console.log(
      `[merchant-normalize] batch=${loops} scanned=${data.scanned} would_update=${data.would_update} updated=${data.updated} done=${data.done}`
    );

    if (data.done || !data.next_cursor) break;
    cursor = String(data.next_cursor);
  }

  console.log(
    `[merchant-normalize] done scanned=${totalScanned} would_update=${totalWouldUpdate} updated=${totalUpdated} dry_run=${dryRun}`
  );
}

main().catch((err) => {
  console.error('[merchant-normalize] failed:', err.message);
  process.exit(1);
});

