/**
 * Stream State Reducer
 *
 * Manages the accumulated state from streaming events.
 * Processes BaleyBots stream events and updates UI state accordingly.
 */

import {
  type StreamState,
  type StreamStatus,
  type ToolCallState,
  type ToolCallStatus,
  createInitialStreamState,
  type BaleybotStreamEvent,
  type ServerStreamEvent,
} from '@/lib/streaming/types';

// ============================================================================
// Action Types
// ============================================================================

export type StreamAction =
  | { type: 'START_STREAM'; botId?: string; botName?: string }
  | { type: 'PROCESS_EVENT'; event: ServerStreamEvent }
  | { type: 'SET_STATUS'; status: StreamStatus }
  | { type: 'SET_ERROR'; error: Error }
  | { type: 'RESET' }
  | { type: 'CANCEL' };

// ============================================================================
// Reducer
// ============================================================================

/**
 * Reducer for managing stream state.
 * Processes streaming events and updates accumulated state.
 */
export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'START_STREAM': {
      const now = Date.now();
      return {
        ...createInitialStreamState(),
        status: 'connecting',
        botId: action.botId || null,
        botName: action.botName || null,
        metrics: {
          ...createInitialStreamState().metrics,
          startTime: now,
        },
      };
    }

    case 'PROCESS_EVENT': {
      return processEvent(state, action.event);
    }

    case 'SET_STATUS': {
      return {
        ...state,
        status: action.status,
        metrics: {
          ...state.metrics,
          endTime: action.status === 'complete' || action.status === 'error' || action.status === 'cancelled'
            ? Date.now()
            : state.metrics.endTime,
        },
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        status: 'error',
        error: action.error,
        metrics: {
          ...state.metrics,
          endTime: Date.now(),
        },
      };
    }

    case 'CANCEL': {
      return {
        ...state,
        status: 'cancelled',
        metrics: {
          ...state.metrics,
          endTime: Date.now(),
        },
      };
    }

    case 'RESET': {
      return createInitialStreamState();
    }

    default:
      return state;
  }
}

// ============================================================================
// Event Processing
// ============================================================================

/**
 * Process a single streaming event and update state accordingly.
 */
