/**
 * Function Block Executor
 *
 * Executes deterministic function blocks using the BaleyBots Deterministic primitive.
 * This ensures function blocks implement the Processable interface and integrate
 * properly with the BaleyBots composition patterns.
 */

import { db, blocks, eq } from '@baleyui/db';
import { Deterministic } from '@baleybots/core';
import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { FunctionBlockNodeData } from '@/lib/baleybots/types';
import { withRetry } from '../retry';
import { ExecutionError, ErrorCode, TimeoutError } from '../errors';
import { evaluateSafeExpression, isSafeExpression } from '@/lib/utils/safe-eval';

/**
 * Create a sandboxed function from code string using safe expression evaluation.
 *
 * SECURITY: Uses a whitelist-based safe expression evaluator instead of new Function().
 * This prevents arbitrary code execution but limits function blocks to safe expressions.
 *
 * Supported patterns:
 * - Simple return statements: `return input.field;`
 * - Expressions with comparisons: `return input.value > 10 ? "high" : "low";`
 * - Property access: `return input.data[0].name;`
 * - Math operations: `return input.a + input.b;`
 *
 * For complex transformations, use a proper BaleyBot block type instead.
 */
function createSandboxedFunction(code: string): (input: unknown) => unknown {
  // Normalize the code - remove extra whitespace and handle simple cases
  const normalizedCode = code.trim();

  // Handle simple return statements
  const returnMatch = normalizedCode.match(/^\s*return\s+(.+?);?\s*$/);
  if (returnMatch && returnMatch[1]) {
    const expression = returnMatch[1].trim();

    // Validate the expression is safe
    if (!isSafeExpression(expression)) {
      throw new Error(
        `Unsafe expression detected in function block. ` +
        `Only safe expressions (property access, comparisons, math, ternary) are allowed. ` +
        `Expression: ${expression}`
      );
    }

    return (input: unknown) => {
      return evaluateSafeExpression(expression, { input });
    };
  }

  // Handle multi-line code by extracting the return expression
  const lines = normalizedCode.split('\n').map(l => l.trim()).filter(l => l);
  const lastLine = lines[lines.length - 1];

  if (lastLine && lastLine.startsWith('return ')) {
    const expression = lastLine.replace(/^return\s+/, '').replace(/;$/, '').trim();

    // Validate the expression is safe
    if (!isSafeExpression(expression)) {
      throw new Error(
        `Unsafe expression detected in function block. ` +
        `Only safe expressions (property access, comparisons, math, ternary) are allowed. ` +
        `Expression: ${expression}`
      );
    }

    // If there are preceding lines, they might be variable declarations
    // For safety, we only support single return statements
    if (lines.length > 1) {
      throw new Error(
        `Function blocks only support single return statements for security. ` +
        `Use a BaleyBot block for complex transformations.`
      );
    }

    return (input: unknown) => {
      return evaluateSafeExpression(expression, { input });
    };
  }

  // If no return statement found, treat the entire code as an expression
  if (!normalizedCode.includes('\n') && isSafeExpression(normalizedCode)) {
    return (input: unknown) => {
      return evaluateSafeExpression(normalizedCode, { input });
    };
  }

  throw new Error(
    `Invalid function block code. Must be a simple return statement or safe expression. ` +
    `For complex logic, use a BaleyBot block instead.`
  );
}

/**
 * Execute function with timeout
 */
async function executeWithTimeout<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(
        `Function execution timed out after ${timeoutMs}ms`,
        timeoutMs
      ));
    }, timeoutMs);

    try {
      const result = fn();

      if (result instanceof Promise) {
        result
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch((error) => {
            clearTimeout(timer);
            reject(error);
          });
      } else {
        clearTimeout(timer);
        resolve(result);
      }
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

export const functionBlockExecutor: NodeExecutor = {
  type: 'function-block',

  async execute(
    node: CompiledNode,
    input: unknown,
    context: NodeExecutorContext
  ): Promise<unknown> {
    const data = node.data as FunctionBlockNodeData;

    // Load block from database
    const block = await db.query.blocks.findFirst({
      where: eq(blocks.id, data.blockId),
    });

    if (!block) {
      throw new ExecutionError(
        `Block not found: ${data.blockId}`,
        ErrorCode.RESOURCE_NOT_FOUND,
        {
          nodeId: node.nodeId,
          nodeType: node.type,
          flowId: context.flowId,
          executionId: context.executionId,
          blockId: data.blockId,
        }
      );
    }

    if (!block.code) {
      throw new ExecutionError(
        `No code defined for function block: ${data.blockId}`,
        ErrorCode.VALIDATION_FAILED,
        {
          nodeId: node.nodeId,
          nodeType: node.type,
          flowId: context.flowId,
          executionId: context.executionId,
          blockId: data.blockId,
        }
      );
    }

    // Check for cancellation
    if (context.signal?.aborted) {
      throw new ExecutionError(
        'Execution cancelled',
        ErrorCode.EXECUTION_CANCELLED,
        {
          nodeId: node.nodeId,
          nodeType: node.type,
          flowId: context.flowId,
          executionId: context.executionId,
        }
      );
    }

    // Create the sandboxed function
    let sandboxedFn: (input: unknown) => unknown;
    try {
      sandboxedFn = createSandboxedFunction(block.code);
    } catch (error) {
      throw new ExecutionError(
        `Failed to compile function: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.VALIDATION_FAILED,
        {
          nodeId: node.nodeId,
          nodeType: node.type,
          flowId: context.flowId,
          executionId: context.executionId,
          blockId: data.blockId,
        }
      );
    }

    // Wrap in a BaleyBots Deterministic processor
    // This ensures it implements the Processable interface and integrates
    // with the BaleyBots composition patterns
    const processor = Deterministic.create({
      name: block.name || `function-block-${data.blockId}`,
      processFn: async (input: unknown) => {
        return executeWithTimeout(() => sandboxedFn(input));
      },
    });

    // Execute with retry logic for transient failures
    // Function blocks typically don't have transient failures, but we add
    // retry for timeout errors and potential runtime errors
    return withRetry(
      async () => {
        try {
          // Execute using the Processable interface
          const result = await processor.process(input, {
            signal: context.signal,
          });
          return result;
        } catch (error) {
          // If it's already an ExecutionError, rethrow it
          if (error instanceof ExecutionError) {
            throw error;
          }

          // Convert to ExecutionError with context
          throw new ExecutionError(
            `Function block execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ErrorCode.EXECUTION_FAILED,
            {
              nodeId: node.nodeId,
              nodeType: node.type,
              flowId: context.flowId,
              executionId: context.executionId,
              blockId: data.blockId,
            }
          );
        }
      },
      {
        maxAttempts: 2, // Function blocks usually don't need many retries
        context: {
          nodeId: node.nodeId,
          nodeType: node.type,
          flowId: context.flowId,
          executionId: context.executionId,
          blockId: data.blockId,
        },
        signal: context.signal,
      }
    );
  },
};
