/**
 * Auto-Save Hook
 *
 * Provides debounced auto-save functionality with status tracking.
 * Optimized to prevent unnecessary saves and network calls.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

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
  /** Compare function to detect changes (default: JSON.stringify comparison) */
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

/**
 * Efficient shallow equality check.
 * For primitives, does direct comparison.
 * For objects/arrays, compares first-level keys/values.
 * Falls back to JSON.stringify only for nested objects.
 */
function defaultIsEqual<T>(a: T, b: T): boolean {
  // Same reference or both primitive and equal
  if (a === b) return true;

  // Handle null/undefined
  if (a == null || b == null) return a === b;

  // Different types
  if (typeof a !== typeof b) return false;

  // Primitives that aren't equal
  if (typeof a !== 'object') return false;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    // For small arrays, do shallow comparison
    if (a.length <= 10) {
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    // For larger arrays, fall back to JSON (but this should be rare)
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Objects - shallow comparison of keys
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);

  if (aKeys.length !== bKeys.length) return false;

  // For small objects, do shallow comparison
  if (aKeys.length <= 10) {
    for (const key of aKeys) {
      const aVal = (a as Record<string, unknown>)[key];
      const bVal = (b as Record<string, unknown>)[key];
      // Shallow compare - primitives or same reference
      if (aVal !== bVal) {
        // If nested objects, fall back to JSON for just that value
        if (typeof aVal === 'object' && typeof bVal === 'object') {
          if (JSON.stringify(aVal) !== JSON.stringify(bVal)) return false;
        } else {
          return false;
        }
      }
    }
    return true;
  }

  // For larger objects, fall back to JSON
  return JSON.stringify(a) === JSON.stringify(b);
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

  // Perform save
  const performSave = useCallback(async (dataToSave: T) => {
    if (!isMountedRef.current) return;

    setStatus('saving');
    setError(null);

    try {
      await onSave(dataToSave);

      if (!isMountedRef.current) return;

      lastSavedDataRef.current = dataToSave;
      setLastSavedAt(new Date());
      setStatus('saved');
      setHasUnsavedChanges(false);
      onSuccess?.();

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
      onError?.(saveError);
    }
  }, [onSave, onSuccess, onError]);

  // Manual save
  const saveNow = useCallback(async () => {
    // Cancel any pending debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    await performSave(pendingDataRef.current);
  }, [performSave]);

  // Cancel pending save
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setStatus('idle');
    }
  }, []);

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
      performSave(data);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, enabled, debounceMs, isEqual, performSave]);

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

  const debouncedFn = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);

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

  const throttledFn = useCallback((...args: Parameters<T>) => {
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
  }, [interval]);

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
