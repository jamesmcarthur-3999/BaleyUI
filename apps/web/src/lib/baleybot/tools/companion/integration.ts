/**
 * Integration Companion Tools
 *
 * Reusable tool builders for save_trigger_config and enable_webhook.
 * Extracted from integrate-stream/route.ts so the creator_bot pipeline
 * can inject them directly when a BaleyBot is saved.
 */

import type { RuntimeToolDefinition } from '../../executor';
import {
  db,
  baleybots,
  baleybotTriggers,
  eq,
  and,
  notDeleted,
  updateWithLock,
} from '@baleyui/db';
import { validateAndNormalizeTriggerConfig } from '../../types';
import type { TriggerConfig } from '../../types';

export interface IntegrationToolContext {
  workspaceId: string;
  baleybotId: string;
  onTriggerSaved: (config: TriggerConfig) => void;
  onWebhookEnabled: (url: string, secret: string) => void;
}

export function buildIntegrationTools(
  ctx: IntegrationToolContext,
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  // save_trigger_config — persists trigger config to baleybotTriggers table
  tools.set('save_trigger_config', {
    name: 'save_trigger_config',
    description:
      'Persist the trigger configuration for this BaleyBot. Call this after determining the integration method with the user.',
    inputSchema: {
      type: 'object',
      properties: {
        triggerType: {
          type: 'string',
          enum: [
            'manual',
            'schedule',
            'webhook',
            'other_bb',
            'db_event',
            'mcp_event',
            'file_upload',
          ],
          description: 'The type of trigger to configure',
        },
        schedule: {
          type: 'string',
          description: 'Cron expression for schedule triggers',
        },
        webhookPath: {
          type: 'string',
          description: 'Custom webhook path',
        },
        sourceBaleybotId: {
          type: 'string',
          description: 'Source BB ID for chain triggers',
        },
        completionType: {
          type: 'string',
          enum: ['success', 'failure', 'completion'],
        },
        dbConnectionId: {
          type: 'string',
          description: 'Database connection ID for db_event triggers',
        },
        dbTable: {
          type: 'string',
          description: 'Table to watch for db_event triggers',
        },
        dbEvent: {
          type: 'string',
          enum: ['insert', 'update', 'delete', 'change'],
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the trigger is active',
        },
      },
      required: ['triggerType'],
    },
    category: 'integration',
    dangerLevel: 'moderate',
    async function(args: Record<string, unknown>) {
      const triggerType = args.triggerType as string;
      const config = {
        type: triggerType,
        schedule: args.schedule,
        webhookPath: args.webhookPath,
        sourceBaleybotId: args.sourceBaleybotId,
        completionType: args.completionType,
        dbConnectionId: args.dbConnectionId,
        dbTable: args.dbTable,
        dbEvent: args.dbEvent,
        enabled: args.enabled ?? true,
      };

      const validation = validateAndNormalizeTriggerConfig(config);
      if (!validation.valid) {
        return { success: false, error: validation.issues.join(' ') };
      }

      // Fetch latest version for optimistic locking
      const current = await db.query.baleybots.findFirst({
        where: eq(baleybots.id, ctx.baleybotId),
      });
      if (!current) return { success: false, error: 'BaleyBot not found' };

      await updateWithLock(baleybots, ctx.baleybotId, current.version, {
        updatedAt: new Date(),
      });

      // Clean up existing triggers
      await db
        .delete(baleybotTriggers)
        .where(
          and(
            eq(baleybotTriggers.targetBaleybotId, ctx.baleybotId),
            eq(baleybotTriggers.workspaceId, ctx.workspaceId),
          ),
        );

      // Create new trigger
      if (validation.normalized) {
        const normalized = validation.normalized;
        await db.insert(baleybotTriggers).values({
          id: crypto.randomUUID(),
          sourceBaleybotId:
            normalized.type === 'other_bb' && normalized.sourceBaleybotId
              ? normalized.sourceBaleybotId
              : ctx.baleybotId,
          targetBaleybotId: ctx.baleybotId,
          triggerType:
            normalized.type === 'other_bb'
              ? normalized.completionType ?? 'completion'
              : normalized.type,
          workspaceId: ctx.workspaceId,
          enabled: normalized.enabled ?? true,
          staticInput: normalized,
        });
      }

      // Notify the pipeline so it can emit SSE events
      ctx.onTriggerSaved(
        (validation.normalized ?? config) as unknown as TriggerConfig,
      );

      return {
        success: true,
        triggerType,
        message: `Trigger configuration saved: ${triggerType}`,
      };
    },
  });

  // enable_webhook — sets webhookEnabled=true and generates a webhookSecret
  tools.set('enable_webhook', {
    name: 'enable_webhook',
    description:
      'Enable the webhook endpoint for this BaleyBot and generate a webhook secret. Call this when setting up webhook integration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    category: 'integration',
    dangerLevel: 'moderate',
    async function() {
      const secret = crypto.randomUUID();

      const current = await db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, ctx.baleybotId),
          notDeleted(baleybots),
        ),
      });
      if (!current) return { success: false, error: 'BaleyBot not found' };

      await updateWithLock(baleybots, ctx.baleybotId, current.version, {
        webhookEnabled: true,
        webhookSecret: secret,
        updatedAt: new Date(),
      });

      // Build the webhook URL
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000');
      const webhookUrl = `${baseUrl}/api/webhooks/baleybots/${ctx.workspaceId}/${ctx.baleybotId}`;

      // Notify the pipeline so it can emit SSE events
      ctx.onWebhookEnabled(webhookUrl, secret);

      return {
        success: true,
        webhookUrl,
        webhookSecret: secret,
        message: `Webhook enabled. URL: ${webhookUrl}. Secret: ${secret}`,
      };
    },
  });

  return tools;
}
