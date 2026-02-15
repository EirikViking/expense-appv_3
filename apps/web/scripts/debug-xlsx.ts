import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseXlsxFile } from '../src/lib/xlsx-parser';

function parseArgs(argv: string[]): { file: string } {
  const fileIdx = argv.indexOf('--file');
  if (fileIdx === -1 || !argv[fileIdx + 1]) {
    throw new Error('Usage: pnpm tsx apps/web/scripts/debug-xlsx.ts --file <path-to-xlsx>');
  }
  return { file: argv[fileIdx + 1] };
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const out = new Uint8Array(buffer.byteLength);
  out.set(buffer);
  return out.buffer;
}

function isSuspiciousAmount(amount: number): boolean {
  const abs = Math.abs(amount);
  return Number.isInteger(abs) && abs >= 30000 && abs <= 60000;
}

function main(): void {
  const { file } = parseArgs(process.argv.slice(2));
  const absolutePath = resolve(file);
  const bytes = readFileSync(absolutePath);
  const result = parseXlsxFile(toArrayBuffer(bytes));

  if (result.error) {
    console.error(`[debug-xlsx] parse error: ${result.error}`);
    process.exit(1);
  }

  const suspicious = result.transactions.filter((tx) => isSuspiciousAmount(tx.amount));
  const firstFive = result.transactions.slice(0, 5).map((tx) => ({
    tx_date: tx.tx_date,
    description: tx.description,
    amount: tx.amount,
  }));

  console.log(`[debug-xlsx] file: ${absolutePath}`);
  console.log(`[debug-xlsx] detected format: ${result.detectedFormat ?? 'unknown'}`);
  console.log(`[debug-xlsx] transaction count: ${result.transactions.length}`);
  console.log('[debug-xlsx] first 5 transactions:');
  console.log(JSON.stringify(firstFive, null, 2));
  console.log(`[debug-xlsx] suspicious amount count (30000-60000 integer): ${suspicious.length}`);

  if (suspicious.length > 0) {
    console.error('[debug-xlsx] failing due to suspicious serial-like amounts');
    process.exit(1);
  }
}

main();
