import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-gradient-to-br from-cyan-300 via-fuchsia-400 to-amber-300 text-black shadow-lg shadow-fuchsia-500/20 hover:brightness-110 active:brightness-95':
              variant === 'default',
            'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-rose-600/20 hover:brightness-110 active:brightness-95':
              variant === 'destructive',
            'border border-white/15 bg-white/5 text-white shadow-sm hover:bg-white/10':
              variant === 'outline',
            'bg-white/10 text-white shadow-sm hover:bg-white/15':
              variant === 'secondary',
            'hover:bg-white/10 text-white/80 hover:text-white': variant === 'ghost',
            'text-white underline-offset-4 hover:underline': variant === 'link',
          },
          {
            'h-9 px-4 py-2': size === 'default',
            'h-8 rounded-md px-3 text-xs': size === 'sm',
            'h-10 rounded-md px-8': size === 'lg',
            'h-9 w-9': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
