/**
 * Spawn BaleyBot Executor Service
 *
 * Implements execution of other BaleyBots for the spawn_baleybot built-in tool.
 * Looks up BBs by ID or name and executes them with provided input.
 *
 * Key features:
 * - Creates execution records in database
 * - Uses the local executor for actual execution
 * - Handles nested spawns with depth limit
 * - Passes parent execution ID for tracing
 */

import { db, baleybots, baleybotExecutions, workspacePolicies, eq, and, notDeleted } from '@baleyui/db';
import type { BuiltInToolContext, SpawnBaleybotResult } from '../tools/built-in';
import { executeBaleybot, type ExecutorContext, type RuntimeToolDefinition } from '../executor';
import { getBuiltInRuntimeTools } from '../tools/built-in/implementations';
import type { WorkspacePolicies as FullWorkspacePolicies } from '../types';

// ============================================================================
// WORKSPACE POLICIES
// ============================================================================

/**
 * Workspace policies for tool and execution control (subset used in spawn executor)
 */
export interface WorkspacePolicies {
  allowedTools?: string[] | null;
  forbiddenTools?: string[] | null;
  requiresApprovalTools?: string[] | null;
  maxSpawnDepth?: number | null;
  maxAutoApproveAmount?: number | null;
}

/**
 * Policy provider function type
 */
type PolicyProvider = (workspaceId: string) => Promise<WorkspacePolicies | null>;

/**
 * Extract tool names from BAL code
 */
