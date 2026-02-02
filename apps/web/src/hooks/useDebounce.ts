/**
 * useDebounce Hooks
 *
 * Provides debouncing utilities for values and callbacks.
 * Used to prevent rapid action conflicts (e.g., rapid save clicks).
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Debounce a value - returns the value only after it hasn't changed for `delay` ms
 *
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced value
 *
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 300);
 *
 * useEffect(() => {
 *   // Only fires 300ms after user stops typing
 *   search(debouncedSearch);
 * }, [debouncedSearch]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Options for useDebouncedCallback
 */
export interface DebouncedCallbackOptions {
  /** Fire on the leading edge instead of trailing */
  leading?: boolean;
  /** Fire on the trailing edge (default: true) */
  trailing?: boolean;
}

/**
 * Return type for useDebouncedCallback
 */
export interface DebouncedCallbackReturn<T extends (...args: unknown[]) => unknown> {
  /** The debounced function */
  debouncedFn: (...args: Parameters<T>) => void;
  /** Cancel any pending execution */
  cancel: () => void;
  /** Execute immediately, bypassing debounce */
  flush: () => void;
  /** Whether there's a pending execution */
  isPending: boolean;
}

/**
 * Debounce a callback function - multiple rapid calls result in single execution
 *
 * @param callback - Function to debounce
 * @param delay - Delay in milliseconds
 * @param options - Configuration options
 * @returns Object with debounced function and control methods
 *
 * @example
 * ```tsx
 * const { debouncedFn: debouncedSave, isPending } = useDebouncedCallback(
 *   handleSave,
 *   500
 * );
 *
 * // Rapid clicks will only trigger one save after 500ms
 * <Button onClick={debouncedSave} disabled={isPending}>
 *   {isPending ? 'Saving...' : 'Save'}
 * </Button>
 * ```
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  options: DebouncedCallbackOptions = {}
): DebouncedCallbackReturn<T> {
  const { leading = false, trailing = true } = options;

  // Keep callback ref updated without causing re-renders
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Track pending state
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastArgsRef = useRef<Parameters<T> | null>(null);
  const hasLeadingCalledRef = useRef(false);

  // Cancel pending execution
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPending(false);
    lastArgsRef.current = null;
    hasLeadingCalledRef.current = false;
  }, []);

  // Execute immediately with last args
  const flush = useCallback(() => {
    if (timeoutRef.current && lastArgsRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      callbackRef.current(...lastArgsRef.current);
      setIsPending(false);
      lastArgsRef.current = null;
      hasLeadingCalledRef.current = false;
    }
  }, []);

  // The debounced function
  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      lastArgsRef.current = args;

      // Leading edge execution
      if (leading && !hasLeadingCalledRef.current) {
        hasLeadingCalledRef.current = true;
        callbackRef.current(...args);
        if (!trailing) {
          return;
        }
      }

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsPending(true);

      // Set new timeout for trailing edge
      timeoutRef.current = setTimeout(() => {
        if (trailing && lastArgsRef.current) {
          callbackRef.current(...lastArgsRef.current);
        }
        setIsPending(false);
        timeoutRef.current = null;
        lastArgsRef.current = null;
        hasLeadingCalledRef.current = false;
      }, delay);
    },
    [delay, leading, trailing]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    debouncedFn,
    cancel,
    flush,
    isPending,
  };
}

/**
 * Simple throttle - ensures function is called at most once per interval
 *
 * @param callback - Function to throttle
 * @param limit - Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  limit: number
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const throttledFn = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= limit) {
        lastRunRef.current = now;
        callbackRef.current(...args);
      } else {
        // Schedule for later if not already scheduled
        if (!timeoutRef.current) {
          timeoutRef.current = setTimeout(() => {
            lastRunRef.current = Date.now();
            callbackRef.current(...args);
            timeoutRef.current = null;
          }, limit - timeSinceLastRun);
        }
      }
    },
    [limit]
  );

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
