# BaleyUI Streaming Hooks

React hooks for streaming AI block executions with automatic reconnection and state management.

## Overview

These hooks provide a complete solution for executing blocks and streaming their results in real-time:

- `useBlockStream` - High-level hook for block execution (most common)
- `useExecutionStream` - Low-level SSE stream connection
- `useStreamState` - State reducer for processing stream events
- `useVisibilityReconnect` - Automatic reconnection on tab visibility

## Quick Start

### Basic Usage

```tsx
import { useBlockStream } from '@/hooks';

function BlockExecutor({ blockId }: { blockId: string }) {
  const { state, execute, reset, cancel, isExecuting } = useBlockStream(blockId, {
    onComplete: (state) => {
      console.log('Execution complete!', state.text);
    },
    onError: (error) => {
      console.error('Execution failed:', error);
    },
  });

  const handleExecute = async () => {
    try {
      await execute({ prompt: 'Hello, world!' });
    } catch (err) {
      console.error('Failed to start execution:', err);
    }
  };

  return (
    <div>
      <button onClick={handleExecute} disabled={isExecuting}>
        {isExecuting ? 'Executing...' : 'Execute'}
      </button>

      {isExecuting && (
        <button onClick={cancel}>Cancel</button>
      )}

      {state.text && (
        <div className="output">
          <h3>Output:</h3>
          <p>{state.text}</p>
        </div>
      )}

      {state.toolCalls.map((tc) => (
        <div key={tc.id}>
          <strong>{tc.toolName}</strong>
          <pre>{JSON.stringify(tc.parsedArguments, null, 2)}</pre>
          {tc.result && <pre>{JSON.stringify(tc.result, null, 2)}</pre>}
        </div>
      ))}

      {state.metrics.ttft && (
        <div>Time to first token: {state.metrics.ttft}ms</div>
      )}
    </div>
  );
}
```

## API Reference

### `useBlockStream(blockId, options)`

High-level hook for executing blocks and streaming results.

**Parameters:**
- `blockId: string` - ID of the block to execute
- `options?: UseBlockStreamOptions` - Configuration options

**Returns:** `UseBlockStreamResult`
```typescript
{
  state: StreamState;           // Current accumulated state
  execute: (input) => Promise<void>;  // Start execution
  reset: () => void;            // Reset state
  cancel: () => Promise<void>;  // Cancel execution
  isExecuting: boolean;         // Whether executing
  executionId: string | null;   // Current execution ID
}
```

**Options:**
```typescript
{
  baseUrl?: string;                    // Default: '/api/executions'
  autoReconnect?: boolean;             // Default: true
  onExecutionStart?: (executionId: string) => void;
  onComplete?: (state: StreamState) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}
```

### `useExecutionStream(executionId, options)`

Low-level hook for connecting to an SSE execution stream.

**Parameters:**
- `executionId: string | null` - Execution ID to stream (null to disconnect)
- `options: UseExecutionStreamOptions` - Configuration

**Returns:** `UseExecutionStreamResult`
```typescript
{
  events: ServerStreamEvent[];  // All received events
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
  error: Error | null;
  isConnected: boolean;
  lastEventIndex: number;       // For reconnection resume
  reconnect: () => void;        // Manual reconnect
  disconnect: () => void;       // Manual disconnect
}
```

**Options:**
```typescript
{
  baseUrl: string;                     // Required
  autoReconnect?: boolean;             // Default: true
  maxReconnectAttempts?: number;       // Default: 5
  initialReconnectDelay?: number;      // Default: 1000ms
  maxReconnectDelay?: number;          // Default: 30000ms
  reconnectOnVisibility?: boolean;     // Default: true
  headers?: Record<string, string>;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}
```

### `streamReducer(state, action)`

Reducer function for managing stream state.

**Actions:**
- `START_STREAM` - Initialize stream
- `PROCESS_EVENT` - Process incoming event
- `SET_STATUS` - Update status
- `SET_ERROR` - Set error state
- `CANCEL` - Cancel execution
- `RESET` - Reset to initial state

### `useVisibilityReconnect(onReconnect, options)`

Hook that triggers reconnection when tab becomes visible.

**Parameters:**
- `onReconnect: () => void` - Callback to trigger
- `options?: UseVisibilityReconnectOptions`

**Options:**
```typescript
{
  enabled?: boolean;      // Default: true
  debounceMs?: number;    // Default: 500ms
}
```

## Stream State Structure

The `StreamState` object contains all accumulated stream data:

```typescript
{
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error' | 'cancelled';

  // Content
  text: string;                    // Accumulated text
  reasoning: string;               // Accumulated reasoning/thinking
  structuredOutput: unknown;       // Parsed JSON output
  structuredOutputComplete: boolean;

  // Tool calls
  toolCalls: ToolCallState[];      // Array of tool executions

  // Metrics
  metrics: {
    ttft: number | null;           // Time to first token (ms)
    tokensPerSecond: number | null;
    totalTokens: number;
    startTime: number | null;
    firstTokenTime: number | null;
    endTime: number | null;
  };

  // Error handling
  error: Error | null;

  // Bot info
  botId: string | null;
  botName: string | null;
}
```

