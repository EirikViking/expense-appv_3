// Hash utilities for Worker only (uses Web Crypto API available in Workers)
// Do NOT import this in browser code - browser should compute hashes directly

import type { SourceType } from './constants';

/**
 * Compute SHA256 hash of data using Web Crypto API
 * Works in Cloudflare Workers and browsers
 */
export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buffer = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute transaction hash for deduplication
 * Format: SHA256 of `${tx_date}|${description.trim().toLowerCase()}|${amount}|${source_type}`
 */
export async function computeTxHash(
  txDate: string,
  description: string,
  amount: number,
  sourceType: SourceType
): Promise<string> {
  const normalized = `${txDate}|${description.trim().toLowerCase()}|${amount}|${sourceType}`;
  return sha256Hex(normalized);
}

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}
