# Streaming UI Components

A comprehensive set of React components for displaying streaming AI responses, tool executions, and performance metrics in BaleyUI.

## Components

### 1. StreamingText

Displays streaming text with optional cursor animation.

**Props:**
- `text: string` - The text content to display
- `isStreaming: boolean` - Whether text is currently streaming
- `className?: string` - Additional CSS classes
- `showCursor?: boolean` - Show animated cursor (default: true)

**Example:**
```tsx
import { StreamingText } from '@/components/streaming';

function MyComponent() {
  const { state } = useBlockStream(blockId);

  return (
    <StreamingText
      text={state.text}
      isStreaming={state.status === 'streaming'}
    />
  );
}
```

### 2. StreamingJSON

Progressive JSON rendering with syntax highlighting for structured output.

**Props:**
- `json: string` - JSON string to display
- `isStreaming: boolean` - Whether JSON is currently streaming
- `className?: string` - Additional CSS classes

**Features:**
- Parses partial JSON while streaming
- Syntax highlighting (keys, strings, numbers, booleans)
- Handles incomplete JSON gracefully

**Example:**
```tsx
import { StreamingJSON } from '@/components/streaming';

function StructuredOutput() {
  const { state } = useBlockStream(blockId);

  return (
    <StreamingJSON
      json={JSON.stringify(state.structuredOutput)}
      isStreaming={state.status === 'streaming'}
    />
  );
}
```

### 3. ToolCallCard

Displays individual tool execution with collapsible arguments and results.

**Props:**
- `toolCall: ToolCall` - Tool call object with status, arguments, and result
- `className?: string` - Additional CSS classes

**ToolCall Type:**
```ts
interface ToolCall {
  id: string;
  toolName: string;
  arguments: string;
  parsedArguments?: unknown;
  status: 'streaming_args' | 'args_complete' | 'executing' | 'complete' | 'error';
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}
```

**Example:**
```tsx
import { ToolCallCard } from '@/components/streaming';

function ToolsList() {
  const { state } = useBlockStream(blockId);

  return (
    <div className="space-y-3">
      {state.toolCalls.map((toolCall) => (
        <ToolCallCard key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  );
}
```

### 4. StreamMetrics

Displays streaming performance metrics in a compact card.

**Props:**
- `metrics: StreamMetrics` - Metrics object
- `className?: string` - Additional CSS classes

**StreamMetrics Type:**
```ts
interface StreamMetrics {
  ttft?: number | null;        // Time to first token (ms)
  tokensPerSec?: number | null; // Tokens per second
  totalTokens?: number;         // Total tokens generated
}
```

**Example:**
```tsx
import { StreamMetrics } from '@/components/streaming';

function MetricsDisplay() {
  const { state } = useBlockStream(blockId);

  return (
    <StreamMetrics
      metrics={{
        ttft: state.metrics.ttft,
        tokensPerSec: state.metrics.tokensPerSecond,
        totalTokens: state.metrics.totalTokens,
      }}
    />
  );
}
```

### 5. StreamStatus

Shows current stream status with loading animations and error handling.

**Props:**
- `status: StreamStatus` - Current stream status
- `error?: string` - Error message if status is 'error'
- `onRetry?: () => void` - Callback for retry button
- `className?: string` - Additional CSS classes

**StreamStatus Type:**
```ts
type StreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'cancelled';
```

**Example:**
```tsx
import { StreamStatus } from '@/components/streaming';

function StatusBar() {
  const { state, reset } = useBlockStream(blockId);

  return (
    <StreamStatus
      status={state.status}
      error={state.error?.message}
      onRetry={reset}
    />
  );
}
```

### 6. ExecutionPanel

Complete execution interface combining all streaming components.

**Props:**
- `blockId: string` - ID of the block to execute
- `className?: string` - Additional CSS classes
- `defaultInput?: string` - Default input value
- `onComplete?: (result: unknown) => void` - Callback when execution completes
- `onError?: (error: Error) => void` - Callback when execution errors

**Features:**
- Input area with text/JSON toggle
- Execute/Cancel/Reset buttons
- Streaming output with tabs (text, structured, reasoning)
- Tool calls list
- Performance metrics
- Status indicator with error handling

**Example:**
```tsx
import { ExecutionPanel } from '@/components/streaming';

function BlockExecutor() {
  return (
    <ExecutionPanel
      blockId="block-uuid"
      defaultInput='{"prompt": "Hello!"}'
      onComplete={(result) => console.log('Done:', result)}
      onError={(error) => console.error('Error:', error)}
    />
  );
}
```

## Integration with useBlockStream Hook

All components are designed to work seamlessly with the `useBlockStream` hook:

```tsx
import { useBlockStream } from '@/hooks';
import {
  StreamingText,
  StreamingJSON,
  ToolCallCard,
  StreamMetrics,
  StreamStatus,
} from '@/components/streaming';

function CustomExecutionUI({ blockId }: { blockId: string }) {
  const { state, execute, cancel, reset, isExecuting } = useBlockStream(blockId);

  return (
    <div className="space-y-4">
      {/* Status */}
      <StreamStatus
        status={state.status}
        error={state.error?.message}
        onRetry={reset}
      />

      {/* Output */}
      {state.text && (
        <StreamingText
          text={state.text}
          isStreaming={state.status === 'streaming'}
        />
      )}

      {/* Tool Calls */}
      {state.toolCalls.map((toolCall) => (
        <ToolCallCard key={toolCall.id} toolCall={toolCall} />
      ))}

      {/* Metrics */}
      <StreamMetrics
        metrics={{
          ttft: state.metrics.ttft,
          tokensPerSec: state.metrics.tokensPerSecond,
          totalTokens: state.metrics.totalTokens,
        }}
      />
    </div>
  );
}
```

## Styling

All components use:
- Tailwind CSS for styling
- Existing UI components from `@/components/ui/`
- CSS variables for theming (supports dark mode)
- Lucide React for icons

## Type Safety

All components are fully typed with TypeScript. Import types from their respective modules or from the streaming types:

```tsx
import type { ToolCall } from '@/components/streaming';
import type { StreamMetrics } from '@/components/streaming';
import type { StreamStatus, StreamState } from '@/lib/streaming/types/state';
```

## Performance

- **StreamingText**: Efficiently updates only when new text is added
- **StreamingJSON**: Parses JSON incrementally with memoization
- **ToolCallCard**: Collapsible sections to reduce DOM size
- **ExecutionPanel**: Uses ScrollArea for large outputs

## Accessibility

- Proper ARIA labels on interactive elements
- Keyboard navigation support
- Screen reader friendly status updates
- High contrast support for error states
