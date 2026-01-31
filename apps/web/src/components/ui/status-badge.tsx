import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Clock, Loader2, CheckCircle, XCircle, Ban } from 'lucide-react';

import { cn } from '@/lib/utils';

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      status: {
        pending:
          'border-transparent bg-muted text-muted-foreground',
        running:
          'border-transparent bg-blue-500 text-white animate-pulse',
        completed:
          'border-transparent bg-green-500 text-white',
        failed:
          'border-transparent bg-destructive text-destructive-foreground',
        cancelled:
          'border-transparent bg-amber-500 text-white',
      },
      size: {
        sm: 'px-2 py-0 text-[10px]',
        default: 'px-2.5 py-0.5 text-xs',
      },
    },
    defaultVariants: {
      status: 'pending',
      size: 'default',
    },
  }
);

const statusIcons = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: Ban,
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBadgeVariants> {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  showIcon?: boolean;
}

function StatusBadge({
  className,
  status,
  size,
  showIcon = true,
  ...props
}: StatusBadgeProps) {
  const Icon = statusIcons[status];
  const iconSize = size === 'sm' ? 10 : 12;

  return (
    <div
      className={cn(statusBadgeVariants({ status, size }), className)}
      {...props}
    >
      {showIcon && (
        <Icon
          className={cn(
            status === 'running' && 'animate-spin',
            size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
          )}
          style={{ width: iconSize, height: iconSize }}
        />
      )}
      <span className="capitalize">{status}</span>
    </div>
  );
}

export { StatusBadge, statusBadgeVariants };
