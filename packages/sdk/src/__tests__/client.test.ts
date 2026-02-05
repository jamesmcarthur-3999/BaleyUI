import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaleyUI } from '../client';
import {
  AuthenticationError,
  BaleyUIError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
  TimeoutError,
  ConnectionError,
} from '../errors';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BaleyUI Client', () => {
  let client: BaleyUI;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BaleyUI({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.test.com',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes with required options', () => {
      const c = new BaleyUI({ apiKey: 'test-key' });
      expect(c).toBeDefined();
      expect(c.flows).toBeDefined();
      expect(c.blocks).toBeDefined();
      expect(c.executions).toBeDefined();
    });

    it('throws AuthenticationError when API key is missing', () => {
      expect(() => new BaleyUI({ apiKey: '' })).toThrow(AuthenticationError);
      expect(() => new BaleyUI({ apiKey: '' })).toThrow('API key is required');
    });

    it('uses default base URL when not provided', () => {
      const c = new BaleyUI({ apiKey: 'test-key' });
      expect(c).toBeDefined();
    });

    it('removes trailing slash from base URL', () => {
      const c = new BaleyUI({
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com/',
      });
      expect(c).toBeDefined();
    });

    it('uses custom timeout and maxRetries', () => {
      const c = new BaleyUI({
        apiKey: 'test-key',
        timeout: 5000,
        maxRetries: 5,
      });
      expect(c.maxRetries).toBe(5);
    });
  });

  describe('request', () => {
    it('makes authenticated requests with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await client.request('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
            'User-Agent': '@baleyui/sdk',
          }),
        })
      );
    });

    it('returns parsed JSON response', async () => {
      const mockData = { flows: [], count: 0 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await client.request('/flows');
      expect(result).toEqual(mockData);
    });

    it('throws TimeoutError on request timeout', async () => {
      vi.useFakeTimers();

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const promise = client.request('/test');

      await expect(promise).rejects.toThrow(TimeoutError);

      vi.useRealTimers();
    });

    it('throws ConnectionError on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.request('/test')).rejects.toThrow(ConnectionError);
    });

    it('throws BaleyUIError for unknown errors', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      await expect(client.request('/test')).rejects.toThrow(BaleyUIError);
    });

    it('re-throws BaleyUIError instances', async () => {
      const error = new BaleyUIError('Test error');
      mockFetch.mockRejectedValueOnce(error);

      await expect(client.request('/test')).rejects.toThrow(error);
    });
  });

  describe('error handling', () => {
    it('throws AuthenticationError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' }),
      });

      await expect(client.request('/test')).rejects.toThrow(AuthenticationError);
    });

    it('throws PermissionError on 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Access denied' }),
      });

      await expect(client.request('/test')).rejects.toThrow(PermissionError);
    });

    it('throws NotFoundError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      });

      await expect(client.request('/test')).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError on 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'Invalid input', details: 'Field required' }),
      });

      await expect(client.request('/test')).rejects.toThrow(ValidationError);
    });

    it('throws RateLimitError on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '60' }),
        json: async () => ({}),
      });

      const error = await client.request('/test').catch((e) => e) as RateLimitError;
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.retryAfter).toBe(60);
    });

    it('throws BaleyUIError on other status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      });

      const error = await client.request('/test').catch((e) => e) as BaleyUIError;
      expect(error).toBeInstanceOf(BaleyUIError);
      expect(error.statusCode).toBe(500);
    });

    it('handles JSON parsing errors in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(client.request('/test')).rejects.toThrow(BaleyUIError);
    });
  });

  describe('createExecutionHandle', () => {
    it('creates execution handle with correct methods', () => {
      const handle = client.createExecutionHandle('exec-123');

      expect(handle.id).toBe('exec-123');
      expect(typeof handle.getStatus).toBe('function');
      expect(typeof handle.waitForCompletion).toBe('function');
      expect(typeof handle.stream).toBe('function');
    });
  });
});

describe('FlowsAPI', () => {
  let client: BaleyUI;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BaleyUI({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.test.com',
    });
  });

  describe('list', () => {
    it('lists all flows', async () => {
      const mockFlows = {
        workspaceId: 'ws-123',
        flows: [{ id: 'flow-1', name: 'Test Flow' }],
        count: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFlows,
      });

      const result = await client.flows.list();
      expect(result).toEqual(mockFlows);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/flows',
        expect.any(Object)
      );
    });
  });

  describe('get', () => {
    it('gets a specific flow', async () => {
      const mockFlow = {
        flow: {
          id: 'flow-123',
          name: 'Test Flow',
          nodes: [],
          edges: [],
          triggers: [],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFlow,
      });

      const result = await client.flows.get('flow-123');
      expect(result).toEqual(mockFlow.flow);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/flows/flow-123',
        expect.any(Object)
      );
    });
  });

  describe('execute', () => {
    it('executes a flow and returns handle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          executionId: 'exec-123',
          status: 'pending',
        }),
      });

      const handle = await client.flows.execute('flow-123', {
        input: { message: 'Hello' },
      });

      expect(handle.id).toBe('exec-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/flows/flow-123/execute',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ input: { message: 'Hello' } }),
        })
      );
    });

    it('waits for completion when wait option is true', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            executionId: 'exec-123',
            status: 'pending',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            execution: {
              id: 'exec-123',
              status: 'completed',
              output: { result: 'done' },
            },
          }),
        });

      const handle = await client.flows.execute('flow-123', {
        wait: true,
      });

      expect(handle.id).toBe('exec-123');
    });

    it('uses empty input object when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          executionId: 'exec-123',
          status: 'pending',
        }),
      });

      await client.flows.execute('flow-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/flows/flow-123/execute',
        expect.objectContaining({
          body: JSON.stringify({ input: {} }),
        })
      );
    });
  });
});

