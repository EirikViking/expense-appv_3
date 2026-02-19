/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const webDistAssets = path.resolve(process.cwd(), 'apps/web/dist/assets');

const budgets = [
  { label: 'index', prefix: 'index-', maxRaw: 420 * 1024, maxGzip: 130 * 1024 },
  { label: 'dashboard', prefix: 'Dashboard-', maxRaw: 450 * 1024, maxGzip: 140 * 1024 },
  { label: 'upload', prefix: 'Upload-', maxRaw: 430 * 1024, maxGzip: 145 * 1024 },
];

if (!fs.existsSync(webDistAssets)) {
  console.error(`Bundle budget check failed: missing assets directory ${webDistAssets}`);
  process.exit(1);
}

const files = fs.readdirSync(webDistAssets).filter((f) => f.endsWith('.js'));
let failed = false;

for (const budget of budgets) {
  const candidate = files.find((f) => f.startsWith(budget.prefix));
  if (!candidate) {
    console.error(`Bundle budget check failed: could not find chunk with prefix "${budget.prefix}"`);
    failed = true;
    continue;
  }

  const filePath = path.join(webDistAssets, candidate);
  const rawBuffer = fs.readFileSync(filePath);
  const gzipBuffer = zlib.gzipSync(rawBuffer);

  const rawSize = rawBuffer.byteLength;
  const gzipSize = gzipBuffer.byteLength;

  console.log(
    `[bundle-budget] ${budget.label}: raw=${(rawSize / 1024).toFixed(1)}KB (limit ${(budget.maxRaw / 1024).toFixed(
      1
    )}KB), gzip=${(gzipSize / 1024).toFixed(1)}KB (limit ${(budget.maxGzip / 1024).toFixed(1)}KB)`
  );

  if (rawSize > budget.maxRaw || gzipSize > budget.maxGzip) {
    console.error(`[bundle-budget] FAIL: ${candidate} exceeds configured budget`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('[bundle-budget] All bundle budgets passed.');
