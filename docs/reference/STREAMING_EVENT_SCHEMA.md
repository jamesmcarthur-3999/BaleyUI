# BaleyBot Streaming Event Schema

This document is the **authoritative reference** for BaleyBot execution streaming events. These events are emitted during real-time BaleyBot execution and consumed by the streaming UI.

Source: `@baleybots/core` (re-exported via `@/lib/streaming/types/events`)

For builder/UI events (workspace collaboration, undo/redo), see [BUILDER_EVENT_SCHEMA.md](./BUILDER_EVENT_SCHEMA.md).

---

## Event Types

### Text Streaming

> **Critical:** Use `content` (NOT `delta`) for the text field name.

```typescript
{ type: 'text_delta', content: string }
{ type: 'structured_output_delta', content: string }
{ type: 'reasoning', content: string }
```

### Tool Call Streaming

> Use `id` for tool call identification.

```typescript
{ type: 'tool_call_stream_start', id: string, toolName: string }
{ type: 'tool_call_arguments_delta', id: string, argumentsDelta: string }
{ type: 'tool_call_stream_complete', id: string, toolName: string, arguments: unknown }
```

### Tool Execution

```typescript
{ type: 'tool_execution_start', id: string, toolName: string, arguments: unknown }
{ type: 'tool_execution_output', id: string, toolName: string, result: unknown, error?: string }
{ type: 'tool_execution_stream', toolCallId: string, toolName: string, nestedEvent: BaleybotStreamEvent, childBotName?: string }
```

### Errors

```typescript
{ type: 'tool_validation_error', toolName: string, validationErrors: unknown, receivedArguments: unknown }
{ type: 'error', error: Error | { message: string, name?: string, stack?: string } }
```

### Done

> **Critical:** Use `reason` (NOT `result`) for the completion reason field.

```typescript
{
  type: 'done',
  reason: DoneReason,
  timestamp: number,
  duration_ms: number,
  agent_id: string,
  parent_agent_id?: string
}
```

---

## DoneReason Values

| Value | Meaning |
|-------|---------|
| `turn_yielded` | Normal completion — the BB finished its turn |
| `out_of_iterations` | Hit max iteration limit |
| `max_tokens_reached` | Model output exceeded token limit |
| `error` | Execution failed with an error |
| `interrupted` | User or system interrupted execution |
| `no_applicable_tools` | BB needed a tool but none matched |
| `max_depth_reached` | Nested spawn_baleybot hit depth limit |
| `graceful_shutdown` | Server shutting down, execution stopped cleanly |

---

## TypeScript Type

```typescript
type DoneReason =
  | 'turn_yielded'
  | 'out_of_iterations'
  | 'max_tokens_reached'
  | 'error'
  | 'interrupted'
  | 'no_applicable_tools'
  | 'max_depth_reached'
  | 'graceful_shutdown';
```

---

## Common Gotchas

1. **`content` not `delta`**: Text events use `content` as the field name, not `delta`. This differs from some other AI streaming APIs.
2. **`reason` not `result`**: The done event uses `reason` for the completion status, not `result`.
3. **`tool_execution_stream`** carries nested events from `spawn_baleybot` calls — these are full `BaleybotStreamEvent` objects wrapped in the parent stream.
4. **`__entityName`** tag is added by the executor's `onEvent` callback to identify which BAL entity emitted an event in multi-entity compositions.

---

## See Also

- [BUILDER_EVENT_SCHEMA.md](./BUILDER_EVENT_SCHEMA.md) — Builder/UI event sourcing schema
- [BAL Language Reference](./BAL_LANGUAGE_REFERENCE.md) — BAL syntax and compositions
