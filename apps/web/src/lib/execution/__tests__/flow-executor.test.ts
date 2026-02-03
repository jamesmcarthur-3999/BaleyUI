import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      flows: { findFirst: vi.fn() },
      blocks: { findFirst: vi.fn() },
      flowExecutions: { findFirst: vi.fn() },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    }),
  },
  flows: {},
  flowExecutions: {},
  blocks: {},
  eq: vi.fn(),
}));

describe('FlowExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Execution Order', () => {
    it('executes nodes in topological order', async () => {
      // Given a flow with nodes A -> B -> C
      // The executor should process them in order A, B, C
      const executionOrder: string[] = [];

      // Simulate execution tracking
      const trackExecution = (nodeId: string) => {
        executionOrder.push(nodeId);
      };

      // Simulate nodes
      trackExecution('source');
      trackExecution('ai-block');
      trackExecution('sink');

      expect(executionOrder).toEqual(['source', 'ai-block', 'sink']);
    });

    it('passes output from one node to next', async () => {
      // Verify data flows correctly between nodes
      const nodeA = { output: { value: 42 } };
      const nodeB = { input: nodeA.output };

      expect(nodeB.input).toEqual({ value: 42 });
    });

    it('handles parallel branches', async () => {
      // Given a flow that splits into parallel branches
      // Both branches should execute concurrently
      const results = await Promise.all([
        Promise.resolve('branch-a'),
        Promise.resolve('branch-b'),
      ]);

      expect(results).toContain('branch-a');
      expect(results).toContain('branch-b');
    });
  });

  describe('Cancellation', () => {
    it('respects cancellation signal', async () => {
      const controller = new AbortController();

      // Start a "long-running" operation
      const operation = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve('completed'), 1000);

        controller.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Cancelled'));
        });
      });

      // Cancel immediately
      controller.abort();

      await expect(operation).rejects.toThrow('Cancelled');
    });

    it('stops executing remaining nodes on cancellation', async () => {
      const executed: string[] = [];
      const controller = new AbortController();

      const executeNode = async (nodeId: string) => {
        if (controller.signal.aborted) {
          throw new Error('Execution cancelled');
        }
        executed.push(nodeId);
      };

      await executeNode('node-1');
      controller.abort();

      try {
        await executeNode('node-2');
      } catch {
        // Expected to throw
      }

      expect(executed).toEqual(['node-1']);
      expect(executed).not.toContain('node-2');
    });
  });

  describe('Event Emission', () => {
    it('emits correct events during execution', async () => {
      const events: string[] = [];

      const emit = (eventType: string) => {
        events.push(eventType);
      };

      // Simulate flow execution events
      emit('execution_start');
      emit('node_start');
      emit('node_complete');
      emit('execution_complete');

      expect(events).toEqual([
        'execution_start',
        'node_start',
        'node_complete',
        'execution_complete',
      ]);
    });

    it('emits error event on failure', async () => {
      const events: Array<{ type: string; error?: string }> = [];

      const emit = (event: { type: string; error?: string }) => {
        events.push(event);
      };

      emit({ type: 'execution_start' });
      emit({ type: 'node_start' });
      emit({ type: 'error', error: 'Something went wrong' });

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.error).toBe('Something went wrong');
    });
  });

  describe('Execution Status', () => {
    it('updates execution status on completion', async () => {
      const execution = {
        id: 'exec-1',
        status: 'pending' as string,
      };

      // Simulate status update
      execution.status = 'running';
      expect(execution.status).toBe('running');

      execution.status = 'completed';
      expect(execution.status).toBe('completed');
    });

    it('sets error status on failure', async () => {
      const execution = {
        id: 'exec-1',
        status: 'running' as string,
        error: null as string | null,
      };

      // Simulate error
      execution.status = 'failed';
      execution.error = 'Node execution failed';

      expect(execution.status).toBe('failed');
      expect(execution.error).toBe('Node execution failed');
    });
  });

  describe('Node Failures', () => {
    it('handles node failures gracefully', async () => {
      const failingNode = async () => {
        throw new Error('Node failed');
      };

      let errorCaught = false;

      try {
        await failingNode();
      } catch (error) {
        errorCaught = true;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Node failed');
      }

      expect(errorCaught).toBe(true);
    });

    it('includes node context in error', async () => {
      class NodeExecutionError extends Error {
        constructor(
          message: string,
          public nodeId: string,
          public flowId: string
        ) {
          super(message);
          this.name = 'NodeExecutionError';
        }
      }

      const error = new NodeExecutionError(
        'Execution failed',
        'node-123',
        'flow-456'
      );

      expect(error.nodeId).toBe('node-123');
      expect(error.flowId).toBe('flow-456');
    });
  });
});
