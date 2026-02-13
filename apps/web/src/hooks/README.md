# BaleyUI Streaming Hooks

React hooks for streaming AI BaleyBot executions with automatic reconnection and state management.

## Architecture

The streaming system is SDK-aligned, using `@baleybots/chat`'s `reduceStreamEvent()` and `StreamSegmentState` as the canonical representation. App-level concerns (status, error, metrics) are managed in a thin `AppStreamState` wrapper.

**Pipeline:** SSE events → `ServerStreamEvent` wrapper → `reduceStreamEvent()` → `StreamSegmentState` → `SegmentRenderer`

## Overview

- `useStreamState` — SDK-aligned state reducer (`AppStreamState` wraps `StreamSegmentState`)
- `useExecutionStream` — Low-level SSE stream connection
- `useExecutionTimeline` — Higher-level hook for flow execution with node tracking
- `useVisibilityReconnect` — Automatic reconnection on tab visibility

## Quick Start

```tsx
import { useReducer } from 'react';
import { streamReducer, createInitialAppStreamState } from '@/hooks/useStreamState';
import { SegmentRenderer, CREATOR_CONFIG } from '@/components/chat';

function StreamingOutput() {
  const [state, dispatch] = useReducer(streamReducer, createInitialAppStreamState());

  // Start a stream
  dispatch({ type: 'START_STREAM', botId: 'abc', botName: 'My Bot' });

  // Process each SSE event
  dispatch({ type: 'PROCESS_EVENT', event: serverStreamEvent });

  // Render segments
  return <SegmentRenderer segments={state.segmentState.segments} config={CREATOR_CONFIG} />;
}
```

## API Reference

### `streamReducer(state, action)`

SDK-aligned reducer wrapping `@baleybots/chat`'s `reduceStreamEvent()`.

**State:** `AppStreamState`
```typescript
{
  segmentState: StreamSegmentState;  // SDK segment state (canonical)
  status: AppStreamStatus;           // 'idle' | 'connecting' | 'streaming' | 'complete' | 'error' | 'cancelled'
  error: Error | null;
  botId: string | null;
  botName: string | null;
  metrics: {
    startTime: number | null;
    firstTokenTime: number | null;
    endTime: number | null;
    ttft: number | null;
  };
}
```

**Actions:**
- `START_STREAM` — Initialize stream with optional botId/botName
- `PROCESS_EVENT` — Feed a `ServerStreamEvent` through SDK reducer
- `SET_STATUS` — Manually set status
- `SET_ERROR` — Set error state
- `CANCEL` — Cancel execution
- `RESET` — Reset to initial state

**Key:** `state.segmentState.segments` is the ordered `StreamSegment[]` array for rendering.

### `useExecutionStream(executionId, options)`

Low-level SSE stream connection hook.

```typescript
const { events, isConnected, reconnect, disconnect } = useExecutionStream(executionId, {
  baseUrl: '/api/executions',
  autoReconnect: true,
  reconnectOnVisibility: true,
});
```

### `useExecutionTimeline(executionId, options)`

Higher-level hook for flow executions with node-level tracking.

```typescript
const { status, nodeStates, activeNodeId, currentStreamContent } = useExecutionTimeline(executionId);
```

## Segment Types (SDK)

The SDK defines 9 segment types. Access via `state.segmentState.segments`:

| Segment | Status Values | Key Fields |
|---------|---------------|------------|
| `TextSegment` | — | `content`, `isStreaming` |
| `ToolCallSegment` | `'running' \| 'completed' \| 'failed'` | `name`, `args`, `result`, `error` |
| `ReasoningSegment` | — | `content`, `isStreaming` |
| `SpawnAgentSegment` | `'running' \| 'completed' \| 'failed'` | `goal`, `childSegments` |
| `SequentialThinkingSegment` | `'running' \| 'completed'` | `thoughts` |
| `DSLPipelineSegment` | `'streaming' \| 'parsing' \| 'running' \| 'completed' \| 'failed'` | `definedBots`, `code` |
| `StructuredOutputSegment` | — | `content`, `isStreaming` |
| `ErrorSegment` | — | `message`, `details` |
| `DoneSegment` | — | `reason`, `duration_ms` |

**IMPORTANT:** Tool call status values are `'running'` / `'completed'` / `'failed'` (NOT the old `'streaming_args'` / `'executing'` / `'complete'` / `'error'`).

## Rendering

Use the unified chat component library:

```tsx
import { SegmentRenderer, CREATOR_CONFIG, COMPANION_CONFIG } from '@/components/chat';

// Full-page (all segment types)
<SegmentRenderer segments={state.segmentState.segments} config={CREATOR_CONFIG} />

// Floating panel (text, tool_call, error only)
<SegmentRenderer segments={state.segmentState.segments} config={COMPANION_CONFIG} />
```

## Best Practices

1. **Use `AppStreamState`** — Don't build custom state accumulators
2. **Render with `SegmentRenderer`** — Don't hand-roll segment rendering
3. **Use SDK status values** — `'running'` / `'completed'` / `'failed'` everywhere
4. **Handle errors** — Use `state.error` and `status === 'error'`
5. **Show loading states** — Use `state.status` for loading indicators
6. **Convert stored text** — Use `textToSegments(content)` for stored messages
