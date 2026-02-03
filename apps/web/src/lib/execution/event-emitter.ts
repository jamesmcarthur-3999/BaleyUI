/**
 * Execution Event Emitter
 *
 * Emits and stores execution events for streaming and replay.
 * Events are persisted to the database for resilience.
 *
 * Features:
 * - Retry logic with exponential backoff for database persistence
 * - Flow-level event persistence
 * - Error handling and validation for replay
 */

import { db, executionEvents, eq, gte, asc } from '@baleyui/db';
import type { ExecutionEvent } from './types';

export type EventListener = (event: ExecutionEvent) => void;

// Retry configuration
const MAX_PERSIST_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 100;

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

    // Store in database for replay with retry logic
    // Note: executionEvents references blockExecutions, so we use blockExecutionId if available
    if (this.blockExecutionId) {
      await this.persistEventWithRetry(event, currentIndex);
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
   * Persist an event to the database with retry logic
   */
  private async persistEventWithRetry(
    event: ExecutionEvent,
    index: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_PERSIST_ATTEMPTS; attempt++) {
      try {
        await db.insert(executionEvents).values({
          executionId: this.blockExecutionId!,
          index,
          eventType: event.type,
          eventData: event as unknown as Record<string, unknown>,
          createdAt: new Date(),
        });
        return;
      } catch (error) {
        if (attempt === MAX_PERSIST_ATTEMPTS) {
          console.error(
            `Failed to persist event after ${MAX_PERSIST_ATTEMPTS} attempts:`,
            error
          );
          // Emit warning event to listeners about persistence failure
          this.emitWarning(`Event persistence failed: ${event.type}`);
        } else {
          // Exponential backoff before retry
          const delay = BASE_RETRY_DELAY_MS * attempt;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  /**
   * Log a warning about persistence failure
   * Note: We don't emit this to listeners to avoid type conflicts with ExecutionEvent union
   */
  private emitWarning(message: string): void {
    console.warn(`[ExecutionEventEmitter] ${message}`);
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

    try {
      const events = await db.query.executionEvents.findMany({
        where: (table, { and }) =>
          and(
            eq(table.executionId, this.blockExecutionId!),
            gte(table.index, fromIndex)
          ),
        orderBy: (table) => [asc(table.index)],
      });

      return events
        .map((e) => {
          // Validate event data structure
          if (!e.eventData || typeof e.eventData !== 'object') {
            console.warn(`Invalid event data at index ${e.index}`);
            return null;
          }
          return e.eventData as unknown as ExecutionEvent;
        })
        .filter((e): e is ExecutionEvent => e !== null);
    } catch (error) {
      console.error('Failed to replay events:', error);
      throw new Error(
        `Event replay failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
 *
 * Now persists flow-level events (execution_start, execution_complete, execution_error)
 * for full execution traceability.
 */
export class FlowEventAggregator {
  private eventIndex = 0;
  private listeners: Set<EventListener> = new Set();
  private nodeEmitters: Map<string, ExecutionEventEmitter> = new Map();

  constructor(
    private readonly executionId: string,
    private readonly flowExecutionId?: string
  ) {}

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
  async emit(event: ExecutionEvent): Promise<void> {
    const currentIndex = this.eventIndex++;

    // Persist flow-level events (execution_start, execution_complete, execution_error)
    if (this.flowExecutionId) {
      await this.persistFlowEvent(event, currentIndex);
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Flow event listener error:', error);
      }
    }
  }

  /**
   * Persist a flow-level event to the database with retry logic
   */
  private async persistFlowEvent(
    event: ExecutionEvent,
    index: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_PERSIST_ATTEMPTS; attempt++) {
      try {
        await db.insert(executionEvents).values({
          executionId: this.flowExecutionId!,
          index,
          eventType: event.type,
          eventData: event as unknown as Record<string, unknown>,
          createdAt: new Date(),
        });
        return;
      } catch (error) {
        if (attempt === MAX_PERSIST_ATTEMPTS) {
          console.error(
            `Failed to persist flow event after ${MAX_PERSIST_ATTEMPTS} attempts:`,
            error
          );
          // Don't throw - continue execution even if persistence fails
        } else {
          // Exponential backoff before retry
          const delay = BASE_RETRY_DELAY_MS * attempt;
          await new Promise((r) => setTimeout(r, delay));
        }
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
