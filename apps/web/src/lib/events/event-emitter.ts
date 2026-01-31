/**
 * Builder Event Emitter
 * 
 * Provides in-memory pub/sub for real-time event broadcasting.
 * Events are stored in the database first, then broadcast to subscribers.
 */

import { EventEmitter } from 'events';
import type { StoredEvent } from './event-store';

// ============================================================================
// EVENT EMITTER CLASS
// ============================================================================

class BuilderEventEmitter extends EventEmitter {
  private static instance: BuilderEventEmitter;

  private constructor() {
    super();
    // Increase max listeners for large workspaces
    this.setMaxListeners(100);
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): BuilderEventEmitter {
    if (!BuilderEventEmitter.instance) {
      BuilderEventEmitter.instance = new BuilderEventEmitter();
    }
    return BuilderEventEmitter.instance;
  }

  /**
   * Emit an event to all subscribers of a workspace and entity.
   */
  emitEvent(workspaceId: string, event: StoredEvent): void {
    // Emit to workspace channel (for all events in workspace)
    this.emit(`workspace:${workspaceId}`, event);

    // Emit to entity channel (for specific entity updates)
    if (event.entityType && event.entityId) {
      this.emit(`entity:${event.entityType}:${event.entityId}`, event);
    }

    // Emit to type channel (for specific event types)
    this.emit(`type:${event.type}`, event);
  }

  /**
   * Subscribe to all events in a workspace.
   * Returns unsubscribe function.
   */
  subscribeToWorkspace(
    workspaceId: string,
    callback: (event: StoredEvent) => void
  ): () => void {
    const channel = `workspace:${workspaceId}`;
    this.on(channel, callback);
    return () => this.off(channel, callback);
  }

  /**
   * Subscribe to events for a specific entity.
   * Returns unsubscribe function.
   */
  subscribeToEntity(
    entityType: string,
    entityId: string,
    callback: (event: StoredEvent) => void
  ): () => void {
    const channel = `entity:${entityType}:${entityId}`;
    this.on(channel, callback);
    return () => this.off(channel, callback);
  }

  /**
   * Subscribe to a specific event type across all workspaces.
   * Returns unsubscribe function.
   */
  subscribeToType(
    eventType: string,
    callback: (event: StoredEvent) => void
  ): () => void {
    const channel = `type:${eventType}`;
    this.on(channel, callback);
    return () => this.off(channel, callback);
  }

  /**
   * Get the number of subscribers for a workspace.
   */
  getWorkspaceSubscriberCount(workspaceId: string): number {
    return this.listenerCount(`workspace:${workspaceId}`);
  }

  /**
   * Check if a workspace has any subscribers.
   */
  hasWorkspaceSubscribers(workspaceId: string): boolean {
    return this.getWorkspaceSubscriberCount(workspaceId) > 0;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const builderEventEmitter = BuilderEventEmitter.getInstance();
