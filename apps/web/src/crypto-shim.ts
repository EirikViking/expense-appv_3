// This shim is aliased for 'crypto' and 'node:crypto' imports
// If this file is ever imported, it means Node crypto was accidentally used in browser code

throw new Error(
  'FATAL: Node crypto was imported in browser code. This breaks the build. Use globalThis.crypto and crypto.subtle instead.'
);

// These exports exist only to satisfy TypeScript - they will never be reached
export const randomBytes = (): never => {
  throw new Error('FATAL: Node crypto was imported in browser code.');
};

export const createHash = (): never => {
  throw new Error('FATAL: Node crypto was imported in browser code.');
};

export default {};
