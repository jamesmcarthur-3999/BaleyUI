/**
 * Test Fixtures
 *
 * Pre-built test data for use in tests. All IDs are deterministic
 * for predictable test behavior.
 */

import type {
  Workspace,
  Connection,
  Block,
  Tool,
} from '@baleyui/db/types';

// ============================================================================
// Workspaces
// ============================================================================

export const fixtures = {
  workspaces: {
    default: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Workspace',
      slug: 'test-workspace',
      ownerId: 'user_test123',
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } satisfies Workspace,
  },

  connections: {
    openai: {
      id: '00000000-0000-0000-0000-000000000010',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      type: 'openai',
      name: 'OpenAI Production',
      config: { apiKey: 'encrypted:sk-test-key' },
      isDefault: true,
      status: 'connected',
      availableModels: null,
      lastCheckedAt: new Date('2024-01-01'),
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } satisfies Connection,

    anthropic: {
      id: '00000000-0000-0000-0000-000000000011',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      type: 'anthropic',
      name: 'Anthropic',
      config: { apiKey: 'encrypted:sk-ant-test-key' },
      isDefault: false,
      status: 'connected',
      availableModels: null,
      lastCheckedAt: new Date('2024-01-01'),
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } satisfies Connection,

    ollama: {
      id: '00000000-0000-0000-0000-000000000012',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      type: 'ollama',
      name: 'Local Ollama',
      config: { baseUrl: 'http://localhost:11434' },
      isDefault: false,
      status: 'connected',
      availableModels: ['llama3.2:latest', 'mistral:7b'],
      lastCheckedAt: new Date('2024-01-01'),
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } satisfies Connection,
  },

  blocks: {
    sentimentAnalyzer: {
      id: '00000000-0000-0000-0000-000000000100',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      type: 'ai',
      name: 'Sentiment Analyzer',
      description: 'Analyzes sentiment of text',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to analyze' },
        },
        required: ['text'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['sentiment', 'confidence'],
      },
      connectionId: '00000000-0000-0000-0000-000000000010',
      model: 'gpt-4o-mini',
      goal: 'Analyze the sentiment of the provided text and return structured output.',
      systemPrompt: null,
      temperature: '0.3',
      maxTokens: 500,
      maxToolIterations: 25,
      code: null,
      routerConfig: null,
      loopConfig: null,
      toolIds: [],
      executionCount: 150,
      avgLatencyMs: 450,
      lastExecutedAt: new Date('2024-01-15'),
      executionMode: 'ai_only',
      generatedCode: null,
      codeGeneratedAt: null,
      codeAccuracy: null,
      hybridThreshold: null,
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } satisfies Block,

    calculator: {
      id: '00000000-0000-0000-0000-000000000101',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      type: 'ai',
      name: 'Calculator Bot',
      description: 'Performs mathematical calculations',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Math question to answer' },
        },
        required: ['question'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          answer: { type: 'number' },
          explanation: { type: 'string' },
        },
        required: ['answer', 'explanation'],
      },
      connectionId: '00000000-0000-0000-0000-000000000010',
      model: 'gpt-4o-mini',
      goal: 'Use the provided tools to solve mathematical problems.',
      systemPrompt: null,
      temperature: '0',
      maxTokens: 1000,
      maxToolIterations: 10,
      code: null,
      routerConfig: null,
      loopConfig: null,
      toolIds: ['00000000-0000-0000-0000-000000001000', '00000000-0000-0000-0000-000000001001'],
      executionCount: 75,
      avgLatencyMs: 800,
      lastExecutedAt: new Date('2024-01-14'),
      executionMode: 'ai_only',
      generatedCode: null,
      codeGeneratedAt: null,
      codeAccuracy: null,
      hybridThreshold: null,
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
    } satisfies Block,

    formatter: {
      id: '00000000-0000-0000-0000-000000000102',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      type: 'function',
      name: 'JSON Formatter',
      description: 'Formats JSON with indentation',
      inputSchema: {
        type: 'object',
        properties: {
          json: { type: 'string', description: 'JSON string to format' },
          indent: { type: 'number', default: 2 },
        },
        required: ['json'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          formatted: { type: 'string' },
        },
        required: ['formatted'],
      },
      connectionId: null,
      model: null,
      goal: null,
      systemPrompt: null,
      temperature: null,
      maxTokens: null,
      maxToolIterations: null,
      code: `
const parsed = JSON.parse(input.json);
return { formatted: JSON.stringify(parsed, null, input.indent ?? 2) };
      `.trim(),
      routerConfig: null,
      loopConfig: null,
      toolIds: [],
      executionCount: 200,
      avgLatencyMs: 5,
      lastExecutedAt: new Date('2024-01-15'),
      executionMode: 'code_only',
      generatedCode: null,
      codeGeneratedAt: null,
      codeAccuracy: null,
      hybridThreshold: null,
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
    } satisfies Block,
  },

  tools: {
    add: {
      id: '00000000-0000-0000-0000-000000001000',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      name: 'add',
      description: 'Add two numbers together',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' },
        },
        required: ['a', 'b'],
      },
      code: 'return input.a + input.b;',
      connectionId: null,
      isGenerated: false,
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } satisfies Tool,

    multiply: {
      id: '00000000-0000-0000-0000-000000001001',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      name: 'multiply',
      description: 'Multiply two numbers together',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' },
        },
        required: ['a', 'b'],
      },
      code: 'return input.a * input.b;',
      connectionId: null,
      isGenerated: false,
      version: 1,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } satisfies Tool,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all fixtures as a flat structure for seeding
 */
export function getAllFixtures() {
  return {
    workspaces: Object.values(fixtures.workspaces),
    connections: Object.values(fixtures.connections),
    blocks: Object.values(fixtures.blocks),
    tools: Object.values(fixtures.tools),
  };
}

/**
 * Create a variant of a fixture with overrides
 */
export function createFixture<T extends object>(
  base: T,
  overrides: Partial<T>
): T {
  return { ...base, ...overrides };
}
