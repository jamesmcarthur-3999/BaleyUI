import { z } from 'zod';
import {
  executeInternalBaleybot,
  type InternalExecutionOptions,
} from '../internal-baleybots';
import {
  runWithContractGateway,
  type FallbackMode,
} from './contract-gateway';
export { normalizeOutputCandidate } from './contract-gateway';

export interface InternalBBRunOptions<T> extends InternalExecutionOptions {
  fallbackMode?: FallbackMode;
  fallbackValue?: T;
  repairAttempts?: number;
}

async function runInternalBB<T>(args: {
  botName: string;
  input: string;
  schema: z.ZodType<T>;
  options?: InternalBBRunOptions<T>;
}): Promise<T> {
  const { botName, input, schema, options } = args;
  const { fallbackMode, fallbackValue, repairAttempts = 1, ...executionOptions } = options ?? {};

  return runWithContractGateway({
    botName,
    input,
    schema,
    execute: executeInternalBaleybot,
    executionOptions,
    fallbackMode,
    fallbackValue,
    repairAttempts,
  });
}

function normalizeCreatorActionLabel(prompt: string): string {
  const compact = prompt
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length === 0) return 'Suggested action';
  if (compact.length <= 42) return compact;
  return `${compact.slice(0, 39).trimEnd()}...`;
}

export const creatorActionAdvisorOutputSchema = z.preprocess((value) => {
  const normalizeAction = (
    entry: unknown,
    index: number
  ): {
    label: string;
    prompt: string;
    mode?: 'send' | 'insert';
    reason?: string;
    priority?: number;
  } | null => {
    if (typeof entry === 'string') {
      const prompt = entry.trim();
      if (!prompt) return null;
      return {
        label: normalizeCreatorActionLabel(prompt),
        prompt,
        mode: 'send',
        priority: Math.min(index + 1, 5),
      };
    }

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return null;
    }

    const record = entry as Record<string, unknown>;
    const promptCandidate =
      typeof record.prompt === 'string'
        ? record.prompt
        : typeof record.action === 'string'
          ? record.action
          : typeof record.text === 'string'
            ? record.text
            : '';
    const prompt = promptCandidate.trim();
    if (!prompt) return null;

    const labelCandidate =
      typeof record.label === 'string'
        ? record.label
        : typeof record.title === 'string'
          ? record.title
          : normalizeCreatorActionLabel(prompt);
    const label = labelCandidate.trim() || normalizeCreatorActionLabel(prompt);

    return {
      label,
      prompt,
      mode: record.mode === 'insert' ? 'insert' : 'send',
      reason:
        typeof record.reason === 'string' && record.reason.trim().length > 0
          ? record.reason.trim()
          : undefined,
      priority:
        typeof record.priority === 'number' && Number.isFinite(record.priority)
          ? Math.max(1, Math.min(5, Math.round(record.priority)))
          : undefined,
    };
  };

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry, index) => normalizeAction(entry, index))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return {
      actions: normalized,
    };
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const rawActions = Array.isArray(record.actions) ? record.actions : [];
  const normalizedActions = rawActions
    .map((entry, index) => normalizeAction(entry, index))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    ...record,
    actions: normalizedActions,
  };
}, z.object({
  actions: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        prompt: z.string().min(1).max(2000),
        mode: z.enum(['send', 'insert']).optional(),
        reason: z.string().max(300).optional(),
        priority: z.number().int().min(1).max(5).optional(),
      })
    )
    .max(3)
    .default([]),
}));

const testCaseSchema = z.object({
  name: z.string(),
  level: z.enum(['unit', 'integration', 'e2e']),
  input: z.union([z.string(), z.record(z.string(), z.unknown())]),
  inputType: z.enum(['text', 'structured', 'fixture']).optional(),
  expectedOutput: z.string().optional(),
  matchStrategy: z.enum(['exact', 'contains', 'semantic', 'schema', 'structured']).optional(),
  description: z.string().optional(),
  fixtures: z
    .array(
      z.object({
        key: z.string(),
        value: z.unknown(),
        ttlSeconds: z.number().optional(),
        description: z.string().optional(),
      })
    )
    .optional(),
  expectedSteps: z
    .array(
      z.object({
        entityName: z.string(),
        expectation: z.string(),
      })
    )
    .optional(),
});

