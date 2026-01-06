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
          'bg-gray-900 text-gray-50 dark:bg-gray-50 dark:text-gray-900': variant === 'default',
          'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50': variant === 'secondary',
          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200': variant === 'destructive',
          'border border-gray-200 dark:border-gray-800': variant === 'outline',
          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200': variant === 'success',
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200': variant === 'warning',
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
