/**
 * Spawn BaleyBot Executor Service
 *
 * Implements execution of other BaleyBots for the spawn_baleybot built-in tool.
 * Looks up BBs by ID or name and executes them with provided input.
 */

import { db, baleybots, eq, and, notDeleted } from '@baleyui/db';
import type { BuiltInToolContext, SpawnBaleybotResult } from '../tools/built-in';

// ============================================================================
// TYPES
// ============================================================================

export type SpawnBaleybotExecutor = (
  baleybotIdOrName: string,
  input: unknown,
  ctx: BuiltInToolContext
) => Promise<SpawnBaleybotResult>;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Look up a BaleyBot by ID or name within the workspace
 */
async function lookupBaleybot(
  idOrName: string,
  workspaceId: string
): Promise<{ id: string; name: string; balCode: string } | null> {
  // Try to find by ID first (if it looks like a UUID)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    idOrName
  );

  if (isUuid) {
    const byId = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, idOrName),
        eq(baleybots.workspaceId, workspaceId),
        notDeleted(baleybots)
      ),
      columns: { id: true, name: true, balCode: true },
    });

    if (byId) return byId;
  }

  // Try to find by name
  const byName = await db.query.baleybots.findFirst({
    where: and(
      eq(baleybots.name, idOrName),
      eq(baleybots.workspaceId, workspaceId),
      notDeleted(baleybots)
    ),
    columns: { id: true, name: true, balCode: true },
  });

  return byName ?? null;
}

/**
 * Execute a BaleyBot by ID or name
 *
 * Note: This is a simplified implementation that uses the SDK.
 * In a full implementation, this would:
 * 1. Create an execution record
 * 2. Use the local executor with proper tool injection
 * 3. Handle streaming and approval
 */
async function spawnBaleybot(
  baleybotIdOrName: string,
  input: unknown,
  ctx: BuiltInToolContext
): Promise<SpawnBaleybotResult> {
  const startTime = Date.now();

  // Look up the target BaleyBot
  const targetBB = await lookupBaleybot(baleybotIdOrName, ctx.workspaceId);

  if (!targetBB) {
    throw new Error(
      `BaleyBot not found: "${baleybotIdOrName}". ` +
        'Make sure the BaleyBot exists in this workspace.'
    );
  }

  // For now, we use a simplified execution that just returns the BAL code info
  // In a full implementation, this would execute the BAL code
  // using the local executor with proper context

  // TODO: Implement full execution with:
  // 1. Create baleybotExecutions record
  // 2. Call executeBaleybot from executor.ts
  // 3. Return the actual output

  // Placeholder implementation
  console.log(
    `[spawn_baleybot] Would execute BB "${targetBB.name}" (${targetBB.id}) with input:`,
    input
  );

  const durationMs = Date.now() - startTime;

  return {
    output: {
      message: `spawn_baleybot executed: ${targetBB.name}`,
      note: 'Full execution support coming in Phase 4',
      targetBaleybotId: targetBB.id,
      targetBaleybotName: targetBB.name,
      input,
    },
    executionId: `spawn_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    durationMs,
  };
}

// ============================================================================
// EXPORT SERVICE
// ============================================================================

/**
 * Create the spawn baleybot executor function
 */
export function createSpawnBaleybotExecutor(): SpawnBaleybotExecutor {
  return spawnBaleybot;
}

/**
 * Default spawn executor instance
 */
export const spawnBaleybotExecutor = createSpawnBaleybotExecutor();
