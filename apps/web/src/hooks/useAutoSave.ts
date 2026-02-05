/**
 * Auto-Save Hook
 *
 * Provides debounced auto-save functionality with status tracking.
 * Optimized to prevent unnecessary saves and network calls.
 */

import { useState, useEffect, useRef } from 'react';
import { deepEqual } from '@/lib/utils/deep-equal';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutoSaveOptions<T> {
  /** Data to auto-save */
  data: T;
  /** Save function that persists the data */
  onSave: (data: T) => Promise<void>;
  /** Debounce delay in milliseconds (default: 1000) */
  debounceMs?: number;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
  /** Callback when save completes */
  onSuccess?: () => void;
  /** Callback when save fails */
  onError?: (error: Error) => void;
  /** Compare function to detect changes (default: deep equality with cycle detection) */
  isEqual?: (a: T, b: T) => boolean;
}

export interface AutoSaveResult {
  /** Current save status */
  status: AutoSaveStatus;
  /** Last successful save timestamp */
  lastSavedAt: Date | null;
  /** Error from last failed save attempt */
  error: Error | null;
  /** Manually trigger save immediately */
  saveNow: () => Promise<void>;
  /** Cancel pending save */
  cancel: () => void;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
}

function defaultIsEqual<T>(a: T, b: T): boolean {
  return deepEqual(a, b);
}

export function useAutoSave<T>({
  data,
  onSave,
  debounceMs = 1000,
  enabled = true,
  onSuccess,
  onError,
  isEqual = defaultIsEqual,
}: AutoSaveOptions<T>): AutoSaveResult {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<T | null>(null);
  const pendingDataRef = useRef<T>(data);
  const isMountedRef = useRef(true);

  // Update pending data ref
  pendingDataRef.current = data;

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Stable refs for callbacks to avoid effect re-triggers
  const onSaveRef = useRef(onSave);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSaveRef.current = onSave;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  // Perform save (ref-stable to avoid triggering effects)
  const performSaveRef = useRef(async (dataToSave: T) => {
    if (!isMountedRef.current) return;

    setStatus('saving');
    setError(null);

    try {
      await onSaveRef.current(dataToSave);

      if (!isMountedRef.current) return;

      lastSavedDataRef.current = dataToSave;
      setLastSavedAt(new Date());
      setStatus('saved');
      setHasUnsavedChanges(false);
      onSuccessRef.current?.();

      // Reset to idle after showing "saved" briefly
      setTimeout(() => {
        if (isMountedRef.current) {
          setStatus('idle');
        }
      }, 2000);
    } catch (err) {
      if (!isMountedRef.current) return;

      const saveError = err instanceof Error ? err : new Error(String(err));
      setError(saveError);
      setStatus('error');
      onErrorRef.current?.(saveError);
    }
  });

  // Manual save
  const saveNow = async () => {
    // Cancel any pending debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    await performSaveRef.current(pendingDataRef.current);
  };

  // Cancel pending save
  const cancel = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setStatus('idle');
    }
  };

  // Debounced auto-save effect
  useEffect(() => {
    if (!enabled) return;

    // Check if data has changed
    const hasChanged = lastSavedDataRef.current === null || !isEqual(data, lastSavedDataRef.current);

    if (!hasChanged) {
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(true);
    setStatus('pending');

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new debounced save
    timeoutRef.current = setTimeout(() => {
      performSaveRef.current(data);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, enabled, debounceMs, isEqual]);

  // Save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // Synchronous cleanup - can't await here
        // Consider using beforeunload for critical saves
      }
    };
  }, []);

  return {
    status,
    lastSavedAt,
    error,
    saveNow,
    cancel,
    hasUnsavedChanges,
  };
}

/**
 * Debounce Hook
 *
 * General-purpose debounce for any callback.
 */
export function useDebounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  callbackRef.current = callback;

  const debouncedFn = (...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedFn;
}

/**
 * Throttle Hook
 *
 * Limits function execution to once per interval.
 */
export function useThrottle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  interval: number
): (...args: Parameters<T>) => void {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  callbackRef.current = callback;

  const throttledFn = (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRunRef.current;

    if (timeSinceLastRun >= interval) {
      lastRunRef.current = now;
      callbackRef.current(...args);
    } else {
      // Schedule to run at the end of the interval
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        lastRunRef.current = Date.now();
        callbackRef.current(...args);
      }, interval - timeSinceLastRun);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledFn;
}
