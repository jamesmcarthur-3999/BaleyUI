import * as React from 'react';
import { cva } from 'class-variance-authority';
import {
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  Ban,
  FileQuestion,
  Zap,
  Pause,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Status domain types
// ---------------------------------------------------------------------------

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type LifecycleStatus = 'draft' | 'active' | 'paused' | 'error';
export type ConnectionStatus = 'connected' | 'error' | 'unconfigured' | 'pending';
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error' | 'cancelled';
export type StatusDomain = 'execution' | 'lifecycle' | 'connection' | 'stream';

type AnyStatus = ExecutionStatus | LifecycleStatus | ConnectionStatus | StreamStatus;

// ---------------------------------------------------------------------------
// Config per status value
// ---------------------------------------------------------------------------

interface StatusConfig {
  icon: typeof Clock;
  label: string;
  badgeClass: string;
  dotClass: string;
  animate?: string;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  // Execution
  pending: {
    icon: Clock,
    label: 'Pending',
    badgeClass: 'bg-muted text-muted-foreground',
    dotClass: 'bg-muted-foreground',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    badgeClass: 'bg-blue-500 text-white',
    dotClass: 'bg-blue-500',
    animate: 'animate-spin',
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    badgeClass: 'bg-emerald-500 text-white',
    dotClass: 'bg-emerald-500',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    badgeClass: 'bg-destructive text-destructive-foreground',
    dotClass: 'bg-red-500',
  },
  cancelled: {
    icon: Ban,
    label: 'Cancelled',
    badgeClass: 'bg-amber-500 text-white',
    dotClass: 'bg-amber-500',
  },
  // Lifecycle
  draft: {
    icon: FileQuestion,
    label: 'Draft',
    badgeClass: 'bg-muted text-muted-foreground',
    dotClass: 'bg-muted-foreground',
  },
  active: {
    icon: Zap,
    label: 'Active',
    badgeClass: 'bg-emerald-500 text-white',
    dotClass: 'bg-emerald-500',
  },
  paused: {
    icon: Pause,
    label: 'Paused',
    badgeClass: 'bg-amber-500 text-white',
    dotClass: 'bg-amber-500',
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    badgeClass: 'bg-destructive text-destructive-foreground',
    dotClass: 'bg-red-500',
  },
  // Connection
  connected: {
    icon: CheckCircle,
    label: 'Connected',
    badgeClass: 'bg-emerald-500 text-white',
    dotClass: 'bg-emerald-500',
  },
  unconfigured: {
    icon: Clock,
    label: 'Unconfigured',
    badgeClass: 'bg-muted text-muted-foreground',
    dotClass: 'bg-muted-foreground',
  },
  // Stream
  idle: {
    icon: Clock,
    label: 'Ready',
    badgeClass: 'bg-muted text-muted-foreground',
    dotClass: 'bg-muted-foreground',
  },
  connecting: {
    icon: Loader2,
    label: 'Connecting',
    badgeClass: 'bg-amber-500 text-white',
    dotClass: 'bg-amber-500',
    animate: 'animate-spin',
  },
  streaming: {
    icon: Zap,
    label: 'Streaming',
    badgeClass: 'bg-blue-500 text-white',
    dotClass: 'bg-blue-500',
    animate: 'animate-pulse',
  },
  complete: {
    icon: CheckCircle,
    label: 'Complete',
    badgeClass: 'bg-emerald-500 text-white',
    dotClass: 'bg-emerald-500',
  },
};

// ---------------------------------------------------------------------------
// CVA variants
// ---------------------------------------------------------------------------

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border border-transparent font-semibold transition-colors',
  {
    variants: {
      size: {
        xs: 'px-1.5 py-0 text-[10px]',
        sm: 'px-2 py-0 text-[10px]',
        default: 'px-2.5 py-0.5 text-xs',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface UnifiedStatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: AnyStatus;
  domain?: StatusDomain;
  variant?: 'badge' | 'dot' | 'icon-only';
  size?: 'xs' | 'sm' | 'default';
}

function UnifiedStatusBadge({
  status,
  domain: _domain,
  variant = 'badge',
  size = 'default',
  className,
  ...props
}: UnifiedStatusBadgeProps) {
  const config = STATUS_CONFIGS[status];
  if (!config) return null;

  const Icon = config.icon;
  const iconSize =
    size === 'xs' ? 'h-2.5 w-2.5' : size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  // Dot variant — small coloured circle, no text
  if (variant === 'dot') {
    return (
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          config.dotClass,
          config.animate,
          className,
        )}
        title={config.label}
        {...props}
      />
    );
  }

  // Icon-only variant — icon without text
  if (variant === 'icon-only') {
    return (
      <span className={cn('inline-flex', className)} title={config.label} {...props}>
        <Icon className={cn(iconSize, config.animate)} />
      </span>
    );
  }

  // Badge variant (default) — icon + label in a pill
  return (
    <div
      className={cn(badgeVariants({ size }), config.badgeClass, className)}
      {...props}
    >
      <Icon className={cn(iconSize, config.animate)} />
      <span>{config.label}</span>
    </div>
  );
}

export { UnifiedStatusBadge };
