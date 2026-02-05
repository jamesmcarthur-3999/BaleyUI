/**
 * Internal BaleyBots Service
 *
 * Defines and manages internal BaleyBots that power the platform.
 * These are stored in the database with isInternal: true.
 */

import { db, baleybots, baleybotExecutions, eq, notDeleted } from '@baleyui/db';
import { getOrCreateSystemWorkspace } from '@/lib/system-workspace';
import { executeBaleybot, type ExecutorContext } from './executor';
import { createLogger } from '@/lib/logger';

const logger = createLogger('internal-baleybots');

// ============================================================================
// INTERNAL BALEYBOT DEFINITIONS (BAL CODE)
// ============================================================================

export interface InternalBaleybotDef {
  name: string;
  description: string;
  icon: string;
  balCode: string;
}

/**
 * All internal BaleyBot definitions.
 * These are seeded into the database on app startup.
 */
export const INTERNAL_BALEYBOTS: Record<string, InternalBaleybotDef> = {
  creator_bot: {
    name: 'creator_bot',
    description: 'Creates new BaleyBots from user descriptions through conversation',
    icon: '🤖',
    balCode: `
creator_bot {
  "goal": "You are a BaleyBot Creator. Help users build AI automation bots through natural conversation. Analyze their request, design entities with appropriate tools, and generate valid BAL code.\\n\\nCRITICAL: You MUST return a JSON object with this EXACT structure:\\n{\\n  \\\"entities\\\": [{\\\"id\\\": \\\"unique-id\\\", \\\"name\\\": \\\"Entity Name\\\", \\\"icon\\\": \\\"emoji\\\", \\\"purpose\\\": \\\"What it does\\\", \\\"tools\\\": [\\\"tool1\\\", \\\"tool2\\\"]}],\\n  \\\"connections\\\": [{\\\"from\\\": \\\"entity-id-1\\\", \\\"to\\\": \\\"entity-id-2\\\", \\\"label\\\": \\\"optional label\\\"}],\\n  \\\"balCode\\\": \\\"the_entity_name {\\\\n  \\\\\\\"goal\\\\\\\": \\\\\\\"...\\\\\\\",\\\\n  \\\\\\\"model\\\\\\\": \\\\\\\"openai:gpt-4o\\\\\\\"\\\\n}\\\",\\n  \\\"name\\\": \\\"BaleyBot Name\\\",\\n  \\\"icon\\\": \\\"emoji\\\",\\n  \\\"status\\\": \\\"ready\\\"\\n}\\n\\nRules:\\n- entities array must contain objects with id, name, icon, purpose, tools (array of strings)\\n- connections array contains objects with from, to (entity IDs), and optional label\\n- balCode must be valid BAL syntax\\n- status must be exactly \\\"building\\\" or \\\"ready\\\"\\n- Use \\\"ready\\\" when the design is complete, \\\"building\\\" if still gathering requirements\\n\\n***CRITICAL MULTI-ENTITY RULE***:\\nWhen you create 2+ entities with connections between them, the balCode MUST include a composition block (chain, parallel, or if/else). The visual canvas shows entities and connections, but the balCode is what actually executes. Example for a research pipeline:\\n\\nresearcher { \\\"goal\\\": \\\"Research the topic\\\", \\\"model\\\": \\\"openai:gpt-4o\\\" }\\nsummarizer { \\\"goal\\\": \\\"Summarize findings\\\", \\\"model\\\": \\\"openai:gpt-4o\\\" }\\nchain { researcher summarizer }\\n\\nThe chain block makes the entities execute in sequence. Without it, only the first entity runs!",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "entities": "array<object { id: string, name: string, icon: string, purpose: string, tools: array<string> }>",
    "connections": "array<object { from: string, to: string, label: ?string }>",
    "balCode": "string",
    "name": "string",
    "icon": "string",
    "status": "enum('building', 'ready')",
    "thinking": "?string"
  }
}
`,
  },

  bal_generator: {
    name: 'bal_generator',
    description: 'Converts natural language descriptions into BAL code',
    icon: '📝',
    balCode: `
bal_generator {
  "goal": "You are a BAL code generator. Convert user descriptions into valid BAL (Baleybots Assembly Language) code.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"balCode\\\": \\\"entity_name {\\\\n  \\\\\\\"goal\\\\\\\": \\\\\\\"...\\\\\\\",\\\\n  \\\\\\\"model\\\\\\\": \\\\\\\"openai:gpt-4o\\\\\\\"\\\\n}\\\",\\n  \\\"explanation\\\": \\\"Why this design was chosen\\\",\\n  \\\"entities\\\": [{\\\"name\\\": \\\"entity_name\\\", \\\"goal\\\": \\\"What it does\\\", \\\"model\\\": \\\"provider:model-id\\\", \\\"tools\\\": [\\\"tool1\\\"], \\\"canRequest\\\": [], \\\"output\\\": {\\\"field\\\": \\\"type\\\"}, \\\"history\\\": \\\"inherit\\\"}],\\n  \\\"toolRationale\\\": {\\\"tool_name\\\": \\\"Why this tool was included\\\"},\\n  \\\"suggestedName\\\": \\\"Human-readable name\\\",\\n  \\\"suggestedIcon\\\": \\\"emoji\\\"\\n}\\n\\nBAL v2 syntax rules:\\n- Entity: name { \\\"goal\\\": \\\"...\\\", \\\"model\\\": \\\"provider:model\\\", \\\"tools\\\": [...], \\\"output\\\": {...} }\\n- Compositions: chain { a b }, parallel { a b }, if (cond) { a } else { b }, loop (\\\"until\\\": cond, \\\"max\\\": 5) { a }\\n- Models: openai:gpt-4o, openai:gpt-4o-mini, anthropic:claude-sonnet-4-20250514, etc.\\n\\n***CRITICAL MULTI-ENTITY RULE***:\\nWhen you generate 2 or more entities, the balCode MUST include a composition block (chain, parallel, or if/else) that connects them. NEVER generate multiple entity definitions without a composition block. Example for 2 entities that run sequentially:\\n\\nresearcher { \\\"goal\\\": \\\"...\\\", \\\"model\\\": \\\"openai:gpt-4o\\\" }\\nsummarizer { \\\"goal\\\": \\\"...\\\", \\\"model\\\": \\\"openai:gpt-4o\\\" }\\nchain { researcher summarizer }\\n\\nWithout the chain block, only the first entity runs!",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "balCode": "string",
    "explanation": "string",
    "entities": "array<object { name: string, goal: string, model: ?string, tools: ?array<string>, canRequest: ?array<string>, output: ?object, history: ?string }>",
    "toolRationale": "object",
    "suggestedName": "string",
    "suggestedIcon": "string"
  }
}
`,
  },

  pattern_learner: {
    name: 'pattern_learner',
    description: 'Analyzes tool approvals and suggests patterns for auto-approval',
    icon: '🧠',
    balCode: `
pattern_learner {
  "goal": "You are an approval pattern learning assistant. Analyze tool call approvals and suggest safe patterns for auto-approval.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"suggestions\\\": [\\n    {\\n      \\\"tool\\\": \\\"tool_name\\\",\\n      \\\"actionPattern\\\": {\\\"paramName\\\": \\\"pattern or *\\\"},\\n      \\\"entityGoalPattern\\\": \\\"goal pattern or null\\\",\\n      \\\"trustLevel\\\": \\\"provisional|trusted|permanent\\\",\\n      \\\"explanation\\\": \\\"Why this pattern is safe\\\",\\n      \\\"riskAssessment\\\": \\\"low|medium|high\\\",\\n      \\\"suggestedExpirationDays\\\": 30\\n    }\\n  ],\\n  \\\"warnings\\\": [\\\"Warning message about risky patterns\\\"],\\n  \\\"recommendations\\\": [\\\"General recommendations for improving approval workflow\\\"]\\n}\\n\\nRules:\\n- trustLevel must be exactly: provisional, trusted, or permanent\\n- riskAssessment must be exactly: low, medium, or high\\n- suggestedExpirationDays can be null for permanent patterns\\n- entityGoalPattern can be null if pattern applies to all entities\\n- Use * as wildcard in actionPattern for any value",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "suggestions": "array<object { tool: string, actionPattern: object, entityGoalPattern: ?string, trustLevel: enum('provisional', 'trusted', 'permanent'), explanation: string, riskAssessment: enum('low', 'medium', 'high'), suggestedExpirationDays: ?number }>",
    "warnings": "array<string>",
    "recommendations": "array<string>"
  }
}
`,
  },

  execution_reviewer: {
    name: 'execution_reviewer',
    description: 'Reviews BaleyBot executions and suggests improvements',
    icon: '🔍',
    balCode: `
execution_reviewer {
  "goal": "You are a BaleyBot Review Agent. Analyze execution results against original intent.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"overallAssessment\\\": \\\"excellent|good|needs_improvement|failed\\\",\\n  \\\"summary\\\": \\\"Brief summary of the execution\\\",\\n  \\\"issues\\\": [\\n    {\\n      \\\"id\\\": \\\"issue-1\\\",\\n      \\\"severity\\\": \\\"error|warning|suggestion\\\",\\n      \\\"category\\\": \\\"accuracy|completeness|performance|safety|clarity|efficiency\\\",\\n      \\\"title\\\": \\\"Short issue title\\\",\\n      \\\"description\\\": \\\"Detailed description\\\",\\n      \\\"affectedEntity\\\": \\\"entity_name or null\\\",\\n      \\\"suggestedFix\\\": \\\"How to fix it or null\\\"\\n    }\\n  ],\\n  \\\"suggestions\\\": [\\n    {\\n      \\\"id\\\": \\\"sug-1\\\",\\n      \\\"type\\\": \\\"bal_change|tool_config|prompt_improvement|workflow_change\\\",\\n      \\\"title\\\": \\\"Short title\\\",\\n      \\\"description\\\": \\\"What to change\\\",\\n      \\\"impact\\\": \\\"high|medium|low\\\",\\n      \\\"reasoning\\\": \\\"Why this would help\\\"\\n    }\\n  ],\\n  \\\"metrics\\\": {\\n    \\\"outputQualityScore\\\": 85,\\n    \\\"intentAlignmentScore\\\": 90,\\n    \\\"efficiencyScore\\\": 75\\n  }\\n}\\n\\nRules:\\n- overallAssessment must be exactly: excellent, good, needs_improvement, or failed\\n- severity must be exactly: error, warning, or suggestion\\n- category must be exactly: accuracy, completeness, performance, safety, clarity, or efficiency\\n- metrics scores must be numbers 0-100",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "overallAssessment": "enum('excellent', 'good', 'needs_improvement', 'failed')",
    "summary": "string",
    "issues": "array<object { id: string, severity: enum('error', 'warning', 'suggestion'), category: string, title: string, description: string, affectedEntity: ?string, suggestedFix: ?string }>",
    "suggestions": "array<object { id: string, type: string, title: string, description: string, impact: enum('high', 'medium', 'low'), reasoning: string }>",
    "metrics": "object { outputQualityScore: number, intentAlignmentScore: number, efficiencyScore: number }"
  }
}
`,
  },

  nl_to_sql_postgres: {
    name: 'nl_to_sql_postgres',
    description: 'Translates natural language queries to PostgreSQL',
    icon: '🐘',
    balCode: `
nl_to_sql_postgres {
  "goal": "You are a SQL expert. Translate natural language queries to valid PostgreSQL. Output ONLY the SQL query. Use provided schema for exact table/column names. Add LIMIT 100 if not specified. Never generate destructive queries. Use PostgreSQL specifics: double quotes for identifiers, :: for casting, ILIKE for case-insensitive.",
  "model": "openai:gpt-4o-mini",
  "output": {
    "sql": "string"
  }
}
`,
  },

  nl_to_sql_mysql: {
    name: 'nl_to_sql_mysql',
    description: 'Translates natural language queries to MySQL',
    icon: '🐬',
    balCode: `
nl_to_sql_mysql {
  "goal": "You are a SQL expert. Translate natural language queries to valid MySQL. Output ONLY the SQL query. Use provided schema for exact table/column names. Add LIMIT 100 if not specified. Never generate destructive queries. Use MySQL specifics: backticks for identifiers, CONVERT() for casting, LOWER() with LIKE for case-insensitive.",
  "model": "openai:gpt-4o-mini",
  "output": {
    "sql": "string"
  }
}
`,
  },

  web_search_fallback: {
    name: 'web_search_fallback',
    description: 'AI-powered web search when no Tavily API key is configured',
    icon: '🔎',
    balCode: `
web_search_fallback {
  "goal": "You are a web search assistant. When asked to search, provide relevant results.\\n\\nCRITICAL: Return a JSON object with this EXACT structure:\\n{\\n  \\\"results\\\": [\\n    {\\n      \\\"title\\\": \\\"Page Title\\\",\\n      \\\"url\\\": \\\"https://example.com/page\\\",\\n      \\\"snippet\\\": \\\"Brief description of the page content...\\\"\\n    }\\n  ]\\n}\\n\\nRules:\\n- results must be an array of objects\\n- Each result MUST have title, url, and snippet (all strings)\\n- Use real, commonly-known websites and realistic URLs\\n- Provide 3-5 relevant results\\n- snippets should be 1-2 sentences describing the page content",
  "model": "openai:gpt-4o-mini",
  "output": {
    "results": "array<object { title: string, url: string, snippet: string }>"
  }
}
`,
  },
};

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Get an internal BaleyBot by name.
 * First checks database, falls back to definition.
 */
