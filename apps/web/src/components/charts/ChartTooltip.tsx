import type { ReactNode } from 'react';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

export type ChartTooltipFormatter = (value: number, name: string) => string;
export type ChartTooltipLabelFormatter = (label: string | number) => string;

interface TooltipPayloadItem {
  name?: NameType;
  value?: ValueType;
  color?: string;
}

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  valueFormatter?: ChartTooltipFormatter;
  labelFormatter?: ChartTooltipLabelFormatter;
}

function normalizeValue(value: ValueType): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function normalizeName(name: NameType): string {
  return typeof name === 'string' ? name : String(name ?? '');
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: ChartTooltipContentProps): ReactNode {
  if (!active || !payload || payload.length === 0) return null;

  const labelText =
    label !== undefined && label !== null
      ? labelFormatter
        ? labelFormatter(label as string | number)
        : String(label)
      : '';

  return (
    <div className="chart-tooltip">
      {labelText && <div className="chart-tooltip__label">{labelText}</div>}
      <div className="chart-tooltip__rows">
        {payload.map((item: TooltipPayloadItem, index: number) => {
          const value = normalizeValue(item.value as ValueType);
          const name = normalizeName(item.name as NameType);
          const color = item.color || '#E7EAF3';
          const formatted = valueFormatter ? valueFormatter(value, name) : String(value);
          return (
            <div key={`${name}-${index}`} className="chart-tooltip__row">
              <span className="chart-tooltip__name">
                <span className="chart-tooltip__dot" style={{ backgroundColor: color }} />
                {name}
              </span>
              <span className="chart-tooltip__value">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
