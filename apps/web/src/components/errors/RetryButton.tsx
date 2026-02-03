'use client';

import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRetryDelay, getNextRetryDelay } from '@/lib/execution/retry';

export interface RetryButtonProps extends Omit<ButtonProps, 'onClick'> {
  /**
   * Callback when retry is clicked
   */
  onRetry: () => void | Promise<void>;
  /**
   * Current retry attempt number (0-indexed)
   */
  attempt?: number;
  /**
   * Maximum retry attempts
   */
  maxAttempts?: number;
  /**
   * Show countdown timer before retry is available
   */
  showCountdown?: boolean;
  /**
   * Delay in milliseconds before retry is available (overrides attempt-based calculation)
   */
  delayMs?: number;
  /**
   * Whether the retry is currently in progress
   */
  isRetrying?: boolean;
}

/**
 * Retry button with exponential backoff indicator
 */
export function RetryButton({
  onRetry,
  attempt = 0,
  maxAttempts = 3,
  showCountdown = true,
  delayMs,
  isRetrying = false,
  className,
  disabled,
  children,
  ...props
}: RetryButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);

  // Calculate the delay if not provided
  const calculatedDelay = delayMs ?? getNextRetryDelay(attempt + 1);

  // Start countdown when component mounts or delay changes
  React.useEffect(() => {
    if (!showCountdown || calculatedDelay <= 0) {
      setCountdown(null);
      return;
    }

    // Initialize countdown
    setCountdown(calculatedDelay);

    const startTime = Date.now();
    const endTime = startTime + calculatedDelay;

    const interval = setInterval(() => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setCountdown(null);
        clearInterval(interval);
      } else {
        setCountdown(remaining);
      }
    }, 100); // Update every 100ms for smooth countdown

    return () => clearInterval(interval);
  }, [calculatedDelay, showCountdown]);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onRetry();
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = disabled || isRetrying || isLoading || (countdown !== null && countdown > 0);

  const getButtonText = () => {
    if (children) {
      return children;
    }

    if (isRetrying || isLoading) {
      return 'Retrying...';
    }

    if (countdown !== null && countdown > 0) {
      return `Retry in ${formatRetryDelay(countdown)}`;
    }

    if (attempt > 0 && maxAttempts > 0) {
      const remaining = maxAttempts - attempt;
      return `Retry (${remaining} left)`;
    }

    return 'Retry';
  };

  const getIcon = () => {
    if (countdown !== null && countdown > 0) {
      return <Clock className="h-4 w-4 mr-2" />;
    }
    return <RefreshCw className={cn('h-4 w-4 mr-2', (isRetrying || isLoading) && 'animate-spin')} />;
  };

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={isDisabled}
      className={cn('', className)}
      {...props}
    >
      {getIcon()}
      {getButtonText()}
    </Button>
  );
}

/**
 * Compact retry button that only shows an icon
 */
export function RetryButtonCompact({
  onRetry,
  attempt = 0,
  showCountdown = true,
  delayMs,
  isRetrying = false,
  className,
  disabled,
  ...props
}: RetryButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);

  // Calculate the delay if not provided
  const calculatedDelay = delayMs ?? getNextRetryDelay(attempt + 1);

  // Start countdown when component mounts or delay changes
  React.useEffect(() => {
    if (!showCountdown || calculatedDelay <= 0) {
      setCountdown(null);
      return;
    }

    setCountdown(calculatedDelay);

    const startTime = Date.now();
    const endTime = startTime + calculatedDelay;

    const interval = setInterval(() => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setCountdown(null);
        clearInterval(interval);
      } else {
        setCountdown(remaining);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [calculatedDelay, showCountdown]);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onRetry();
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = disabled || isRetrying || isLoading || (countdown !== null && countdown > 0);

  const getTooltip = () => {
    if (isRetrying || isLoading) {
      return 'Retrying...';
    }

    if (countdown !== null && countdown > 0) {
      return `Retry in ${formatRetryDelay(countdown)}`;
    }

    return 'Retry';
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isDisabled}
      title={getTooltip()}
      aria-label={getTooltip()}
      className={cn('h-8 w-8', className)}
      {...props}
    >
      <RefreshCw className={cn('h-4 w-4', (isRetrying || isLoading) && 'animate-spin')} aria-hidden="true" />
    </Button>
  );
}
