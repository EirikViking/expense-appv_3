import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCompactCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface ConstellationItem {
  id: string;
  name: string;
  total: number;
  count: number;
  fill: string;
  depthFill: string;
}

type Props = {
  title: string;
  subtitle: string;
  emptyLabel: string;
  hintLabel: string;
  momentumTitle: string;
  momentumText: string;
  items: ConstellationItem[];
  onSelect: (id: string) => void;
};

const ANIMATIONS = ['animate-float', 'animate-floatSlow', 'animate-floatSlower'] as const;
const POSITIONS = [
  { x: 16, y: 22 },
  { x: 50, y: 15 },
  { x: 80, y: 30 },
  { x: 24, y: 58 },
  { x: 58, y: 54 },
  { x: 82, y: 70 },
];

export function SpendingConstellation({
  title,
  subtitle,
  emptyLabel,
  hintLabel,
  momentumTitle,
  momentumText,
  items,
  onSelect,
}: Props) {
  const maxTotal = Math.max(...items.map((item) => Math.abs(item.total)), 1);
  const nodes = items.map((item, index) => {
    const pos = POSITIONS[index % POSITIONS.length];
    const weight = Math.abs(item.total) / maxTotal;
    const size = Math.round(66 + weight * 72);
    return {
      ...item,
      x: pos.x,
      y: pos.y,
      size,
      animation: ANIMATIONS[index % ANIMATIONS.length],
    };
  });

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="mt-1 text-xs text-white/65">{subtitle}</p>
          </div>
          <div className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-wide text-cyan-200/85">{momentumTitle}</p>
            <p className="text-xs font-semibold text-cyan-100">{momentumText}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {nodes.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/65">
            {emptyLabel}
          </div>
        ) : (
          <div className="relative h-[280px] sm:h-[330px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_20%_15%,rgba(56,189,248,.22),transparent_40%),radial-gradient(circle_at_85%_80%,rgba(244,114,182,.2),transparent_45%),radial-gradient(circle_at_45%_55%,rgba(16,185,129,.14),transparent_50%),rgba(8,12,26,.85)]">
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {nodes.slice(0, -1).map((node, index) => {
                const next = nodes[index + 1];
                if (!next) return null;
                return (
                  <line
                    key={`${node.id}-${next.id}`}
                    x1={`${node.x}%`}
                    y1={`${node.y}%`}
                    x2={`${next.x}%`}
                    y2={`${next.y}%`}
                    stroke="rgba(186,230,253,0.22)"
                    strokeWidth="1.4"
                    strokeDasharray="4 7"
                  />
                );
              })}
            </svg>

            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={cn(
                  'absolute flex flex-col items-center justify-center rounded-full border text-center text-white shadow-[0_12px_35px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70',
                  node.animation
                )}
                style={{
                  left: `calc(${node.x}% - ${node.size / 2}px)`,
                  top: `calc(${node.y}% - ${node.size / 2}px)`,
                  width: `${node.size}px`,
                  height: `${node.size}px`,
                  background: `radial-gradient(circle at 30% 25%, ${node.fill}, ${node.depthFill})`,
                  borderColor: `${node.fill}88`,
                }}
                onClick={() => onSelect(node.id)}
                title={node.name}
              >
                <span className="max-w-[88%] truncate text-[11px] font-semibold">{node.name}</span>
                <span className="mt-1 text-[10px] text-white/90">{formatCompactCurrency(Math.abs(node.total))}</span>
                <span className="text-[10px] text-white/75">{node.count} tx</span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-white/60">{hintLabel}</p>
      </CardContent>
    </Card>
  );
}

