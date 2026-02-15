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
import type { BuiltInToolContext } from './tools/built-in';
import {
  GENERATED_INTERNAL_BALEYBOTS,
  type GeneratedInternalBaleybotDef,
} from './internal-bb/generated-definitions';
import { initializeBuiltInToolServices } from './services';
import { normalizeOutputCandidate } from './internal-bb/contract-gateway';

const logger = createLogger('internal-baleybots');

// ============================================================================
// INTERNAL BALEYBOT DEFINITIONS (BAL CODE)
// ============================================================================

export type InternalBaleybotDef = GeneratedInternalBaleybotDef;

/**
 * All internal BaleyBot definitions.
 * These are seeded into the database on app startup.
 */
export const INTERNAL_BALEYBOTS: Record<string, InternalBaleybotDef> = {
  ...GENERATED_INTERNAL_BALEYBOTS,
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
      logger.info('Updating internal BaleyBot BAL code from source-of-truth', {
        name,
        id: existing.id,
        wasAdminEdited: existing.adminEdited,
      });
      await db
        .update(baleybots)
        .set({
          balCode: expectedBalCode,
          description: def.description,
          icon: def.icon,
          adminEdited: false,
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
  /** Side channel: spawn_baleybot stores full output here (keyed by bot name) */
  _spawnOutputs?: Map<string, unknown>;
  /** Optional swarm orchestration run ID to attach nested spawns to */
  orchestrationRunId?: string;
  /** Optional active orchestration task ID for child lineage */
  orchestrationTaskId?: string;
  /** Whether this execution is allowed to spawn additional workers */
  allowChildSpawns?: boolean;
}

export interface InternalExecutionMetadata {
  finishReasons: string[];
  maxTokensReached: boolean;
  tokenCount?: number;
  model?: string;
}

const INTERNAL_DEFAULT_MODEL: Record<'openai' | 'anthropic' | 'ollama', string> = {
  openai: 'openai:gpt-5-mini',
  anthropic: 'anthropic:claude-sonnet-4-20250514',
  ollama: 'ollama:llama3.2',
};

function applyInternalContractCompatibility(name: string, balCode: string): string {
  // Legacy output contract shims were removed in favor of app-layer parsing.
  return balCode;
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
): Promise<{ output: unknown; executionId: string; metadata: InternalExecutionMetadata }> {
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

    const toolCtx: BuiltInToolContext = {
      workspaceId,
      baleybotId: internalBB.id,
      executionId: execution.id,
      userId: 'system',
      _spawnOutputs: options._spawnOutputs,
      orchestrationRunId: options.orchestrationRunId,
      orchestrationTaskId: options.orchestrationTaskId,
      allowChildSpawns:
        typeof options.allowChildSpawns === 'boolean'
          ? options.allowChildSpawns
          : true,
    };

    // Load ALL tool categories (built-in + DB + MCP + workspace) for full parity
    const { loadExecutionTools } = await import('./services/execution-tools-loader');
    const { runtimeTools: baseRuntimeTools } = await loadExecutionTools({
      workspaceId,
      toolCtx,
    });
    const { getBuiltInRuntimeTools } = await import(
      './tools/built-in/implementations'
    );

    let createStreamingSpawnTool:
      | ((scopedToolCtx: BuiltInToolContext) => RuntimeToolDefinition)
      | null = null;

    const buildScopedRuntimeTools = (
      scopedToolCtx: BuiltInToolContext
    ): Map<string, RuntimeToolDefinition> => {
      const scopedTools = new Map<string, RuntimeToolDefinition>(
        baseRuntimeTools
      );

      // Re-bind built-in tools to the current execution scope so nested spawns
      // get correct execution IDs, depth tracking, and side-channel state.
      const scopedBuiltIns = getBuiltInRuntimeTools(scopedToolCtx);
      for (const [toolName, toolDef] of scopedBuiltIns) {
        scopedTools.set(toolName, toolDef);
      }

      // In streaming mode, use a spawn tool that forwards child segments.
      if (createStreamingSpawnTool) {
        scopedTools.set('spawn_baleybot', createStreamingSpawnTool(scopedToolCtx));
      }

      // Injected tools override built-ins/custom tools of the same name.
      if (options.injectedTools) {
        for (const [toolName, tool] of options.injectedTools) {
          scopedTools.set(toolName, tool);
        }
      }

      return scopedTools;
    };

    if (options.onSegment) {
      const { createSpawnBaleybotExecutor } = await import(
        './services/spawn-executor'
      );
      const { SPAWN_BALEYBOT_SCHEMA } = await import('./tools/built-in');

      createStreamingSpawnTool = (
        scopedToolCtx: BuiltInToolContext
      ): RuntimeToolDefinition => {
        const streamingSpawnExecutor = createSpawnBaleybotExecutor({
          onChildSegment: options.onSegment,
          getTools: buildScopedRuntimeTools,
        });
        return {
          name: 'spawn_baleybot',
          description: 'Execute another BaleyBot and return its result',
          inputSchema: SPAWN_BALEYBOT_SCHEMA as Record<string, unknown>,
          function: async (args: Record<string, unknown>) =>
            streamingSpawnExecutor(
              String(args.baleybot),
              args.input,
              scopedToolCtx
            ),
        };
      };
    }

    const allTools = buildScopedRuntimeTools(toolCtx);

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
    let runtimeBalCode = rewriteModelProvidersForAvailability(
      compatibilityPatchedCode,
      aiProviders
    );

    // Inject additional tool names into the BAL tools block so the SDK
    // interpreter gives the bot access to them. Without this, injected tools
    // are in availableTools but not declared in BAL, so the interpreter skips them.
    if (options.injectedTools && options.injectedTools.size > 0) {
      const injectedNames = [...options.injectedTools.keys()];
      // Find existing tools already declared in BAL to avoid duplicates
      const newNames = injectedNames.filter(
        (n) => !runtimeBalCode.includes(`"${n}"`)
      );
      if (newNames.length > 0) {
        // Insert before the closing brace of the tools block: "tools": { ..., "new1", "new2" }
        const additions = newNames.map((n) => `"${n}"`).join(', ');
        runtimeBalCode = runtimeBalCode.replace(
          /("tools"\s*:\s*\{[^}]*)(})/,
          `$1, ${additions}$2`
        );
      }
    }

    // Use caller's signal, or default to 2-minute timeout to prevent indefinite hangs
    const signal = options.signal ?? AbortSignal.timeout(120_000);

    // Check signal before execution
    if (signal.aborted) {
      throw new Error('Execution aborted');
    }

    const result = await executeBaleybot(runtimeBalCode, fullInput, ctx, {
      onSegment: options.onSegment,
      signal,
      attachments: options.attachments,
    });

    const normalizedOutput = normalizeOutputCandidate(result.output);

    // Update execution record (including usage data for analytics)
    await db
      .update(baleybotExecutions)
      .set({
        status: result.status === 'completed' ? 'completed' : 'failed',
        output: normalizedOutput,
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

    const finishReasons = result.segments
      .filter((segment) => {
        const maybe = segment as Record<string, unknown>;
        return maybe.type === 'done';
      })
      .map((segment) => {
        const maybe = segment as Record<string, unknown>;
        return String(maybe.reason ?? '');
      })
      .filter((reason) => reason.length > 0);

    const metadata: InternalExecutionMetadata = {
      finishReasons,
      maxTokensReached: finishReasons.includes('max_tokens_reached'),
      tokenCount: result.tokenCount,
      model: result.model,
    };

    return {
      output: normalizedOutput,
      executionId: execution.id,
      metadata,
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
