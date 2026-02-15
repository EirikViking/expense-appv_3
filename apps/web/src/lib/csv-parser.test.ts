import { describe, expect, it } from 'vitest';
import { parseCsvFile } from './csv-parser';

function toArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe('parseCsvFile', () => {
  it('parses semicolon CSV with norwegian decimals and headers', () => {
    const csv = [
      'Dato;Beskrivelse;Beløp;Valuta',
      '02.01.2026;REMA 1000;-123,45;NOK',
      '03.01.2026;Lønn;25000,00;NOK',
    ].join('\n');

    const result = parseCsvFile(toArrayBuffer(csv));
    expect(result.error).toBeUndefined();
    expect(result.transactions.length).toBe(2);

    const grocery = result.transactions.find((t) => t.description.includes('REMA'));
    const salary = result.transactions.find((t) => t.description.includes('Lønn'));
    expect(grocery?.amount).toBe(-123.45);
    expect(salary?.amount).toBe(25000);
  });

  it('parses comma CSV with quoted delimiters and debit/credit columns', () => {
    const csv = [
      'Date,Description,Debit,Credit,Currency',
      '2026-01-10,"Coffee, downtown",56.70,,NOK',
      '2026-01-11,Salary,,12000.00,NOK',
    ].join('\n');

    const result = parseCsvFile(toArrayBuffer(csv));
    expect(result.error).toBeUndefined();
    expect(result.transactions.length).toBe(2);

    const coffee = result.transactions.find((t) => t.description.includes('Coffee'));
    const salary = result.transactions.find((t) => t.description.includes('Salary'));
    expect(coffee?.amount).toBe(-56.7);
    expect(salary?.amount).toBe(12000);
  });
});

