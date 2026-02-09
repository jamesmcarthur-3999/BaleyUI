import { z } from 'zod';
import {
  executeInternalBaleybot,
  type InternalExecutionOptions,
} from '../internal-baleybots';
import { createLogger } from '@/lib/logger';
import { creatorOutputSchema } from '../creator-types';

const log = createLogger('internal-bb-runner');

type FallbackMode = 'throw' | 'value';

export interface InternalBBRunOptions<T> extends InternalExecutionOptions {
  fallbackMode?: FallbackMode;
  fallbackValue?: T;
  repairAttempts?: number;
}

function summarizeOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output.slice(0, 500);
  }
  try {
    return JSON.stringify(output).slice(0, 500);
  } catch {
    return String(output).slice(0, 500);
  }
}

function normalizeOutputCandidate(output: unknown): unknown {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return output;
  }

  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (!trimmed) return output;

    const looksLikeJsonObject = trimmed.startsWith('{') && trimmed.endsWith('}');
    const looksLikeJsonArray = trimmed.startsWith('[') && trimmed.endsWith(']');

    if (looksLikeJsonObject || looksLikeJsonArray) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return output;
      }
    }
  }

  return output;
}

function parseAgainstSchema<T>(
  schema: z.ZodType<T>,
  output: unknown
): {
  success: true;
  data: T;
  normalizedOutput: unknown;
} | {
  success: false;
  issues: z.ZodIssue[];
  normalizedOutput: unknown;
} {
  const normalized = normalizeOutputCandidate(output);
  const parsed = schema.safeParse(normalized);

  if (parsed.success) {
    return {
      success: true,
      data: parsed.data,
      normalizedOutput: normalized,
    };
  }

  return {
    success: false,
    issues: parsed.error.issues,
    normalizedOutput: normalized,
  };
}

function formatRepairPrompt(args: {
  botName: string;
  originalInput: string;
  previousOutput: unknown;
  issues: z.ZodIssue[];
}): string {
  const issueSummary = args.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');

  return [
    `Repair your previous ${args.botName} output so it matches your output contract exactly.`,
    'Return only one valid JSON object and nothing else.',
    '',
    'Original request:',
    args.originalInput,
    '',
    'Validation issues to fix:',
    issueSummary || '(unknown validation issue)',
    '',
    'Previous output preview:',
    summarizeOutput(args.previousOutput),
  ].join('\n');
}

async function runInternalBB<T>(args: {
  botName: string;
  input: string;
  schema: z.ZodType<T>;
  options?: InternalBBRunOptions<T>;
}): Promise<T> {
  const { botName, input, schema, options } = args;
  const {
    fallbackMode = 'throw',
    fallbackValue,
    repairAttempts = 1,
    ...executionOptions
  } = options ?? {};

  try {
    let { output } = await executeInternalBaleybot(botName, input, executionOptions);
    let parsed = parseAgainstSchema(schema, output);

    if (parsed.success) {
      return parsed.data;
    }

    log.warn('Internal BB output parse failed', {
      botName,
      issues: parsed.issues,
      outputType: typeof output,
      outputPreview: summarizeOutput(output),
    });

    const maxRepairAttempts = Math.max(0, repairAttempts);
    for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
      const repairPrompt = formatRepairPrompt({
        botName,
        originalInput: input,
        previousOutput: parsed.normalizedOutput,
        issues: parsed.issues,
      });

      const repaired = await executeInternalBaleybot(
        botName,
        repairPrompt,
        executionOptions
      );
      output = repaired.output;
      parsed = parseAgainstSchema(schema, output);

      if (parsed.success) {
        log.info('Internal BB output repaired successfully', {
          botName,
          attempt,
        });
        return parsed.data;
      }

      log.warn('Internal BB output repair attempt failed', {
        botName,
        attempt,
        issues: parsed.issues,
        outputPreview: summarizeOutput(output),
      });
    }

    if (fallbackMode === 'value' && fallbackValue !== undefined) {
      return fallbackValue;
    }

    const issueSummary = parsed.issues
      .slice(0, 6)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new Error(`${botName} returned malformed output: ${issueSummary}`);
  } catch (error) {
    if (fallbackMode === 'value' && fallbackValue !== undefined) {
      log.warn('Internal BB execution failed, using fallback value', {
        botName,
        error: error instanceof Error ? error.message : String(error),
      });
      return fallbackValue;
    }

    throw error;
  }
}

const discoveryQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().optional(),
  requiredNow: z.boolean().optional(),
});

export const creatorDiscoveryOutputSchema = z.object({
  needsMoreInfo: z.boolean(),
  message: z.string().optional(),
  questions: z.array(discoveryQuestionSchema).max(8).default([]),
  contextNotes: z.array(z.string()).max(16).default([]),
});

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

const webSearchResultSchema = z
  .object({
    title: z.string().default(''),
    url: z.string().default(''),
    snippet: z.string().optional(),
    content: z.string().optional(),
  })
  .transform((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.snippet ?? result.content ?? '',
  }));

export const webSearchFallbackOutputSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return { results: value };
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.results) && Array.isArray(record.searchResults)) {
      return {
        ...record,
        results: record.searchResults,
      };
    }
  }

  return value;
}, z.object({
  results: z.array(webSearchResultSchema),
}));

export const toolExecutorOutputSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { success: true, text: value } : value),
  z.object({
    success: z.boolean().optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    text: z.string().optional(),
  })
);

export type CreatorDiscoveryOutput = z.infer<typeof creatorDiscoveryOutputSchema>;
export type CreatorActionAdvisorOutput = z.infer<typeof creatorActionAdvisorOutputSchema>;
export type TestGeneratorOutput = z.infer<typeof testGeneratorOutputSchema>;
export type ConnectionAdvisorOutput = z.infer<typeof connectionAdvisorOutputSchema>;
export type TestValidatorOutput = z.infer<typeof testValidatorOutputSchema>;
export type TestResultsAnalyzerOutput = z.infer<typeof testResultsAnalyzerOutputSchema>;
export type DeploymentAdvisorOutput = z.infer<typeof deploymentAdvisorOutputSchema>;
export type BalGeneratorOutput = z.infer<typeof balGeneratorOutputSchema>;
export type PatternLearnerOutput = z.infer<typeof patternLearnerOutputSchema>;
export type ExecutionReviewerOutput = z.infer<typeof executionReviewerOutputSchema>;
export type WebSearchFallbackOutput = z.infer<typeof webSearchFallbackOutputSchema>;
export type ToolExecutorOutput = z.infer<typeof toolExecutorOutputSchema>;

export async function runCreatorDiscovery(
  input: string,
  options?: InternalBBRunOptions<CreatorDiscoveryOutput>
): Promise<CreatorDiscoveryOutput> {
  return runInternalBB({
    botName: 'creator_discovery',
    input,
    schema: creatorDiscoveryOutputSchema,
    options,
  });
}

export async function runCreatorBot(
  input: string,
  options?: InternalBBRunOptions<z.infer<typeof creatorOutputSchema>>
): Promise<z.infer<typeof creatorOutputSchema>> {
  return runInternalBB({
    botName: 'creator_bot',
    input,
    schema: creatorOutputSchema,
    options,
  });
}

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

export async function runWebSearchFallback(
  input: string,
  options?: InternalBBRunOptions<WebSearchFallbackOutput>
): Promise<WebSearchFallbackOutput> {
  return runInternalBB({
    botName: 'web_search_fallback',
    input,
    schema: webSearchFallbackOutputSchema,
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
