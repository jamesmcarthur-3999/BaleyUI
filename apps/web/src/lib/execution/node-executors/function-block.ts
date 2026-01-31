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

/**
 * Create a sandboxed function from code string
 *
 * The function receives the input as its first argument and should return the output.
 * Available globals: console, JSON, Math, Date, Array, Object, String, Number, Boolean
 */
function createSandboxedFunction(code: string): (input: unknown) => unknown {
  // Create a restricted scope
  const allowedGlobals = {
    console: {
      log: (...args: unknown[]) => console.log('[Function Block]', ...args),
      warn: (...args: unknown[]) => console.warn('[Function Block]', ...args),
      error: (...args: unknown[]) => console.error('[Function Block]', ...args),
    },
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
  };

  // Wrap the code in a function
  const wrappedCode = `
    return (function(input) {
      "use strict";
      ${code}
    });
  `;

  try {
    // Create the function with restricted scope
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const createFn = new Function(...Object.keys(allowedGlobals), wrappedCode);
    return createFn(...Object.values(allowedGlobals));
  } catch (error) {
    throw new Error(
      `Failed to compile function: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
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
