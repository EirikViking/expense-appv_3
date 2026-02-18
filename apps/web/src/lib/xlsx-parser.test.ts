import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseXlsxFile } from './xlsx-parser';

function workbookToArrayBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown;
  if (out instanceof ArrayBuffer) return out;

  // XLSX can return Uint8Array backed by ArrayBuffer or SharedArrayBuffer. Copy into a fresh ArrayBuffer.
  if (out && typeof out === 'object' && 'buffer' in (out as any)) {
    const u8 = out as Uint8Array;
    const copy = new Uint8Array(u8.byteLength);
    copy.set(u8);
    return copy.buffer;
  }

  throw new Error('Unexpected XLSX.write output type');
}

describe('parseXlsxFile (header section scan)', () => {
  it('parses only real transaction rows, skips summaries, and never inserts zero-amount junk', () => {
    const rows: unknown[][] = [
      // Metadata above header
      ['Kontoutskrift', '', '', '', '', ''],
      ['', '', '', '', '', ''],

      // Section 1 header
      ['Dato', 'Bokført', 'Spesifikasjon', 'Beløp', 'Valuta', 'Sted'],
      ['01.01.2026', '02.01.2026', 'REMA 1000 OSLO', '-123,45', 'NOK', 'OSLO'],
      // Summary row with valid-looking date + amount must be skipped
      ['31.01.2026', '', 'Totalbeløp', '0,00', 'NOK', ''],
      // Blank row terminates section
      ['', '', '', '', '', ''],

      // Section 2 header with different order and with Utl. beløp
      ['Spesifikasjon', 'Dato', 'Utl. beløp', 'Beløp', 'Valuta'],
      // Beløp is zero but Utl. beløp is non-zero -> must use Utl. beløp
      ['KIWI 505 BARCODE/OSLO/NO', '05.01.2026', '-10,00', '0,00', 'NOK'],
      // Terminator row should stop parsing
      ['Saldo hendelser', '', '', '', ''],

      // Another section should still be found after terminator
      ['Dato', 'Spesifikasjon', 'Beløp', 'Valuta'],
      ['06.01.2026', 'MENY CARL BERNER', '-50,00', 'NOK'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const arrayBuffer = workbookToArrayBuffer(wb);
    const result = parseXlsxFile(arrayBuffer);

    expect(result.error).toBeUndefined();
    expect(result.transactions.length).toBe(3);

    // No summary labels
    for (const tx of result.transactions) {
      expect(tx.description.toLowerCase()).not.toContain('saldo');
      expect(tx.description.toLowerCase()).not.toContain('totalbel');
      expect(tx.amount).not.toBe(0);
      expect(Number.isFinite(tx.amount)).toBe(true);
    }

    const rema = result.transactions.find((t) => t.description.includes('REMA'));
    expect(rema).toBeTruthy();
    expect(rema?.merchant).toBe('REMA 1000');

    const kiwi = result.transactions.find((t) => t.description.includes('KIWI'));
    expect(kiwi?.amount).toBe(-10);
    expect(kiwi?.merchant).toBe('KIWI');
  });

  it('parses DNB directional amount columns from header format', () => {
    const rows: unknown[][] = [
      ['Dato', 'Forklaring', 'Rentedato', 'Ut fra konto', 'Inn på konto'],
      [46041, 'Dagligvare', 46043, 205.75, ''],
      [46044, 'Lønn', 46044, '', 7350],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kontoutskrift');

    const result = parseXlsxFile(workbookToArrayBuffer(wb));
    expect(result.error).toBeUndefined();
    expect(result.transactions.length).toBe(2);
    expect(result.transactions[0].tx_date).toBe('2026-01-19');
    expect(result.transactions[0].booked_date).toBe('2026-01-21');
    expect(result.transactions[0].amount).toBe(-205.75);
    expect(result.transactions[1].amount).toBe(7350);
  });

  it('parses headerless 5-column layout with date serial in col0 and amount in col2', () => {
    const rows: unknown[][] = [
      [46041, 'Kjøp matbutikk', -205.75, 10000.2, 'NOK'],
      [46042, 'Lønn fra jobb', 7350, 17350.2, 'NOK'],
      [46043, 'Mobilregning', -499, 16851.2, 'NOK'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const result = parseXlsxFile(workbookToArrayBuffer(wb));
    expect(result.error).toBeUndefined();
    expect(result.transactions.length).toBe(3);
    expect(result.detectedFormat).toBe('simple_5col');
    expect(result.transactions[0].tx_date).toBe('2026-01-19');
    expect(result.transactions[0].amount).toBe(-205.75);
    expect(result.transactions[1].amount).toBe(7350);
  });

  it('fails with a clear error when amount collides with date serial', () => {
    const rows: unknown[][] = [
      ['Dato', 'Beskrivelse', 'Beløp'],
      [46041, 'Feil kolonne', 46041],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const result = parseXlsxFile(workbookToArrayBuffer(wb));
    expect(result.transactions).toHaveLength(0);
    expect(result.error).toContain('Beløpskolonnen ser ut til å være en datokolonne');
  });

  it('rejects oversized XLSX payloads before parsing', () => {
    const tooLarge = new ArrayBuffer(13 * 1024 * 1024);
    const result = parseXlsxFile(tooLarge);
    expect(result.transactions).toHaveLength(0);
    expect(result.error).toContain('XLSX-filen er for stor');
  });
});

