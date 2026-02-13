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
const BALEY_GOAL = `You are Baley, the AI assistant built into BaleyUI. Be direct, warm, and concise — respond in 1-3 natural sentences like a knowledgeable colleague, not a manual. Never use markdown headers, bullet lists, or numbered steps unless the user explicitly asks for structured output. Match the user's energy — if they send something casual and short, keep your reply casual and short.

BaleyBots are AI agents defined in BAL with entities, goals, models, and tools composed via chain, parallel, if/else, and loop.

When the user asks for help or seems stuck, check workspace health first. When creating connections, gather credentials conversationally — never echo them back. Before any destructive action (deleting connections, revoking keys), always confirm first.

Your context includes pendingActions data:
- First message only: if critical actions exist, mention them briefly once.
- Do not list individual actions unprompted. Use list_pending_actions when the user asks.
- If only info/warning actions exist, do not mention them proactively.
- On /dashboard/actions, the user already sees the list — help explain or batch-apply instead.
- Before applying any recommendation, describe what it does and confirm.

When uncertain, ask one focused question rather than assuming. If something fails, explain clearly and suggest a concrete next step.`;

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
      `    "review_execution", "diagnose_failure", "suggest_approval_patterns",`,
      `    "list_pending_actions", "apply_action",`,
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
 * In-memory cache for internal BB definitions.
 * Internal BBs are static after seeding — BAL code and config never change at runtime
 * (except admin edits, which invalidate the cache).
 */
const internalBBCache = new Map<string, { id: string; name: string; balCode: string }>();
/** Clear the internal BB cache (call after admin edits) */
export function invalidateInternalBBCache(): void {
  internalBBCache.clear();
}

/**
 * Get an internal BaleyBot by name.
 * Uses in-memory cache after first DB lookup.
 */
export async function getInternalBaleybot(
  name: string
): Promise<{ id: string; name: string; balCode: string } | null> {
  // Fast path: return from cache
  const cached = internalBBCache.get(name);
  if (cached) return cached;

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
        const result = {
          id: existing.id,
          name: existing.name,
          balCode: existing.balCode,
        };
        internalBBCache.set(name, result);
        return result;
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

    const result = {
      id: existing.id,
      name: existing.name,
      balCode: expectedBalCode,
    };
    internalBBCache.set(name, result);
    return result;
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

    const result = {
      id: created.id,
      name: created.name,
      balCode: created.balCode,
    };
    internalBBCache.set(name, result);
    return result;
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
      const result = { id: raceWinner.id, name: raceWinner.name, balCode: raceWinner.balCode };
      internalBBCache.set(name, result);
      return result;
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
  /** Multi-modal file attachments (images, PDFs, etc.) */
  attachments?: Array<{ data: string; mimeType: string }>;
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
  // Parallel initialization: fetch internal BB definition and system workspace concurrently
  const [internalBB, systemWorkspaceId] = await Promise.all([
    getInternalBaleybot(name),
    getOrCreateSystemWorkspace(),
  ]);

  if (!internalBB) {
    throw new Error(`Internal BaleyBot not found: ${name}`);
  }

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
    const workspaceId = options.userWorkspaceId || systemWorkspaceId;

    // Parallel: update status to running + fetch AI connections concurrently
    const [, availableConnections] = await Promise.all([
      db
        .update(baleybotExecutions)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(baleybotExecutions.id, execution.id)),
      db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, workspaceId),
          notDeleted(connections),
        ),
        columns: { type: true, name: true, status: true },
      }),
    ]);

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
      baleybotName: internalBB.name,
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

    // Use caller's signal, or default to 2-minute timeout to prevent indefinite hangs
    const signal = options.signal ?? AbortSignal.timeout(120_000);

    // Check signal before execution
    if (signal.aborted) {
      throw new Error('Execution aborted');
    }

    const result = await executeBaleybot(runtimeBalCode, fullInput, ctx, {
      onSegment: options.onSegment,
      signal,
    });

    // Update execution record (including usage data for analytics)
    await db
      .update(baleybotExecutions)
      .set({
        status: result.status === 'completed' ? 'completed' : 'failed',
        output: result.output,
        error: result.error,
        segments: result.segments,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        tokenCount: result.tokenCount,
        model: result.model,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        estimatedCost: result.estimatedCost,
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
