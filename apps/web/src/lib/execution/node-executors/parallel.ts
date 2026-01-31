/**
 * Parallel Executor
 *
 * Executes multiple branches in parallel and merges results.
 *
 * Note: This executor handles dynamic fan-out/fan-in for database-stored flows.
 * For static compositions, use the BaleyBots `parallel()` pipeline primitive.
 * Splitter and merger blocks use aiBlockExecutor and functionBlockExecutor
 * which properly integrate with BaleyBots Baleybot.create() and Deterministic.create().
 */

import { db, blocks, eq } from '@baleyui/db';
import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { ParallelNodeData } from '@/lib/baleybots/types';
import { aiBlockExecutor } from './ai-block';
import { functionBlockExecutor } from './function-block';

interface SplitResult {
  chunks: unknown[];
}

interface MergeInput {
  results: unknown[];
  originalInput: unknown;
}

export const parallelExecutor: NodeExecutor = {
  type: 'parallel',

  async execute(
    node: CompiledNode,
    input: unknown,
    context: NodeExecutorContext
  ): Promise<unknown> {
    const data = node.data as ParallelNodeData;

    // Step 1: Split the input if a splitter is configured
    let chunks: unknown[];

    if (data.splitterBlockId) {
      const splitterBlock = await db.query.blocks.findFirst({
        where: eq(blocks.id, data.splitterBlockId),
      });

      if (!splitterBlock) {
        throw new Error(`Splitter block not found: ${data.splitterBlockId}`);
      }

      const splitterNode: CompiledNode = {
        nodeId: `${node.nodeId}-splitter`,
        type: splitterBlock.type === 'ai' ? 'ai-block' : 'function-block',
        data: {
          label: 'Splitter',
          blockId: data.splitterBlockId,
        },
        incomingEdges: [],
        outgoingEdges: [],
      };

      const executor =
        splitterBlock.type === 'ai' ? aiBlockExecutor : functionBlockExecutor;

      const splitResult = (await executor.execute(
        splitterNode,
        input,
        context
      )) as SplitResult;

      // Expect the splitter to return an array or object with chunks
      if (Array.isArray(splitResult)) {
        chunks = splitResult;
      } else if (
        typeof splitResult === 'object' &&
        splitResult !== null &&
        'chunks' in splitResult
      ) {
        chunks = splitResult.chunks;
      } else {
        // If single item, wrap in array
        chunks = [splitResult];
      }
    } else if (Array.isArray(input)) {
      // If input is already an array, use it directly
      chunks = input;
    } else {
      // Single input, process once
      chunks = [input];
    }

    // Step 2: Execute processors in parallel
    // Note: In a full implementation, each processor would be a separate node
    // For now, we'll process each chunk in parallel
    const processorResults = await Promise.all(
      chunks.map(async (chunk, index) => {
        // Check for cancellation before each chunk
        if (context.signal?.aborted) {
          throw new Error('Execution cancelled');
        }

        // Return chunk with index for tracking
        return {
          index,
          input: chunk,
          output: chunk, // Pass through for now
        };
      })
    );

    // Step 3: Merge results if a merger is configured
    if (data.mergerBlockId) {
      const mergerBlock = await db.query.blocks.findFirst({
        where: eq(blocks.id, data.mergerBlockId),
      });

      if (!mergerBlock) {
        throw new Error(`Merger block not found: ${data.mergerBlockId}`);
      }

      const mergerNode: CompiledNode = {
        nodeId: `${node.nodeId}-merger`,
        type: mergerBlock.type === 'ai' ? 'ai-block' : 'function-block',
        data: {
          label: 'Merger',
          blockId: data.mergerBlockId,
        },
        incomingEdges: [],
        outgoingEdges: [],
      };

      const executor =
        mergerBlock.type === 'ai' ? aiBlockExecutor : functionBlockExecutor;

      const mergeInput: MergeInput = {
        results: processorResults.map((r) => r.output),
        originalInput: input,
      };

      return executor.execute(mergerNode, mergeInput, context);
    }

    // No merger, return array of results
    return {
      __parallelResult: true,
      results: processorResults.map((r) => r.output),
      totalChunks: chunks.length,
    };
  },
};
