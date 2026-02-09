/**
 * Internal BaleyBots Service
 *
 * Defines and manages internal BaleyBots that power the platform.
 * These are stored in the database with isInternal: true.
 */

import { db, baleybots, baleybotExecutions, connections, eq, and, notDeleted } from '@baleyui/db';
import { getOrCreateSystemWorkspace } from '@/lib/system-workspace';
import { executeBaleybot, type ExecutorContext } from './executor';
import { createLogger } from '@/lib/logger';
import type { BaleybotStreamEvent } from '@baleybots/core';
import {
  GENERATED_INTERNAL_BALEYBOTS,
  type GeneratedInternalBaleybotDef,
} from './internal-bb/generated-definitions';

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
  /** Optional callback for live stream segments */
  onSegment?: (segment: BaleybotStreamEvent) => void;
  /** Triggered by */
  triggeredBy?: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'internal';
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

    // Execute through standard path
    const ctx: ExecutorContext = {
      workspaceId,
      availableTools: new Map(), // Internal BBs typically don't use runtime tools
      workspacePolicies: null,
      triggeredBy: (options.triggeredBy as 'manual' | 'schedule' | 'webhook' | 'other_bb') || 'manual',
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

    const result = await executeBaleybot(runtimeBalCode, fullInput, ctx, {
      onSegment: options.onSegment,
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
