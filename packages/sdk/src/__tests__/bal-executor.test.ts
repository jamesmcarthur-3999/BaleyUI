import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compileBALCode, executeBALCode, streamBALExecution } from '../bal-executor';

vi.mock('@baleybots/tools', () => ({
  compileBAL: vi.fn(),
  webSearchTool: vi.fn(() => ({})),
  sequentialThinkTool: {},
}));

import { compileBAL } from '@baleybots/tools';

const mockedCompileBAL = vi.mocked(compileBAL);

const BAL_CODE = `
  test_bot {
    "goal": "Run test"
  }
  run("input")
`;

describe('compileBALCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns entities and structure on success', () => {
    mockedCompileBAL.mockReturnValue({
      executable: null,
      entityNames: ['test_bot'],
      pipelineStructure: { type: 'sequential', steps: [] },
      runInput: 'input',
    });

    const result = compileBALCode(BAL_CODE);

    expect(result.entities).toEqual(['test_bot']);
    expect(result.structure).toEqual({ type: 'sequential', steps: [] });
    expect(result.runInput).toBe('input');
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

    compileBALCode(BAL_CODE, {
      enableWebSearch: true,
      tavilyApiKey: 'test-key',
    });

    expect(mockedCompileBAL).toHaveBeenCalledWith(
      BAL_CODE,
      expect.objectContaining({
        availableTools: expect.objectContaining({
          web_search: expect.any(Object),
        }),
      })
    );
  });
});

describe('executeBALCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success result on successful execution', async () => {
    const process = vi.fn().mockResolvedValue('test output');
    mockedCompileBAL.mockReturnValue({
      executable: { process },
      entityNames: ['test_bot'],
      pipelineStructure: { type: 'bot', name: 'test_bot' },
      runInput: 'input',
    });

    const result = await executeBALCode(BAL_CODE);

    expect(result.status).toBe('success');
    expect(result.result).toBe('test output');
    expect(result.entities).toEqual(['test_bot']);
    expect(process).toHaveBeenCalled();
  });

  it('returns error on compilation failure', async () => {
    mockedCompileBAL.mockImplementation(() => {
      throw new Error('Compile error');
    });

    const result = await executeBALCode('invalid');

    expect(result.status).toBe('error');
    expect(result.error).toBe('Compile error');
  });

  it('handles timeout', async () => {
    const process = vi.fn().mockImplementation(
      (_input, ctx?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
        if (ctx?.signal?.aborted) {
          reject(new Error('aborted'));
          return;
        }
        ctx?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })
    );
    mockedCompileBAL.mockReturnValue({
      executable: { process },
      entityNames: ['test_bot'],
      pipelineStructure: { type: 'bot', name: 'test_bot' },
      runInput: 'input',
    });

    const result = await executeBALCode(BAL_CODE, { timeout: 100 });

    expect(result.status).toBe('timeout');
  }, 10000);

  it('calls onEvent callback with events', async () => {
    const process = vi.fn().mockResolvedValue('output');
    mockedCompileBAL.mockReturnValue({
      executable: { process },
      entityNames: ['test_bot'],
      pipelineStructure: { type: 'bot', name: 'test_bot' },
      runInput: 'input',
    });

    const events: unknown[] = [];
    await executeBALCode(BAL_CODE, {
      onEvent: (event) => events.push(event),
    });

    expect(events.some((e) => (e as Record<string, unknown>).type === 'parsing')).toBe(true);
    expect(events.some((e) => (e as Record<string, unknown>).type === 'compiled')).toBe(true);
    expect(events.some((e) => (e as Record<string, unknown>).type === 'started')).toBe(true);
    expect(events.some((e) => (e as Record<string, unknown>).type === 'completed')).toBe(true);
  });
});

describe('streamBALExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('yields events in order', async () => {
    const process = vi.fn().mockResolvedValue('output');
    mockedCompileBAL.mockReturnValue({
      executable: { process },
      entityNames: ['test_bot'],
      pipelineStructure: { type: 'bot', name: 'test_bot' },
      runInput: 'input',
    });

    const events: unknown[] = [];
    const generator = streamBALExecution(BAL_CODE);

    for await (const event of generator) {
      events.push(event);
    }

    const types = events.map((e) => (e as Record<string, unknown>).type);
    expect(types).toContain('parsing');
    expect(types).toContain('compiled');
    expect(types).toContain('started');
    expect(types).toContain('completed');
  });
});
