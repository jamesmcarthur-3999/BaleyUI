/**
 * BaleyBot Webhook API Route
 *
 * POST /api/webhooks/baleybots/[workspaceId]/[baleybotId]
 *
 * Accepts external webhook requests to trigger BaleyBot execution.
 * The request body is passed as input to the BaleyBot.
 *
 * Security: Requires X-Webhook-Secret header matching the BB's webhookSecret
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  baleybots,
  baleybotExecutions,
  workspaces,
  eq,
  and,
  notDeleted,
} from '@baleyui/db';
import { executeBALCode } from '@baleyui/sdk';

// ============================================================================
// TYPES
// ============================================================================

interface WebhookResponse {
  success: boolean;
  executionId?: string;
  message?: string;
  error?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract client IP from request
 */
function getClientIp(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined
  );
}

/**
 * Generate a random webhook secret
 */
export function generateWebhookSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let secret = 'whk_';
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; baleybotId: string }> }
): Promise<NextResponse<WebhookResponse>> {
  const startTime = Date.now();
  const { workspaceId, baleybotId } = await params;

  // Extract request metadata
  const userAgent = request.headers.get('user-agent') || undefined;
  const ipAddress = getClientIp(request);
  const webhookSecret = request.headers.get('x-webhook-secret');

  // Parse request body
  let body: unknown;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => ({}));
    } else if (contentType.includes('text/plain')) {
      body = await request.text();
    } else {
      body = {};
    }
  } catch {
    body = {};
  }

  try {
    // Verify workspace exists
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), notDeleted(workspaces)),
      columns: { id: true },
    });

    if (!workspace) {
      console.warn(`[webhook] Workspace not found: ${workspaceId}`);
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Verify baleybot exists and is in the workspace
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, baleybotId),
        eq(baleybots.workspaceId, workspaceId),
        notDeleted(baleybots)
      ),
      columns: {
        id: true,
        name: true,
        balCode: true,
        webhookSecret: true,
        webhookEnabled: true,
        status: true,
      },
    });

    if (!baleybot) {
      console.warn(`[webhook] BaleyBot not found: ${baleybotId}`);
      return NextResponse.json(
        { success: false, error: 'BaleyBot not found' },
        { status: 404 }
      );
    }

    // Check if webhook is enabled
    if (!baleybot.webhookEnabled) {
      console.warn(`[webhook] Webhook not enabled for BB: ${baleybot.name}`);
      return NextResponse.json(
        { success: false, error: 'Webhook not enabled for this BaleyBot' },
        { status: 403 }
      );
    }

    // Verify webhook secret
    if (!baleybot.webhookSecret || baleybot.webhookSecret !== webhookSecret) {
      console.warn(
        `[webhook] Invalid secret for BB: ${baleybot.name} from IP: ${ipAddress}`
      );
      return NextResponse.json(
        { success: false, error: 'Invalid webhook secret' },
        { status: 401 }
      );
    }

    // Check if BB is in executable state
    if (baleybot.status !== 'active') {
      console.warn(`[webhook] BB not active: ${baleybot.name} (status: ${baleybot.status})`);
      return NextResponse.json(
        {
          success: false,
          error: `BaleyBot is not active (current status: ${baleybot.status})`,
        },
        { status: 400 }
      );
    }

    console.log(
      `[webhook] Executing BB "${baleybot.name}" (${baleybot.id}) via webhook from ${ipAddress}`
    );

    // Create execution record
    const [execution] = await db
      .insert(baleybotExecutions)
      .values({
        baleybotId: baleybot.id,
        status: 'running',
        input: body as Record<string, unknown>,
        triggeredBy: 'webhook',
        triggerSource: ipAddress ?? 'unknown',
        startedAt: new Date(),
      })
      .returning({ id: baleybotExecutions.id });

    if (!execution) {
      throw new Error('Failed to create execution record');
    }

    // Get API key for execution
    // In production, this would come from workspace connection settings
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('No API key configured for webhook execution');
    }

    // Execute the BaleyBot
    const result = await executeBALCode(baleybot.balCode, {
      model: 'gpt-4o-mini',
      apiKey,
      timeout: 55000, // 55 second timeout (leaving margin for response)
    });

    const durationMs = Date.now() - startTime;

    // Update execution record with success
    await db
      .update(baleybotExecutions)
      .set({
        status: 'completed',
        output: result as unknown as Record<string, unknown>,
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    // Update BB execution count using SQL increment
    await db
      .update(baleybots)
      .set({
        lastExecutedAt: new Date(),
      })
      .where(eq(baleybots.id, baleybot.id));

    console.log(
      `[webhook] BB "${baleybot.name}" completed successfully in ${durationMs}ms`
    );

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      message: 'BaleyBot execution completed successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[webhook] BB execution failed:`, errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute BaleyBot',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Export config for Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 second timeout