export const testGeneratorOutputSchema = z.object({
  tests: z.array(testCaseSchema),
  topology: z.string().optional(),
  topologyDescription: z.string().optional(),
  strategy: z.string().optional(),
});

export const connectionAdvisorOutputSchema = z.object({
  analysis: z
    .object({
      aiProvider: z
        .object({
          needed: z.boolean(),
          recommended: z.string().optional(),
          reason: z.string(),
        })
        .optional(),
      databases: z
        .array(
          z.object({
            type: z.string(),
            tools: z.array(z.string()),
            configHints: z.string().optional(),
          })
        )
        .optional(),
      external: z
        .array(
          z.object({
            service: z.string(),
            reason: z.string(),
          })
        )
        .optional(),
    })
    .optional(),
  recommendations: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  remediationSteps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        actionType: z.string().optional(),
        target: z.string().optional(),
      })
    )
    .optional(),
  verificationPlan: z
    .array(
      z.object({
        target: z.string(),
        method: z.string(),
        expected: z.string().optional(),
      })
    )
    .optional(),
});

export const testValidatorOutputSchema = z.object({
  passed: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestions: z.array(z.string()).optional(),
});

export const testResultsAnalyzerOutputSchema = z.object({
  overallStatus: z.enum(['passed', 'mixed', 'failed']),
  summary: z.string(),
  passRate: z.number().min(0).max(1),
  topology: z.string().optional(),
  patterns: z
    .array(
      z.object({
        type: z.string(),
        description: z.string(),
        affectedTests: z.array(z.string()),
        suggestedFix: z.string(),
      })
    )
    .optional(),
  botImprovements: z
    .array(
      z.object({
        type: z.enum(['prompt', 'tool', 'model', 'structure']),
        title: z.string(),
        description: z.string(),
        impact: z.enum(['high', 'medium', 'low']),
      })
    )
    .optional(),
  pipelineInsights: z
    .array(
      z.object({
        entityName: z.string(),
        likelyIssue: z.string().optional(),
        suggestedFix: z.string().optional(),
      })
    )
    .optional(),
  nextSteps: z.array(z.string()).optional(),
});

export const deploymentAdvisorOutputSchema = z.object({
  triggerRecommendations: z
    .array(
      z.object({
        type: z.enum(['manual', 'schedule', 'webhook', 'other_bb', 'db_event', 'mcp_event']),
        reason: z.string(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
  monitoringAdvice: z
    .object({
      alertsToSet: z.array(z.string()).optional(),
      metricsToWatch: z.array(z.string()).optional(),
    })
    .optional(),
  readinessGaps: z.array(z.string()).optional(),
  productionChecklist: z.array(z.string()).optional(),
});

const balGeneratorEntitySchema = z.object({
  name: z.string().catch('unnamed'),
  goal: z.string().catch(''),
  model: z.string().optional().catch(undefined),
  tools: z.array(z.string()).catch([]),
  canRequest: z.array(z.string()).optional().catch([]),
  output: z.record(z.string(), z.string()).optional().catch(undefined),
  history: z.enum(['none', 'inherit']).optional().catch(undefined),
}).passthrough();

export const balGeneratorOutputSchema = z.object({
  balCode: z.string(),
  explanation: z.string().catch(''),
  entities: z.array(balGeneratorEntitySchema).catch([]),
  toolRationale: z.record(z.string(), z.string()).catch({}),
  suggestedName: z.string().catch('Unnamed BaleyBot'),
  suggestedIcon: z.string().catch('🤖'),
});

const patternSuggestionSchema = z.object({
  tool: z.string(),
  actionPattern: z.record(z.string(), z.unknown()),
  entityGoalPattern: z.string().nullable(),
  trustLevel: z.enum(['provisional', 'trusted', 'permanent']),
  explanation: z.string(),
  riskAssessment: z.enum(['low', 'medium', 'high']),
  suggestedExpirationDays: z.number().nullable(),
});

export const patternLearnerOutputSchema = z.object({
  suggestions: z.array(patternSuggestionSchema).catch([]),
  warnings: z.array(z.string()).catch([]),
  recommendations: z.array(z.string()).catch([]),
});

const executionReviewIssueSchema = z.object({
  id: z.string().optional(),
  severity: z.enum(['error', 'warning', 'suggestion']).optional(),
  category: z.enum(['accuracy', 'completeness', 'performance', 'safety', 'clarity', 'efficiency']).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  affectedEntity: z.string().optional(),
  suggestedFix: z.string().optional(),
}).passthrough();

const executionReviewSuggestionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['bal_change', 'tool_config', 'prompt_improvement', 'workflow_change']).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  impact: z.enum(['high', 'medium', 'low']).optional(),
  balCodeChange: z.object({
    original: z.string().optional(),
    proposed: z.string().optional(),
    entityName: z.string().optional(),
  }).passthrough().optional(),
  reasoning: z.string().optional(),
}).passthrough();

export const executionReviewerOutputSchema = z.object({
  overallAssessment: z.enum(['excellent', 'good', 'needs_improvement', 'failed']).catch('needs_improvement'),
  summary: z.string().catch('No summary available'),
  issues: z.array(executionReviewIssueSchema).catch([]),
  suggestions: z.array(executionReviewSuggestionSchema).catch([]),
  metrics: z.object({
    outputQualityScore: z.number(),
    intentAlignmentScore: z.number(),
    efficiencyScore: z.number(),
  }).optional(),
}).passthrough();

export const nlToSqlOutputSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { sql: value } : value),
  z.object({
    sql: z.string(),
  })
);

