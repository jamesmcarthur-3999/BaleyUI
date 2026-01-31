/**
 * Execution Stream Hook
 *
 * Core hook for connecting to SSE streams with automatic reconnection.
 * Handles EventSource lifecycle, reconnection logic, and event parsing.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { parseSSEChunk } from '@/lib/streaming/utils';
import type { ServerStreamEvent } from '@/lib/streaming/types';
import { useVisibilityReconnect } from './useVisibilityReconnect';

// ============================================================================
// Types
// ============================================================================

export interface UseExecutionStreamOptions {
  /**
   * Base URL for the SSE endpoint.
   * The executionId will be appended to this.
   * @example '/api/executions'
   */
  baseUrl: string;

  /**
   * Whether to automatically reconnect on disconnect.
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Maximum number of reconnection attempts.
   * @default 5
   */
  maxReconnectAttempts?: number;

  /**
   * Initial reconnection delay in milliseconds.
   * Will increase exponentially with each attempt.
   * @default 1000
   */
  initialReconnectDelay?: number;

  /**
   * Maximum reconnection delay in milliseconds.
   * @default 30000
   */
  maxReconnectDelay?: number;

  /**
   * Whether to reconnect when tab becomes visible again.
   * @default true
   */
  reconnectOnVisibility?: boolean;

  /**
   * Custom headers to send with the request.
   */
  headers?: Record<string, string>;

  /**
   * Called when connection is established.
   */
  onConnect?: () => void;

  /**
   * Called when connection is lost.
   */
  onDisconnect?: () => void;

  /**
   * Called when an error occurs.
   */
  onError?: (error: Error) => void;
}

export interface UseExecutionStreamResult {
  /** All events received so far */
  events: ServerStreamEvent[];

  /** Current connection status */
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

  /** Error if status is 'error' */
  error: Error | null;

  /** Whether currently connected to the stream */
  isConnected: boolean;

  /** Index of the last event received (for reconnection) */
  lastEventIndex: number;

  /** Manually trigger reconnection */
  reconnect: () => void;

  /** Manually disconnect */
  disconnect: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for connecting to an SSE execution stream with automatic reconnection.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Tracks last event index for resume capability
 * - Reconnects when tab becomes visible again
 * - Properly cleans up EventSource on unmount
 *
 * @param executionId - The execution ID to stream, or null to disconnect
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { events, status, isConnected } = useExecutionStream(executionId, {
 *   baseUrl: '/api/executions',
 *   onConnect: () => console.log('Connected'),
 *   onError: (err) => console.error('Stream error:', err),
 * });
 * ```
 */
export function useExecutionStream(
  executionId: string | null,
  options: UseExecutionStreamOptions
): UseExecutionStreamResult {
  const {
    baseUrl,
    autoReconnect = true,
    maxReconnectAttempts = 5,
    initialReconnectDelay = 1000,
    maxReconnectDelay = 30000,
    reconnectOnVisibility = true,
    headers,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  // State
  const [events, setEvents] = useState<ServerStreamEvent[]>([]);
  const [status, setStatus] = useState<UseExecutionStreamResult['status']>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Refs for managing connection
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastEventIndexRef = useRef(-1);
  const bufferRef = useRef('');
  const isConnectingRef = useRef(false);

  // Callbacks refs (kept stable)
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onConnect, onDisconnect, onError]);

  /**
   * Connect to the SSE stream
   */
  const connect = useCallback(() => {
    if (!executionId || isConnectingRef.current || eventSourceRef.current) {
      return;
    }

    isConnectingRef.current = true;
    setStatus('connecting');
    setError(null);

    try {
      // Build URL with lastEventIndex for resuming
      const url = new URL(`${baseUrl}/${executionId}`, window.location.origin);
      if (lastEventIndexRef.current >= 0) {
        url.searchParams.set('lastEventIndex', lastEventIndexRef.current.toString());
      }

      // Create EventSource
      const eventSource = new EventSource(url.toString());
      eventSourceRef.current = eventSource;

      // Handle connection open
      eventSource.addEventListener('open', () => {
        isConnectingRef.current = false;
        setStatus('connected');
        reconnectAttemptsRef.current = 0; // Reset on successful connection
        onConnectRef.current?.();
      });

      // Handle incoming messages
      eventSource.addEventListener('message', (e) => {
        // Parse the SSE chunk
        const { events: parsedEvents, remainder } = parseSSEChunk(e.data, bufferRef.current);
        bufferRef.current = remainder;

        if (parsedEvents.length > 0) {
          // Update last event index
          lastEventIndexRef.current += parsedEvents.length;

          // Add events to state
          setEvents((prev) => [...prev, ...parsedEvents]);
        }
      });

      // Handle errors
      eventSource.addEventListener('error', (e) => {
        const err = new Error('SSE connection error');
        setError(err);
        onErrorRef.current?.(err);

        // Close the connection
        eventSource.close();
        eventSourceRef.current = null;
        isConnectingRef.current = false;

        // Set status
        setStatus('disconnected');
        onDisconnectRef.current?.();

        // Attempt reconnection if enabled
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          scheduleReconnect();
        } else {
          setStatus('error');
        }
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect to stream');
      isConnectingRef.current = false;
      setStatus('error');
      setError(error);
      onErrorRef.current?.(error);
    }
  }, [
    executionId,
    baseUrl,
    autoReconnect,
    maxReconnectAttempts,
  ]);

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Calculate delay with exponential backoff
    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(
      initialReconnectDelay * Math.pow(2, attempt),
      maxReconnectDelay
    );

    reconnectAttemptsRef.current += 1;

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect, initialReconnectDelay, maxReconnectDelay]);

  /**
   * Disconnect from the stream
   */
  const disconnect = useCallback(() => {
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    isConnectingRef.current = false;
    setStatus('idle');
  }, []);

  /**
   * Manually trigger reconnection
   */
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  // Connect when executionId changes
  useEffect(() => {
    if (executionId) {
      connect();
    } else {
      disconnect();
      // Reset state when executionId becomes null
      setEvents([]);
      setError(null);
      lastEventIndexRef.current = -1;
      bufferRef.current = '';
    }

    // Cleanup on unmount or executionId change
    return () => {
      disconnect();
    };
  }, [executionId, connect, disconnect]);

  // Reconnect when tab becomes visible
  useVisibilityReconnect(reconnect, {
    enabled: reconnectOnVisibility && status === 'disconnected',
  });

  return {
    events,
    status,
    error,
    isConnected: status === 'connected',
    lastEventIndex: lastEventIndexRef.current,
    reconnect,
    disconnect,
  };
}
