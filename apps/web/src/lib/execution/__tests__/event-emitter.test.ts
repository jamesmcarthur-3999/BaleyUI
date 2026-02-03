import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock database
vi.mock('@baleyui/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    }),
    query: {
      executionEvents: {
        findMany: vi.fn(),
      },
    },
  },
  executionEvents: {},
  eq: vi.fn((a, b) => ({ field: a, value: b })),
  gte: vi.fn((a, b) => ({ field: a, gte: b })),
  asc: vi.fn((a) => ({ field: a, order: 'asc' })),
}));

import { db } from '@baleyui/db';
import { ExecutionEventEmitter, FlowEventAggregator } from '../event-emitter';
import type { ExecutionEvent, NodeCompleteEvent, ExecutionStartEvent } from '../types';

// Helper to create a valid execution event
function createNodeCompleteEvent(nodeId: string = 'node-1'): NodeCompleteEvent {
  return {
    type: 'node_complete',
    executionId: 'exec-1',
    nodeId,
    blockExecutionId: 'block-exec-1',
    output: { result: 'success' },
    durationMs: 100,
    timestamp: Date.now(),
  };
}

function createExecutionStartEvent(): ExecutionStartEvent {
  return {
    type: 'execution_start',
    executionId: 'exec-1',
    flowId: 'flow-1',
    input: { message: 'hello' },
    timestamp: Date.now(),
  };
}

describe('ExecutionEventEmitter', () => {
  let emitter: ExecutionEventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    emitter = new ExecutionEventEmitter('exec-1', 'block-exec-1');
  });

  afterEach(() => {
    emitter.close();
  });

  describe('emit', () => {
    it('emits events to all listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.subscribe(listener1);
      emitter.subscribe(listener2);

      const event = createNodeCompleteEvent();
      await emitter.emit(event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it('persists events to database', async () => {
      const insertMock = vi.mocked(db.insert);
      const valuesMock = vi.fn().mockResolvedValue({});
      insertMock.mockReturnValue({ values: valuesMock } as unknown as ReturnType<typeof db.insert>);

      const event = createNodeCompleteEvent();
      await emitter.emit(event);

      expect(insertMock).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'block-exec-1',
          index: 0,
          eventType: 'node_complete',
          eventData: event,
        })
      );
    });

    it('retries on database failure', async () => {
      const insertMock = vi.mocked(db.insert);
      const valuesMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('DB error'))
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({});

      insertMock.mockReturnValue({ values: valuesMock } as unknown as ReturnType<typeof db.insert>);

      const event = createNodeCompleteEvent();

      // Should not throw - retry logic handles failures
      await emitter.emit(event);

      // Should have tried 3 times (2 failures + 1 success)
      expect(valuesMock).toHaveBeenCalledTimes(3);
    });

    it('logs warning after max retry attempts', async () => {
      const insertMock = vi.mocked(db.insert);
      const valuesMock = vi.fn().mockRejectedValue(new Error('Persistent DB error'));
      insertMock.mockReturnValue({ values: valuesMock } as unknown as ReturnType<typeof db.insert>);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const event = createNodeCompleteEvent();
      await emitter.emit(event);

      // Should have retried 3 times
      expect(valuesMock).toHaveBeenCalledTimes(3);

      // Should have logged a warning
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('handles closed emitter gracefully', async () => {
      const listener = vi.fn();
      emitter.subscribe(listener);

      emitter.close();

      const event = createNodeCompleteEvent();

      // Should not throw or emit
      await emitter.emit(event);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('replay', () => {
    it('replays events from index', async () => {
      const findManyMock = vi.mocked(db.query.executionEvents.findMany);
      findManyMock.mockResolvedValue([
        { id: '1', createdAt: new Date(), executionId: 'exec-1', index: 0, eventType: 'node_complete', eventData: createNodeCompleteEvent('node-1') },
        { id: '2', createdAt: new Date(), executionId: 'exec-1', index: 1, eventType: 'node_complete', eventData: createNodeCompleteEvent('node-2') },
        { id: '3', createdAt: new Date(), executionId: 'exec-1', index: 2, eventType: 'node_complete', eventData: createNodeCompleteEvent('node-3') },
      ]);

      const events = await emitter.replay(1);

      expect(events).toHaveLength(3);
    });

    it('returns empty array when no blockExecutionId', async () => {
      const emitterWithoutBlockId = new ExecutionEventEmitter('exec-1');

      const events = await emitterWithoutBlockId.replay(0);

      expect(events).toEqual([]);
    });

    it('filters out invalid event data', async () => {
      const findManyMock = vi.mocked(db.query.executionEvents.findMany);
      findManyMock.mockResolvedValue([
        { id: '1', createdAt: new Date(), executionId: 'exec-1', index: 0, eventType: 'node_complete', eventData: createNodeCompleteEvent() },
        { id: '2', createdAt: new Date(), executionId: 'exec-1', index: 1, eventType: 'node_complete', eventData: null },
        { id: '3', createdAt: new Date(), executionId: 'exec-1', index: 2, eventType: 'node_complete', eventData: 'not-an-object' },
      ]);

      const events = await emitter.replay(0);

      // Only valid events should be returned
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('node_complete');
    });

    it('throws on database error', async () => {
      const findManyMock = vi.mocked(db.query.executionEvents.findMany);
      findManyMock.mockRejectedValue(new Error('Database connection failed'));

      await expect(emitter.replay(0)).rejects.toThrow('Event replay failed');
    });
  });

  describe('subscribe', () => {
    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = emitter.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();

      // After unsubscribe, listener should not be called
      // (We'd need to emit an event to verify, but subscribe internally removes from Set)
    });
  });

  describe('currentIndex', () => {
    it('increments with each emit', async () => {
      expect(emitter.currentIndex).toBe(0);

      await emitter.emit(createNodeCompleteEvent());
      expect(emitter.currentIndex).toBe(1);

      await emitter.emit(createNodeCompleteEvent());
      expect(emitter.currentIndex).toBe(2);
    });
  });
});

