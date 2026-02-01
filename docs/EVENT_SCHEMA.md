# BaleyUI Event Schema

This document describes the event sourcing schema used throughout BaleyUI.

## Overview

All builder actions are captured as immutable events. This enables:

- **Real-time collaboration** - See changes as they happen
- **Time-travel** - Navigate through history
- **Undo/Redo** - Reverse any action
- **Audit logging** - Track who did what and when

## Event Structure

### Base Event

All events share this structure:

```typescript
interface BuilderEvent {
  /** Unique event ID (UUID) */
  id: string;

  /** Event type identifier */
  type: BuilderEventType;

  /** Workspace this event belongs to */
  workspaceId: string;

  /** Who performed the action */
  actor: Actor;

  /** Event-specific payload */
  data: EventData;

  /** When the event occurred (ISO 8601) */
  timestamp: string;

  /** Schema version for migrations */
  version: number;
}
```

### Actor

```typescript
interface Actor {
  /** Actor type */
  type: 'user' | 'ai-agent' | 'system';

  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;
}
```

## Event Types

### Block Events

#### `block.created`

Emitted when a new block is created.

```typescript
interface BlockCreatedData {
  blockId: string;
  blockType: 'agent' | 'tool' | 'prompt' | 'output';
  name: string;
  config?: Record<string, unknown>;
}
```

Example:
```json
{
  "type": "block.created",
  "data": {
    "blockId": "block_abc123",
    "blockType": "agent",
    "name": "Customer Support Agent",
    "config": {
      "model": "gpt-4",
      "temperature": 0.7
    }
  }
}
```

#### `block.updated`

Emitted when a block is modified.

```typescript
interface BlockUpdatedData {
  blockId: string;
  changes: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
}
```

Example:
```json
{
  "type": "block.updated",
  "data": {
    "blockId": "block_abc123",
    "changes": [
      {
        "field": "name",
        "oldValue": "Customer Support Agent",
        "newValue": "Support Bot v2"
      },
      {
        "field": "config.temperature",
        "oldValue": 0.7,
        "newValue": 0.5
      }
    ]
  }
}
```

#### `block.deleted`

Emitted when a block is removed.

```typescript
interface BlockDeletedData {
  blockId: string;
  blockType: string;
  name: string;
}
```

### Flow Events

#### `flow.created`

Emitted when a new flow is created.

```typescript
interface FlowCreatedData {
  flowId: string;
  name: string;
  description?: string;
}
```

#### `flow.updated`

Emitted when a flow is modified.

```typescript
interface FlowUpdatedData {
  flowId: string;
  changes: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
}
```

#### `flow.deleted`

Emitted when a flow is removed.

```typescript
interface FlowDeletedData {
  flowId: string;
  name: string;
}
```

### Connection Events

#### `connection.created`

Emitted when blocks are connected.

```typescript
interface ConnectionCreatedData {
  connectionId: string;
  flowId: string;
  sourceBlockId: string;
  sourcePort: string;
  targetBlockId: string;
  targetPort: string;
}
```

#### `connection.deleted`

Emitted when a connection is removed.

```typescript
interface ConnectionDeletedData {
  connectionId: string;
  flowId: string;
  sourceBlockId: string;
  targetBlockId: string;
}
```

### Execution Events

#### `execution.started`

Emitted when a block or flow execution begins.

```typescript
interface ExecutionStartedData {
  executionId: string;
  entityType: 'block' | 'flow';
  entityId: string;
  input?: unknown;
  triggeredBy: 'user' | 'schedule' | 'webhook' | 'flow';
}
```

#### `execution.completed`

Emitted when execution finishes successfully.

```typescript
interface ExecutionCompletedData {
  executionId: string;
  entityType: 'block' | 'flow';
  entityId: string;
  output: unknown;
  durationMs: number;
  tokensUsed?: number;
}
```

#### `execution.failed`

Emitted when execution fails.

