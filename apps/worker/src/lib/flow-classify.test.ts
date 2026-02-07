import { describe, expect, it } from 'vitest';
import { classifyFlowType, normalizeAmountAndFlags } from './flow-classify';

describe('flow-classify', () => {
  it('classifies obvious purchases as expense (never income)', () => {
    const samples = [
      'SATS NORWAY AS',
      'GOOGLE *GOOGLE ONE',
      'LOS TACOS BJORVIKA',
      'NARVESEN 278 BODO LUFT',
      'VIPPS*KURT EDGAR LIEN',
    ];

    for (const d of samples) {
      const c = classifyFlowType({ source_type: 'xlsx', description: d, amount: 100, raw_json: null });
      expect(c.flow_type).toBe('expense');

      const n = normalizeAmountAndFlags({ flow_type: c.flow_type, amount: 100 });
      expect(n.amount).toBe(-100);
    }
  });

  it('classifies explicit salary as income', () => {
    const c = classifyFlowType({ source_type: 'xlsx', description: 'LØNN ACME AS', amount: -5000, raw_json: null });
    expect(c.flow_type).toBe('income');
    const n = normalizeAmountAndFlags({ flow_type: c.flow_type, amount: -5000 });
    expect(n.amount).toBe(5000);
  });


  it('never classifies Skatteetaten payments as income (treat as expense)', () => {
    const c = classifyFlowType({ source_type: 'xlsx', description: 'SKATTEETATEN', amount: 1000, raw_json: null });
    expect(c.flow_type).toBe('expense');
    const n = normalizeAmountAndFlags({ flow_type: c.flow_type, amount: 1000 });
    expect(n.amount).toBe(-1000);
  });

  it('classifies innbetaling bankgiro as transfer (excluded)', () => {
    const c = classifyFlowType({
      source_type: 'xlsx',
      description: 'INNBETALING BANKGIRO',
      amount: 2000,
      raw_json: JSON.stringify({ section_label: 'Innbetaling bankgiro' }),
    });
    expect(c.flow_type).toBe('transfer');
    const n = normalizeAmountAndFlags({ flow_type: c.flow_type, amount: 2000 });
    expect(n.flags).toEqual({ is_transfer: 1, is_excluded: 1 });
  });
});