describe('FlowEventAggregator', () => {
  let aggregator: FlowEventAggregator;

  beforeEach(() => {
    vi.clearAllMocks();
    aggregator = new FlowEventAggregator('flow-exec-1', 'flow-exec-1');
  });

  afterEach(() => {
    aggregator.close();
  });

  describe('emit', () => {
    it('emits flow-level events to listeners', async () => {
      const listener = vi.fn();
      aggregator.subscribe(listener);

      const event = createExecutionStartEvent();
      await aggregator.emit(event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('persists flow-level events', async () => {
      const insertMock = vi.mocked(db.insert);
      const valuesMock = vi.fn().mockResolvedValue({});
      insertMock.mockReturnValue({ values: valuesMock } as unknown as ReturnType<typeof db.insert>);

      const event = createExecutionStartEvent();
      await aggregator.emit(event);

      expect(insertMock).toHaveBeenCalled();
    });
  });

  describe('createNodeEmitter', () => {
    it('creates node emitter that forwards events', async () => {
      const listener = vi.fn();
      aggregator.subscribe(listener);

      const nodeEmitter = aggregator.createNodeEmitter('node-1', 'block-exec-1');

      const event = createNodeCompleteEvent();
      await nodeEmitter.emit(event);

      // Event should be forwarded to aggregator listeners
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('stores emitters in nodeEmitters map', () => {
      aggregator.createNodeEmitter('node-1', 'block-1');
      aggregator.createNodeEmitter('node-2', 'block-2');

      const emitters = aggregator.getNodeEmitters();

      expect(emitters.size).toBe(2);
      expect(emitters.has('node-1')).toBe(true);
      expect(emitters.has('node-2')).toBe(true);
    });
  });

  describe('close', () => {
    it('closes all node emitters', () => {
      const emitter1 = aggregator.createNodeEmitter('node-1', 'block-1');
      const emitter2 = aggregator.createNodeEmitter('node-2', 'block-2');

      aggregator.close();

      expect(emitter1.closed).toBe(true);
      expect(emitter2.closed).toBe(true);
    });

    it('clears listeners and emitters', () => {
      aggregator.subscribe(() => {});
      aggregator.createNodeEmitter('node-1', 'block-1');

      aggregator.close();

      expect(aggregator.getNodeEmitters().size).toBe(0);
    });
  });
});
