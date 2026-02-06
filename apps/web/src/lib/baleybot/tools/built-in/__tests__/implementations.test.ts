/**
 * Built-in Tool Implementations Tests
 *
 * Tests for all 8 built-in tools: web_search, fetch_url, spawn_baleybot,
 * send_notification, schedule_task, store_memory, create_agent, create_tool.
 * Also tests getBuiltInRuntimeTools() returns all tools correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BuiltInToolContext } from '../index';

// ---------------------------------------------------------------------------
// Hoisted mocks - vi.hoisted ensures these are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockSearch,
  mockCreateAndExecute,
  mockEphemeralToolCreate,
  mockEphemeralToolGetTool,
  mockSharedStorageImpl,
  mockFetch,
} = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockCreateAndExecute: vi.fn(),
  mockEphemeralToolCreate: vi.fn(),
  mockEphemeralToolGetTool: vi.fn(),
  mockSharedStorageImpl: vi.fn(),
  mockFetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  extractErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

vi.mock('../../../services/web-search-service', () => ({
  createWebSearchService: vi.fn(() => ({
    search: mockSearch,
    searchFull: vi.fn(),
  })),
}));

vi.mock('../../../services/ephemeral-agent-service', () => ({
  ephemeralAgentService: {
    createAndExecute: mockCreateAndExecute,
  },
}));

vi.mock('../../../services/ephemeral-tool-service', () => ({
  ephemeralToolService: {
    create: mockEphemeralToolCreate,
    getTool: mockEphemeralToolGetTool,
    getTools: vi.fn(() => new Map()),
    clear: vi.fn(),
  },
}));

vi.mock('../../../services/shared-storage-service', () => ({
  createSharedStorageToolImpl: () => mockSharedStorageImpl,
}));

vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  getBuiltInRuntimeTools,
  setWebSearchService,
  setSpawnBaleybotExecutor,
  setNotificationSender,
  setTaskScheduler,
  setMemoryStorage,
  configureWebSearch,
} from '../implementations';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides?: Partial<BuiltInToolContext>): BuiltInToolContext {
  return {
    workspaceId: 'ws-00000000-0000-0000-0000-000000000001',
    baleybotId: 'bb-00000000-0000-0000-0000-000000000001',
    executionId: 'exec-00000000-0000-0000-0000-000000000001',
    userId: 'user-001',
    ...overrides,
  };
}

/** Get a tool's execute function from the runtime map. */
function getTool(name: string, ctx?: BuiltInToolContext) {
  const tools = getBuiltInRuntimeTools(ctx ?? makeCtx());
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Built-in Tool Implementations', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset module-level injected services to null so each test can inject its own
    setWebSearchService(null as unknown as Parameters<typeof setWebSearchService>[0]);
    setSpawnBaleybotExecutor(null as unknown as Parameters<typeof setSpawnBaleybotExecutor>[0]);
    setNotificationSender(null as unknown as Parameters<typeof setNotificationSender>[0]);
    setTaskScheduler(null as unknown as Parameters<typeof setTaskScheduler>[0]);
    setMemoryStorage(null as unknown as Parameters<typeof setMemoryStorage>[0]);
  });

  // ========================================================================
  // getBuiltInRuntimeTools
  // ========================================================================

  describe('getBuiltInRuntimeTools', () => {
    it('should return a Map with all 9 built-in tools', () => {
      const tools = getBuiltInRuntimeTools(makeCtx());
      const expectedTools = [
        'web_search',
        'fetch_url',
        'spawn_baleybot',
        'send_notification',
        'schedule_task',
        'store_memory',
        'create_agent',
        'create_tool',
        'shared_storage',
      ];

      expect(tools.size).toBe(expectedTools.length);
      for (const name of expectedTools) {
        expect(tools.has(name)).toBe(true);
      }
    });

    it('should return tools with correct structure', () => {
      const tools = getBuiltInRuntimeTools(makeCtx());

      for (const [, tool] of tools) {
        expect(tool.name).toBeTypeOf('string');
        expect(tool.description).toBeTypeOf('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.function).toBeTypeOf('function');
      }
    });

    it('should mark approval-required tools correctly', () => {
      const tools = getBuiltInRuntimeTools(makeCtx());

      // schedule_task, create_agent, create_tool require approval
      expect(tools.get('schedule_task')?.needsApproval).toBe(true);
      expect(tools.get('create_agent')?.needsApproval).toBe(true);
      expect(tools.get('create_tool')?.needsApproval).toBe(true);

      // Others don't
      expect(tools.get('web_search')?.needsApproval).toBe(false);
      expect(tools.get('fetch_url')?.needsApproval).toBe(false);
      expect(tools.get('spawn_baleybot')?.needsApproval).toBe(false);
      expect(tools.get('send_notification')?.needsApproval).toBe(false);
      expect(tools.get('store_memory')?.needsApproval).toBe(false);
    });
  });

  // ========================================================================
  // web_search
  // ========================================================================

  describe('web_search', () => {
    it('should return search results on happy path', async () => {
      const mockResults = [
        { title: 'Result 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
        { title: 'Result 2', url: 'https://example.com/2', snippet: 'Snippet 2' },
      ];
      mockSearch.mockResolvedValue(mockResults);

      const tool = getTool('web_search');
      const result = await tool.function({ query: 'test query' });

      expect(result).toEqual(mockResults);
    });

    it('should use injected web search service when set', async () => {
      const customSearchFn = vi.fn().mockResolvedValue([
        { title: 'Custom', url: 'https://custom.com', snippet: 'Custom result' },
      ]);
      setWebSearchService({ search: customSearchFn, searchFull: vi.fn() });

      const tool = getTool('web_search');
      const result = await tool.function({ query: 'custom search' });

      expect(customSearchFn).toHaveBeenCalledWith('custom search', 5);
      expect(result).toHaveLength(1);
    });

    it('should cap num_results at 20', async () => {
      mockSearch.mockResolvedValue([]);

      const tool = getTool('web_search');
      await tool.function({ query: 'test', num_results: 50 });

      expect(mockSearch).toHaveBeenCalledWith('test', 20);
    });

    it('should default num_results to 5', async () => {
      mockSearch.mockResolvedValue([]);

      const tool = getTool('web_search');
      await tool.function({ query: 'test' });

      expect(mockSearch).toHaveBeenCalledWith('test', 5);
    });

    it('should propagate errors from search service', async () => {
      mockSearch.mockRejectedValue(new Error('Search service down'));

      const tool = getTool('web_search');
      await expect(tool.function({ query: 'fail' })).rejects.toThrow(
        'Search service down'
      );
    });
  });

  // ========================================================================
  // fetch_url
  // ========================================================================

  describe('fetch_url', () => {
    it('should fetch URL content as text by default', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: vi.fn().mockResolvedValue('<p>Hello World</p>'),
      });

      const tool = getTool('fetch_url');
      const result = (await tool.function({ url: 'https://example.com' })) as {
        content: string;
        contentType: string;
        statusCode: number;
      };

      expect(result.statusCode).toBe(200);
      expect(result.contentType).toBe('text/html');
      // HTML tags should be stripped in text mode
      expect(result.content).toContain('Hello World');
      expect(result.content).not.toContain('<p>');
    });

    it('should fetch URL content as HTML when format is html', async () => {
      const htmlContent = '<html><body><p>Hello</p></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: vi.fn().mockResolvedValue(htmlContent),
      });

      const tool = getTool('fetch_url');
      const result = (await tool.function({
        url: 'https://example.com',
        format: 'html',
      })) as { content: string; contentType: string; statusCode: number };

      expect(result.content).toBe(htmlContent);
    });

    it('should fetch URL content as JSON when format is json', async () => {
      const jsonData = { key: 'value' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue(jsonData),
      });

      const tool = getTool('fetch_url');
      const result = (await tool.function({
        url: 'https://api.example.com/data',
        format: 'json',
      })) as { content: string; contentType: string; statusCode: number };

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.content)).toEqual(jsonData);
    });

    it('should return error info for non-ok responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      });

      const tool = getTool('fetch_url');
      const result = (await tool.function({
        url: 'https://example.com/missing',
      })) as { content: string; statusCode: number };

      expect(result.statusCode).toBe(404);
      expect(result.content).toContain('HTTP 404');
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const tool = getTool('fetch_url');
      const result = (await tool.function({
        url: 'https://unreachable.example.com',
      })) as { content: string; statusCode: number };

      expect(result.statusCode).toBe(0);
      expect(result.content).toContain('Network error');
    });

    it('should truncate content exceeding 50000 characters', async () => {
      const longContent = 'x'.repeat(60000);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: vi.fn().mockResolvedValue(longContent),
      });

      const tool = getTool('fetch_url');
      const result = (await tool.function({
        url: 'https://example.com/large',
      })) as { content: string };

      expect(result.content.length).toBeLessThan(60000);
      expect(result.content).toContain('[Content truncated...]');
    });
  });

  // ========================================================================
  // spawn_baleybot
  // ========================================================================

  describe('spawn_baleybot', () => {
    it('should execute spawned baleybot via injected executor', async () => {
      const mockResult = {
        output: 'Bot result',
        executionId: 'exec-123',
        durationMs: 500,
      };
      const mockExecutor = vi.fn().mockResolvedValue(mockResult);
      setSpawnBaleybotExecutor(mockExecutor);

      const ctx = makeCtx();
      const tool = getTool('spawn_baleybot', ctx);
      const result = await tool.function({
        baleybot: 'helper-bot',
        input: 'do something',
      });

      expect(result).toEqual(mockResult);
      expect(mockExecutor).toHaveBeenCalledWith(
        'helper-bot',
        'do something',
        ctx
      );
    });

    it('should throw if executor is not configured', async () => {
      const tool = getTool('spawn_baleybot');

      await expect(
        tool.function({ baleybot: 'some-bot' })
      ).rejects.toThrow('spawn_baleybot executor not configured');
    });

    it('should pass input as undefined when not provided', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({
        output: '',
        executionId: 'e',
        durationMs: 0,
      });
      setSpawnBaleybotExecutor(mockExecutor);

      const ctx = makeCtx();
      const tool = getTool('spawn_baleybot', ctx);
      await tool.function({ baleybot: 'bot-name' });

      expect(mockExecutor).toHaveBeenCalledWith('bot-name', undefined, ctx);
    });
  });

  // ========================================================================
  // send_notification
  // ========================================================================

  describe('send_notification', () => {
    it('should send notification via injected sender', async () => {
      const mockResult = { sent: true, notification_id: 'notif-456' };
      const sender = vi.fn().mockResolvedValue(mockResult);
      setNotificationSender(sender);

      const ctx = makeCtx();
      const tool = getTool('send_notification', ctx);
      const result = await tool.function({
        title: 'Alert',
        message: 'Something happened',
        priority: 'high',
      });

      expect(result).toEqual(mockResult);
      expect(sender).toHaveBeenCalledWith(
        { title: 'Alert', message: 'Something happened', priority: 'high' },
        ctx
      );
    });

    it('should use fallback when sender is not configured', async () => {
      const tool = getTool('send_notification');
      const result = (await tool.function({
        title: 'Test',
        message: 'Hello',
      })) as { sent: boolean; notification_id: string };

      expect(result.sent).toBe(true);
      expect(result.notification_id).toMatch(/^notif_/);
    });

    it('should default priority to normal', async () => {
      const sender = vi
        .fn()
        .mockResolvedValue({ sent: true, notification_id: 'n1' });
      setNotificationSender(sender);

      const ctx = makeCtx();
      const tool = getTool('send_notification', ctx);
      await tool.function({ title: 'Info', message: 'No priority set' });

      expect(sender).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'normal' }),
        ctx
      );
    });
  });

  // ========================================================================
  // schedule_task
  // ========================================================================

  describe('schedule_task', () => {
    it('should schedule task via injected scheduler', async () => {
      const mockResult = {
        scheduled: true,
        task_id: 'task-789',
        run_at: '2026-03-01T00:00:00Z',
      };
      const scheduler = vi.fn().mockResolvedValue(mockResult);
      setTaskScheduler(scheduler);

      const ctx = makeCtx();
      const tool = getTool('schedule_task', ctx);
      const result = await tool.function({
        baleybot: 'nightly-bot',
        run_at: '2026-03-01T00:00:00Z',
        input: { mode: 'full' },
      });

      expect(result).toEqual(mockResult);
      expect(scheduler).toHaveBeenCalledWith(
        {
          baleybotIdOrName: 'nightly-bot',
          runAt: '2026-03-01T00:00:00Z',
          input: { mode: 'full' },
        },
        ctx
      );
    });

    it('should default baleybot to context baleybotId when not provided', async () => {
      const scheduler = vi.fn().mockResolvedValue({
        scheduled: true,
        task_id: 't',
        run_at: '',
      });
      setTaskScheduler(scheduler);

      const ctx = makeCtx({ baleybotId: 'current-bb-id' });
      const tool = getTool('schedule_task', ctx);
      await tool.function({ run_at: '2026-06-01T00:00:00Z' });

      expect(scheduler).toHaveBeenCalledWith(
        expect.objectContaining({ baleybotIdOrName: 'current-bb-id' }),
        ctx
      );
    });

    it('should throw if scheduler is not configured', async () => {
      const tool = getTool('schedule_task');

      await expect(
        tool.function({ run_at: '2026-06-01T00:00:00Z' })
      ).rejects.toThrow('schedule_task scheduler not configured');
    });
  });

  // ========================================================================
  // store_memory
  // ========================================================================

  describe('store_memory', () => {
    const mockStorage = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
      setMemoryStorage(mockStorage);
    });

    it('should get a value', async () => {
      mockStorage.get.mockResolvedValue({ name: 'test' });

      const tool = getTool('store_memory');
      const result = (await tool.function({
        action: 'get',
        key: 'user-prefs',
      })) as { success: boolean; value: unknown };

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ name: 'test' });
    });

    it('should set a value', async () => {
      mockStorage.set.mockResolvedValue(undefined);

      const tool = getTool('store_memory');
      const result = (await tool.function({
        action: 'set',
        key: 'counter',
        value: 42,
      })) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockStorage.set).toHaveBeenCalledWith(
        'counter',
        42,
        expect.any(Object)
      );
    });

    it('should delete a value', async () => {
      mockStorage.delete.mockResolvedValue(undefined);

      const tool = getTool('store_memory');
      const result = (await tool.function({
        action: 'delete',
        key: 'old-key',
      })) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockStorage.delete).toHaveBeenCalledWith(
        'old-key',
        expect.any(Object)
      );
    });

    it('should list keys', async () => {
      mockStorage.list.mockResolvedValue(['key-a', 'key-b']);

      const tool = getTool('store_memory');
      const result = (await tool.function({
        action: 'list',
      })) as { success: boolean; keys: string[] };

      expect(result.success).toBe(true);
      expect(result.keys).toEqual(['key-a', 'key-b']);
    });

    it('should throw on get without key', async () => {
      const tool = getTool('store_memory');

      await expect(
        tool.function({ action: 'get' })
      ).rejects.toThrow('Key required for get action');
    });

    it('should throw on set without key', async () => {
      const tool = getTool('store_memory');

      await expect(
        tool.function({ action: 'set', value: 'hello' })
      ).rejects.toThrow('Key required for set action');
    });

    it('should throw on set without value', async () => {
      const tool = getTool('store_memory');

      await expect(
        tool.function({ action: 'set', key: 'k' })
      ).rejects.toThrow('Value required for set action');
    });

    it('should throw on delete without key', async () => {
      const tool = getTool('store_memory');

      await expect(
        tool.function({ action: 'delete' })
      ).rejects.toThrow('Key required for delete action');
    });

    it('should throw if memory storage is not configured', async () => {
      setMemoryStorage(null as unknown as Parameters<typeof setMemoryStorage>[0]);

      const tool = getTool('store_memory');
      await expect(
        tool.function({ action: 'list' })
      ).rejects.toThrow('store_memory storage not configured');
    });
  });

  // ========================================================================
  // create_agent
  // ========================================================================

  describe('create_agent', () => {
    it('should create and execute an ephemeral agent', async () => {
      const mockResult = { output: 'Agent did its thing', agentName: 'helper' };
      mockCreateAndExecute.mockResolvedValue(mockResult);

      const tool = getTool('create_agent');
      const result = await tool.function({
        name: 'helper',
        goal: 'Summarize documents',
        model: 'openai:gpt-4o',
        tools: ['web_search'],
        input: 'Summarize this',
      });

      expect(result).toEqual(mockResult);
      expect(mockCreateAndExecute).toHaveBeenCalledWith(
        { name: 'helper', goal: 'Summarize documents', model: 'openai:gpt-4o', tools: ['web_search'] },
        'Summarize this',
        expect.any(Map)
      );
    });

    it('should default input to empty string when not provided', async () => {
      mockCreateAndExecute.mockResolvedValue({
        output: '',
        agentName: 'agent',
      });

      const tool = getTool('create_agent');
      await tool.function({ name: 'agent', goal: 'Do a thing' });

      expect(mockCreateAndExecute).toHaveBeenCalledWith(
        expect.any(Object),
        '',
        expect.any(Map)
      );
    });

    it('should propagate errors from ephemeral agent service', async () => {
      mockCreateAndExecute.mockRejectedValue(
        new Error('Agent execution failed')
      );

      const tool = getTool('create_agent');
      await expect(
        tool.function({ name: 'bad-agent', goal: 'fail' })
      ).rejects.toThrow('Agent execution failed');
    });
  });

  // ========================================================================
  // create_tool
  // ========================================================================

  describe('create_tool', () => {
    it('should create an ephemeral tool', async () => {
      const mockResult = { created: true, tool_name: 'my_calculator' };
      mockEphemeralToolCreate.mockResolvedValue(mockResult);
      mockEphemeralToolGetTool.mockReturnValue({
        name: 'my_calculator',
        description: 'Calculates things',
        inputSchema: {},
        function: vi.fn(),
      });

      const tool = getTool('create_tool');
      const result = await tool.function({
        name: 'my_calculator',
        description: 'A calculator tool',
        implementation: 'Add two numbers together',
      });

      expect(result).toEqual(mockResult);
      expect(mockEphemeralToolCreate).toHaveBeenCalledWith(
        {
          name: 'my_calculator',
          description: 'A calculator tool',
          inputSchema: undefined,
          implementation: 'Add two numbers together',
        },
        expect.any(Object)
      );
    });

    it('should pass input_schema to ephemeral tool service', async () => {
      mockEphemeralToolCreate.mockResolvedValue({
        created: true,
        tool_name: 'validator',
      });
      mockEphemeralToolGetTool.mockReturnValue({
        name: 'validator',
        description: 'Validates',
        inputSchema: { type: 'object', properties: { data: { type: 'string' } } },
        function: vi.fn(),
      });

      const tool = getTool('create_tool');
      await tool.function({
        name: 'validator',
        description: 'Validates data',
        input_schema: { type: 'object', properties: { data: { type: 'string' } } },
        implementation: 'Check data is valid',
      });

      expect(mockEphemeralToolCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          inputSchema: {
            type: 'object',
            properties: { data: { type: 'string' } },
          },
        }),
        expect.any(Object)
      );
    });

    it('should propagate errors from ephemeral tool service', async () => {
      mockEphemeralToolCreate.mockRejectedValue(
        new Error('Tool creation failed')
      );

      const tool = getTool('create_tool');
      await expect(
        tool.function({
          name: 'bad-tool',
          description: 'fail',
          implementation: 'fail',
        })
      ).rejects.toThrow('Tool creation failed');
    });

    it('should not add tool to parent store when creation fails', async () => {
      mockEphemeralToolCreate.mockResolvedValue({
        created: false,
        tool_name: 'failed_tool',
      });

      const tool = getTool('create_tool');
      const result = (await tool.function({
        name: 'failed_tool',
        description: 'nope',
        implementation: 'nope',
      })) as { created: boolean };

      expect(result.created).toBe(false);
      // getTool should not have been called since created was false
      expect(mockEphemeralToolGetTool).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // configureWebSearch helper
  // ========================================================================

  describe('configureWebSearch', () => {
    it('should be callable without errors', () => {
      expect(() => configureWebSearch('test-api-key')).not.toThrow();
    });

    it('should accept undefined api key', () => {
      expect(() => configureWebSearch(undefined)).not.toThrow();
    });
  });
});
