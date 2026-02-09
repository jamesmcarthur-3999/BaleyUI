import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCreatorMessage } from '../creator-bot';

// Mock internal discovery runner
vi.mock('../internal-bb/runner', () => ({
  runCreatorDiscovery: vi.fn().mockImplementation(async (prompt: string) => {
    const lower = prompt.toLowerCase();
    const isOutcomePolicyPrompt = lower.includes('approval policy');
    const isUnderspecifiedDbMonitor =
      lower.includes('monitor my database for new signups') &&
      !lower.includes('table') &&
      !lower.includes('every');
    const hasStructuredDbAnswers =
      lower.includes('database source:') || lower.includes('signup signal:');

    if (isOutcomePolicyPrompt) {
      return {
        needsMoreInfo: true,
        message: 'Need your approval handling policy before generation.',
        questions: [
          {
            id: 'approval-policy',
            label: 'Approval Policy',
            description: 'What should happen when confidence is below threshold?',
            requiredNow: true,
          },
        ],
        contextNotes: ['Approval policy missing.'],
      };
    }

    if (isUnderspecifiedDbMonitor || hasStructuredDbAnswers) {
      return {
        needsMoreInfo: true,
        message: 'Need source and signal details before generation.',
        questions: [
          {
            id: 'db-source',
            label: 'Database Source',
            description: 'Which connected database should be monitored?',
            requiredNow: true,
          },
          {
            id: 'signup-signal',
            label: 'Signup Signal',
            description: 'Which table/field indicates a new signup event?',
            requiredNow: true,
          },
          {
            id: 'trigger-mode',
            label: 'Trigger Mode',
            description: 'Schedule interval or real-time trigger?',
            requiredNow: false,
          },
        ],
        contextNotes: ['Database monitoring intent detected.'],
      };
    }

    return {
      needsMoreInfo: false,
      message: 'Discovery complete',
      questions: [],
      contextNotes: [],
    };
  }),
}));

