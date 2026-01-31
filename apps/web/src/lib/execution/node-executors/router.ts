/**
 * Router Executor
 *
 * Routes input to different branches based on a field value or classifier.
 *
 * Note: This executor handles dynamic routing for database-stored flows.
 * For static compositions, use the BaleyBots `route()` pipeline primitive.
 * When a classifier block is used, it internally uses the aiBlockExecutor
 * which properly integrates with BaleyBots Baleybot.create().
 */

import { db, blocks, eq } from '@baleyui/db';
import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { RouterNodeData } from '@/lib/baleybots/types';
import { aiBlockExecutor } from './ai-block';

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

export const routerExecutor: NodeExecutor = {
  type: 'router',

  async execute(
    node: CompiledNode,
    input: unknown,
    context: NodeExecutorContext
  ): Promise<unknown> {
    const data = node.data as RouterNodeData;

    let routeKey: string;

    // If there's a classifier block, use it to determine the route
    if (data.classifierBlockId) {
      const classifierBlock = await db.query.blocks.findFirst({
        where: eq(blocks.id, data.classifierBlockId),
      });

      if (!classifierBlock) {
        throw new Error(`Classifier block not found: ${data.classifierBlockId}`);
      }

      // Create a temporary node to execute the classifier
      const classifierNode: CompiledNode = {
        nodeId: `${node.nodeId}-classifier`,
        type: 'ai-block',
        data: {
          label: 'Classifier',
          blockId: data.classifierBlockId,
        },
        incomingEdges: [],
        outgoingEdges: [],
      };

      // Execute the classifier
      const classifierOutput = await aiBlockExecutor.execute(
        classifierNode,
        input,
        context
      );

      // Extract route key from classifier output
      if (typeof classifierOutput === 'string') {
        routeKey = classifierOutput.trim();
      } else if (typeof classifierOutput === 'object' && classifierOutput !== null) {
        const output = classifierOutput as Record<string, unknown>;
        routeKey = String(output.route || output.category || output.class || '');
      } else {
        routeKey = String(classifierOutput);
      }
    } else {
      // Use field-based routing
      const value = getNestedValue(input, data.routeField);
      routeKey = String(value ?? '');
    }

    // Find matching route
    const targetNodeId = data.routes[routeKey] || data.defaultRoute;

    if (!targetNodeId) {
      throw new Error(
        `No route found for key "${routeKey}" and no default route configured`
      );
    }

    // Return routing result with the selected path
    return {
      __routerResult: true,
      routeKey,
      targetNodeId,
      input,
    };
  },
};