export const toolExecutorOutputSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { success: true, text: value } : value),
  z.object({
    success: z.boolean().optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    text: z.string().optional(),
  })
);

// Context Processor — extracts structured context from raw content
const contextProcessorEntrySchema = z.object({
  key: z.string().min(1).catch('Untitled'),
  value: z.string().min(1).catch(''),
  category: z.string().min(1).catch('general'),
  description: z.string().catch(''),
}).passthrough();

export const contextProcessorOutputSchema = z.object({
  entries: z.array(contextProcessorEntrySchema).catch([]),
  summary: z.string().catch(''),
  skippedReasons: z.array(z.string()).catch([]),
});

export const testInterfaceDesignerOutputSchema = z.object({
  mode: z.enum(['chat', 'form', 'hybrid', 'file', 'webhook']).catch('chat'),
  components: z.array(z.object({
    type: z.string(),
    id: z.string(),
    label: z.string(),
    props: z.record(z.string(), z.unknown()).optional(),
  })).min(1).catch([
    { type: 'chat_input', id: 'fallback-chat', label: 'Test Input' },
    { type: 'result_view', id: 'fallback-result', label: 'Result' },
  ]),
  testSuggestions: z.array(z.string()).catch([]),
  rationale: z.string().catch(''),
});

export type TestInterfaceDesignerOutput = z.infer<typeof testInterfaceDesignerOutputSchema>;

export type CreatorActionAdvisorOutput = z.infer<typeof creatorActionAdvisorOutputSchema>;
export type TestGeneratorOutput = z.infer<typeof testGeneratorOutputSchema>;
export type ConnectionAdvisorOutput = z.infer<typeof connectionAdvisorOutputSchema>;
export type TestValidatorOutput = z.infer<typeof testValidatorOutputSchema>;
export type TestResultsAnalyzerOutput = z.infer<typeof testResultsAnalyzerOutputSchema>;
export type DeploymentAdvisorOutput = z.infer<typeof deploymentAdvisorOutputSchema>;
export type BalGeneratorOutput = z.infer<typeof balGeneratorOutputSchema>;
export type PatternLearnerOutput = z.infer<typeof patternLearnerOutputSchema>;
export type ExecutionReviewerOutput = z.infer<typeof executionReviewerOutputSchema>;
export type ToolExecutorOutput = z.infer<typeof toolExecutorOutputSchema>;
export type ContextProcessorOutput = z.infer<typeof contextProcessorOutputSchema>;

export async function runCreatorActionAdvisor(
  input: string,
  options?: InternalBBRunOptions<CreatorActionAdvisorOutput>
): Promise<CreatorActionAdvisorOutput> {
  return runInternalBB({
    botName: 'creator_action_advisor',
    input,
    schema: creatorActionAdvisorOutputSchema,
    options,
  });
}

