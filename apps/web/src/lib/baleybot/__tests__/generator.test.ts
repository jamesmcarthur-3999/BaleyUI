import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBal } from '../generator';

vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: {
      balCode: 'test_entity { "goal": "Test", "model": "openai:gpt-4o-mini" }',
      explanation: 'A simple test bot',
      entities: [
        {
          name: 'test_entity',
          goal: 'Test',
          model: 'openai:gpt-4o-mini',
          tools: [],
          canRequest: [],
        },
      ],
      toolRationale: {},
      suggestedName: 'test_bot',
      suggestedIcon: '🤖',
    },
    executionId: 'exec-123',
  }),
}));

describe('generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses internal BaleyBot for generation', async () => {
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    await generateBal(
      {
        workspaceId: 'ws-1',
        availableTools: [],
        existingBaleybots: [],
        workspacePolicies: null,
      },
      'Create a bot that helps with tasks'
    );

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'bal_generator',
      expect.any(String),
      expect.objectContaining({
        userWorkspaceId: 'ws-1',
        context: expect.any(String),
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
      },
      'Create a bot'
    );

    expect(result).toHaveProperty('balCode');
    expect(result).toHaveProperty('entities');
    expect(result).toHaveProperty('explanation');
  });
});
