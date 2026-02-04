import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compileBALCode, executeBALCode, streamBALExecution } from '../bal-executor';

// Mock @baleybots/tools
vi.mock('@baleybots/tools', () => ({
  compileBAL: vi.fn(),
  webSearchTool: vi.fn(() => ({})),
  sequentialThinkTool: {},
}));

import { compileBAL } from '@baleybots/tools';

const mockedCompileBAL = vi.mocked(compileBAL);
const createMockExecutable = () => ({
  process: vi.fn(),
  subscribeToAll: vi.fn(() => ({ unsubscribe: vi.fn() })),
});

describe('compileBALCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns entities and structure on success', () => {
    mockedCompileBAL.mockReturnValue({
      executable: null,
      entityNames: ['Researcher', 'Writer'],
      pipelineStructure: { type: 'sequential', steps: [] },
      runInput: 'test input',
    });

    const result = compileBALCode('@entity Researcher');

    expect(result.entities).toEqual(['Researcher', 'Writer']);
    expect(result.structure).toEqual({ type: 'sequential', steps: [] });
    expect(result.runInput).toBe('test input');
    expect(result.errors).toBeUndefined();
  });

  it('returns errors on compilation failure', () => {
    mockedCompileBAL.mockImplementation(() => {
      throw new Error('Syntax error at line 1');
    });

    const result = compileBALCode('invalid code');

    expect(result.errors).toEqual(['Syntax error at line 1']);
    expect(result.entities).toEqual([]);
    expect(result.structure).toBeNull();
  });

  it('includes web search tool when enabled with API key', () => {
    mockedCompileBAL.mockReturnValue({
      executable: null,
      entityNames: [],
      pipelineStructure: null,
      runInput: null,
    });

    compileBALCode('@entity Test', {
      enableWebSearch: true,
      tavilyApiKey: 'test-key',
    });

    expect(mockedCompileBAL).toHaveBeenCalledWith(
      '@entity Test',
      expect.objectContaining({
        availableTools: expect.objectContaining({
          web_search: expect.any(Object),
        }),
      })
    );
  });

  it('does not include web search without API key', () => {
    mockedCompileBAL.mockReturnValue({
      executable: null,
      entityNames: [],
      pipelineStructure: null,
      runInput: null,
    });

    compileBALCode('@entity Test', {
      enableWebSearch: true,
      // No tavilyApiKey
    });

    expect(mockedCompileBAL).toHaveBeenCalledWith(
      '@entity Test',
      expect.objectContaining({
        availableTools: {},
      })
    );
  });
});

describe('executeBALCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success result on successful execution', async () => {
    const executable = createMockExecutable();
    executable.process.mockResolvedValue('test output');
    mockedCompileBAL.mockReturnValue({
      executable: executable as any, // Mock executable
      entityNames: ['Test'],
      pipelineStructure: { type: 'bot', name: 'Test' },
      runInput: 'input',
    });

    const result = await executeBALCode('@entity Test @run Test("input")');

    expect(result.status).toBe('success');
    expect(result.result).toBe('test output');
    expect(result.entities).toEqual(['Test']);
  });

  it('returns error on compilation failure', async () => {
    mockedCompileBAL.mockImplementation(() => {
      throw new Error('Compile error');
    });

    const result = await executeBALCode('invalid');

    expect(result.status).toBe('error');
    expect(result.error).toBe('Compile error');
  });

  it('returns success with no-op message when no pipeline exists', async () => {
    const executable = createMockExecutable();
    mockedCompileBAL.mockReturnValue({
      executable: executable as any,
      entityNames: ['Test'],
      pipelineStructure: null,
      runInput: null,
    });

    const result = await executeBALCode('@entity Test');

    expect(result.status).toBe('success');
    expect(result.result).toEqual({
      message: 'No pipeline to execute',
      entities: ['Test'],
    });
    expect(executable.process).not.toHaveBeenCalled();
  });

  it('handles timeout', async () => {
    const executable = createMockExecutable();
    executable.process.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5000))
    );
    mockedCompileBAL.mockReturnValue({
      executable: executable as any,
      entityNames: ['Test'],
      pipelineStructure: { type: 'bot', name: 'Test' },
      runInput: 'input',
    });

    const result = await executeBALCode('@entity Test @run Test("input")', {
      timeout: 100,
    });

    expect(result.status).toBe('timeout');
  }, 10000);

  it('calls onEvent callback with events', async () => {
    const executable = createMockExecutable();
    executable.process.mockResolvedValue('output');
    mockedCompileBAL.mockReturnValue({
      executable: executable as any,
      entityNames: ['Test'],
      pipelineStructure: { type: 'bot', name: 'Test' },
      runInput: 'input',
    });

    const events: unknown[] = [];
    await executeBALCode('@entity Test @run Test("input")', {
      onEvent: (event) => events.push(event),
    });

    expect(events.some((e: any) => e.type === 'parsing')).toBe(true);
    expect(events.some((e: any) => e.type === 'compiled')).toBe(true);
    expect(events.some((e: any) => e.type === 'started')).toBe(true);
    expect(events.some((e: any) => e.type === 'completed')).toBe(true);
  });
});

describe('streamBALExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('yields events in order', async () => {
    const executable = createMockExecutable();
    executable.process.mockResolvedValue('output');
    mockedCompileBAL.mockReturnValue({
      executable: executable as any,
      entityNames: ['Test'],
      pipelineStructure: { type: 'bot', name: 'Test' },
      runInput: 'input',
    });

    const events: unknown[] = [];
    const generator = streamBALExecution('@entity Test @run Test("input")');

    for await (const event of generator) {
      events.push(event);
    }

    const types = events.map((e: any) => e.type);
    expect(types).toContain('parsing');
    expect(types).toContain('compiled');
    expect(types).toContain('started');
    expect(types).toContain('completed');
  });

  it('completes generator successfully', async () => {
    const executable = createMockExecutable();
    executable.process.mockResolvedValue('output');
    mockedCompileBAL.mockReturnValue({
      executable: executable as any,
      entityNames: ['Test'],
      pipelineStructure: { type: 'bot', name: 'Test' },
      runInput: 'input',
    });

    const generator = streamBALExecution('@entity Test @run Test("input")');

    // Consume all events
    for await (const _ of generator) {
      // consume
    }

    // Get return value
    const final = await generator.next();
    expect(final.done).toBe(true);
  });
});