export async function runTestOrchestrator(
  input: string,
  options?: InternalBBRunOptions<TestGeneratorOutput>
): Promise<TestGeneratorOutput> {
  return runInternalBB({
    botName: 'test_orchestrator',
    input,
    schema: testGeneratorOutputSchema,
    options,
  });
}

export async function runTestGenerator(
  input: string,
  options?: InternalBBRunOptions<TestGeneratorOutput>
): Promise<TestGeneratorOutput> {
  return runInternalBB({
    botName: 'test_generator',
    input,
    schema: testGeneratorOutputSchema,
    options,
  });
}

export async function runConnectionAdvisor(
  input: string,
  options?: InternalBBRunOptions<ConnectionAdvisorOutput>
): Promise<ConnectionAdvisorOutput> {
  return runInternalBB({
    botName: 'connection_advisor',
    input,
    schema: connectionAdvisorOutputSchema,
    options,
  });
}

export async function runTestValidator(
  input: string,
  options?: InternalBBRunOptions<TestValidatorOutput>
): Promise<TestValidatorOutput> {
  return runInternalBB({
    botName: 'test_validator',
    input,
    schema: testValidatorOutputSchema,
    options,
  });
}

export async function runTestResultsAnalyzer(
  input: string,
  options?: InternalBBRunOptions<TestResultsAnalyzerOutput>
): Promise<TestResultsAnalyzerOutput> {
  return runInternalBB({
    botName: 'test_results_analyzer',
    input,
    schema: testResultsAnalyzerOutputSchema,
    options,
  });
}

export async function runDeploymentAdvisor(
  input: string,
  options?: InternalBBRunOptions<DeploymentAdvisorOutput>
): Promise<DeploymentAdvisorOutput> {
  return runInternalBB({
    botName: 'deployment_advisor',
    input,
    schema: deploymentAdvisorOutputSchema,
    options,
  });
}

export async function runBalGenerator(
  input: string,
  options?: InternalBBRunOptions<BalGeneratorOutput>
): Promise<BalGeneratorOutput> {
  return runInternalBB({
    botName: 'bal_generator',
    input,
    schema: balGeneratorOutputSchema,
    options,
  });
}

export async function runPatternLearner(
  input: string,
  options?: InternalBBRunOptions<PatternLearnerOutput>
): Promise<PatternLearnerOutput> {
  return runInternalBB({
    botName: 'pattern_learner',
    input,
    schema: patternLearnerOutputSchema,
    options,
  });
}

export async function runExecutionReviewer(
  input: string,
  options?: InternalBBRunOptions<ExecutionReviewerOutput>
): Promise<ExecutionReviewerOutput> {
  return runInternalBB({
    botName: 'execution_reviewer',
    input,
    schema: executionReviewerOutputSchema,
    options,
  });
}

export async function runNlToSql(
  databaseType: 'postgres' | 'mysql',
  input: string,
  options?: InternalBBRunOptions<z.infer<typeof nlToSqlOutputSchema>>
): Promise<z.infer<typeof nlToSqlOutputSchema>> {
  return runInternalBB({
    botName: databaseType === 'mysql' ? 'nl_to_sql_mysql' : 'nl_to_sql_postgres',
    input,
    schema: nlToSqlOutputSchema,
    options,
  });
}

export async function runToolExecutor(
  input: string,
  options?: InternalBBRunOptions<ToolExecutorOutput>
): Promise<ToolExecutorOutput> {
  return runInternalBB({
    botName: 'tool_executor',
    input,
    schema: toolExecutorOutputSchema,
    options,
  });
}

export async function runContextProcessor(
  input: string,
  options?: InternalBBRunOptions<ContextProcessorOutput>
): Promise<ContextProcessorOutput> {
  return runInternalBB({
    botName: 'context_processor',
    input,
    schema: contextProcessorOutputSchema,
    options,
  });
}

// Design System — analyzer, generator, refiner
const designColorEntrySchema = z.object({
  hex: z.string().catch('#000000'),
  hsl: z.string().catch('0 0% 0%'),
  role: z.string().catch('primary'),
}).passthrough();

