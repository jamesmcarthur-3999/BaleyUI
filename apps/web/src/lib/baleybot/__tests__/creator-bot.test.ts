import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCreatorMessage } from '../creator-bot';
import { parseBalCode } from '../bal-parser-pure';

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
    const hasFreeformDbAnswers =
      (lower.includes('primary users db') && lower.includes('users.created_at')) ||
      (lower.includes('users table') && lower.includes('new signup'));
    const hasResolvedDbAnswers = hasStructuredDbAnswers || hasFreeformDbAnswers;
    const isWeeklyStatusPrompt = lower.includes('weekly status updates from activity data');
    const hasWeeklyStatusResolutionHints =
      lower.includes('activity data source:') ||
      lower.includes('status update focus:') ||
      lower.includes('database') ||
      lower.includes('api') ||
      lower.includes('spreadsheet');

    if (isOutcomePolicyPrompt) {
      return {
        needsMoreInfo: true,
        message:
          'Before I generate, how should approvals behave when confidence is low or outputs are sensitive?',
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

    if (isUnderspecifiedDbMonitor && !hasResolvedDbAnswers) {
      return {
        needsMoreInfo: true,
        message:
          'Great direction. First, which database source and signup signal should I use?',
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

    if (isWeeklyStatusPrompt && !hasWeeklyStatusResolutionHints) {
      return {
        needsMoreInfo: true,
        message:
          'Nice idea. To make this runnable, where is the activity data and what should each weekly update focus on?',
        questions: [
          {
            id: 'status-data-source',
            label: 'Activity Data Source',
            description:
              'Where does the activity data live (database, API, spreadsheet, warehouse, etc.)?',
            requiredNow: true,
          },
          {
            id: 'status-metrics-focus',
            label: 'Status Update Focus',
            description:
              'What should the weekly update cover (for example: signups, retention, engagement, incidents, revenue)?',
            requiredNow: true,
          },
        ],
        contextNotes: ['Status update workflow needs source and focus details.'],
      };
    }

    return {
      needsMoreInfo: false,
      message: 'Discovery complete',
      questions: [],
      contextNotes: [],
    };
  }),
  runCreatorBot: vi.fn().mockImplementation(async (prompt: string) => {
    if (prompt.toLowerCase().includes('how should we approach this')) {
      return {
        entities: [],
        connections: [],
        balCode: '',
        name: 'test_bot',
        icon: '🤖',
        status: 'building',
        message: 'We should start with your desired outcome and constraints, then I will propose a first draft.',
      };
    }

    return {
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
  formatToolCatalogForCreatorBotCompact: vi
    .fn()
    .mockReturnValue('## Tool Catalog\nNo tools available.'),
  getBuiltInToolDefinitions: vi.fn().mockReturnValue([]),
}));

describe('creator-bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses internal BaleyBot for processing', async () => {
    const { runCreatorDiscovery, runCreatorBot } = await import('../internal-bb/runner');

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
      expect.stringContaining(
        'Latest user message: Create a bot that searches the web'
      ),
      expect.objectContaining({
        userWorkspaceId: 'ws-1',
        context: expect.any(String),
        triggeredBy: 'internal',
      })
    );

    expect(runCreatorBot).toHaveBeenCalledWith(
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
    const { runCreatorDiscovery, runCreatorBot } = await import('../internal-bb/runner');

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
    expect((result.questions ?? []).length).toBeGreaterThan(0);
    const requiredQuestions = (result.questions ?? []).filter(
      (question) => question.requiredNow !== false
    );
    expect(requiredQuestions).toHaveLength(1);
    expect(
      /database|signup/i.test(requiredQuestions[0]?.label ?? '')
    ).toBe(true);
    expect(runCreatorDiscovery).toHaveBeenCalledWith(
      expect.stringContaining('Latest user message: Monitor my database for new signups'),
      expect.objectContaining({
        userWorkspaceId: 'ws-1',
        triggeredBy: 'internal',
      })
    );
    expect(runCreatorBot).not.toHaveBeenCalled();
  });

  it('proceeds to generation after discovery details are present', async () => {
    const { runCreatorDiscovery, runCreatorBot } = await import('../internal-bb/runner');

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
    expect(runCreatorBot).toHaveBeenCalled();
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
    expect(result.message ?? '').toContain('generate');
    expect(result.message ?? '').not.toContain('Current stage');
  });

  it('does not repeat resolved discovery prompts when labeled answers are provided', async () => {
    const { runCreatorDiscovery, runCreatorBot } = await import('../internal-bb/runner');

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
    expect(runCreatorBot).toHaveBeenCalledWith(
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
    const { runCreatorBot } = await import('../internal-bb/runner');
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
    expect(runCreatorBot).not.toHaveBeenCalled();
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

  it('recovers malformed creator output with a runnable starter draft', async () => {
    const { runCreatorBot } = await import('../internal-bb/runner');
    vi.mocked(runCreatorBot).mockRejectedValueOnce(
      new Error('creator_bot returned malformed output: entities: invalid')
    );

    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [{ name: 'web_search', description: '', inputSchema: {} }],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
      },
      'Create a team of bots where one monitors websites and another writes a digest'
    );

    expect(result.status).toBe('ready');
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.balCode.trim().length).toBeGreaterThan(0);
    expect((result.message ?? '').toLowerCase()).not.toContain('continue with defaults');
  });

  it('hides technical discovery fallback wording when analyzer fails', async () => {
    const { runCreatorDiscovery } = await import('../internal-bb/runner');
    vi.mocked(runCreatorDiscovery).mockRejectedValueOnce(
      new Error('creator_discovery returned malformed output: delta.summary')
    );

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
      'Create a bot that summarizes support requests daily'
    );

    expect((result.message ?? '').toLowerCase()).not.toContain('fallback discovery mode');
    expect((result.message ?? '').toLowerCase()).not.toContain('analyzer failure');
  });

  it('auto-repairs invalid BAL returned by creator output', async () => {
    const { runCreatorBot } = await import('../internal-bb/runner');
    vi.mocked(runCreatorBot).mockResolvedValueOnce({
      entities: [
        {
          id: 'entity-1',
          name: 'Website Monitor',
          icon: '🛰️',
          purpose: 'Watch websites for changes.',
          tools: ['web_search'],
        },
        {
          id: 'entity-2',
          name: 'Digest Writer',
          icon: '📝',
          purpose: 'Summarize changes into a daily digest.',
          tools: [],
        },
      ],
      connections: [
        {
          from: 'Website Monitor',
          to: 'Digest Writer',
        },
      ],
      balCode: 'invalid bal output',
      name: 'Website Digest Bot',
      description: 'Monitor websites and summarize changes.',
      icon: '🤖',
      status: 'ready',
      message: 'Built your workflow.',
    });

    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [{ name: 'web_search', description: '', inputSchema: {} }],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
      },
      'Create a website monitoring digest workflow'
    );

    expect(result.status).toBe('ready');
    expect(result.balCode).toContain('chain {');
    expect(result.balCode).toContain('website_monitor');
    const parsed = parseBalCode(result.balCode);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.entities.length).toBeGreaterThanOrEqual(2);
  });

  it('emits progress milestones and normalized segment highlights', async () => {
    const { runCreatorDiscovery, runCreatorBot } = await import('../internal-bb/runner');
    vi.mocked(runCreatorDiscovery).mockImplementation(
      async (
        _prompt: string,
        options?: Parameters<typeof runCreatorDiscovery>[1]
      ) => {
        options?.onSegment?.({
          type: 'reasoning',
          content: 'Reviewing discovery context',
        });
        return {
          needsMoreInfo: false,
          message: 'Discovery complete',
          questions: [],
          contextNotes: [],
        };
      }
    );
    vi.mocked(runCreatorBot).mockImplementation(
      async (
        _prompt: string,
        options?: Parameters<typeof runCreatorBot>[1]
      ) => {
        options?.onSegment?.({
          type: 'tool_execution_start',
          toolName: 'web_search',
          arguments: { query: 'test' },
          id: 'tool-run-1',
        });
        options?.onSegment?.({
          type: 'tool_execution_output',
          toolName: 'web_search',
          result: { ok: true },
          id: 'tool-run-1',
        });
        return {
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
          description: 'test',
          icon: '🤖',
          status: 'ready',
          message: 'Created test bot',
        };
      }
    );

    const progressEvents: Array<{
      phase: string;
      message: string;
      highlightType?: string;
    }> = [];

    const result = await processCreatorMessage(
      {
        context: {
          workspaceId: 'ws-1',
          availableTools: [],
          existingBaleybots: [],
          workspacePolicies: null,
          connections: [],
        },
        onProgress: (event) => {
          progressEvents.push({
            phase: event.phase,
            message: event.message,
            highlightType: event.highlightType,
          });
        },
      },
      'Create a bot that searches the web'
    );

    expect(result.status).toBe('ready');
    expect(progressEvents.some((event) => event.phase === 'discovery')).toBe(true);
    expect(progressEvents.some((event) => event.highlightType === 'thinking')).toBe(true);
    expect(progressEvents.some((event) => event.highlightType === 'tool')).toBe(true);
  });
});
