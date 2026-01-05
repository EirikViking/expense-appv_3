// Browser-safe hash utilities using Web Crypto API
// IMPORTANT: Uses globalThis.crypto.subtle - NO Node crypto imports!

/**
 * Compute SHA256 hash of an ArrayBuffer and return hex string
 */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute SHA256 hash of a File and return hex string
 */
export async function computeFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return sha256Hex(arrayBuffer);
}
