import { describe, expect, it } from 'vitest';
import { buildPasswordTokenCandidates } from './auth';

describe('buildPasswordTokenCandidates', () => {
  it('normalizes whitespace and quoted tokens', () => {
    const candidates = buildPasswordTokenCandidates(`  "abc123-token"  `);

    expect(candidates).toContain('"abc123-token"');
    expect(candidates).toContain('abc123-token');
  });

  it('adds decoded and legacy space variants', () => {
    const candidates = buildPasswordTokenCandidates('abc%2Bdef ghi');

    expect(candidates).toContain('abc+def ghi');
    expect(candidates).toContain('abc+def+ghi');
    expect(candidates).toContain('abc+def-ghi');
    expect(candidates).toContain('abc+defghi');
  });

  it('strips trailing punctuation from shared links', () => {
    const candidates = buildPasswordTokenCandidates('token-value.,');
    expect(candidates).toContain('token-value');
  });
});
