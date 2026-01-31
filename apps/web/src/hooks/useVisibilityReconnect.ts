/**
 * Visibility Reconnect Hook
 *
 * Detects when the page becomes visible again and triggers reconnection.
 * Useful for SSE connections that may have been dropped while tab was hidden.
 */

import { useEffect, useRef } from 'react';

export interface UseVisibilityReconnectOptions {
  /**
   * Whether to enable visibility-based reconnection.
   * @default true
   */
  enabled?: boolean;

  /**
   * Debounce delay in milliseconds before triggering reconnect.
   * Prevents multiple rapid reconnections.
   * @default 500
   */
  debounceMs?: number;
}

/**
 * Hook that calls onReconnect when the page becomes visible again.
 *
 * This is useful for maintaining SSE connections that may have been
 * dropped or timed out while the tab was in the background.
 *
 * @param onReconnect - Callback to trigger reconnection
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * useVisibilityReconnect(() => {
 *   // Reconnect to stream
 *   reconnect();
 * });
 * ```
 */
export function useVisibilityReconnect(
  onReconnect: () => void,
  options: UseVisibilityReconnectOptions = {}
): void {
  const { enabled = true, debounceMs = 500 } = options;

  const onReconnectRef = useRef(onReconnect);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wasHiddenRef = useRef(false);

  // Keep ref up to date
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Check if document.hidden is supported
    if (typeof document === 'undefined' || typeof document.hidden === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      const isHidden = document.hidden;

      if (!isHidden && wasHiddenRef.current) {
        // Page became visible again - trigger reconnect after debounce
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          onReconnectRef.current();
          debounceTimerRef.current = null;
        }, debounceMs);
      }

      wasHiddenRef.current = isHidden;
    };

    // Initialize the hidden state
    wasHiddenRef.current = document.hidden;

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, debounceMs]);
}
