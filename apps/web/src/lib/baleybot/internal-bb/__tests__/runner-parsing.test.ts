import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecuteInternalBaleybot } = vi.hoisted(() => ({
  mockExecuteInternalBaleybot: vi.fn(),
}));

vi.mock('../../internal-baleybots', () => ({
  executeInternalBaleybot: (...args: unknown[]) =>
    mockExecuteInternalBaleybot(...args),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { runCreatorActionAdvisor } from '../runner';

describe('runInternalBB output parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses JSON wrapped in markdown fences', async () => {
    mockExecuteInternalBaleybot.mockResolvedValueOnce({
      executionId: 'exec-1',
      output: [
        '```json',
        '{"actions":[{"label":"Try this","prompt":"Build a webhook bot","mode":"send"}]}',
        '```',
      ].join('\n'),
    });

    const parsed = await runCreatorActionAdvisor('test input', {
      userWorkspaceId: 'ws-1',
      triggeredBy: 'internal',
      repairAttempts: 0,
    });

    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]?.label).toBe('Try this');
    expect(parsed.actions[0]?.prompt).toBe('Build a webhook bot');
  });

  it('parses JSON embedded in surrounding text', async () => {
    mockExecuteInternalBaleybot.mockResolvedValueOnce({
      executionId: 'exec-2',
      output:
        'Sure - here is the output:\n{"actions":[{"label":"Add monitoring","prompt":"Add monitoring to track uptime","mode":"send"}]}',
    });

    const parsed = await runCreatorActionAdvisor('test input', {
      userWorkspaceId: 'ws-1',
      triggeredBy: 'internal',
      repairAttempts: 0,
    });

    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]?.label).toBe('Add monitoring');
  });
});
