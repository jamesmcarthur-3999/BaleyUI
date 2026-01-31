'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingDots } from '@/components/ui/loading-dots';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { AlertCircle, CheckCircle2, Loader2, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StreamStatus as StreamStatusType } from '@/lib/streaming/types/state';

interface StreamStatusProps {
  status: StreamStatusType;
  error?: string;
  onRetry?: () => void;
  className?: string;
}

const statusConfig: Record<
  StreamStatusType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    showIndicator: boolean;
    indicatorStatus?: 'connected' | 'error' | 'pending';
  }
> = {
  idle: {
    label: 'Ready',
    icon: Wifi,
    showIndicator: false,
  },
  connecting: {
    label: 'Connecting',
    icon: Loader2,
    showIndicator: true,
    indicatorStatus: 'pending',
  },
  streaming: {
    label: 'Streaming',
    icon: Wifi,
    showIndicator: true,
    indicatorStatus: 'connected',
  },
  complete: {
    label: 'Complete',
    icon: CheckCircle2,
    showIndicator: true,
    indicatorStatus: 'connected',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    showIndicator: true,
    indicatorStatus: 'error',
  },
  cancelled: {
    label: 'Cancelled',
    icon: WifiOff,
    showIndicator: true,
    indicatorStatus: 'error',
  },
};

export function StreamStatus({ status, error, onRetry, className }: StreamStatusProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isAnimating = status === 'connecting' || status === 'streaming';

  // Don't show anything for idle state
  if (status === 'idle') {
    return null;
  }

  // Show error state prominently
  if (status === 'error' && error) {
    return (
      <Card className={cn('border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950', className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show simple status indicator for other states
  return (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      {config.showIndicator && (
        <StatusIndicator status={config.indicatorStatus} className="flex-shrink-0" />
      )}
      <Icon
        className={cn('h-4 w-4 flex-shrink-0', isAnimating && 'animate-spin')}
      />
      <span>{config.label}</span>
      {status === 'streaming' && <LoadingDots size="sm" />}
    </div>
  );
}
