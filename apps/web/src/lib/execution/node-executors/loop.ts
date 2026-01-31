/**
 * Loop Executor
 *
 * Executes a body node repeatedly until a condition is met.
 *
 * Note: This executor handles dynamic iteration for database-stored flows.
 * For static compositions, use the BaleyBots `loop()` or `recursiveLoop()`
 * pipeline primitives. Body nodes are executed via the node executor registry
 * which uses BaleyBots Baleybot.create() and Deterministic.create().
 */

import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { LoopNodeData, LoopCondition } from '@/lib/baleybots/types';

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return undefined;
  }

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate a loop condition
 */
function evaluateCondition(
  condition: LoopCondition,
  data: unknown,
  iteration: number
): boolean {
  if (condition.type === 'field' && condition.field) {
    const value = getNestedValue(data, condition.field);
    const target = condition.value;

    switch (condition.operator) {
      case 'eq':
        return value === target;
      case 'neq':
        return value !== target;
      case 'gt':
        return typeof value === 'number' && typeof target === 'number' && value > target;
      case 'lt':
        return typeof value === 'number' && typeof target === 'number' && value < target;
      case 'gte':
        return typeof value === 'number' && typeof target === 'number' && value >= target;
      case 'lte':
        return typeof value === 'number' && typeof target === 'number' && value <= target;
      default:
        return false;
    }
  }

  if (condition.type === 'expression' && condition.expression) {
    // Simple expression evaluation
    // In production, use a proper expression evaluator
    try {
      // Support simple expressions like "iteration < 5" or "data.done === true"
      const expr = condition.expression
        .replace(/\bdata\b/g, JSON.stringify(data))
        .replace(/\biteration\b/g, String(iteration));

      // Very limited eval - only for simple boolean expressions
      // In production, use a proper safe expression evaluator
      const safeEval = new Function(`return ${expr}`);
      return Boolean(safeEval());
    } catch {
      return false;
    }
  }

  return false;
}

export const loopExecutor: NodeExecutor = {
  type: 'loop',

  async execute(
    node: CompiledNode,
    input: unknown,
    context: NodeExecutorContext
  ): Promise<unknown> {
    const data = node.data as LoopNodeData;
    const maxIterations = data.maxIterations || 10;

    const currentData = input;
    let iteration = 0;
    const iterationResults: unknown[] = [];

    // Continue while condition is not met and max iterations not reached
    while (iteration < maxIterations) {
      // Check for cancellation
      if (context.signal?.aborted) {
        throw new Error('Execution cancelled');
      }

      // Check exit condition (evaluates to true when loop should continue)
      const shouldContinue = !evaluateCondition(data.condition, currentData, iteration);

      if (!shouldContinue) {
        break;
      }

      // Store iteration result
      iterationResults.push({
        iteration,
        input: currentData,
        // In a full implementation, this would execute the body node
        output: currentData,
      });

      // For now, just pass through the data
      // In a full implementation, this would execute the bodyNodeId
      iteration++;

      // Simple example: if the condition never changes, we'd loop forever
      // In practice, the body node would modify currentData
    }

    return {
      __loopResult: true,
      finalOutput: currentData,
      iterations: iterationResults,
      totalIterations: iteration,
      exitReason: iteration >= maxIterations ? 'max_iterations' : 'condition_met',
    };
  },
};
