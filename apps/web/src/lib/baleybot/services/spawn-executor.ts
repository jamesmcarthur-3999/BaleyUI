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
import type { BaleybotStreamEvent } from '@baleybots/core';
import { getOrCreateSystemWorkspace } from '@/lib/system-workspace';
import { getDefaultModelForTier } from '@/lib/models/model-registry';
import { createLogger } from '@/lib/logger';

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
 * Extract tool names from BAL code.
 * Supports both brace syntax (canonical BAL) and bracket syntax (legacy/test).
 */
export function extractToolsFromBAL(balCode: string): string[] {
  const allTools: string[] = [];

  // Brace syntax (canonical BAL): "tools": { "web_search", "fetch_url" }
  for (const match of balCode.matchAll(/"tools"\s*:\s*\{(.*?)\}/gs)) {
    const toolNames = match[1]?.match(/"([^"]+)"/g) || [];
    allTools.push(...toolNames.map(t => t.replace(/"/g, '')));
  }

  // Bracket syntax (legacy/test): "tools": ["web_search"]
  for (const match of balCode.matchAll(/"tools"\s*:\s*\[(.*?)\]/gs)) {
    const toolNames = match[1]?.match(/"([^"]+)"/g) || [];
    allTools.push(...toolNames.map(t => t.replace(/"/g, '')));
  }

  // Deduplicate
  return [...new Set(allTools)];
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
  ctx: BuiltInToolContext,
  options?: { modelTierOverride?: string }
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

const log = createLogger('spawn-executor');

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Look up a BaleyBot by ID or name.
 * Searches the user workspace first, then falls back to the system workspace
 * so internal BBs (e.g. bal_generator) can be found when spawned from user BBs.
 *
 * When `options.preferSystem` is true, the system workspace is searched FIRST
 * to prevent user-created BBs from shadowing internal ones (e.g. a user creating
 * a BB named `bal_generator` that overrides the canonical internal version).
 */
async function lookupBaleybot(
  idOrName: string,
  workspaceId: string,
  options?: { preferSystem?: boolean }
): Promise<{ id: string; name: string; balCode: string } | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    idOrName
  );

  // Helper: search a single workspace by ID or name
  const searchWorkspace = async (wsId: string) => {
    if (isUuid) {
      const byId = await db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, idOrName),
          eq(baleybots.workspaceId, wsId),
          notDeleted(baleybots)
        ),
        columns: { id: true, name: true, balCode: true },
      });
      if (byId) return byId;
    }

    return db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.name, idOrName),
        eq(baleybots.workspaceId, wsId),
        notDeleted(baleybots)
      ),
      columns: { id: true, name: true, balCode: true },
    });
  };

  const systemWorkspaceId = await getOrCreateSystemWorkspace();
  const isSystemWorkspace = systemWorkspaceId === workspaceId;

  if (options?.preferSystem && !isSystemWorkspace) {
    // System-first: internal BB spawns should find the canonical system version
    const systemResult = await searchWorkspace(systemWorkspaceId);
    if (systemResult) return systemResult;
    return (await searchWorkspace(workspaceId)) ?? null;
  }

  // Default: user workspace first, system fallback
  const userResult = await searchWorkspace(workspaceId);
  if (userResult) return userResult;

  if (!isSystemWorkspace) {
    return (await searchWorkspace(systemWorkspaceId)) ?? null;
  }

  return null;
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
 * Build a human-readable summary of a spawn result for the LLM.
 * The full structured output is captured in the side channel (_spawnOutputs)
 * so the LLM doesn't need to see raw JSON.
 */
function buildSpawnSummary(botName: string, output: unknown): string {
  if (!output || typeof output !== 'object') {
    return `spawn_baleybot(${botName}) completed. Result: ${String(output).slice(0, 200)}`;
  }
  const obj = output as Record<string, unknown>;
  const parts = [`spawn_baleybot(${botName}) completed successfully.`];
  if (obj.suggestedName ?? obj.name) parts.push(`Name: ${String(obj.suggestedName ?? obj.name).slice(0, 100)}`);
  if (Array.isArray(obj.entities)) {
    parts.push(`Entities: ${obj.entities.map((e: Record<string, unknown>) => String(e.name ?? 'unnamed')).join(', ')}`);
  }
  if (obj.explanation) parts.push(`Summary: ${String(obj.explanation).slice(0, 300)}`);
  parts.push('Full structured output has been captured and will be applied automatically. Do not reproduce raw data.');
  return parts.join('\n');
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
  /** Optional: callback for streaming events from spawned child BBs */
  onChildSegment?: (event: BaleybotStreamEvent) => void;
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
    ctx: BuiltInToolContext,
    spawnOptions?: { modelTierOverride?: string }
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

    // When spawning from the system workspace (internal BBs), prefer system versions
    // to prevent user-created BBs from shadowing internal ones
    const systemWorkspaceId = await getOrCreateSystemWorkspace();
    const isSystemContext = ctx.workspaceId === systemWorkspaceId;
    const targetBB = await lookupBaleybot(baleybotIdOrName, ctx.workspaceId, {
      preferSystem: isSystemContext,
    });

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

    log.info(`Executing BB "${targetBB.name}" (${targetBB.id}) at depth ${currentDepth}`, {
      baleybotId: targetBB.id,
      baleybotName: targetBB.name,
      depth: currentDepth,
      input,
    });

    // Create execution record
    const executionId = await createExecutionRecord(
      targetBB.id,
      input,
      ctx.executionId // Parent execution ID
    );

    try {
      // Apply model tier override if requested
      let balCode = targetBB.balCode;
      if (spawnOptions?.modelTierOverride) {
        // Extract current provider from BAL code (e.g., "anthropic" from "anthropic:claude-haiku-...")
        const modelMatch = balCode.match(/"model"\s*:\s*"([^":]+):/);
        const provider = modelMatch?.[1] as 'openai' | 'anthropic' | 'ollama' | undefined;
        if (provider) {
          const resolvedModel = await getDefaultModelForTier(provider, spawnOptions.modelTierOverride);
          if (resolvedModel) {
            balCode = balCode.replace(
              /"model"\s*:\s*"[^"]+"/g,
              `"model": "${resolvedModel}"`
            );
            log.info(`Model override applied: tier=${spawnOptions.modelTierOverride} → ${resolvedModel}`, {
              baleybotName: targetBB.name,
            });
          }
        }
      }

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
        baleybotName: targetBB.name,
        availableTools,
        workspacePolicies: policies as FullWorkspacePolicies | null,
        triggeredBy: 'other_bb',
        triggerSource: ctx.baleybotId,
      };

      // Convert input to string (executor expects string input)
      const inputStr = typeof input === 'string' ? input : JSON.stringify(input);

      // Execute the BaleyBot with optional streaming callback
      const result = await executeBaleybot(
        balCode,
        inputStr,
        executorContext,
        {
          onSegment: options?.onChildSegment
            ? (childEvent: BaleybotStreamEvent) => {
                options.onChildSegment!({
                  type: 'tool_execution_stream',
                  toolName: 'spawn_baleybot',
                  nestedEvent: childEvent,
                  childBotName: targetBB.name,
                } as BaleybotStreamEvent);
              }
            : undefined,
        }
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

      // Store full output in side channel for downstream consumers
      if (ctx._spawnOutputs) {
        ctx._spawnOutputs.set(targetBB.name, result.output);
      }

      // Return a human-readable summary instead of raw JSON
      const summary = buildSpawnSummary(targetBB.name, result.output);

      return {
        output: summary,
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
