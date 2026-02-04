/**
 * Event Emitter Tests
 *
 * Tests for the ExecutionEventEmitter and FlowEventAggregator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      executionEvents: {
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
  },
  executionEvents: {
    executionId: 'executionId',
    index: 'index',
    eventType: 'eventType',
    eventData: 'eventData',
    createdAt: 'createdAt',
  },
  eq: vi.fn((field, value) => ({ field, value })),
  gte: vi.fn((field, value) => ({ field, value })),
  asc: vi.fn((field) => ({ field, direction: 'asc' })),
}));

import { ExecutionEventEmitter, FlowEventAggregator } from '../event-emitter';
import type { ExecutionEvent } from '../types';

/**
 * Create a mock ExecutionEvent for testing.
 * Uses minimal properties since we're testing the emitter, not the event structure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockEvent(type: string, props: Record<string, unknown> = {}): any {
  return { type, ...props };
}

describe('ExecutionEventEmitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('emit', () => {
    it('should emit events to all listeners', async () => {
      const emitter = new ExecutionEventEmitter('exec-1', 'block-exec-1');
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.subscribe(listener1);
      emitter.subscribe(listener2);

      const event = mockEvent('node_start', { nodeId: 'node-1' }) as ExecutionEvent;
      await emitter.emit(event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it('should persist events to database with blockExecutionId', async () => {
      const { db } = await import('@baleyui/db');
      const emitter = new ExecutionEventEmitter('exec-1', 'block-exec-1');

      const event = mockEvent('node_start', { nodeId: 'node-1' }) as ExecutionEvent;
      await emitter.emit(event);

      expect(db.insert).toHaveBeenCalled();
    });

    it('should not persist events without blockExecutionId', async () => {
      const { db } = await import('@baleyui/db');
      const emitter = new ExecutionEventEmitter('exec-1'); // No blockExecutionId

      const event = mockEvent('node_start', { nodeId: 'node-1' }) as ExecutionEvent;
      await emitter.emit(event);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', async () => {
      const emitter = new ExecutionEventEmitter('exec-1');
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      emitter.subscribe(errorListener);
      emitter.subscribe(goodListener);

      const event = mockEvent('node_start', { nodeId: 'node-1' }) as ExecutionEvent;
      await emitter.emit(event);

      // Should still call the good listener
      expect(goodListener).toHaveBeenCalledWith(event);
    });

    it('should not emit events after close', async () => {
      const emitter = new ExecutionEventEmitter('exec-1');
      const listener = vi.fn();
      emitter.subscribe(listener);

      emitter.close();

      const event = mockEvent('node_start', { nodeId: 'node-1' }) as ExecutionEvent;
      await emitter.emit(event);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('retry logic', () => {
    it('should retry on database failure', async () => {
      const { db } = await import('@baleyui/db');
      let attempts = 0;

      vi.mocked(db.insert).mockImplementation(
        () =>
          ({
            values: vi.fn().mockImplementation(() => {
              attempts++;
              if (attempts < 3) {
                throw new Error('DB connection failed');
              }
              return Promise.resolve(undefined);
            }),
          }) as unknown as ReturnType<typeof db.insert>
      );

      const emitter = new ExecutionEventEmitter('exec-1', 'block-exec-1');
      const event = mockEvent('node_start', { nodeId: 'node-1' }) as ExecutionEvent;

      await emitter.emit(event);

      expect(attempts).toBe(3); // Should have retried
    });
  });

  describe('replay', () => {
    it('should replay events from index', async () => {
      const { db } = await import('@baleyui/db');
      const mockEvents = [
        { index: 5, eventData: { type: 'node_start', nodeId: 'node-1' } },
        { index: 6, eventData: { type: 'node_complete', nodeId: 'node-1' } },
      ];

      vi.mocked(db.query.executionEvents.findMany).mockResolvedValue(
        mockEvents as any
      );

      const emitter = new ExecutionEventEmitter('exec-1', 'block-exec-1');
      const events = await emitter.replay(5);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: 'node_start', nodeId: 'node-1' });
    });

    it('should return empty array without blockExecutionId', async () => {
      const emitter = new ExecutionEventEmitter('exec-1'); // No blockExecutionId
      const events = await emitter.replay(0);

      expect(events).toEqual([]);
    });

    it('should filter invalid event data', async () => {
      const { db } = await import('@baleyui/db');
      const mockEvents = [
        { index: 0, eventData: { type: 'node_start', nodeId: 'node-1' } },
        { index: 1, eventData: null }, // Invalid
        { index: 2, eventData: 'not an object' }, // Invalid
        { index: 3, eventData: { type: 'node_complete', nodeId: 'node-1' } },
      ];

      vi.mocked(db.query.executionEvents.findMany).mockResolvedValue(
        mockEvents as any
      );

      const emitter = new ExecutionEventEmitter('exec-1', 'block-exec-1');
      const events = await emitter.replay(0);

      expect(events).toHaveLength(2);
    });

    it('should throw on database error', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.executionEvents.findMany).mockRejectedValue(
        new Error('DB error')
      );

      const emitter = new ExecutionEventEmitter('exec-1', 'block-exec-1');

      await expect(emitter.replay(0)).rejects.toThrow(/Event replay failed/);
    });
  });

  describe('subscribe', () => {
    it('should return unsubscribe function', async () => {
      const emitter = new ExecutionEventEmitter('exec-1');
      const listener = vi.fn();

      const unsubscribe = emitter.subscribe(listener);

      const event = mockEvent('node_start', { nodeId: 'node-1' }) as ExecutionEvent;
      await emitter.emit(event);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      await emitter.emit(event);
      expect(listener).toHaveBeenCalledTimes(1); // No additional call
    });
  });

  describe('close', () => {
    it('should set closed state', () => {
      const emitter = new ExecutionEventEmitter('exec-1');
      expect(emitter.closed).toBe(false);

      emitter.close();

      expect(emitter.closed).toBe(true);
    });

    it('should clear listeners', async () => {
      const emitter = new ExecutionEventEmitter('exec-1');
      const listener = vi.fn();
      emitter.subscribe(listener);

      emitter.close();

      // Even if we try to emit (which will be ignored), listener is cleared
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe('FlowEventAggregator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNodeEmitter', () => {
    it('should create node emitter that forwards events', async () => {
      const aggregator = new FlowEventAggregator('exec-1');
      const aggregatorListener = vi.fn();
      aggregator.subscribe(aggregatorListener);

      const nodeEmitter = aggregator.createNodeEmitter('node-1', 'block-exec-1');
      const event = mockEvent('node_start', { nodeId: 'node-1' }) as ExecutionEvent;
      await nodeEmitter.emit(event);

      expect(aggregatorListener).toHaveBeenCalledWith(event);
    });

    it('should track node emitters', () => {
      const aggregator = new FlowEventAggregator('exec-1');

      aggregator.createNodeEmitter('node-1', 'block-exec-1');
      aggregator.createNodeEmitter('node-2', 'block-exec-2');

      const emitters = aggregator.getNodeEmitters();
      expect(emitters.size).toBe(2);
      expect(emitters.has('node-1')).toBe(true);
      expect(emitters.has('node-2')).toBe(true);
    });
  });

  describe('emit', () => {
    it('should emit flow-level events to listeners', async () => {
      const aggregator = new FlowEventAggregator('exec-1', 'flow-exec-1');
      const listener = vi.fn();
      aggregator.subscribe(listener);

      const event = mockEvent('execution_start', { executionId: 'exec-1' }) as ExecutionEvent;
      await aggregator.emit(event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should persist flow-level events with flowExecutionId', async () => {
      const { db } = await import('@baleyui/db');
      const aggregator = new FlowEventAggregator('exec-1', 'flow-exec-1');

      const event = mockEvent('execution_start', { executionId: 'exec-1' }) as ExecutionEvent;
      await aggregator.emit(event);

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close all node emitters', async () => {
      const aggregator = new FlowEventAggregator('exec-1');

      const emitter1 = aggregator.createNodeEmitter('node-1', 'block-exec-1');
      const emitter2 = aggregator.createNodeEmitter('node-2', 'block-exec-2');

      aggregator.close();

      expect(emitter1.closed).toBe(true);
      expect(emitter2.closed).toBe(true);
      expect(aggregator.getNodeEmitters().size).toBe(0);
    });
  });
});
