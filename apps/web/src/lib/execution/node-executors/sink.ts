/**
 * Sink Executor
 *
 * Terminal node for flow execution. Handles different output types.
 */

import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { SinkNodeData } from '@/lib/baleybots/types';
import { createSignatureHeader } from '@/lib/api/webhook-signature';
import { createLogger, extractErrorMessage } from '@/lib/logger';
import { createDatabaseExecutor } from '@/lib/baleybot/tools/connection-derived/database-executor';
import type { DatabaseConnectionConfig } from '@/lib/connections/providers';

const logger = createLogger('sink-executor');

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** Reject URLs pointing to private/internal networks */
function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost|::1|\[::1\])/.test(hostname);
  } catch {
    return true; // Invalid URLs are treated as private
  }
}

export const sinkExecutor: NodeExecutor = {
  type: 'sink',

  async execute(
    node: CompiledNode,
    input: unknown,
    _context: NodeExecutorContext
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

      case 'database': {
        // Database sink - store data to configured database connection
        const dbConfig = data.config as Record<string, unknown> | undefined;
        const connectionType = dbConfig?.connectionType as 'postgres' | 'mysql' | undefined;
        const tableName = dbConfig?.tableName as string | undefined;

        if (!connectionType || !dbConfig?.connectionConfig || !tableName) {
          logger.warn('Database sink missing configuration', {
            hasConnectionType: !!connectionType,
            hasConfig: !!dbConfig?.connectionConfig,
            hasTable: !!tableName,
          });
          return {
            __sinkResult: true,
            sinkType: 'database',
            completedAt: new Date().toISOString(),
            stored: false,
            error: 'Database sink not configured: missing connectionType, connectionConfig, or tableName',
            output: input,
          };
        }

        let executor;
        try {
          executor = createDatabaseExecutor(
            connectionType,
            dbConfig.connectionConfig as DatabaseConnectionConfig,
            { timeout: 30000, maxRows: 1 }
          );

          // Build parameterized INSERT from input data
          const inputData = typeof input === 'object' && input !== null
            ? input as Record<string, unknown>
            : { value: input };
          const columns = Object.keys(inputData);
          const quotedTable = quoteIdentifier(tableName);
          const quotedColumns = columns.map(c => quoteIdentifier(c));
          const placeholders = columns.map((_, i) => `$${i + 1}`);
          const values = Object.values(inputData);

          const insertSQL = `INSERT INTO ${quotedTable} (${quotedColumns.join(', ')}) VALUES (${placeholders.join(', ')})`;
          await executor.queryWithParams(insertSQL, values);

          return {
            __sinkResult: true,
            sinkType: 'database',
            completedAt: new Date().toISOString(),
            stored: true,
            output: input,
          };
        } catch (error: unknown) {
          logger.error('Database sink write failed', error);
          return {
            __sinkResult: true,
            sinkType: 'database',
            completedAt: new Date().toISOString(),
            stored: false,
            error: extractErrorMessage(error),
            output: input,
          };
        } finally {
          if (executor) {
            await executor.close().catch(() => {});
          }
        }
      }

      case 'webhook':
        // Webhook sink - POST to configured URL with signature
        try {
          const config = data.config as Record<string, unknown>;
          const webhookUrl = config?.url as string;
          const signingSecret = config?.signingSecret as string;

          if (!webhookUrl) {
            throw new Error('Webhook URL not configured');
          }

          if (isPrivateUrl(webhookUrl)) {
            throw new Error('Webhook URLs to private/internal networks are not allowed');
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

          // Send webhook with timeout
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          try {
            const response = await fetch(webhookUrl, {
              method: 'POST',
              headers,
              body: payload,
              signal: controller.signal,
            });

            return {
              __sinkResult: true,
              sinkType: 'webhook',
              completedAt: new Date().toISOString(),
              delivered: response.ok,
              statusCode: response.status,
              output: input,
            };
          } finally {
            clearTimeout(timeout);
          }
        } catch (error: unknown) {
          logger.error('Webhook delivery failed', error);
          return {
            __sinkResult: true,
            sinkType: 'webhook',
            completedAt: new Date().toISOString(),
            delivered: false,
            error: extractErrorMessage(error),
            output: input,
          };
        }

      case 'notification':
        // Notification sink - would send notification
        // In production, would use notification service
        logger.debug('Notification', { input });
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
