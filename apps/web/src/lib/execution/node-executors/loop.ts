/**
 * Loop Executor
 *
 * Executes a body node repeatedly until a condition is met.
 *
 * Note: This executor handles dynamic iteration for database-stored flows.
 * For static compositions, use the BaleyBots `loop()` or `recursiveLoop()`
 * pipeline primitives. Body nodes are executed via the node executor registry
 * which uses BaleyBots Baleybot.create() and Deterministic.create().
 *
 * SECURITY: Uses expr-eval for safe expression evaluation to prevent code injection.
 */

import { Parser } from 'expr-eval';
import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import { executeNode } from './index';
import type { LoopNodeData, LoopCondition } from '@/lib/baleybots/types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('loop-executor');

// Create a parser instance with limited operators (no function calls)
const expressionParser = new Parser({
  operators: {
    // Enable safe comparison and logical operators
    comparison: true,
    logical: true,
    // Disable potentially dangerous operators
    assignment: false,
    conditional: true,
    in: true,
  },
});

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
    // Safe expression evaluation using expr-eval
    // Supports expressions like "iteration < 5" or "data.done == true"
    try {
      const parsedExpr = expressionParser.parse(condition.expression);
      // Flatten the data to simple key-value pairs for expr-eval compatibility
      const flattenedData = typeof data === 'object' && data !== null
        ? JSON.parse(JSON.stringify(data))
        : data;
      // expr-eval expects a specific Value type, but we're passing compatible primitives
      const context = { data: flattenedData, iteration };
      const result = parsedExpr.evaluate(context as Parameters<typeof parsedExpr.evaluate>[0]);
      return Boolean(result);
    } catch (error: unknown) {
      logger.warn(`Failed to evaluate loop condition expression: ${condition.expression}`, { error });
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

    let currentData = input;
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

      // Execute body node if configured
      let bodyOutput: unknown = currentData;
      if (data.bodyNodeId) {
        const bodyNode = context.nodeResults.get(data.bodyNodeId);
        // Look up the body node in compiled nodes and execute it
        const bodyCompiledNode: CompiledNode = {
          nodeId: data.bodyNodeId,
          type: (bodyNode as CompiledNode)?.type ?? 'function-block',
          data: (bodyNode as CompiledNode)?.data ?? {},
          incomingEdges: [],
          outgoingEdges: [],
        };

        // If the body node is available in context as a compiled node, use it directly
        // Otherwise, execute via the registry
        bodyOutput = await executeNode(bodyCompiledNode, currentData, context);
      }

      // Store iteration result
      iterationResults.push({
        iteration,
        input: currentData,
        output: bodyOutput,
      });

      // Use body node output as input for next iteration
      currentData = bodyOutput;
      iteration++;
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
