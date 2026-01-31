/**
 * Source Executor
 *
 * Entry point for flow execution. Handles different trigger types.
 */

import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { SourceNodeData } from '@/lib/baleybots/types';

export const sourceExecutor: NodeExecutor = {
  type: 'source',

  async execute(
    node: CompiledNode,
    input: unknown,
    context: NodeExecutorContext
  ): Promise<unknown> {
    const data = node.data as SourceNodeData;

    // Source node primarily passes through the flow input
    // with any transformations based on trigger type

    switch (data.triggerType) {
      case 'manual':
        // Manual triggers pass input directly
        return {
          __sourceResult: true,
          triggerType: 'manual',
          triggeredAt: new Date().toISOString(),
          input: context.flowInput,
        };

      case 'webhook':
        // Webhook triggers include request metadata
        return {
          __sourceResult: true,
          triggerType: 'webhook',
          triggeredAt: new Date().toISOString(),
          webhookPath: data.webhookPath,
          input: context.flowInput,
          // In production, would include headers, method, etc.
        };

      case 'schedule':
        // Scheduled triggers include schedule info
        return {
          __sourceResult: true,
          triggerType: 'schedule',
          triggeredAt: new Date().toISOString(),
          cronExpression: data.cronExpression,
          input: context.flowInput,
        };

      default:
        // Pass through for unknown trigger types
        return context.flowInput;
    }
  },
};
