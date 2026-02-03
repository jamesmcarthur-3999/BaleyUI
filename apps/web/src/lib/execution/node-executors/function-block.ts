/**
 * Function Block Executor
 *
 * Executes deterministic function blocks using the BaleyBots Deterministic primitive.
 * This ensures function blocks implement the Processable interface and integrate
 * properly with the BaleyBots composition patterns.
 *
 * SECURITY: Uses isolated-vm for true V8 isolate sandboxing to prevent:
 * - Access to Node.js globals (process, require, etc.)
 * - Prototype pollution attacks
 * - Constructor escape attacks
 * - Memory exhaustion (enforced memory limits)
 * - CPU exhaustion (enforced timeouts)
 */

import { db, blocks, eq } from '@baleyui/db';
import { Deterministic } from '@baleybots/core';
import ivm from 'isolated-vm';
import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { FunctionBlockNodeData } from '@/lib/baleybots/types';
import { withRetry } from '../retry';
import { ExecutionError, ErrorCode, TimeoutError } from '../errors';

// Memory limit for isolate (128MB)
const ISOLATE_MEMORY_LIMIT = 128;

// Execution timeout (30 seconds)
const EXECUTION_TIMEOUT_MS = 30000;

/**
 * Execute code in a sandboxed V8 isolate
 *
 * Uses isolated-vm to create a true V8 isolate with:
 * - Memory limits
 * - CPU timeout
 * - No access to Node.js globals
 */
async function executeSandboxed(code: string, input: unknown): Promise<unknown> {
  const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_LIMIT });

  try {
    const context = await isolate.createContext();
    const jail = context.global;

    // Set up limited safe globals
    await jail.set('global', jail.derefInto());

    // Inject input as a copy
    await jail.set('__input__', new ivm.ExternalCopy(input).copyInto());

    // Create a console proxy that logs safely
    const logCallback = new ivm.Reference((...args: unknown[]) => {
      console.log('[Function Block]', ...args);
    });
    await jail.set('__log__', logCallback);

    const warnCallback = new ivm.Reference((...args: unknown[]) => {
      console.warn('[Function Block]', ...args);
    });
    await jail.set('__warn__', warnCallback);

    const errorCallback = new ivm.Reference((...args: unknown[]) => {
      console.error('[Function Block]', ...args);
    });
    await jail.set('__error__', errorCallback);

    // Build the sandboxed code with safe globals
    const wrappedCode = `
      "use strict";

      // Create safe console
      const console = {
        log: (...args) => __log__.apply(undefined, args, { arguments: { copy: true } }),
        warn: (...args) => __warn__.apply(undefined, args, { arguments: { copy: true } }),
        error: (...args) => __error__.apply(undefined, args, { arguments: { copy: true } }),
      };

      // Execute user code with input
      const input = __input__;
      const __userFn__ = (function(input) {
        ${code}
      });

      // Return result
      __userFn__(input);
    `;

    const script = await isolate.compileScript(wrappedCode);
    const result = await script.run(context, { timeout: EXECUTION_TIMEOUT_MS });

    // Clean up references
    logCallback.release();
    warnCallback.release();
    errorCallback.release();

    return result;
  } finally {
    // Always dispose the isolate to free memory
    isolate.dispose();
  }
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

    // Wrap in a BaleyBots Deterministic processor
    // This ensures it implements the Processable interface and integrates
    // with the BaleyBots composition patterns
    const processor = Deterministic.create({
      name: block.name || `function-block-${data.blockId}`,
      processFn: async (input: unknown) => {
        // Execute in isolated V8 sandbox with memory and timeout limits
        return executeSandboxed(block.code!, input);
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
