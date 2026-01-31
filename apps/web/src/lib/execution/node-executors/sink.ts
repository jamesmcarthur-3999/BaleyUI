/**
 * Sink Executor
 *
 * Terminal node for flow execution. Handles different output types.
 */

import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { SinkNodeData } from '@/lib/baleybots/types';
import { createSignatureHeader } from '@/lib/api/webhook-signature';

export const sinkExecutor: NodeExecutor = {
  type: 'sink',

  async execute(
    node: CompiledNode,
    input: unknown,
    context: NodeExecutorContext
  ): Promise<unknown> {
    const data = node.data as SinkNodeData;

    switch (data.sinkType) {
      case 'output':
        // Simple output - return the input as final result
        return {
          __sinkResult: true,
          sinkType: 'output',
          completedAt: new Date().toISOString(),
          output: input,
        };

      case 'database':
        // Database sink - would store to configured database
        // In production, would use the connection from config
        console.log('[Sink] Database output:', input);
        return {
          __sinkResult: true,
          sinkType: 'database',
          completedAt: new Date().toISOString(),
          stored: true,
          output: input,
        };

      case 'webhook':
        // Webhook sink - POST to configured URL with signature
        try {
          const config = data.config as Record<string, unknown>;
          const webhookUrl = config?.url as string;
          const signingSecret = config?.signingSecret as string;

          if (!webhookUrl) {
            throw new Error('Webhook URL not configured');
          }

          // Prepare payload
          const payload = JSON.stringify(input);

          // Create headers
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'BaleyUI-Webhook',
          };

          // Add signature if signing secret is configured
          if (signingSecret) {
            headers['X-BaleyUI-Signature'] = createSignatureHeader(payload, signingSecret);
          }

          // Send webhook
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers,
            body: payload,
          });

          return {
            __sinkResult: true,
            sinkType: 'webhook',
            completedAt: new Date().toISOString(),
            delivered: response.ok,
            statusCode: response.status,
            output: input,
          };
        } catch (error) {
          console.error('[Sink] Webhook delivery failed:', error);
          return {
            __sinkResult: true,
            sinkType: 'webhook',
            completedAt: new Date().toISOString(),
            delivered: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            output: input,
          };
        }

      case 'notification':
        // Notification sink - would send notification
        // In production, would use notification service
        console.log('[Sink] Notification:', input);
        return {
          __sinkResult: true,
          sinkType: 'notification',
          completedAt: new Date().toISOString(),
          sent: true,
          output: input,
        };

      default:
        // Unknown sink type - just return input
        return input;
    }
  },
};
