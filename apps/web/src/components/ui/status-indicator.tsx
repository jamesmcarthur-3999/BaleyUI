import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const statusIndicatorVariants = cva(
  'inline-flex h-2 w-2 rounded-full',
  {
    variants: {
      status: {
        connected: 'bg-[hsl(var(--color-stream-active))]',
        error: 'bg-[hsl(var(--color-stream-error))]',
        unconfigured: 'bg-muted-foreground',
        pending: 'bg-[hsl(var(--color-stream-tool))] animate-pulse',
      },
    },
    defaultVariants: {
      status: 'unconfigured',
    },
  }
);

export interface StatusIndicatorProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusIndicatorVariants> {}

function StatusIndicator({ className, status, ...props }: StatusIndicatorProps) {
  return (
    <span
      className={cn(statusIndicatorVariants({ status }), className)}
      {...props}
    />
  );
}

export { StatusIndicator, statusIndicatorVariants };
