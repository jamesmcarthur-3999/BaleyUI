/**
 * Stream State Reducer — SDK-Aligned
 *
 * Wraps @baleybots/chat's reduceStreamEvent() to manage streaming state.
 * The SDK's StreamSegmentState is the canonical representation.
 * App-level concerns (status, error, metrics) are managed in a thin wrapper.
 */

import {
  reduceStreamEvent,
  createInitialState as createInitialSegmentState,
  type StreamSegmentState,
} from '@baleybots/chat';
import type { ServerStreamEvent } from '@/lib/streaming/types';

// ============================================================================
// Action Types
// ============================================================================

export type StreamAction =
  | { type: 'START_STREAM'; botId?: string; botName?: string }
  | { type: 'PROCESS_EVENT'; event: ServerStreamEvent }
  | { type: 'SET_STATUS'; status: AppStreamStatus }
  | { type: 'SET_ERROR'; error: Error }
  | { type: 'RESET' }
  | { type: 'CANCEL' };

// ============================================================================
// State Types
// ============================================================================

export type AppStreamStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error' | 'cancelled';

export interface AppStreamState {
  /** SDK segment state — the canonical streaming representation */
  segmentState: StreamSegmentState;
  /** App-level status */
  status: AppStreamStatus;
  /** Error if status is 'error' */
  error: Error | null;
  /** Bot info */
  botId: string | null;
  botName: string | null;
  /** Streaming metrics */
  metrics: {
    startTime: number | null;
    firstTokenTime: number | null;
    endTime: number | null;
    ttft: number | null;
  };
}

export function createInitialAppStreamState(): AppStreamState {
  return {
    segmentState: createInitialSegmentState(),
    status: 'idle',
    error: null,
    botId: null,
    botName: null,
    metrics: { startTime: null, firstTokenTime: null, endTime: null, ttft: null },
  };
}

// ============================================================================
// Reducer
// ============================================================================

export function streamReducer(state: AppStreamState, action: StreamAction): AppStreamState {
  switch (action.type) {
    case 'START_STREAM': {
      return {
        segmentState: createInitialSegmentState(),
        status: 'connecting',
        error: null,
        botId: action.botId ?? null,
        botName: action.botName ?? null,
        metrics: { startTime: Date.now(), firstTokenTime: null, endTime: null, ttft: null },
      };
    }

    case 'PROCESS_EVENT': {
      const prevSegCount = state.segmentState.segments.length;
      const newSegState = reduceStreamEvent(state.segmentState, action.event.event);
      const now = Date.now();

      // Detect first content
      const isFirstContent = !state.metrics.firstTokenTime && newSegState.segments.length > prevSegCount;

      return {
        ...state,
        segmentState: newSegState,
        status: newSegState.isDone ? 'complete' : 'streaming',
        botId: state.botId || action.event.botId,
        botName: state.botName || action.event.botName,
        metrics: {
          ...state.metrics,
          firstTokenTime: isFirstContent ? now : state.metrics.firstTokenTime,
          ttft: isFirstContent && state.metrics.startTime
            ? now - state.metrics.startTime
            : state.metrics.ttft,
          endTime: newSegState.isDone ? now : null,
        },
      };
    }

    case 'SET_STATUS': {
      const isTerminal = action.status === 'complete' || action.status === 'error' || action.status === 'cancelled';
      return {
        ...state,
        status: action.status,
        metrics: {
          ...state.metrics,
          endTime: isTerminal ? Date.now() : state.metrics.endTime,
        },
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        status: 'error',
        error: action.error,
        metrics: { ...state.metrics, endTime: Date.now() },
      };
    }

    case 'CANCEL': {
      return {
        ...state,
        status: 'cancelled',
        metrics: { ...state.metrics, endTime: Date.now() },
      };
    }

    case 'RESET': {
      return createInitialAppStreamState();
    }

    default:
      return state;
  }
}
