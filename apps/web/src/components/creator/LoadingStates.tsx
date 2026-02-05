'use client';

import { useState, useEffect } from 'react';
import { Loader2, CloudOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Loading indicator for inline operations
 */
interface InlineLoadingProps {
  /** Loading text to display */
  text?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Optional CSS class */
  className?: string;
}

export function InlineLoading({ text, size = 'md', className }: InlineLoadingProps) {
  const sizeClasses = {
    sm: 'text-xs gap-1.5',
    md: 'text-sm gap-2',
    lg: 'text-base gap-2.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className={cn('flex items-center text-muted-foreground', sizeClasses[size], className)}>
      <Loader2 className={cn('animate-spin', iconSizes[size])} />
      {text && <span>{text}</span>}
    </div>
  );
}

/**
 * Skeleton placeholder for content loading
 */
interface SkeletonBlockProps {
  /** Number of lines to show */
  lines?: number;
  /** Whether to animate */
  animated?: boolean;
  /** Optional CSS class */
  className?: string;
}

export function SkeletonBlock({ lines = 3, animated = true, className }: SkeletonBlockProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-4 rounded bg-muted',
            i === lines - 1 && 'w-3/4', // Last line shorter
            animated && 'animate-skeleton-pulse'
          )}
          style={animated ? { animationDelay: `${i * 100}ms` } : undefined}
        />
      ))}
    </div>
  );
}

/**
 * Network status indicator
 */
interface NetworkStatusProps {
  /** Whether offline */
  isOffline: boolean;
  /** Whether reconnecting */
  isReconnecting?: boolean;
  /** Optional CSS class */
  className?: string;
}

export function NetworkStatus({ isOffline, isReconnecting, className }: NetworkStatusProps) {
  if (!isOffline && !isReconnecting) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
        'animate-slide-down',
        isOffline
          ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
          : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
        className
      )}
    >
      {isOffline ? (
        <>
          <CloudOff className="h-4 w-4" />
          <span>You appear to be offline</span>
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4 animate-pulse" />
          <span>Reconnecting...</span>
        </>
      )}
    </div>
  );
}

/**
 * Hook to detect network status
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsReconnecting(true);
      // Brief delay to show reconnecting state
      setTimeout(() => {
        setIsOnline(true);
        setIsReconnecting(false);
      }, 1000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsReconnecting(false);
    };

    // Initial check
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isOffline: !isOnline, isReconnecting };
}

/**
 * Animated loading dots
 */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current animate-loading-dot"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Retrying indicator
 */
interface RetryingIndicatorProps {
  /** Retry attempt number */
  attempt: number;
  /** Maximum retries */
  maxRetries?: number;
  /** Optional CSS class */
  className?: string;
}

export function RetryingIndicator({ attempt, maxRetries = 3, className }: RetryingIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>
        Retrying ({attempt}/{maxRetries})
        <LoadingDots className="ml-1" />
      </span>
    </div>
  );
}
