import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors',
        {
          'bg-white/12 text-white': variant === 'default',
          'bg-white/8 text-white/85': variant === 'secondary',
          'bg-rose-500/20 text-rose-100 border border-rose-500/25': variant === 'destructive',
          'border border-white/15 text-white/80': variant === 'outline',
          'bg-emerald-400/15 text-emerald-100 border border-emerald-400/25': variant === 'success',
          'bg-amber-400/15 text-amber-100 border border-amber-400/25': variant === 'warning',
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