export const designAnalyzerOutputSchema = z.object({
  colors: z.array(designColorEntrySchema).catch([]),
  typography: z.object({
    primaryFont: z.string().catch('Inter'),
    fontUrl: z.string().optional(),
    scale: z.string().optional(),
    weights: z.array(z.string()).optional(),
  }).passthrough().catch({ primaryFont: 'Inter' }),
  spacing: z.object({
    borderRadius: z.string().catch('0.75rem'),
    density: z.enum(['compact', 'normal', 'relaxed']).optional(),
  }).passthrough().catch({ borderRadius: '0.75rem' }),
  mood: z.enum(['playful', 'professional', 'minimal', 'elegant', 'bold']).catch('professional'),
  confidence: z.number().min(0).max(1).catch(0.5),
  recommendations: z.array(z.string()).catch([]),
});

const colorPaletteSchema = z.object({
  background: z.string(),
  foreground: z.string(),
  card: z.string(),
  cardForeground: z.string(),
  primary: z.string(),
  primaryForeground: z.string(),
  secondary: z.string(),
  secondaryForeground: z.string(),
  muted: z.string(),
  mutedForeground: z.string(),
  accent: z.string(),
  accentForeground: z.string(),
  destructive: z.string(),
  destructiveForeground: z.string(),
  border: z.string(),
  input: z.string(),
  ring: z.string(),
  success: z.string(),
  warning: z.string(),
  error: z.string(),
  info: z.string(),
}).passthrough();

export const designGeneratorOutputSchema = z.object({
  colors: z.object({
    light: colorPaletteSchema,
    dark: colorPaletteSchema,
  }),
  typography: z.object({
    fontFamily: z.string().catch('Inter, sans-serif'),
    fontFamilyHeading: z.string().optional(),
    googleFontsUrl: z.string().optional(),
  }).passthrough(),
  borderRadius: z.string().catch('0.75rem'),
  mood: z.enum(['playful', 'professional', 'minimal', 'elegant', 'bold']).catch('professional'),
  animationStyle: z.enum(['playful', 'professional', 'minimal']).catch('professional'),
  suggestedName: z.string().catch('Custom Design'),
});

export const designRefinerOutputSchema = designGeneratorOutputSchema;

export type DesignAnalyzerOutput = z.infer<typeof designAnalyzerOutputSchema>;
export type DesignGeneratorOutput = z.infer<typeof designGeneratorOutputSchema>;
export type DesignRefinerOutput = z.infer<typeof designRefinerOutputSchema>;

export async function runDesignAnalyzer(
  input: string,
  options?: InternalBBRunOptions<DesignAnalyzerOutput>
): Promise<DesignAnalyzerOutput> {
  return runInternalBB({
    botName: 'design_analyzer',
    input,
    schema: designAnalyzerOutputSchema,
    options,
  });
}

export async function runDesignGenerator(
  input: string,
  options?: InternalBBRunOptions<DesignGeneratorOutput>
): Promise<DesignGeneratorOutput> {
  return runInternalBB({
    botName: 'design_generator',
    input,
    schema: designGeneratorOutputSchema,
    options,
  });
}

export async function runDesignRefiner(
  input: string,
  options?: InternalBBRunOptions<DesignRefinerOutput>
): Promise<DesignRefinerOutput> {
  return runInternalBB({
    botName: 'design_refiner',
    input,
    schema: designRefinerOutputSchema,
    options,
  });
}

export async function runTestInterfaceDesigner(
  input: string,
  options?: InternalBBRunOptions<TestInterfaceDesignerOutput>
): Promise<TestInterfaceDesignerOutput> {
  return runInternalBB({
    botName: 'test_interface_designer',
    input,
    schema: testInterfaceDesignerOutputSchema,
    options: {
      fallbackMode: 'value',
      fallbackValue: {
        mode: 'chat' as const,
        components: [
          { type: 'chat_input', id: 'fallback-chat', label: 'Test Input' },
          { type: 'result_view', id: 'fallback-result', label: 'Result' },
        ],
        testSuggestions: [],
        rationale: 'Fallback: AI-driven design unavailable',
      },
      ...options,
    },
  });
}
