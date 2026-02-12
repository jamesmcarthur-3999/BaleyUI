'use client';

import { useState, useEffect } from 'react';
import { CloudOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

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
