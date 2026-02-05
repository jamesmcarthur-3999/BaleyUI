/**
 * Block Stream Hook
 *
 * High-level hook for executing blocks and streaming their results.
 * Combines execution API calls with SSE streaming and state management.
 */

import { useReducer, useRef, useEffect, useState } from 'react';
import { streamReducer } from './useStreamState';
import { useExecutionStream } from './useExecutionStream';
import { createInitialStreamState, type StreamState } from '@/lib/streaming/types';

// ============================================================================
// Types
// ============================================================================

export interface UseBlockStreamOptions {
  /**
   * Base URL for execution endpoints.
   * @default '/api/executions'
   */
  baseUrl?: string;

  /**
   * Whether to automatically reconnect on disconnect.
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Called when execution starts successfully.
   */
  onExecutionStart?: (executionId: string) => void;

  /**
   * Called when execution completes.
   */
  onComplete?: (state: StreamState) => void;

  /**
   * Called when execution errors.
   */
  onError?: (error: Error) => void;

  /**
   * Called when execution is cancelled.
   */
  onCancel?: () => void;
}

export interface UseBlockStreamResult {
  /** Current accumulated stream state */
  state: StreamState;

  /** Execute the block with given input */
  execute: (input: unknown) => Promise<void>;

  /** Reset the stream state */
  reset: () => void;

  /** Cancel the running execution */
  cancel: () => Promise<void>;

  /** Whether currently executing */
  isExecuting: boolean;

  /** Current execution ID */
  executionId: string | null;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for executing a block and streaming its results.
 *
 * Features:
 * - Starts execution via API
 * - Streams results via SSE
 * - Manages accumulated state (text, tool calls, metrics, etc.)
 * - Supports cancellation
 * - Auto-reconnects on disconnect
 *
 * @param blockId - The ID of the block to execute
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { state, execute, reset, cancel } = useBlockStream(blockId, {
 *   onComplete: (state) => console.log('Done!', state.text),
 *   onError: (err) => console.error('Error:', err),
 * });
 *
 * // Execute the block
 * await execute({ prompt: 'Hello!' });
 *
 * // Display streaming results
 * return <div>{state.text}</div>;
 * ```
 */
export function useBlockStream(
  blockId: string,
  options: UseBlockStreamOptions = {}
): UseBlockStreamResult {
  const {
    baseUrl = '/api/executions',
    autoReconnect = true,
    onExecutionStart,
    onComplete,
    onError,
    onCancel,
  } = options;

  // Stream state management
  const [state, dispatch] = useReducer(streamReducer, createInitialStreamState());

  // Execution tracking
  const [executionId, setExecutionId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isExecutingRef = useRef(false);
  const processedCountRef = useRef(0);

  // Callback refs
  const onExecutionStartRef = useRef(onExecutionStart);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onExecutionStartRef.current = onExecutionStart;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
    onCancelRef.current = onCancel;
  }, [onExecutionStart, onComplete, onError, onCancel]);

  // Connect to SSE stream
  const {
    events,
    error: streamError,
  } = useExecutionStream(executionId, {
    baseUrl,
    autoReconnect,
    onError: (err) => {
      dispatch({ type: 'SET_ERROR', error: err });
      onErrorRef.current?.(err);
    },
  });

  // Process incoming stream events
  useEffect(() => {
    if (events.length > processedCountRef.current) {
      const newEvents = events.slice(processedCountRef.current);
      processedCountRef.current = events.length;

      for (const event of newEvents) {
        dispatch({ type: 'PROCESS_EVENT', event });

        // Check if stream is complete
        if (event.event.type === 'done') {
          dispatch({ type: 'SET_STATUS', status: 'complete' });
          isExecutingRef.current = false;
        }
      }
    }
  }, [events]);

  // Notify on completion
  useEffect(() => {
    if (state.status === 'complete') {
      onCompleteRef.current?.(state);
    }
  }, [state.status, state]);

  // Handle stream errors
  useEffect(() => {
    if (streamError) {
      dispatch({ type: 'SET_ERROR', error: streamError });
      onErrorRef.current?.(streamError);
      isExecutingRef.current = false;
    }
  }, [streamError]);

  /**
   * Execute the block with given input
   */
  const execute = async (input: unknown) => {
    // Prevent concurrent executions
    if (isExecutingRef.current) {
      throw new Error('Execution already in progress');
    }

    try {
      isExecutingRef.current = true;

      // Reset state
      dispatch({ type: 'RESET' });
      processedCountRef.current = 0;
      dispatch({ type: 'START_STREAM' });

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // Call API to start execution
      const response = await fetch(`${baseUrl}/${blockId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Execution failed with status ${response.status}`
        );
      }

      const result = await response.json();
      const newExecutionId = result.executionId;

      if (!newExecutionId) {
        throw new Error('No execution ID returned from API');
      }

      // Set execution ID to trigger SSE connection
      setExecutionId(newExecutionId);
      onExecutionStartRef.current?.(newExecutionId);
    } catch (err) {
      // Handle abort (cancellation)
      if (err instanceof Error && err.name === 'AbortError') {
        dispatch({ type: 'CANCEL' });
        onCancelRef.current?.();
        isExecutingRef.current = false;
        return;
      }

      // Handle other errors
      const error = err instanceof Error ? err : new Error('Execution failed');
      dispatch({ type: 'SET_ERROR', error });
      onErrorRef.current?.(error);
      isExecutingRef.current = false;
    }
  };

  /**
   * Cancel the running execution
   */
  const cancel = async () => {
    // Abort the fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Call cancel API if we have an execution ID
    if (executionId) {
      try {
        await fetch(`${baseUrl}/${executionId}/cancel`, {
          method: 'POST',
        });
      } catch (err) {
        // Ignore cancel errors - stream will be disconnected anyway
        console.warn('Failed to cancel execution:', err);
      }

      // Disconnect from stream
      setExecutionId(null);
    }

    dispatch({ type: 'CANCEL' });
    onCancelRef.current?.();
    isExecutingRef.current = false;
  };

  /**
   * Reset the stream state
   */
  const reset = () => {
    // Cancel any running execution first
    if (isExecutingRef.current) {
      cancel();
    }

    dispatch({ type: 'RESET' });
    processedCountRef.current = 0;
    setExecutionId(null);
  };

  return {
    state,
    execute,
    reset,
    cancel,
    isExecuting: isExecutingRef.current,
    executionId,
  };
}
