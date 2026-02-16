import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBal } from '../generator';

vi.mock('../internal-bb/runner', () => ({
  runBalGenerator: vi.fn().mockResolvedValue({
    balCode: 'test_entity { "goal": "Test", "model": "openai|gpt-4o-mini" }',
    explanation: 'A simple test bot',
    entities: [
      {
        name: 'test_entity',
        goal: 'Test',
        model: 'openai|gpt-4o-mini',
        tools: [],
        canRequest: [],
      },
    ],
    toolRationale: {},
    suggestedName: 'test_bot',
    suggestedIcon: '🤖',
  }),
}));

describe('generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses internal BaleyBot for generation', async () => {
    const { runBalGenerator } = await import('../internal-bb/runner');

    await generateBal(
      {
        workspaceId: 'ws-1',
        availableTools: [],
        existingBaleybots: [],
        workspacePolicies: null,
        connections: [],
      },
      'Create a bot that helps with tasks'
    );

    expect(runBalGenerator).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        userWorkspaceId: 'ws-1',
        triggeredBy: 'internal',
      })
    );
  });

  it('returns parsed generator result', async () => {
    const result = await generateBal(
      {
        workspaceId: 'ws-1',
        availableTools: [],
        existingBaleybots: [],
        workspacePolicies: null,
        connections: [],
      },
      'Create a bot'
    );

    expect(result).toHaveProperty('balCode');
    expect(result).toHaveProperty('entities');
    expect(result).toHaveProperty('explanation');
  });
});
