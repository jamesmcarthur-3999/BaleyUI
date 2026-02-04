/**
 * Internal BaleyBots Service
 *
 * Defines and manages internal BaleyBots that power the platform.
 * These are stored in the database with isInternal: true.
 */

import { db, baleybots, baleybotExecutions, eq, and, notDeleted } from '@baleyui/db';
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
  "goal": "You are a BaleyBot Creator. Help users build AI automation bots through natural conversation. Analyze their request, design entities with appropriate tools, and generate valid BAL code. Output structured data with: entities (id, name, icon, purpose, tools), connections (from, to), balCode, name, icon, and status (building/ready).",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "entities": "array",
    "connections": "array",
    "balCode": "string",
    "name": "string",
    "icon": "string",
    "status": "string",
    "message": "string"
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
  "goal": "You are a BAL code generator. Convert user descriptions into valid BAL (Baleybots Assembly Language) code. Follow BAL v2 syntax: entity definitions with goal/model/tools/output, chain/parallel/if/loop compositions. Output balCode, explanation, entities array, toolRationale, suggestedName, and suggestedIcon.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "balCode": "string",
    "explanation": "string",
    "entities": "array",
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
  "goal": "You are an approval pattern learning assistant. Analyze tool call approvals and suggest safe patterns for auto-approval. Consider risk levels, appropriate constraints vs wildcards, and suggest trust levels (provisional/trusted/permanent) with clear explanations.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "suggestions": "array",
    "warnings": "array",
    "recommendations": "array"
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
  "goal": "You are a BaleyBot Review Agent. Analyze execution results against original intent. Identify issues (errors, warnings, suggestions) across accuracy, completeness, performance, safety, clarity, efficiency. Propose specific BAL code improvements with reasoning.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "overallAssessment": "string",
    "summary": "string",
    "issues": "array",
    "suggestions": "array",
    "metrics": "object"
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
  "goal": "You are a web search assistant. When asked to search, provide relevant results with title, url (use real commonly-known websites), and snippet. Return as JSON array.",
  "model": "openai:gpt-4o-mini",
  "output": {
    "results": "array"
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
    return {
      id: existing.id,
      name: existing.name,
      balCode: existing.balCode,
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
  } catch (error) {
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
