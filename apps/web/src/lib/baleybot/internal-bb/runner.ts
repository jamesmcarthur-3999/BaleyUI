import { z } from 'zod';
import {
  executeInternalBaleybot,
  type InternalExecutionOptions,
} from '../internal-baleybots';
import { createLogger } from '@/lib/logger';
import { creatorOutputSchema } from '../creator-types';

const log = createLogger('internal-bb-runner');

type FallbackMode = 'throw' | 'value';

interface InternalBBRunOptions<T> extends InternalExecutionOptions {
  fallbackMode?: FallbackMode;
  fallbackValue?: T;
}

async function runInternalBB<T>(args: {
  botName: string;
  input: string;
  schema: z.ZodType<T>;
  options?: InternalBBRunOptions<T>;
}): Promise<T> {
  const { botName, input, schema, options } = args;
  const { fallbackMode = 'throw', fallbackValue, ...executionOptions } = options ?? {};

  try {
    const { output } = await executeInternalBaleybot(botName, input, executionOptions);
    const parsed = schema.safeParse(output);

    if (parsed.success) {
      return parsed.data;
    }

    log.warn('Internal BB output parse failed', {
      botName,
      issues: parsed.error.issues,
      outputType: typeof output,
      outputPreview:
        typeof output === 'string'
          ? output.slice(0, 400)
          : JSON.stringify(output).slice(0, 400),
    });

    if (fallbackMode === 'value' && fallbackValue !== undefined) {
      return fallbackValue;
    }

    throw new Error(`${botName} returned malformed output`);
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

export const creatorActionAdvisorOutputSchema = z.object({
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
});

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
