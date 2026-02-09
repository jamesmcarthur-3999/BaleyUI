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

import { runCreatorDiscovery } from '../runner';

describe('runInternalBB output parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses JSON wrapped in markdown fences', async () => {
    mockExecuteInternalBaleybot.mockResolvedValueOnce({
      executionId: 'exec-1',
      output: [
        '```json',
        '{"needsMoreInfo":false,"message":"ok","questions":[],"contextNotes":[]}',
        '```',
      ].join('\n'),
    });

    const parsed = await runCreatorDiscovery('test input', {
      userWorkspaceId: 'ws-1',
      triggeredBy: 'internal',
      repairAttempts: 0,
    });

    expect(parsed.needsMoreInfo).toBe(false);
    expect(parsed.message).toBe('ok');
    expect(parsed.questions).toEqual([]);
  });

  it('parses JSON embedded in surrounding text', async () => {
    mockExecuteInternalBaleybot.mockResolvedValueOnce({
      executionId: 'exec-2',
      output:
        'Sure - here is the contract output:\n{"needsMoreInfo":true,"questions":[{"id":"q1","label":"Source","description":"Which source should I use?","requiredNow":true}],"contextNotes":[]}',
    });

    const parsed = await runCreatorDiscovery('test input', {
      userWorkspaceId: 'ws-1',
      triggeredBy: 'internal',
      repairAttempts: 0,
    });

    expect(parsed.needsMoreInfo).toBe(true);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0]?.label).toBe('Source');
  });
});