describe('BlocksAPI', () => {
  let client: BaleyUI;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BaleyUI({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.test.com',
    });
  });

  describe('list', () => {
    it('lists all blocks', async () => {
      const mockBlocks = {
        workspaceId: 'ws-123',
        blocks: [{ id: 'block-1', name: 'Test Block' }],
        count: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockBlocks,
      });

      const result = await client.blocks.list();
      expect(result).toEqual(mockBlocks);
    });
  });

  describe('run', () => {
    it('runs a block and returns handle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          executionId: 'exec-456',
          status: 'pending',
        }),
      });

      const handle = await client.blocks.run('block-123', {
        input: { data: 'test' },
      });

      expect(handle.id).toBe('exec-456');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/blocks/block-123/run',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ input: { data: 'test' } }),
        })
      );
    });

    it('waits for completion when wait option is true', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            executionId: 'exec-456',
            status: 'pending',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            execution: {
              id: 'exec-456',
              status: 'completed',
            },
          }),
        });

      const handle = await client.blocks.run('block-123', {
        wait: true,
      });

      expect(handle.id).toBe('exec-456');
    });
  });
});

describe('ExecutionsAPI', () => {
  let client: BaleyUI;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BaleyUI({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.test.com',
    });
  });

  describe('get', () => {
    it('gets execution status', async () => {
      const mockExecution = {
        execution: {
          id: 'exec-123',
          status: 'running',
          input: { message: 'Hello' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockExecution,
      });

      const result = await client.executions.get('exec-123');
      expect(result).toEqual(mockExecution.execution);
    });
  });

  describe('waitForCompletion', () => {
    it('returns completed execution immediately', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          execution: {
            id: 'exec-123',
            status: 'completed',
            output: { result: 'done' },
          },
        }),
      });

      const result = await client.executions.waitForCompletion('exec-123');
      expect(result.status).toBe('completed');
    });

    it('returns failed execution immediately', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          execution: {
            id: 'exec-123',
            status: 'failed',
            error: 'Something went wrong',
          },
        }),
      });

      const result = await client.executions.waitForCompletion('exec-123');
      expect(result.status).toBe('failed');
    });

    it('returns cancelled execution immediately', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          execution: {
            id: 'exec-123',
            status: 'cancelled',
          },
        }),
      });

      const result = await client.executions.waitForCompletion('exec-123');
      expect(result.status).toBe('cancelled');
    });

    it('polls until completion', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            execution: { id: 'exec-123', status: 'running' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            execution: { id: 'exec-123', status: 'completed' },
          }),
        });

      const result = await client.executions.waitForCompletion('exec-123');
      expect(result.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws TimeoutError when timeout is reached', async () => {
      // Use a very short timeout (10ms) and delay the mock response enough
      // for the timeout to be reached
      mockFetch.mockImplementation(async () => {
        // Delay the response slightly on each call
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          ok: true,
          json: async () => ({
            execution: { id: 'exec-123', status: 'running' },
          }),
        };
      });

      // Use a 10ms timeout so test runs quickly
      await expect(client.executions.waitForCompletion('exec-123', 10)).rejects.toThrow(TimeoutError);
    });
  });

  describe('stream', () => {
    it('streams execution events', async () => {
      const eventData = [
        { type: 'execution_start', executionId: 'exec-123', timestamp: '2024-01-01', index: 0 },
        { type: 'node_start', executionId: 'exec-123', nodeId: 'node-1', timestamp: '2024-01-01', index: 1 },
        { type: 'execution_complete', executionId: 'exec-123', timestamp: '2024-01-01', index: 2 },
      ];

      const encoder = new TextEncoder();
      const streamData = eventData.map((e) => `data: ${JSON.stringify(e)}\n`).join('') + 'data: [DONE]\n';

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: encoder.encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const events = [];
      for await (const event of client.executions.stream('exec-123')) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('execution_start');
      expect(events[2].type).toBe('execution_complete');
    });

    it('handles stream from specific index', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: vi.fn(),
          }),
        },
      });

      const gen = client.executions.stream('exec-123', 5);
      await gen.next();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/executions/exec-123/stream?fromIndex=5',
        expect.any(Object)
      );
    });

    it('throws error on failed stream response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const gen = client.executions.stream('exec-123');
      await expect(gen.next()).rejects.toThrow(BaleyUIError);
    });

    it('throws error when response body is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      });

      const gen = client.executions.stream('exec-123');
      await expect(gen.next()).rejects.toThrow('Failed to get response reader');
    });

    it('handles malformed JSON in stream', async () => {
      const encoder = new TextEncoder();
      const streamData = 'data: invalid json\ndata: [DONE]\n';

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: encoder.encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const events = [];
      for await (const event of client.executions.stream('exec-123')) {
        events.push(event);
      }

      // Should skip malformed event
      expect(events).toHaveLength(0);
    });

    it('stops on execution_error event', async () => {
      const encoder = new TextEncoder();
      const streamData = 'data: {"type":"execution_error","executionId":"exec-123","timestamp":"2024-01-01","index":0}\ndata: {"type":"should_not_see","executionId":"exec-123","timestamp":"2024-01-01","index":1}\n';

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: encoder.encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const events = [];
      for await (const event of client.executions.stream('exec-123')) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('execution_error');
    });

    it('releases reader lock on completion', async () => {
      const mockReleaseLock = vi.fn();
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: mockReleaseLock,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const gen = client.executions.stream('exec-123');
      await gen.next();

      expect(mockReleaseLock).toHaveBeenCalled();
    });
  });
});