export async function getInternalBaleybot(
  name: string
): Promise<{ id: string; name: string; balCode: string } | null> {
  const def = INTERNAL_BALEYBOTS[name];
  if (!def) {
    return null;
  }

  const systemWorkspaceId = await getOrCreateSystemWorkspace();

  // Try to find in database
  const existing = await db.query.baleybots.findFirst({
    where: (bb, { and: whereAnd }) =>
      whereAnd(
        eq(bb.workspaceId, systemWorkspaceId),
        eq(bb.name, name),
        eq(bb.isInternal, true),
        notDeleted(bb)
      ),
  });

  if (existing) {
    // Check if BAL code needs updating (definition changed)
    const expectedBalCode = def.balCode.trim();
    if (existing.balCode !== expectedBalCode) {
      logger.info('Updating internal BaleyBot BAL code', { name, id: existing.id });
      await db
        .update(baleybots)
        .set({
          balCode: expectedBalCode,
          description: def.description,
          icon: def.icon,
        })
        .where(eq(baleybots.id, existing.id));
    }

    return {
      id: existing.id,
      name: existing.name,
      balCode: expectedBalCode,
    };
  }

  // Create if not exists (auto-seed)
  const [created] = await db
    .insert(baleybots)
    .values({
      workspaceId: systemWorkspaceId,
      name: def.name,
      description: def.description,
      icon: def.icon,
      balCode: def.balCode.trim(),
      status: 'active',
      isInternal: true,
    })
    .returning();

  if (!created) {
    logger.error('Failed to create internal BaleyBot', { name });
    return null;
  }

  logger.info('Created internal BaleyBot', { name, id: created.id });

  return {
    id: created.id,
    name: created.name,
    balCode: created.balCode,
  };
}