function processEvent(state: StreamState, serverEvent: ServerStreamEvent): StreamState {
  const event = serverEvent.event;
  const now = Date.now();

  // Update bot info if not set
  let newState = state;
  if (!state.botId && serverEvent.botId) {
    newState = {
      ...newState,
      botId: serverEvent.botId,
      botName: serverEvent.botName,
    };
  }

  // Set status to streaming if not already
  if (state.status === 'connecting') {
    newState = {
      ...newState,
      status: 'streaming',
    };
  }

  // Update first token metrics if this is the first content event
  const isFirstContentEvent = !state.metrics.firstTokenTime && (
    event.type === 'text_delta' ||
    event.type === 'structured_output_delta' ||
    event.type === 'reasoning'
  );

  let metrics = newState.metrics;
  if (isFirstContentEvent && state.metrics.startTime) {
    metrics = {
      ...metrics,
      firstTokenTime: now,
      ttft: now - state.metrics.startTime,
    };
  }

  // Process the specific event type
  switch (event.type) {
    case 'text_delta': {
      const newText = state.text + event.content;
      return {
        ...newState,
        text: newText,
        metrics: {
          ...metrics,
          totalTokens: metrics.totalTokens + 1,
          tokensPerSecond: calculateTokensPerSecond(
            metrics.totalTokens + 1,
            metrics.firstTokenTime,
            now
          ),
        },
      };
    }

    case 'structured_output_delta': {
      // Accumulate structured output string
      const currentOutput = typeof state.structuredOutput === 'string'
        ? state.structuredOutput
        : '';

      return {
        ...newState,
        structuredOutput: currentOutput + event.content,
        structuredOutputComplete: false,
        metrics,
      };
    }

    case 'reasoning': {
      return {
        ...newState,
        reasoning: state.reasoning + event.content,
        metrics: {
          ...metrics,
          totalTokens: metrics.totalTokens + 1,
          tokensPerSecond: calculateTokensPerSecond(
            metrics.totalTokens + 1,
            metrics.firstTokenTime,
            now
          ),
        },
      };
    }

    case 'tool_call_stream_start': {
      const newToolCall: ToolCallState = {
        id: event.id,
        toolName: event.toolName,
        status: 'streaming_args',
        arguments: '',
        startTime: now,
      };

      return {
        ...newState,
        toolCalls: [...state.toolCalls, newToolCall],
        metrics,
      };
    }

    case 'tool_call_arguments_delta': {
      const toolCalls = state.toolCalls.map((tc) =>
        tc.id === event.id
          ? {
              ...tc,
              arguments: tc.arguments + event.argumentsDelta,
            }
          : tc
      );

      return {
        ...newState,
        toolCalls,
        metrics,
      };
    }

    case 'tool_call_stream_complete': {
      const toolCalls = state.toolCalls.map((tc) =>
        tc.id === event.id
          ? {
              ...tc,
              status: 'args_complete' as const,
              parsedArguments: event.arguments,
            }
          : tc
      );

      return {
        ...newState,
        toolCalls,
        metrics,
      };
    }

    case 'tool_execution_start': {
      const toolCalls = state.toolCalls.map((tc) =>
        tc.id === event.id
          ? {
              ...tc,
              status: 'executing' as const,
            }
          : tc
      );

      return {
        ...newState,
        toolCalls,
        metrics,
      };
    }

    case 'tool_execution_output': {
      const toolCalls = state.toolCalls.map((tc) => {
        if (tc.id === event.id) {
          const newStatus: ToolCallStatus = event.error ? 'error' : 'complete';
          return {
            ...tc,
            status: newStatus,
            result: event.result,
            error: event.error,
            endTime: now,
          };
        }
        return tc;
      });

      return {
        ...newState,
        toolCalls,
        metrics,
      };
    }

    case 'tool_execution_stream': {
      // Handle nested bot streams within tool execution
      const toolCalls = state.toolCalls.map((tc) => {
        if (tc.id === event.toolCallId) {
          const nestedEvent = event.nestedEvent;
          const currentNested = tc.nestedStream || {
            botName: event.childBotName || event.toolName,
            text: '',
            isComplete: false,
          };

          // Process nested event
          if (nestedEvent.type === 'text_delta') {
            return {
              ...tc,
              nestedStream: {
                ...currentNested,
                text: currentNested.text + nestedEvent.content,
              },
            };
          } else if (nestedEvent.type === 'done') {
            return {
              ...tc,
              nestedStream: {
                ...currentNested,
                isComplete: true,
              },
            };
          }
        }
        return tc;
      });

      return {
        ...newState,
        toolCalls,
        metrics,
      };
    }

    case 'tool_validation_error': {
      return {
        ...newState,
        error: new Error(
          `Tool validation error for ${event.toolName}: ${JSON.stringify(event.validationErrors)}`
        ),
        metrics,
      };
    }

    case 'error': {
      const errorMessage = event.error instanceof Error
        ? event.error.message
        : event.error.message;

      return {
        ...newState,
        status: 'error',
        error: new Error(errorMessage),
        metrics: {
          ...metrics,
          endTime: now,
        },
      };
    }

    case 'done': {
      // Try to parse structured output if it's a string
      let finalStructuredOutput = state.structuredOutput;
      if (typeof state.structuredOutput === 'string' && state.structuredOutput.trim()) {
        try {
          finalStructuredOutput = JSON.parse(state.structuredOutput);
        } catch {
          // Keep as string if parsing fails
        }
      }

      return {
        ...newState,
        status: 'complete',
        structuredOutput: finalStructuredOutput,
        structuredOutputComplete: true,
        metrics: {
          ...metrics,
          endTime: now,
        },
      };
    }

    default:
      return newState;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate tokens per second based on elapsed time.
 */
function calculateTokensPerSecond(
  totalTokens: number,
  firstTokenTime: number | null,
  currentTime: number
): number | null {
  if (!firstTokenTime || totalTokens === 0) {
    return null;
  }

  const elapsedSeconds = (currentTime - firstTokenTime) / 1000;
  if (elapsedSeconds === 0) {
    return null;
  }

  return totalTokens / elapsedSeconds;
}
