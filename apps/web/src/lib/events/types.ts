/**
 * Builder Event Types
 * 
 * Defines the event-sourcing schema for all builder actions.
 * Every change to blocks, flows, and connections is captured as an immutable event.
 */

import { z } from 'zod';

// ============================================================================
// ACTOR TYPES
// ============================================================================

export const UserActorSchema = z.object({
  type: z.literal('user'),
  userId: z.string(),
});

export const AIActorSchema = z.object({
  type: z.literal('ai-agent'),
  agentId: z.string(),
  agentName: z.string(),
});

export const SystemActorSchema = z.object({
  type: z.literal('system'),
  reason: z.string(),
});

export const ActorSchema = z.discriminatedUnion('type', [
  UserActorSchema,
  AIActorSchema,
  SystemActorSchema,
]);

export type UserActor = z.infer<typeof UserActorSchema>;
export type AIActor = z.infer<typeof AIActorSchema>;
export type SystemActor = z.infer<typeof SystemActorSchema>;
export type Actor = z.infer<typeof ActorSchema>;

// ============================================================================
// BASE EVENT STRUCTURE
// ============================================================================

export const BaseEventSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  actor: ActorSchema,
  workspaceId: z.string(),
  version: z.number().default(1),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// ============================================================================
// BLOCK EVENTS
// ============================================================================

export const BlockCreatedSchema = BaseEventSchema.extend({
  type: z.literal('BlockCreated'),
  data: z.object({
    blockId: z.string(),
    name: z.string(),
    blockType: z.enum(['ai', 'function', 'router', 'pipeline', 'loop', 'parallel']),
  }),
});

