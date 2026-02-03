import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  flows,
  webhookLogs,
  eq,
  and,
  notDeleted,
  updateWithLock,
  desc,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'crypto';
import { sanitizeErrorMessage, isUserFacingError } from '@/lib/errors/sanitize';

/**
 * Generate a random webhook secret
 */
function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Get the base URL for the application
 */
function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

/**
 * tRPC router for managing webhooks.
 */
export const webhooksRouter = router({
  /**
   * Generate a new webhook URL for a flow.
   */
  generateWebhook: protectedProcedure
    .input(z.object({ flowId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.flowId),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      // Generate new webhook secret (used in URL)
      const secret = generateWebhookSecret();
      // Generate signing secret (used for HMAC signatures)
      const signingSecret = generateWebhookSecret();

      // Update flow triggers
      const triggers = Array.isArray(flow.triggers) ? flow.triggers : [];
      const existingWebhook = triggers.find((t: any) => t?.type === 'webhook');

      let updatedTriggers;
      if (existingWebhook) {
        // Update existing webhook
        updatedTriggers = triggers.map((t: any) =>
          t?.type === 'webhook'
            ? { ...t, secret, signingSecret, enabled: true, createdAt: new Date().toISOString() }
            : t
        );
      } else {
        // Add new webhook trigger
        updatedTriggers = [
          ...triggers,
          {
            type: 'webhook',
            secret,
            signingSecret,
            enabled: true,
            createdAt: new Date().toISOString(),
          },
        ];
      }

      // Update flow with new triggers
      await updateWithLock(flows, input.flowId, flow.version, {
        triggers: updatedTriggers,
      });

      // Build webhook URL
      const baseUrl = getBaseUrl();
      const webhookUrl = `${baseUrl}/api/webhooks/${input.flowId}/${secret}`;

      return {
        webhookUrl,
        secret,
        signingSecret,
        createdAt: new Date(),
      };
    }),

  /**
   * Revoke the webhook for a flow.
   */
  revokeWebhook: protectedProcedure
    .input(z.object({ flowId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.flowId),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      // Remove webhook trigger from triggers array
      const triggers = Array.isArray(flow.triggers) ? flow.triggers : [];
      const updatedTriggers = triggers.map((t: any) =>
        t?.type === 'webhook' ? { ...t, enabled: false } : t
      );

      // Update flow with new triggers
      await updateWithLock(flows, input.flowId, flow.version, {
        triggers: updatedTriggers,
      });

      return { success: true };
    }),

  /**
   * Get the current webhook configuration for a flow.
   */
  getWebhook: protectedProcedure
    .input(z.object({ flowId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.flowId),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      // Find webhook trigger
      const triggers = Array.isArray(flow.triggers) ? flow.triggers : [];
      const webhookTrigger = triggers.find(
        (t: any) => t?.type === 'webhook' && t?.enabled === true
      );

      if (!webhookTrigger) {
        return null;
      }

      // Build webhook URL
      const baseUrl = getBaseUrl();
      const webhookUrl = `${baseUrl}/api/webhooks/${input.flowId}/${webhookTrigger.secret}`;

      return {
        webhookUrl,
        secret: webhookTrigger.secret,
        signingSecret: webhookTrigger.signingSecret,
        createdAt: webhookTrigger.createdAt
          ? new Date(webhookTrigger.createdAt)
          : null,
      };
    }),

  /**
   * Get recent webhook invocation logs for a flow.
   */
  getWebhookLogs: protectedProcedure
    .input(
      z.object({
        flowId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.flowId),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      // Fetch webhook logs
      const logs = await ctx.db.query.webhookLogs.findMany({
        where: eq(webhookLogs.flowId, input.flowId),
        orderBy: [desc(webhookLogs.createdAt)],
        limit: input.limit,
        with: {
          execution: {
            columns: {
              id: true,
              status: true,
              completedAt: true,
            },
          },
        },
      });

      return logs;
    }),

  /**
   * Test a webhook by sending a sample request.
   */
  testWebhook: protectedProcedure
    .input(
      z.object({
        flowId: z.string().uuid(),
        samplePayload: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.flowId),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      // Find webhook trigger
      const triggers = Array.isArray(flow.triggers) ? flow.triggers : [];
      const webhookTrigger = triggers.find(
        (t: any) => t?.type === 'webhook' && t?.enabled === true
      );

      if (!webhookTrigger) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No webhook configured for this flow',
        });
      }

      // Build webhook URL
      const baseUrl = getBaseUrl();
      const webhookUrl = `${baseUrl}/api/webhooks/${input.flowId}/${webhookTrigger.secret}`;

      // Send test request
      try {
        const payload = input.samplePayload || {
          test: true,
          message: 'This is a test webhook invocation',
          timestamp: new Date().toISOString(),
        };

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'BaleyUI-Webhook-Test',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        return {
          success: response.ok,
          statusCode: response.status,
          response: result,
        };
      } catch (error) {
        const message = isUserFacingError(error)
          ? sanitizeErrorMessage(error)
          : 'An internal error occurred while testing webhook';
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        });
      }
    }),
});
