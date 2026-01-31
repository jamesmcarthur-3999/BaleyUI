/**
 * Event Emission Helpers
 * 
 * Provides helper functions for emitting builder events from tRPC procedures.
 * Handles storing events and broadcasting to subscribers.
 */

import { eventStore, type AppendResult, type StoredEvent } from './event-store';
import { builderEventEmitter } from './event-emitter';
import type { BuilderEvent, Actor, BuilderEventType } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context required for emitting events.
 */
export interface EventContext {
  workspaceId: string;
  actor: Actor;
}

/**
 * Result of emitting an event.
 */
export interface EmitResult extends AppendResult {
  broadcasted: boolean;
}

// ============================================================================
// EVENT EMISSION
// ============================================================================

/**
 * Emit a builder event: store it and broadcast to subscribers.
 */
export async function emitBuilderEvent<T extends BuilderEventType>(
  ctx: EventContext,
  eventType: T,
  data: Extract<BuilderEvent, { type: T }>['data']
): Promise<EmitResult> {
  // Store the event
  const result = await eventStore.append({
    type: eventType,
    workspaceId: ctx.workspaceId,
    actor: ctx.actor,
    data,
    version: 1,
  } as Omit<BuilderEvent, 'id' | 'timestamp'>);

  // Create stored event for broadcasting
  const storedEvent: StoredEvent = {
    id: result.id,
    type: eventType,
    workspaceId: ctx.workspaceId,
    actor: ctx.actor,
    data: data as Record<string, unknown>,
    timestamp: result.timestamp,
    version: 1,
    entityType: extractEntityType(data as Record<string, unknown>),
    entityId: extractEntityId(data as Record<string, unknown>),
    sequenceNumber: result.sequenceNumber,
  };

  // Broadcast to subscribers
  const broadcasted = builderEventEmitter.hasWorkspaceSubscribers(ctx.workspaceId);
  if (broadcasted) {
    builderEventEmitter.emitEvent(ctx.workspaceId, storedEvent);
  }

  return {
    ...result,
    broadcasted,
  };
}

/**
 * Emit multiple events in a batch.
 */
export async function emitBuilderEventBatch(
  ctx: EventContext,
  events: Array<{ type: BuilderEventType; data: Record<string, unknown> }>
): Promise<EmitResult[]> {
  // Store all events
  const results = await eventStore.appendBatch(
    events.map((e) => ({
      type: e.type,
      workspaceId: ctx.workspaceId,
      actor: ctx.actor,
      data: e.data,
      version: 1,
    })) as Array<Omit<BuilderEvent, 'id' | 'timestamp'>>
  );

  // Broadcast to subscribers
  const hasSubscribers = builderEventEmitter.hasWorkspaceSubscribers(ctx.workspaceId);

  return results.map((result, i) => {
    const eventDef = events[i];
    if (!eventDef) {
      return { ...result, broadcasted: false };
    }

    if (hasSubscribers) {
      const storedEvent: StoredEvent = {
        id: result.id,
        type: eventDef.type,
        workspaceId: ctx.workspaceId,
        actor: ctx.actor,
        data: eventDef.data,
        timestamp: result.timestamp,
        version: 1,
        entityType: extractEntityType(eventDef.data),
        entityId: extractEntityId(eventDef.data),
        sequenceNumber: result.sequenceNumber,
      };
      builderEventEmitter.emitEvent(ctx.workspaceId, storedEvent);
    }

    return {
      ...result,
      broadcasted: hasSubscribers,
    };
  });
}

// ============================================================================
// ACTOR HELPERS
// ============================================================================

/**
 * Create a user actor from tRPC context.
 */
export function userActor(userId: string): Actor {
  return {
    type: 'user',
    userId,
  };
}

/**
 * Create an AI agent actor.
 */
export function aiActor(agentId: string, agentName: string): Actor {
  return {
    type: 'ai-agent',
    agentId,
    agentName,
  };
}

/**
 * Create a system actor.
 */
export function systemActor(reason: string): Actor {
  return {
    type: 'system',
    reason,
  };
}

/**
 * Create actor from tRPC context.
 */
export function actorFromContext(ctx: { userId: string }): Actor {
  return userActor(ctx.userId);
}

// ============================================================================
// ENTITY EXTRACTION HELPERS
// ============================================================================

function extractEntityType(data: Record<string, unknown>): string | null {
  if ('blockId' in data) return 'block';
  if ('flowId' in data) return 'flow';
  if ('connectionId' in data) return 'connection';
  if ('toolId' in data) return 'tool';
  return null;
}

function extractEntityId(data: Record<string, unknown>): string | null {
  if ('blockId' in data) return data.blockId as string;
  if ('flowId' in data) return data.flowId as string;
  if ('connectionId' in data) return data.connectionId as string;
  if ('toolId' in data) return data.toolId as string;
  return null;
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export { builderEventEmitter } from './event-emitter';
export { eventStore } from './event-store';
export type { StoredEvent } from './event-store';