```typescript
interface ExecutionFailedData {
  executionId: string;
  entityType: 'block' | 'flow';
  entityId: string;
  error: {
    code: string;
    message: string;
    stack?: string;
  };
  durationMs: number;
}
```

### Configuration Events

#### `config.updated`

Emitted when workspace configuration changes.

```typescript
interface ConfigUpdatedData {
  scope: 'workspace' | 'user';
  key: string;
  oldValue: unknown;
  newValue: unknown;
}
```

## Database Schema

Events are stored in PostgreSQL:

```sql
CREATE TABLE builder_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  actor JSONB NOT NULL,
  data JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  sequence_number BIGSERIAL,
  entity_type VARCHAR(50),
  entity_id UUID,

  -- Indexes for common queries
  INDEX idx_events_workspace (workspace_id, timestamp DESC),
  INDEX idx_events_entity (entity_type, entity_id, timestamp DESC),
  INDEX idx_events_type (type, timestamp DESC)
);
```

## Event Store API

### Appending Events

```typescript
import { eventStore } from '@/lib/events/event-store';

const result = await eventStore.append({
  type: 'block.created',
  workspaceId: 'ws_123',
  actor: { type: 'user', id: 'user_456', name: 'Jane' },
  data: {
    blockId: 'block_789',
    blockType: 'agent',
    name: 'My Agent',
  },
  version: 1,
});

// result: { id, timestamp, sequenceNumber }
```

### Querying Events

```typescript
// Get events for a workspace
const events = await eventStore.getByWorkspace('ws_123', {
  since: new Date('2024-01-01'),
  eventTypes: ['block.created', 'block.updated'],
  limit: 100,
});

// Get events for an entity
const blockEvents = await eventStore.getByEntity('block', 'block_789', {
  limit: 50,
});

// Get events after a sequence number (for SSE)
const newEvents = await eventStore.getAfterSequence('ws_123', 12345, 100);
```

## Real-Time Subscription

### SSE Endpoint

```
GET /api/events/{workspaceId}
```

Response is a stream of Server-Sent Events:

```
event: message
data: {"id":"evt_1","type":"block.created","data":{...},"timestamp":"2024-01-15T10:30:00Z"}

event: message
data: {"id":"evt_2","type":"block.updated","data":{...},"timestamp":"2024-01-15T10:30:05Z"}
```

### Client Hook

```typescript
import { useBuilderEvents } from '@/hooks';

const {
  events,        // Recent events buffer
  lastEvent,     // Most recent event
  isConnected,   // Connection status
  error,         // Connection error
  reconnect,     // Manual reconnect
} = useBuilderEvents({
  workspaceId: 'ws_123',
  eventTypes: ['block.created', 'block.updated'],
  onEvent: (event) => {
    // Handle individual events
  },
  onBatch: (events) => {
    // Handle batched events (for efficiency)
  },
});
```

## Event Replay

Events can be replayed to rebuild state:

```typescript
import { eventStore } from '@/lib/events/event-store';

// Get all events for a workspace
const allEvents = await eventStore.getByWorkspace('ws_123', {
  limit: 10000,
});

// Rebuild state by applying events in order
const state = allEvents.reduce((acc, event) => {
  return applyEvent(acc, event);
}, initialState);
```

## Versioning

Events include a `version` field for schema migrations:

```typescript
// Version 1 event
{
  "type": "block.created",
  "version": 1,
  "data": {
    "blockId": "...",
    "blockType": "agent"
  }
}

// Version 2 event (with additional field)
{
  "type": "block.created",
  "version": 2,
  "data": {
    "blockId": "...",
    "blockType": "agent",
    "parentId": "..."  // New field in v2
  }
}
```

When reading events, check the version and apply migrations as needed.

## Best Practices

1. **Immutability** - Never modify events after they're stored
2. **Atomicity** - Each event should represent a single atomic change
3. **Idempotency** - Handle duplicate events gracefully
4. **Ordering** - Use sequence numbers for strict ordering
5. **Batching** - Group related changes when possible to reduce noise