// Mock internal creator bot execution
vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockImplementation(async (_name: string, prompt: string) => {
    if (prompt.toLowerCase().includes('how should we approach this')) {
      return {
        output: {
          entities: [],
          connections: [],
          balCode: '',
          name: 'test_bot',
          icon: '🤖',
          status: 'building',
          message: 'We should start with your desired outcome and constraints, then I will propose a first draft.',
        },
        executionId: 'exec-creator-chat-123',
      };
    }

    return {
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
      executionId: 'exec-creator-123',
    };
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
    const { runCreatorDiscovery } = await import('../internal-bb/runner');
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
      },
      'Create a bot that searches the web'
    );

    expect(runCreatorDiscovery).toHaveBeenCalledWith(
      'Create a bot that searches the web',
      expect.objectContaining({
        userWorkspaceId: 'ws-1',
        context: expect.any(String),
        triggeredBy: 'internal',
      })
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
          connections: [],
        },
      },
      'Create a bot'
    );

    expect(result).toHaveProperty('entities');
    expect(result).toHaveProperty('balCode');
    expect(result).toHaveProperty('status');
  });

  it('blocks generation for underspecified database monitoring requests', async () => {
    const { runCreatorDiscovery } = await import('../internal-bb/runner');
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [
            {
              id: 'conn-db-1',
              type: 'postgres',
              name: 'Primary Users DB',
              status: 'connected',
              isDefault: true,
            },
          ],
        },
      },
      'Monitor my database for new signups'
    );

    expect(result.status).toBe('building');
    expect(result.questions?.some((q) => q.id === 'db-source')).toBe(true);
    expect(result.questions?.some((q) => q.id === 'signup-signal')).toBe(true);
    expect(runCreatorDiscovery).toHaveBeenCalledWith(
      'Monitor my database for new signups',
      expect.objectContaining({
        userWorkspaceId: 'ws-1',
        triggeredBy: 'internal',
      })
    );
    expect(executeInternalBaleybot).not.toHaveBeenCalled();
  });

  it('proceeds to generation after discovery details are present', async () => {
    const { runCreatorDiscovery } = await import('../internal-bb/runner');
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [
            {
              id: 'conn-db-1',
              type: 'postgres',
              name: 'Users',
              status: 'connected',
              isDefault: true,
            },
          ],
        },
      },
      'Monitor users table for new signups every 5 minutes and send notification alerts'
    );

    expect(result.status).toBe('ready');
    expect(result.entities.length).toBeGreaterThan(0);
    expect(runCreatorDiscovery).toHaveBeenCalled();
    expect(executeInternalBaleybot).toHaveBeenCalled();
  });

  it('keeps discovery blocking when user replies with acknowledgement only', async () => {
    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
        conversationHistory: [
          {
            id: 'assistant-discovery-1',
            role: 'assistant',
            content: 'Please answer required details.',
            timestamp: new Date(),
            metadata: {
              creatorLifecycle: {
                stage: 'discovery',
                iteration: 1,
                requiredQuestions: [
                  {
                    id: 'approval-policy',
                    label: 'Approval Policy',
                    description: 'What should happen when confidence is below threshold?',
                    requiredNow: true,
                  },
                ],
              },
            },
          },
        ],
      },
      'ok'
    );

    expect(result.status).toBe('building');
    expect(result.questions?.some((q) => q.id === 'approval-policy')).toBe(true);
    expect(result.message ?? '').toContain('Current stage');
    expect(result.message ?? '').toContain('Next stage');
  });

  it('does not repeat resolved discovery prompts when labeled answers are provided', async () => {
    const { runCreatorDiscovery } = await import('../internal-bb/runner');
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [
            {
              id: 'conn-db-1',
              type: 'postgres',
              name: 'Primary Users DB',
              status: 'connected',
              isDefault: true,
            },
            {
              id: 'conn-db-2',
              type: 'postgres',
              name: 'Analytics DB',
              status: 'connected',
              isDefault: false,
            },
          ],
        },
        conversationHistory: [
          {
            id: 'assistant-discovery-2',
            role: 'assistant',
            content: 'Need source and signal details.',
            timestamp: new Date(),
            metadata: {
              creatorLifecycle: {
                stage: 'discovery',
                iteration: 2,
                requiredQuestions: [
                  {
                    id: 'db-source',
                    label: 'Database Source',
                    description: 'Which connected database should be monitored?',
                    requiredNow: true,
                  },
                  {
                    id: 'signup-signal',
                    label: 'Signup Signal',
                    description: 'Which table/field indicates a new signup event?',
                    requiredNow: true,
                  },
                ],
              },
            },
          },
        ],
      },
      [
        'Monitor my database for new signups',
        'Database Source: Production signups mirror',
        'Signup Signal: users.created_at',
      ].join('\n')
    );

    expect(result.status).toBe('ready');
    expect(runCreatorDiscovery).toHaveBeenCalled();
    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'creator_bot',
      expect.any(String),
      expect.anything()
    );
  });

  it('uses freeform answers to avoid repeating discovery prompts', async () => {
    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [
            {
              id: 'conn-db-1',
              type: 'postgres',
              name: 'Primary Users DB',
              status: 'connected',
              isDefault: true,
            },
          ],
        },
        conversationHistory: [
          {
            id: 'assistant-discovery-3',
            role: 'assistant',
            content: 'Need source and signal details.',
            timestamp: new Date(),
            metadata: {
              creatorLifecycle: {
                stage: 'discovery',
                iteration: 1,
                requiredQuestions: [
                  {
                    id: 'db-source',
                    label: 'Database Source',
                    description: 'Which connected database should be monitored?',
                    requiredNow: true,
                  },
                  {
                    id: 'signup-signal',
                    label: 'Signup Signal',
                    description: 'Which table/field indicates a new signup event?',
                    requiredNow: true,
                  },
                ],
              },
            },
          },
        ],
      },
      'Use Primary Users DB and monitor users.created_at for new signup events.'
    );

    expect(result.status).toBe('ready');
  });

  it('uses prior user answers in history when latest reply is acknowledgement', async () => {
    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [
            {
              id: 'conn-db-1',
              type: 'postgres',
              name: 'Primary Users DB',
              status: 'connected',
              isDefault: true,
            },
          ],
        },
        conversationHistory: [
          {
            id: 'assistant-discovery-4',
            role: 'assistant',
            content: 'Need source and signal details.',
            timestamp: new Date(),
            metadata: {
              creatorLifecycle: {
                stage: 'discovery',
                iteration: 1,
                requiredQuestions: [
                  {
                    id: 'db-source',
                    label: 'Database Source',
                    description: 'Which connected database should be monitored?',
                    requiredNow: true,
                  },
                ],
              },
            },
          },
          {
            id: 'user-answer-1',
            role: 'user',
            content: 'Database Source: Primary Users DB',
            timestamp: new Date(),
          },
        ],
      },
      'ok'
    );

    expect(result.status).toBe('ready');
  });

  it('keeps discovery blocking for outcome-critical questions', async () => {
    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
      },
      'Create a review workflow with an approval policy'
    );

    expect(result.status).toBe('building');
    expect(result.questions?.some((q) => q.id === 'approval-policy')).toBe(true);
  });

  it('blocks weekly status bots until data source and metric scope are explicit', async () => {
    const { executeInternalBaleybot } = await import('../internal-baleybots');
    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
      },
      'Build a bot that drafts weekly status updates from activity data'
    );
    expect(result.status).toBe('building');
    expect(result.questions?.some((q) => q.id === 'status-data-source')).toBe(true);
    expect(result.questions?.some((q) => q.id === 'status-metrics-focus')).toBe(true);
    expect(executeInternalBaleybot).not.toHaveBeenCalled();
  });

  it('adds stage narrative to ready outputs', async () => {
    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
      },
      'Create a bot that searches the web'
    );

    expect(result.status).toBe('ready');
    expect(result.message ?? '').toContain('What I did');
    expect(result.message ?? '').toContain('Current stage');
    expect(result.message ?? '').toContain('Next stage');
  });

  it('supports conversational creator replies without forcing generation', async () => {
    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
      },
      'How should we approach this before building?'
    );

    expect(result.status).toBe('building');
    expect(result.entities).toHaveLength(0);
    expect(result.balCode).toBe('');
    expect(result.message ?? '').not.toContain('Design Complete');
    expect(result.message ?? '').toContain('start with your desired outcome');
  });
});
