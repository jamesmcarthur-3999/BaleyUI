/**
 * BaleyBot Completion Trigger Service
 *
 * Handles triggering downstream BaleyBots when a source BB completes execution.
 * This enables BB chaining where the completion of one BB triggers another.
 *
 * Trigger types:
 * - 'completion': Triggers when source BB completes (success or failure)
 * - 'success': Triggers only when source BB completes successfully
 * - 'failure': Triggers only when source BB fails
 */

import {
  db,
  baleybotTriggers,
  baleybots,
  baleybotExecutions,
  eq,
  and,
  notDeleted,
} from '@baleyui/db';
import { executeBALCode } from '@baleyui/sdk';
import { createLogger } from '@/lib/logger';

const log = createLogger('bb_trigger');

// ============================================================================
// TYPES
// ============================================================================

export type TriggerType = 'completion' | 'success' | 'failure';

export interface TriggerConfig {
  id: string;
  sourceBaleybotId: string;
  targetBaleybotId: string;
  triggerType: TriggerType;
  enabled: boolean;
  inputMapping: Record<string, string> | null;
  staticInput: Record<string, unknown> | null;
  condition: string | null;
}

export interface TriggerResult {
  triggerId: string;
  targetBaleybotId: string;
  executionId: string | null;
  success: boolean;
  error?: string;
}

export interface CompletionEvent {
  sourceBaleybotId: string;
  executionId: string;
  status: 'completed' | 'failed';
  output: unknown;
}

// ============================================================================
// TRIGGER SERVICE
// ============================================================================

/**
 * Get all active triggers for a source BaleyBot
 */
export async function getTriggersForSource(
  sourceBaleybotId: string
): Promise<TriggerConfig[]> {
  const triggers = await db.query.baleybotTriggers.findMany({
    where: and(
      eq(baleybotTriggers.sourceBaleybotId, sourceBaleybotId),
      eq(baleybotTriggers.enabled, true)
    ),
  });

  return triggers.map((t) => ({
    id: t.id,
    sourceBaleybotId: t.sourceBaleybotId,
    targetBaleybotId: t.targetBaleybotId,
    triggerType: t.triggerType as TriggerType,
    enabled: t.enabled ?? true,
    inputMapping: t.inputMapping as Record<string, string> | null,
    staticInput: t.staticInput as Record<string, unknown> | null,
    condition: t.condition,
  }));
}

/**
 * Check if a trigger should fire based on execution status
 */
function shouldTriggerFire(
  trigger: TriggerConfig,
  status: 'completed' | 'failed'
): boolean {
  switch (trigger.triggerType) {
    case 'completion':
      return true; // Always fires on completion (success or failure)
    case 'success':
      return status === 'completed';
    case 'failure':
      return status === 'failed';
    default:
      return false;
  }
}

/**
 * Build input for the target BB based on input mapping
 */
function buildTargetInput(
  trigger: TriggerConfig,
  sourceOutput: unknown
): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  // Start with static input if provided
  if (trigger.staticInput) {
    Object.assign(input, trigger.staticInput);
  }

  // Apply input mapping
  if (trigger.inputMapping && sourceOutput && typeof sourceOutput === 'object') {
    for (const [targetField, sourcePath] of Object.entries(trigger.inputMapping)) {
      const value = getNestedValue(sourceOutput as Record<string, unknown>, sourcePath);
      if (value !== undefined) {
        input[targetField] = value;
      }
    }
  }

  // If no mapping, pass the entire source output
  if (!trigger.inputMapping && !trigger.staticInput) {
    return { sourceOutput };
  }

  return input;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Execute a triggered BaleyBot
 */