## Tool Call State

Each tool call has the following structure:

```typescript
{
  id: string;
  toolName: string;
  status: 'streaming_args' | 'args_complete' | 'executing' | 'complete' | 'error';
  arguments: string;           // Raw accumulated arguments
  parsedArguments?: unknown;   // Parsed when complete
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
  nestedStream?: {             // For nested bot streams
    botName: string;
    text: string;
    isComplete: boolean;
  };
}
```

## Advanced Examples

### Custom Error Handling

```tsx
const { state, execute } = useBlockStream(blockId, {
  onError: (error) => {
    if (error.message.includes('rate limit')) {
      toast.error('Rate limit exceeded. Please try again later.');
    } else {
      toast.error(`Execution failed: ${error.message}`);
    }
  },
});
```

### Displaying Tool Calls

```tsx
{state.toolCalls.map((tc) => (
  <div key={tc.id} className="tool-call">
    <div className="tool-header">
      <span className="tool-name">{tc.toolName}</span>
      <span className={`status ${tc.status}`}>{tc.status}</span>
    </div>

    {tc.status === 'streaming_args' && (
      <div className="loading">Streaming arguments...</div>
    )}

    {tc.parsedArguments && (
      <pre className="arguments">
        {JSON.stringify(tc.parsedArguments, null, 2)}
      </pre>
    )}

    {tc.result && (
      <div className="result">
        <h4>Result:</h4>
        <pre>{JSON.stringify(tc.result, null, 2)}</pre>
      </div>
    )}

    {tc.error && (
      <div className="error">Error: {tc.error}</div>
    )}
  </div>
))}
```

### Metrics Display

```tsx
{state.metrics.ttft && (
  <div className="metrics">
    <div>Time to first token: {state.metrics.ttft}ms</div>
    {state.metrics.tokensPerSecond && (
      <div>Tokens/sec: {state.metrics.tokensPerSecond.toFixed(2)}</div>
    )}
    <div>Total tokens: {state.metrics.totalTokens}</div>
  </div>
)}
```

### Manual Stream Connection

For advanced use cases, you can use the low-level hooks:

```tsx
import { useExecutionStream, streamReducer, createInitialStreamState } from '@/hooks';
import { useReducer, useEffect } from 'react';

function CustomStreamComponent({ executionId }: { executionId: string | null }) {
  const [state, dispatch] = useReducer(streamReducer, createInitialStreamState());

  const { events, status, error } = useExecutionStream(executionId, {
    baseUrl: '/api/executions',
    onConnect: () => console.log('Connected!'),
    onDisconnect: () => console.log('Disconnected'),
  });

  // Process events
  useEffect(() => {
    events.forEach((event) => {
      dispatch({ type: 'PROCESS_EVENT', event });
    });
  }, [events]);

  return (
    <div>
      <div>Status: {status}</div>
      <div>Text: {state.text}</div>
    </div>
  );
}
```

## Event Types

The hooks handle all BaleyBots stream events:

- `text_delta` - Text content chunks
- `structured_output_delta` - JSON output chunks
- `reasoning` - Thinking/reasoning content
- `tool_call_stream_start` - Tool call initiated
- `tool_call_arguments_delta` - Tool arguments streaming
- `tool_call_stream_complete` - Tool arguments complete
- `tool_execution_start` - Tool execution started
- `tool_execution_output` - Tool execution result
- `tool_execution_stream` - Nested bot stream events
- `tool_validation_error` - Tool validation failed
- `error` - Stream error
- `done` - Stream complete

## Features

- **Automatic Reconnection**: Reconnects with exponential backoff on disconnect
- **Tab Visibility**: Reconnects when tab becomes visible again
- **Metrics Tracking**: Automatically tracks TTFT, tokens/sec, and more
- **Type Safety**: Full TypeScript support
- **React 19 Compatible**: Uses modern React patterns
- **Event Resumption**: Tracks last event index for resuming streams
- **Cancellation**: Proper cleanup and cancellation support
- **Error Handling**: Comprehensive error handling and recovery

## Best Practices

1. **Always handle errors**: Use the `onError` callback to handle failures gracefully
2. **Show loading states**: Use `state.status` or `isExecuting` to show loading indicators
3. **Clean up on unmount**: The hooks handle cleanup automatically
4. **Don't execute concurrently**: Wait for one execution to complete before starting another
5. **Display metrics**: Show TTFT and tokens/sec for transparency
6. **Handle tool calls**: Display tool executions to users when relevant
7. **Use cancellation**: Provide a way for users to cancel long-running executions
