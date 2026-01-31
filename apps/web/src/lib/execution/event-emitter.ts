/**
 * Execution Event Emitter
 *
 * Emits and stores execution events for streaming and replay.
 * Events are persisted to the database for resilience.
 */

import { db, executionEvents, eq, gte, asc } from '@baleyui/db';
import type { ExecutionEvent } from './types';

export type EventListener = (event: ExecutionEvent) => void;

export class ExecutionEventEmitter {
  private eventIndex = 0;
  private listeners: Set<EventListener> = new Set();
  private isClosed = false;

  constructor(
    private readonly executionId: string,
    private readonly blockExecutionId?: string
  ) {}

  /**
   * Emit an event, storing it in the database and notifying listeners
   */
  async emit(event: ExecutionEvent): Promise<void> {
    if (this.isClosed) {
      console.warn(`Attempted to emit event on closed emitter: ${this.executionId}`);
      return;
    }

    const currentIndex = this.eventIndex++;

    // Store in database for replay
    // Note: executionEvents references blockExecutions, so we use blockExecutionId if available
    if (this.blockExecutionId) {
      try {
        await db.insert(executionEvents).values({
          executionId: this.blockExecutionId,
          index: currentIndex,
          eventType: event.type,
          eventData: event as unknown as Record<string, unknown>,
          createdAt: new Date(),
        });
      } catch (error) {
        console.error('Failed to store execution event:', error);
        // Continue emitting to listeners even if storage fails
      }
    }

    // Notify listeners synchronously
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Replay events from a specific index
   */
  async replay(fromIndex: number): Promise<ExecutionEvent[]> {
    if (!this.blockExecutionId) {
      return [];
    }

    const events = await db.query.executionEvents.findMany({
      where: (table, { and }) =>
        and(
          eq(table.executionId, this.blockExecutionId!),
          gte(table.index, fromIndex)
        ),
      orderBy: (table) => [asc(table.index)],
    });

    return events.map((e) => e.eventData as unknown as ExecutionEvent);
  }

  /**
   * Get the current event index
   */
  get currentIndex(): number {
    return this.eventIndex;
  }

  /**
   * Close the emitter and prevent further events
   */
  close(): void {
    this.isClosed = true;
    this.listeners.clear();
  }

  /**
   * Check if the emitter is closed
   */
  get closed(): boolean {
    return this.isClosed;
  }
}

/**
 * Flow-level event aggregator
 * Aggregates events from multiple node emitters
 */
export class FlowEventAggregator {
  private eventIndex = 0;
  private listeners: Set<EventListener> = new Set();
  private nodeEmitters: Map<string, ExecutionEventEmitter> = new Map();

  constructor(private readonly executionId: string) {}

  /**
   * Create a node-level emitter that forwards events to this aggregator
   */
  createNodeEmitter(nodeId: string, blockExecutionId: string): ExecutionEventEmitter {
    const emitter = new ExecutionEventEmitter(this.executionId, blockExecutionId);

    // Forward events to aggregator
    emitter.subscribe((event) => {
      this.forward(event);
    });

    this.nodeEmitters.set(nodeId, emitter);
    return emitter;
  }

  /**
   * Emit a flow-level event
   */
  emit(event: ExecutionEvent): void {
    this.eventIndex++;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Flow event listener error:', error);
      }
    }
  }

  /**
   * Forward an event from a node emitter
   */
  private forward(event: ExecutionEvent): void {
    this.eventIndex++;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Flow event listener error:', error);
      }
    }
  }

  /**
   * Subscribe to all events (flow-level and node-level)
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get all node emitters
   */
  getNodeEmitters(): Map<string, ExecutionEventEmitter> {
    return this.nodeEmitters;
  }

  /**
   * Close all emitters
   */
  close(): void {
    for (const emitter of this.nodeEmitters.values()) {
      emitter.close();
    }
    this.nodeEmitters.clear();
    this.listeners.clear();
  }
}
