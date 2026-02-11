/**
 * Internal BaleyBots Service
 *
 * Defines and manages internal BaleyBots that power the platform.
 * These are stored in the database with isInternal: true.
 */

import { db, baleybots, baleybotExecutions, connections, eq, and, notDeleted } from '@baleyui/db';
import { getOrCreateSystemWorkspace } from '@/lib/system-workspace';
import { executeBaleybot, type ExecutorContext, type RuntimeToolDefinition } from './executor';
import { createLogger } from '@/lib/logger';
import type { BaleybotStreamEvent } from '@baleybots/core';
import {
  GENERATED_INTERNAL_BALEYBOTS,
  type GeneratedInternalBaleybotDef,
} from './internal-bb/generated-definitions';
import { initializeBuiltInToolServices } from './services';

const logger = createLogger('internal-baleybots');

// ============================================================================
// INTERNAL BALEYBOT DEFINITIONS (BAL CODE)
// ============================================================================

export type InternalBaleybotDef = GeneratedInternalBaleybotDef;

/**
 * Baley system prompt — defined manually because:
 * - Conversational (no output schema)
 * - Tools are injected at runtime (30+ companion tools), not declared in BAL
 */
const BALEY_GOAL = `You are Baley, the AI assistant built into BaleyUI. You are always present in the workspace sidebar, context-aware, and proactive. Be direct, helpful, and professional. Keep responses concise (1-3 sentences) unless the user asks for detail. When you detect issues (broken connections, missing AI providers, failed executions), mention them proactively.

## Platform Knowledge
BaleyBots are AI agents defined in BAL (Baleybots Assembly Language). Each BaleyBot has entities with goals, models, and tools. Entities can be composed: chain (sequential), parallel (concurrent), if/else (conditional), loop (iterative).

Connections provide external capabilities:
- AI providers: OpenAI, Anthropic, Google, Ollama (local)
- Databases: PostgreSQL, MySQL — yield query tools
- MCP servers: 40+ integrations (Stripe, GitHub, Linear, Notion, Slack, HubSpot, Sentry, Supabase, and more)

Tool sources: built-in (always available), connection-derived (from DB connections), MCP (from MCP servers), workspace custom (user-defined). Three tools require user approval before execution: schedule_task, create_agent, create_tool.

## Context Awareness
Use the current page path to provide contextually relevant help. Use workspace health data to detect and surface issues proactively. Remember conversation history — never repeat questions or re-explain context already discussed.

## Your Tools
Navigation: get_workspace_health (workspace status and issues), navigate_user_to (send user to dashboard pages)
Connections: list_connections, test_connection, set_default_connection, create_connection, delete_connection
Tools: list_tools, create_tool, delete_tool
API Keys: list_api_keys, create_api_key, revoke_api_key
BaleyBots: list_baleybots, get_baleybot, get_execution, list_recent_executions
Analytics: get_analytics_summary
Workspace: get_workspace_info, update_workspace
Approvals: list_approval_patterns, revoke_approval_pattern
General: web_search, fetch_url, spawn_baleybot, send_notification, store_memory, request_user_input

## Tool Usage Guidelines
Use get_workspace_health proactively when the user asks for help, mentions problems, or seems stuck. Use navigate_user_to with dashboard paths like /dashboard, /dashboard/baleybots, /dashboard/capabilities/connections, /dashboard/tools, /dashboard/settings, /dashboard/analytics. Before any destructive action (delete_connection, delete_tool, revoke_api_key, revoke_approval_pattern), always confirm with the user first. Use web_search for questions about external services or APIs. Use spawn_baleybot to run the user's bots on their behalf. For creating connections, gather required fields conversationally — AI providers need an apiKey, databases need host/port/database/username/password, MCP servers need url and transportType. Use get_analytics_summary with a period parameter (7d, 30d, 90d) for usage questions.

## Safety
Never delete, revoke, or perform destructive actions without explicit user confirmation. When uncertain about the user's intent, ask rather than assume. If an action fails, explain what happened clearly and suggest concrete next steps.`;

