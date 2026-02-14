import { describe, expect, it } from 'vitest';
import { ChartTooltip } from './ChartTooltip';

describe('ChartTooltip', () => {
  it('returns null when inactive', () => {
    const node = ChartTooltip({
      active: false,
      payload: [],
      label: undefined,
    } as any);

    expect(node).toBeNull();
  });

  it('uses shared tooltip theme class when active', () => {
    const node = ChartTooltip({
      active: true,
      label: '2026-02-14',
      payload: [
        {
          name: 'Expenses',
          value: 1234,
          color: '#ef4444',
        },
      ],
    } as any) as any;

    expect(node).toBeTruthy();
    expect(node.props.className).toContain('chart-tooltip');
  });
});
