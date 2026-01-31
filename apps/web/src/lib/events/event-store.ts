/**
 * Event Store Service
 * 
 * Provides persistence for builder events using the builder_events table.
 * Implements append-only event log with efficient querying by entity and sequence.
 */

import { db, builderEvents, eq, and, gt, desc, asc } from '@baleyui/db';
import type { BuilderEvent, Actor } from './types';
import { getEventEntityInfo } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Stored event with database-assigned fields
 */
export interface StoredEvent {
  id: string;
  type: string;
  workspaceId: string;
  actor: Actor;
  data: Record<string, unknown>;
  timestamp: Date;
  version: number;
  entityType: string | null;
  entityId: string | null;
  sequenceNumber: number;
}

/**
 * Result from appending an event
 */
export interface AppendResult {
  id: string;
  sequenceNumber: number;
  timestamp: Date;
}

/**
 * Options for querying events
 */
export interface QueryOptions {
  limit?: number;
  afterSequence?: number;
}

// ============================================================================
// EVENT STORE CLASS
// ============================================================================

export class EventStore {
  constructor(private database = db) {}

  /**
   * Append a single event to the store.
   * Returns the stored event with its assigned sequence number.
   */
  async append(
    event: Omit<BuilderEvent, 'id' | 'timestamp'>
  ): Promise<AppendResult> {
    const timestamp = new Date();

    // Extract entity info for indexing
    let entityType: string | null = null;
    let entityId: string | null = null;

    try {
      const entityInfo = getEventEntityInfo(event as BuilderEvent);
      entityType = entityInfo.entityType;
      entityId = entityInfo.entityId;
    } catch {
      // Some events might not have entity info - that's ok
    }

    const result = await this.database
      .insert(builderEvents)
      .values({
        type: event.type,
        workspaceId: event.workspaceId,
        actor: event.actor,
        data: event.data,
        timestamp,
        version: event.version ?? 1,
        entityType,
        entityId,
      })
      .returning({
        id: builderEvents.id,
        sequenceNumber: builderEvents.sequenceNumber,
      });

    const inserted = result[0];
    if (!inserted) {
      throw new Error('Failed to insert event - no result returned');
    }

    return {
      id: inserted.id,
      sequenceNumber: inserted.sequenceNumber,
      timestamp,
    };
  }

  /**
   * Append multiple events in a single transaction.
   * Events are assigned sequential sequence numbers.
   */
  async appendBatch(
    events: Array<Omit<BuilderEvent, 'id' | 'timestamp'>>
  ): Promise<AppendResult[]> {
    const timestamp = new Date();

    const toInsert = events.map((event) => {
      let entityType: string | null = null;
      let entityId: string | null = null;

      try {
        const entityInfo = getEventEntityInfo(event as BuilderEvent);
        entityType = entityInfo.entityType;
        entityId = entityInfo.entityId;
      } catch {
        // Ignore
      }

      return {
        type: event.type,
        workspaceId: event.workspaceId,
        actor: event.actor,
        data: event.data,
        timestamp,
        version: event.version ?? 1,
        entityType,
        entityId,
      };
    });

    const inserted = await this.database
      .insert(builderEvents)
      .values(toInsert)
      .returning({
        id: builderEvents.id,
        sequenceNumber: builderEvents.sequenceNumber,
      });

    return inserted.map((row) => ({
      id: row.id,
      sequenceNumber: row.sequenceNumber,
      timestamp,
    }));
  }

  /**
   * Get events for a specific entity (block, flow, connection, tool).
   */
  async getByEntity(
    entityType: string,
    entityId: string,
    options?: QueryOptions
  ): Promise<StoredEvent[]> {
    const conditions = [
      eq(builderEvents.entityType, entityType),
      eq(builderEvents.entityId, entityId),
    ];

    if (options?.afterSequence !== undefined) {
      conditions.push(gt(builderEvents.sequenceNumber, options.afterSequence));
    }

    const rows = await this.database
      .select()
      .from(builderEvents)
      .where(and(...conditions))
      .orderBy(asc(builderEvents.sequenceNumber))
      .limit(options?.limit ?? 1000);

    return rows.map(this.rowToStoredEvent);
  }

  /**
   * Get all events in a workspace after a given sequence number.
   * Used for real-time sync - clients track their last seen sequence.
   */
  async getAfterSequence(
    workspaceId: string,
    afterSequence: number,
    limit = 100
  ): Promise<StoredEvent[]> {
    const rows = await this.database
      .select()
      .from(builderEvents)
      .where(
        and(
          eq(builderEvents.workspaceId, workspaceId),
          gt(builderEvents.sequenceNumber, afterSequence)
        )
      )
      .orderBy(asc(builderEvents.sequenceNumber))
      .limit(limit);

    return rows.map(this.rowToStoredEvent);
  }

  /**
   * Get events in a workspace by type.
   */
  async getByType(
    workspaceId: string,
    eventType: string,
    options?: QueryOptions
  ): Promise<StoredEvent[]> {
    const conditions = [
      eq(builderEvents.workspaceId, workspaceId),
      eq(builderEvents.type, eventType),
    ];

    if (options?.afterSequence !== undefined) {
      conditions.push(gt(builderEvents.sequenceNumber, options.afterSequence));
    }

    const rows = await this.database
      .select()
      .from(builderEvents)
      .where(and(...conditions))
      .orderBy(asc(builderEvents.sequenceNumber))
      .limit(options?.limit ?? 1000);

    return rows.map(this.rowToStoredEvent);
  }

  /**
   * Get the latest sequence number for a workspace.
   * Used to initialize sync clients.
   */
  async getLatestSequence(workspaceId: string): Promise<number> {
    const [row] = await this.database
      .select({ seq: builderEvents.sequenceNumber })
      .from(builderEvents)
      .where(eq(builderEvents.workspaceId, workspaceId))
      .orderBy(desc(builderEvents.sequenceNumber))
      .limit(1);

    return row?.seq ?? 0;
  }

  /**
   * Get total event count for a workspace (for metrics).
   */
  async getEventCount(workspaceId: string): Promise<number> {
    const result = await this.database
      .select({ count: builderEvents.id })
      .from(builderEvents)
      .where(eq(builderEvents.workspaceId, workspaceId));

    return result.length;
  }

  /**
   * Convert a database row to a StoredEvent.
   */
  private rowToStoredEvent(row: typeof builderEvents.$inferSelect): StoredEvent {
    return {
      id: row.id,
      type: row.type,
      workspaceId: row.workspaceId,
      actor: row.actor as Actor,
      data: row.data as Record<string, unknown>,
      timestamp: row.timestamp,
      version: row.version,
      entityType: row.entityType,
      entityId: row.entityId,
      sequenceNumber: row.sequenceNumber,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const eventStore = new EventStore();