async function executeTriggeredBB(
  trigger: TriggerConfig,
  input: Record<string, unknown>,
  sourceExecutionId: string
): Promise<TriggerResult> {
  let executionId: string | null = null;

  try {
    // Get the target BB
    const targetBB = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, trigger.targetBaleybotId),
        notDeleted(baleybots)
      ),
      columns: {
        id: true,
        name: true,
        balCode: true,
        status: true,
      },
    });

    if (!targetBB) {
      return {
        triggerId: trigger.id,
        targetBaleybotId: trigger.targetBaleybotId,
        executionId: null,
        success: false,
        error: 'Target BaleyBot not found or deleted',
      };
    }

    if (targetBB.status !== 'active') {
      return {
        triggerId: trigger.id,
        targetBaleybotId: trigger.targetBaleybotId,
        executionId: null,
        success: false,
        error: `Target BaleyBot is not active (status: ${targetBB.status})`,
      };
    }

    // Create execution record
    const [execution] = await db
      .insert(baleybotExecutions)
      .values({
        baleybotId: targetBB.id,
        status: 'running',
        input: input,
        triggeredBy: 'other_bb',
        triggerSource: sourceExecutionId,
        startedAt: new Date(),
      })
      .returning({ id: baleybotExecutions.id });

    if (!execution) {
      throw new Error('Failed to create execution record');
    }

    executionId = execution.id;

    log.info(
      `Executing triggered BB "${targetBB.name}" (${targetBB.id}) from trigger ${trigger.id}`
    );

    // Get API key for execution
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('No API key configured for triggered execution');
    }

    const startTime = Date.now();

    // Execute the BaleyBot with the computed input
    const inputStr = JSON.stringify(input);
    const result = await executeBALCode(targetBB.balCode, {
      input: inputStr,
      model: 'gpt-4o-mini',
      apiKey,
      timeout: 55000,
    });

    const durationMs = Date.now() - startTime;

    // Update execution record with success
    await db
      .update(baleybotExecutions)
      .set({
        status: 'completed',
        output: result as unknown as Record<string, unknown>,
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    log.info(
      `Triggered BB "${targetBB.name}" completed successfully in ${durationMs}ms`
    );

    return {
      triggerId: trigger.id,
      targetBaleybotId: trigger.targetBaleybotId,
      executionId: execution.id,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(` Triggered BB execution failed:`, errorMessage);

    // Mark the execution as failed so it doesn't stay stuck in 'running'
    if (executionId) {
      try {
        await db
          .update(baleybotExecutions)
          .set({
            status: 'failed',
            error: errorMessage,
            completedAt: new Date(),
          })
          .where(eq(baleybotExecutions.id, executionId));
      } catch (updateErr) {
        log.error('Failed to update execution status', updateErr);
      }
    }

    return {
      triggerId: trigger.id,
      targetBaleybotId: trigger.targetBaleybotId,
      executionId,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Process a BB completion event and trigger any downstream BBs
 */
export async function processBBCompletion(
  event: CompletionEvent
): Promise<TriggerResult[]> {
  log.info(
    `Processing completion for BB ${event.sourceBaleybotId}, status: ${event.status}`
  );

  // Get all triggers for this source BB
  const triggers = await getTriggersForSource(event.sourceBaleybotId);

  if (triggers.length === 0) {
    log.info(` No triggers configured for BB ${event.sourceBaleybotId}`);
    return [];
  }

  const results: TriggerResult[] = [];

  // Process each trigger
  for (const trigger of triggers) {
    // Check if this trigger should fire
    if (!shouldTriggerFire(trigger, event.status)) {
      log.debug(
        `Skipping trigger ${trigger.id} (type: ${trigger.triggerType}, status: ${event.status})`
      );
      continue;
    }

    // Build input for target BB
    const targetInput = buildTargetInput(trigger, event.output);

    // Execute the triggered BB
    const result = await executeTriggeredBB(trigger, targetInput, event.executionId);
    results.push(result);
  }

  log.info(
    `Processed ${results.length} triggers for BB ${event.sourceBaleybotId}`
  );

  return results;
}

/**
 * Create a new BB trigger
 */
export async function createTrigger(
  workspaceId: string,
  sourceBaleybotId: string,
  targetBaleybotId: string,
  config: {
    triggerType: TriggerType;
    inputMapping?: Record<string, string>;
    staticInput?: Record<string, unknown>;
    condition?: string;
  }
): Promise<string> {
  const [trigger] = await db
    .insert(baleybotTriggers)
    .values({
      workspaceId,
      sourceBaleybotId,
      targetBaleybotId,
      triggerType: config.triggerType,
      enabled: true,
      inputMapping: config.inputMapping,
      staticInput: config.staticInput,
      condition: config.condition,
    })
    .returning({ id: baleybotTriggers.id });

  if (!trigger) {
    throw new Error('Failed to create trigger');
  }

  log.info(
    `Created trigger ${trigger.id}: ${sourceBaleybotId} -> ${targetBaleybotId} (${config.triggerType})`
  );

  return trigger.id;
}

/**
 * Disable a trigger
 */
export async function disableTrigger(triggerId: string): Promise<void> {
  await db
    .update(baleybotTriggers)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(baleybotTriggers.id, triggerId));

  log.info(` Disabled trigger ${triggerId}`);
}

/**
 * Enable a trigger
 */
export async function enableTrigger(triggerId: string): Promise<void> {
  await db
    .update(baleybotTriggers)
    .set({ enabled: true, updatedAt: new Date() })
    .where(eq(baleybotTriggers.id, triggerId));

  log.info(` Enabled trigger ${triggerId}`);
}

/**
 * Delete a trigger
 */
export async function deleteTrigger(triggerId: string): Promise<void> {
  await db.delete(baleybotTriggers).where(eq(baleybotTriggers.id, triggerId));

  log.info(` Deleted trigger ${triggerId}`);
}