export const BlockUpdatedSchema = BaseEventSchema.extend({
  type: z.literal('BlockUpdated'),
  data: z.object({
    blockId: z.string(),
    changes: z.record(z.string(), z.unknown()),
    previousValues: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const BlockDeletedSchema = BaseEventSchema.extend({
  type: z.literal('BlockDeleted'),
  data: z.object({
    blockId: z.string(),
  }),
});

export type BlockCreated = z.infer<typeof BlockCreatedSchema>;
export type BlockUpdated = z.infer<typeof BlockUpdatedSchema>;
export type BlockDeleted = z.infer<typeof BlockDeletedSchema>;

// ============================================================================
// FLOW EVENTS
// ============================================================================

export const FlowCreatedSchema = BaseEventSchema.extend({
  type: z.literal('FlowCreated'),
  data: z.object({
    flowId: z.string(),
    name: z.string(),
  }),
});

export const FlowUpdatedSchema = BaseEventSchema.extend({
  type: z.literal('FlowUpdated'),
  data: z.object({
    flowId: z.string(),
    changes: z.record(z.string(), z.unknown()),
    previousValues: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const FlowDeletedSchema = BaseEventSchema.extend({
  type: z.literal('FlowDeleted'),
  data: z.object({
    flowId: z.string(),
  }),
});

export const FlowNodeAddedSchema = BaseEventSchema.extend({
  type: z.literal('FlowNodeAdded'),
  data: z.object({
    flowId: z.string(),
    nodeId: z.string(),
    nodeType: z.string(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const FlowNodeUpdatedSchema = BaseEventSchema.extend({
  type: z.literal('FlowNodeUpdated'),
  data: z.object({
    flowId: z.string(),
    nodeId: z.string(),
    changes: z.record(z.string(), z.unknown()),
    previousValues: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const FlowNodeRemovedSchema = BaseEventSchema.extend({
  type: z.literal('FlowNodeRemoved'),
  data: z.object({
    flowId: z.string(),
    nodeId: z.string(),
  }),
});

export const FlowEdgeAddedSchema = BaseEventSchema.extend({
  type: z.literal('FlowEdgeAdded'),
  data: z.object({
    flowId: z.string(),
    edgeId: z.string(),
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
  }),
});

export const FlowEdgeRemovedSchema = BaseEventSchema.extend({
  type: z.literal('FlowEdgeRemoved'),
  data: z.object({
    flowId: z.string(),
    edgeId: z.string(),
  }),
});

export type FlowCreated = z.infer<typeof FlowCreatedSchema>;
export type FlowUpdated = z.infer<typeof FlowUpdatedSchema>;
export type FlowDeleted = z.infer<typeof FlowDeletedSchema>;
export type FlowNodeAdded = z.infer<typeof FlowNodeAddedSchema>;
export type FlowNodeUpdated = z.infer<typeof FlowNodeUpdatedSchema>;
export type FlowNodeRemoved = z.infer<typeof FlowNodeRemovedSchema>;
export type FlowEdgeAdded = z.infer<typeof FlowEdgeAddedSchema>;
export type FlowEdgeRemoved = z.infer<typeof FlowEdgeRemovedSchema>;

// ============================================================================
// CONNECTION EVENTS
// ============================================================================

export const ConnectionCreatedSchema = BaseEventSchema.extend({
  type: z.literal('ConnectionCreated'),
  data: z.object({
    connectionId: z.string(),
    provider: z.enum(['openai', 'anthropic', 'ollama', 'postgres', 'mysql', 'mongodb', 'custom']),
    name: z.string(),
  }),
});

export const ConnectionUpdatedSchema = BaseEventSchema.extend({
  type: z.literal('ConnectionUpdated'),
  data: z.object({
    connectionId: z.string(),
    changes: z.record(z.string(), z.unknown()),
    previousValues: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const ConnectionTestedSchema = BaseEventSchema.extend({
  type: z.literal('ConnectionTested'),
  data: z.object({
    connectionId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
});

export const ConnectionDeletedSchema = BaseEventSchema.extend({
  type: z.literal('ConnectionDeleted'),
  data: z.object({
    connectionId: z.string(),
  }),
});

export type ConnectionCreated = z.infer<typeof ConnectionCreatedSchema>;
export type ConnectionUpdated = z.infer<typeof ConnectionUpdatedSchema>;
export type ConnectionTested = z.infer<typeof ConnectionTestedSchema>;
export type ConnectionDeleted = z.infer<typeof ConnectionDeletedSchema>;

// ============================================================================
// TOOL EVENTS
// ============================================================================

export const ToolCreatedSchema = BaseEventSchema.extend({
  type: z.literal('ToolCreated'),
  data: z.object({
    toolId: z.string(),
    name: z.string(),
    description: z.string(),
  }),
});

export const ToolUpdatedSchema = BaseEventSchema.extend({
  type: z.literal('ToolUpdated'),
  data: z.object({
    toolId: z.string(),
    changes: z.record(z.string(), z.unknown()),
    previousValues: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const ToolDeletedSchema = BaseEventSchema.extend({
  type: z.literal('ToolDeleted'),
  data: z.object({
    toolId: z.string(),
  }),
});

export type ToolCreated = z.infer<typeof ToolCreatedSchema>;
export type ToolUpdated = z.infer<typeof ToolUpdatedSchema>;
export type ToolDeleted = z.infer<typeof ToolDeletedSchema>;

// ============================================================================
// UNION OF ALL BUILDER EVENTS
// ============================================================================

export const BuilderEventSchema = z.discriminatedUnion('type', [
  // Block events
  BlockCreatedSchema,
  BlockUpdatedSchema,
  BlockDeletedSchema,
  // Flow events
  FlowCreatedSchema,
  FlowUpdatedSchema,
  FlowDeletedSchema,
  FlowNodeAddedSchema,
  FlowNodeUpdatedSchema,
  FlowNodeRemovedSchema,
  FlowEdgeAddedSchema,
  FlowEdgeRemovedSchema,
  // Connection events
  ConnectionCreatedSchema,
  ConnectionUpdatedSchema,
  ConnectionTestedSchema,
  ConnectionDeletedSchema,
  // Tool events
  ToolCreatedSchema,
  ToolUpdatedSchema,
  ToolDeletedSchema,
]);

export type BuilderEvent = z.infer<typeof BuilderEventSchema>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isBuilderEvent(event: unknown): event is BuilderEvent {
  return BuilderEventSchema.safeParse(event).success;
}

export function isBlockEvent(event: BuilderEvent): event is BlockCreated | BlockUpdated | BlockDeleted {
  return event.type.startsWith('Block');
}

export function isFlowEvent(event: BuilderEvent): boolean {
  return event.type.startsWith('Flow');
}

export function isConnectionEvent(event: BuilderEvent): boolean {
  return event.type.startsWith('Connection');
}

export function isToolEvent(event: BuilderEvent): boolean {
  return event.type.startsWith('Tool');
}

// ============================================================================
// EVENT METADATA HELPERS
// ============================================================================

/**
 * Extract entity type and ID from an event for indexing purposes.
 */
export function getEventEntityInfo(event: BuilderEvent): {
  entityType: 'block' | 'flow' | 'connection' | 'tool';
  entityId: string;
} {
  const data = event.data as Record<string, unknown>;
  
  if ('blockId' in data) {
    return { entityType: 'block', entityId: data.blockId as string };
  }
  if ('flowId' in data) {
    return { entityType: 'flow', entityId: data.flowId as string };
  }
  if ('connectionId' in data) {
    return { entityType: 'connection', entityId: data.connectionId as string };
  }
  if ('toolId' in data) {
    return { entityType: 'tool', entityId: data.toolId as string };
  }
  
  throw new Error(`Unable to determine entity from event type: ${event.type}`);
}

/**
 * Get all event types as a union type for routing/filtering.
 */
export type BuilderEventType = BuilderEvent['type'];

export const BUILDER_EVENT_TYPES: BuilderEventType[] = [
  'BlockCreated',
  'BlockUpdated',
  'BlockDeleted',
  'FlowCreated',
  'FlowUpdated',
  'FlowDeleted',
  'FlowNodeAdded',
  'FlowNodeUpdated',
  'FlowNodeRemoved',
  'FlowEdgeAdded',
  'FlowEdgeRemoved',
  'ConnectionCreated',
  'ConnectionUpdated',
  'ConnectionTested',
  'ConnectionDeleted',
  'ToolCreated',
  'ToolUpdated',
  'ToolDeleted',
] as const;
