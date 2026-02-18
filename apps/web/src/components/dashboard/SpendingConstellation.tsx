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
  const totalSpend = items.reduce((sum, item) => sum + Math.abs(item.total), 0);
  const lead = items[0]?.name ?? '';
  const nodes = items.map((item, index) => {
    const pos = POSITIONS[index % POSITIONS.length];
    const weight = Math.abs(item.total) / maxTotal;
    const size = Math.round(64 + weight * 72);
    return {
      ...item,
      x: pos.x,
      y: pos.y,
      size,
      animation: ANIMATIONS[index % ANIMATIONS.length],
    };
  });

  return (
    <Card className="constellation-card relative overflow-hidden border-cyan-300/20 bg-slate-950/60">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-cyan-50">{title}</CardTitle>
            <p className="mt-1 text-xs text-white/65">{subtitle}</p>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-right shadow-[0_0_28px_rgba(34,211,238,0.18)]">
            <div className="pointer-events-none absolute inset-0 constellation-shimmer opacity-60" />
            <p className="relative text-[11px] uppercase tracking-wide text-cyan-200/85">{momentumTitle}</p>
            <p className="relative text-xs font-semibold text-cyan-100">{momentumText}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {nodes.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/65">
            {emptyLabel}
          </div>
        ) : (
          <div className="constellation-surface relative h-[300px] sm:h-[360px] overflow-hidden rounded-2xl border border-cyan-200/15">
            <div className="pointer-events-none absolute -left-10 -top-16 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl constellation-aurora" />
            <div className="pointer-events-none absolute -right-12 bottom-0 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl constellation-aurora constellation-aurora-delay" />
            <div className="pointer-events-none absolute left-1/3 top-1/3 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl constellation-aurora constellation-aurora-delay-2" />
            <div className="pointer-events-none absolute inset-0 constellation-grid opacity-40" />
            <div className="pointer-events-none absolute inset-0 constellation-scan opacity-40" />

            <div className="constellation-core pointer-events-none absolute left-1/2 top-1/2 z-[1] flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-cyan-300/30 bg-slate-950/55 text-center shadow-[0_0_40px_rgba(34,211,238,0.24)] backdrop-blur-sm sm:h-36 sm:w-36">
              <span className="text-[10px] uppercase tracking-[0.12em] text-cyan-200/80">allocation core</span>
              <span className="mt-1 text-sm font-semibold text-cyan-100">{formatCompactCurrency(totalSpend)}</span>
              <span className="mt-1 max-w-[80%] truncate text-[10px] text-white/70">{lead}</span>
            </div>

            <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full">
              <defs>
                <filter id="constellationLineGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.2" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {nodes.slice(0, -1).map((node, index) => {
                const next = nodes[index + 1];
                if (!next) return null;
                return (
                  <line
                    key={`${node.id}-${next.id}`}
                    className="constellation-link"
                    x1={`${node.x}%`}
                    y1={`${node.y}%`}
                    x2={`${next.x}%`}
                    y2={`${next.y}%`}
                    stroke="rgba(125,211,252,0.48)"
                    strokeWidth="1.5"
                    strokeDasharray="6 8"
                    filter="url(#constellationLineGlow)"
                  />
                );
              })}
            </svg>

            {nodes.map((node, index) => {
              const toneA = `${node.fill}dd`;
              const toneB = `${node.depthFill}ee`;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={cn(
                    'constellation-node absolute z-[3] flex flex-col items-center justify-center rounded-full border text-center text-white shadow-[0_14px_38px_rgba(0,0,0,0.45)] transition duration-300 hover:scale-[1.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70',
                    node.animation
                  )}
                  style={{
                    left: `calc(${node.x}% - ${node.size / 2}px)`,
                    top: `calc(${node.y}% - ${node.size / 2}px)`,
                    width: `${node.size}px`,
                    height: `${node.size}px`,
                    background: `radial-gradient(circle at 28% 24%, ${toneA}, ${toneB})`,
                    borderColor: `${node.fill}99`,
                  }}
                  onClick={() => onSelect(node.id)}
                  title={node.name}
                >
                  <span className="constellation-node-halo" />
                  <span
                    className="constellation-node-ring"
                    style={{ borderColor: `${node.fill}66`, boxShadow: `0 0 16px ${node.fill}66` }}
                  />
                  <span className="absolute left-1 top-1 rounded-full border border-white/20 bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-100">
                    #{index + 1}
                  </span>
                  <span className="max-w-[86%] truncate text-[11px] font-semibold">{node.name}</span>
                  <span className="mt-1 text-[10px] text-white/95">{formatCompactCurrency(Math.abs(node.total))}</span>
                  <span className="text-[10px] text-white/75">{node.count} tx</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-white/60">{hintLabel}</p>
      </CardContent>
    </Card>
  );
}

