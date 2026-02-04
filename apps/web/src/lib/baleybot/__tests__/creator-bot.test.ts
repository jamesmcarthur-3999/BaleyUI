import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCreatorMessage } from '../creator-bot';

// Mock internal-baleybots
vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: {
      entities: [
        {
          id: 'entity-1',
          name: 'test_entity',
          icon: '🤖',
          purpose: 'Test entity',
          tools: ['web_search'],
        },
      ],
      connections: [],
      balCode: 'test_entity { "goal": "Test", "model": "anthropic:claude-sonnet-4-20250514" }',
      name: 'test_bot',
      icon: '🤖',
      status: 'ready',
      message: 'Created test bot',
    },
    executionId: 'exec-123',
  }),
}));

// Mock catalog service
vi.mock('../tools/catalog-service', () => ({
  getToolCatalog: vi.fn().mockReturnValue({
    builtIn: [],
    connectionDerived: [],
    workspace: [],
  }),
  formatToolCatalogForCreatorBot: vi.fn().mockReturnValue('## Tool Catalog\nNo tools available.'),
  getBuiltInToolDefinitions: vi.fn().mockReturnValue([]),
}));

describe('creator-bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses internal BaleyBot for processing', async () => {
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
        },
      },
      'Create a bot that searches the web'
    );

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'creator_bot',
      'Create a bot that searches the web',
      expect.objectContaining({
        userWorkspaceId: 'ws-1',
        context: expect.any(String),
        triggeredBy: 'internal',
      })
    );
  });

  it('returns parsed creator output', async () => {
    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
        },
      },
      'Create a bot'
    );

    expect(result).toHaveProperty('entities');
    expect(result).toHaveProperty('balCode');
    expect(result).toHaveProperty('status');
  });
});