/**
 * Ensure all internal BaleyBots exist in the database.
 * Called during app initialization.
 */
export async function seedInternalBaleybots(): Promise<void> {
  logger.info('Seeding internal BaleyBots...');

  for (const name of Object.keys(INTERNAL_BALEYBOTS)) {
    await getInternalBaleybot(name);
  }

  logger.info('Internal BaleyBots seeded', {
    count: Object.keys(INTERNAL_BALEYBOTS).length,
  });
}

// ============================================================================
// EXECUTION
// ============================================================================

export interface InternalExecutionOptions {
  /** User's workspace ID (for context, not ownership) */
  userWorkspaceId?: string;
  /** Additional context to append to input */
  context?: string;
  /** Triggered by */
  triggeredBy?: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'internal';
}

/**
 * Execute an internal BaleyBot.
 * Creates execution record and runs through standard executor.
 */
export async function executeInternalBaleybot(
  name: string,
  input: string,
  options: InternalExecutionOptions = {}
): Promise<{ output: unknown; executionId: string }> {
  const internalBB = await getInternalBaleybot(name);
  if (!internalBB) {
    throw new Error(`Internal BaleyBot not found: ${name}`);
  }

  const systemWorkspaceId = await getOrCreateSystemWorkspace();

  // Create execution record
  const [execution] = await db
    .insert(baleybotExecutions)
    .values({
      baleybotId: internalBB.id,
      status: 'pending',
      input: { raw: input, context: options.context },
      triggeredBy: options.triggeredBy || 'internal',
      triggerSource: options.userWorkspaceId,
    })
    .returning();

  if (!execution) {
    throw new Error('Failed to create execution record');
  }

  const startTime = Date.now();

  try {
    // Update to running
    await db
      .update(baleybotExecutions)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(baleybotExecutions.id, execution.id));

    // Build full input with context
    const fullInput = options.context
      ? `${options.context}\n\n${input}`
      : input;

    // Execute through standard path
    const ctx: ExecutorContext = {
      workspaceId: systemWorkspaceId,
      availableTools: new Map(), // Internal BBs typically don't use tools
      workspacePolicies: null,
      triggeredBy: (options.triggeredBy as 'manual' | 'schedule' | 'webhook' | 'other_bb') || 'manual',
      triggerSource: options.userWorkspaceId,
    };

    const result = await executeBaleybot(internalBB.balCode, fullInput, ctx);

    // Update execution record
    await db
      .update(baleybotExecutions)
      .set({
        status: result.status === 'completed' ? 'completed' : 'failed',
        output: result.output,
        error: result.error,
        segments: result.segments,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    if (result.status !== 'completed') {
      throw new Error(result.error || 'Internal BaleyBot execution failed');
    }

    return {
      output: result.output,
      executionId: execution.id,
    };
  } catch (error: unknown) {
    // Update execution with error
    await db
      .update(baleybotExecutions)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    throw error;
  }
}