export function extractToolsFromBAL(balCode: string): string[] {
  const toolsMatch = balCode.match(/"tools"\s*:\s*\[(.*?)\]/s);
  if (!toolsMatch) return [];

  const toolsStr = toolsMatch[1];
  if (!toolsStr) return [];

  const tools = toolsStr.match(/"([^"]+)"/g) || [];
  return tools.map(t => t.replace(/"/g, ''));
}

/**
 * Fetch workspace policies from database
 */
async function fetchWorkspacePolicies(workspaceId: string): Promise<WorkspacePolicies | null> {
  const policies = await db.query.workspacePolicies.findFirst({
    where: eq(workspacePolicies.workspaceId, workspaceId),
  });

  if (!policies) return null;

  return {
    allowedTools: policies.allowedTools,
    forbiddenTools: policies.forbiddenTools,
    requiresApprovalTools: policies.requiresApprovalTools,
    maxSpawnDepth: null, // Would need to add this column to schema
    maxAutoApproveAmount: policies.maxAutoApproveAmount,
  };
}

/**
 * Validate that tools used by a BaleyBot are allowed by workspace policies
 */
function validateToolsAgainstPolicies(
  usedTools: string[],
  policies: WorkspacePolicies
): { valid: boolean; reason?: string } {
  // If no tools used, always valid
  if (usedTools.length === 0) {
    return { valid: true };
  }

  // Check forbidden tools (blocklist)
  if (policies.forbiddenTools && policies.forbiddenTools.length > 0) {
    const forbidden = usedTools.filter(t => policies.forbiddenTools!.includes(t));
    if (forbidden.length > 0) {
      return {
        valid: false,
        reason: `Uses forbidden tools: ${forbidden.join(', ')}`,
      };
    }
  }

  // Check allowed tools (allowlist) - if specified, only these tools are allowed
  if (policies.allowedTools && policies.allowedTools.length > 0) {
    const notAllowed = usedTools.filter(t => !policies.allowedTools!.includes(t));
    if (notAllowed.length > 0) {
      return {
        valid: false,
        reason: `Uses tools not in allowed list: ${notAllowed.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// TYPES
// ============================================================================

export type SpawnBaleybotExecutor = (
  baleybotIdOrName: string,
  input: unknown,
  ctx: BuiltInToolContext
) => Promise<SpawnBaleybotResult>;

/**
 * Extended context for spawn execution, including spawn depth tracking
 */
interface SpawnContext extends BuiltInToolContext {
  /** Current spawn depth (0 = top level, 1 = spawned by another BB, etc.) */
  spawnDepth?: number;
  /** Maximum allowed spawn depth to prevent infinite recursion */
  maxSpawnDepth?: number;
  /** Parent execution ID for tracing spawn chains */
  parentExecutionId?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MAX_SPAWN_DEPTH = 5; // Maximum nesting level

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
 * Create an execution record in the database
 */
async function createExecutionRecord(
  baleybotId: string,
  input: unknown,
  triggerSource: string
): Promise<string> {
  const [record] = await db
    .insert(baleybotExecutions)
    .values({
      baleybotId,
      status: 'running',
      input: input as Record<string, unknown>,
      triggeredBy: 'other_bb',
      triggerSource,
      startedAt: new Date(),
    })
    .returning({ id: baleybotExecutions.id });

  if (!record) {
    throw new Error('Failed to create execution record');
  }

  return record.id;
}

/**
 * Update an execution record with the result
 */
async function updateExecutionRecord(
  executionId: string,
  status: 'completed' | 'failed',
  output: unknown,
  error?: string,
  durationMs?: number
): Promise<void> {
  await db
    .update(baleybotExecutions)
    .set({
      status,
      output: output as Record<string, unknown>,
      error,
      completedAt: new Date(),
      durationMs,
    })
    .where(eq(baleybotExecutions.id, executionId));
}

/**
 * Create a spawn executor with configurable options
 */
export function createSpawnBaleybotExecutor(options?: {
  maxSpawnDepth?: number;
  /** Optional: inject tools provider for testing */
  getTools?: (ctx: BuiltInToolContext) => Map<string, RuntimeToolDefinition>;
  /** Optional: inject policy provider for testing */
  getPolicies?: PolicyProvider;
}): SpawnBaleybotExecutor {
  const maxDepth = options?.maxSpawnDepth ?? DEFAULT_MAX_SPAWN_DEPTH;
  const getTools = options?.getTools ?? getBuiltInRuntimeTools;
  const getPolicies = options?.getPolicies ?? fetchWorkspacePolicies;

  /**
   * Execute a BaleyBot by ID or name
   */
  async function spawnBaleybot(
    baleybotIdOrName: string,
    input: unknown,
    ctx: BuiltInToolContext
  ): Promise<SpawnBaleybotResult> {
    const startTime = Date.now();
    const spawnCtx = ctx as SpawnContext;

    // Check spawn depth to prevent infinite recursion
    const currentDepth = spawnCtx.spawnDepth ?? 0;
    if (currentDepth >= maxDepth) {
      throw new Error(
        `Maximum spawn depth (${maxDepth}) exceeded. ` +
          'This may indicate a circular dependency between BaleyBots. ' +
          `Current spawn chain depth: ${currentDepth}`
      );
    }

    // Look up the target BaleyBot
    const targetBB = await lookupBaleybot(baleybotIdOrName, ctx.workspaceId);

    if (!targetBB) {
      throw new Error(
        `BaleyBot not found: "${baleybotIdOrName}". ` +
          'Make sure the BaleyBot exists in this workspace.'
      );
    }

    // Fetch and enforce workspace policies
    const policies = await getPolicies(ctx.workspaceId);

    if (policies) {
      // Check spawn depth against policy (if specified)
      if (policies.maxSpawnDepth !== null && policies.maxSpawnDepth !== undefined) {
        if (currentDepth >= policies.maxSpawnDepth) {
          throw new Error(
            `Workspace policy limits spawn depth to ${policies.maxSpawnDepth}. ` +
            `Current depth: ${currentDepth}`
          );
        }
      }

      // Check if target BB uses forbidden tools
      if (targetBB.balCode) {
        const usedTools = extractToolsFromBAL(targetBB.balCode);
        const validation = validateToolsAgainstPolicies(usedTools, policies);

        if (!validation.valid) {
          throw new Error(
            `Cannot spawn "${targetBB.name}": ${validation.reason}`
          );
        }
      }
    }

    console.log(
      `[spawn_baleybot] Executing BB "${targetBB.name}" (${targetBB.id}) ` +
        `at depth ${currentDepth} with input:`,
      input
    );

    // Create execution record
    const executionId = await createExecutionRecord(
      targetBB.id,
      input,
      ctx.executionId // Parent execution ID
    );

    try {
      // Create executor context for the spawned BB
      const nestedCtx: SpawnContext = {
        workspaceId: ctx.workspaceId,
        baleybotId: targetBB.id,
        executionId,
        userId: ctx.userId,
        spawnDepth: currentDepth + 1,
        maxSpawnDepth: maxDepth,
        parentExecutionId: ctx.executionId,
      };

      // Get runtime tools for the spawned BB
      const availableTools = getTools(nestedCtx);

      // Create executor context with fetched policies
      // Cast to FullWorkspacePolicies since the local type is a subset
      const executorContext: ExecutorContext = {
        workspaceId: ctx.workspaceId,
        availableTools,
        workspacePolicies: policies as FullWorkspacePolicies | null,
        triggeredBy: 'other_bb',
        triggerSource: ctx.baleybotId,
      };

      // Convert input to string (executor expects string input)
      const inputStr = typeof input === 'string' ? input : JSON.stringify(input);

      // Execute the BaleyBot
      const result = await executeBaleybot(
        targetBB.balCode,
        inputStr,
        executorContext
      );

      const durationMs = Date.now() - startTime;

      // Update execution record with result
      if (result.status === 'completed') {
        await updateExecutionRecord(
          executionId,
          'completed',
          result.output,
          undefined,
          durationMs
        );
      } else if (result.status === 'failed') {
        await updateExecutionRecord(
          executionId,
          'failed',
          result.output,
          result.error,
          durationMs
        );
        throw new Error(`Spawned BaleyBot "${targetBB.name}" failed: ${result.error}`);
      }

      return {
        output: result.output,
        executionId,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update execution record with error
      await updateExecutionRecord(
        executionId,
        'failed',
        null,
        errorMessage,
        durationMs
      );

      throw error;
    }
  }

  return spawnBaleybot;
}

/**
 * Default spawn executor instance
 */
export const spawnBaleybotExecutor = createSpawnBaleybotExecutor();