/**
 * All internal BaleyBot definitions.
 * These are seeded into the database on app startup.
 */
export const INTERNAL_BALEYBOTS: Record<string, InternalBaleybotDef> = {
  ...GENERATED_INTERNAL_BALEYBOTS,
  baley: {
    name: 'baley',
    description: 'BaleyUI system assistant — workspace management, troubleshooting, and proactive guidance',
    icon: '✦',
    balCode: [
      `baley {`,
      `  "goal": ${JSON.stringify(BALEY_GOAL)},`,
      `  "model": "anthropic:claude-sonnet-4-20250514",`,
      `  "tools": {`,
      `    "get_workspace_health", "navigate_user_to",`,
      `    "list_connections", "test_connection", "set_default_connection", "create_connection", "delete_connection",`,
      `    "list_tools", "create_tool", "delete_tool",`,
      `    "list_api_keys", "create_api_key", "revoke_api_key",`,
      `    "list_baleybots", "get_baleybot", "get_execution", "list_recent_executions",`,
      `    "get_analytics_summary",`,
      `    "get_workspace_info", "update_workspace",`,
      `    "list_approval_patterns", "revoke_approval_pattern",`,
      `    "web_search", "fetch_url", "spawn_baleybot", "send_notification",`,
      `    "store_memory", "schedule_task", "request_user_input"`,
      `  }`,
      `}`,
    ].join('\n'),
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
      // If admin has edited this bot, respect their changes (DB wins)
      if (existing.adminEdited) {
        logger.info('Skipping BAL code update for admin-edited internal BaleyBot', { name, id: existing.id });
        return {
          id: existing.id,
          name: existing.name,
          balCode: existing.balCode,
        };
      }

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

  // Create if not exists (auto-seed). Use try-catch to handle concurrent
  // insertions from parallel startup requests without a unique index.
  try {
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
  } catch (insertError) {
    // Concurrent insert race — re-query for the winning row
    logger.warn('Concurrent insert for internal BaleyBot, re-querying', { name });
    const raceWinner = await db.query.baleybots.findFirst({
      where: (bb, { and: whereAnd }) =>
        whereAnd(
          eq(bb.workspaceId, systemWorkspaceId),
          eq(bb.name, name),
          eq(bb.isInternal, true),
          notDeleted(bb)
        ),
    });
    if (raceWinner) {
      return { id: raceWinner.id, name: raceWinner.name, balCode: raceWinner.balCode };
    }
    throw insertError;
  }
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
  /** Optional callback for live stream segments */
  onSegment?: (segment: BaleybotStreamEvent) => void;
  /** Triggered by */
  triggeredBy?: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'internal';
  /** Injected runtime tools (e.g. request_user_input for the concierge) */
  injectedTools?: Map<string, RuntimeToolDefinition>;
  /** Abort signal — when aborted, execution should terminate */
  signal?: AbortSignal;
}

const INTERNAL_DEFAULT_MODEL: Record<'openai' | 'anthropic' | 'ollama', string> = {
  openai: 'openai:gpt-5-mini',
  anthropic: 'anthropic:claude-sonnet-4-20250514',
  ollama: 'ollama:llama3.1',
};

function applyInternalContractCompatibility(name: string, balCode: string): string {
  if (name !== 'creator_action_advisor') {
    return balCode;
  }

  // Compatibility for older edits that used actions: array<string> (or other array scalar contracts).
  return balCode.replace(
    /("actions"\s*:\s*")array<[^"]+>"/gi,
    '$1array<object>"'
  );
}

function rewriteModelProvidersForAvailability(
  balCode: string,
  providers: Array<'openai' | 'anthropic' | 'ollama'>
): string {
  if (providers.length === 0) {
    return balCode;
  }

  const fallbackProvider = providers.includes('anthropic')
    ? 'anthropic'
    : providers.includes('openai')
      ? 'openai'
      : 'ollama';
  const availableProviders = new Set(providers);
  const fallbackModel = INTERNAL_DEFAULT_MODEL[fallbackProvider];

  return balCode.replace(
    /"model"\s*:\s*"([^":]+):([^"]+)"/g,
    (fullMatch, provider) => {
      const normalizedProvider = String(provider).toLowerCase() as
        | 'openai'
        | 'anthropic'
        | 'ollama';
      if (availableProviders.has(normalizedProvider)) {
        return fullMatch;
      }
      return `"model": "${fallbackModel}"`;
    }
  );
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

    // Fetch available AI connections for the workspace
    const workspaceId = options.userWorkspaceId || systemWorkspaceId;
    const availableConnections = await db.query.connections.findMany({
      where: and(
        eq(connections.workspaceId, workspaceId),
        notDeleted(connections),
      ),
      columns: { type: true, name: true, status: true },
    });

    const aiProviders = Array.from(
      new Set(
        availableConnections
          .filter(
            (connection) =>
              ['openai', 'anthropic', 'ollama'].includes(connection.type) &&
              connection.status === 'connected'
          )
          .map(
            (connection) =>
              connection.type as 'openai' | 'anthropic' | 'ollama'
          )
      )
    );

    // Add AI provider context
    const enrichedContext = [
      options.context,
      aiProviders.length > 0
        ? `Available AI providers: ${aiProviders.join(', ')}. Default to the first available provider when choosing a model.`
        : 'No AI providers connected. Use "anthropic:claude-sonnet-4-20250514" as default model.',
    ].filter(Boolean).join('\n');

    // Build full input with context
    const fullInput = enrichedContext
      ? `${enrichedContext}\n\n${input}`
      : input;

    // Initialize built-in tool services (spawn, notify, schedule, memory, web search)
    initializeBuiltInToolServices({
      tavilyApiKey: process.env.TAVILY_API_KEY,
    });

    const toolCtx = {
      workspaceId,
      baleybotId: internalBB.id,
      executionId: execution.id,
      userId: 'system',
    };

    // Load ALL tool categories (built-in + DB + MCP + workspace) for full parity
    const { loadExecutionTools } = await import('./services/execution-tools-loader');
    const { runtimeTools } = await loadExecutionTools({ workspaceId, toolCtx });

    // If streaming, replace the default spawn_baleybot with a streaming-aware version
    if (options.onSegment) {
      const { createSpawnBaleybotExecutor } = await import('./services/spawn-executor');
      const { SPAWN_BALEYBOT_SCHEMA } = await import('./tools/built-in');
      const streamingSpawnExecutor = createSpawnBaleybotExecutor({
        onChildSegment: options.onSegment,
        getTools: () => runtimeTools,
      });
      runtimeTools.set('spawn_baleybot', {
        name: 'spawn_baleybot',
        description: 'Execute another BaleyBot and return its result',
        inputSchema: SPAWN_BALEYBOT_SCHEMA as Record<string, unknown>,
        function: async (args: Record<string, unknown>) =>
          streamingSpawnExecutor(String(args.baleybot), args.input, toolCtx),
      });
    }

    const allTools = runtimeTools;

    // Injected tools override built-in tools of the same name
    if (options.injectedTools) {
      for (const [name, tool] of options.injectedTools) {
        allTools.set(name, tool);
      }
    }

    // Execute through standard path
    const ctx: ExecutorContext = {
      workspaceId,
      availableTools: allTools,
      workspacePolicies: null,
      triggeredBy: options.triggeredBy || 'internal',
      triggerSource: options.userWorkspaceId,
    };

    const compatibilityPatchedCode = applyInternalContractCompatibility(
      name,
      internalBB.balCode
    );
    const runtimeBalCode = rewriteModelProvidersForAvailability(
      compatibilityPatchedCode,
      aiProviders
    );

    // Check signal before execution
    if (options.signal?.aborted) {
      throw new Error('Execution aborted');
    }

    const result = await executeBaleybot(runtimeBalCode, fullInput, ctx, {
      onSegment: options.onSegment,
      signal: options.signal,
    });

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
