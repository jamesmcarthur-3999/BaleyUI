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
import crypto from 'crypto';
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
import { createLogger } from '@/lib/logger';
import { getWorkspaceAICredentials } from '@/lib/baleybot/services';
import { checkApiRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createErrorResponse } from '@/lib/api/error-response';

const log = createLogger('baleybot-webhook');

// ============================================================================
// TYPES
// ============================================================================

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
 * Timing-safe comparison of webhook secrets to prevent timing attacks
 */
function verifyWebhookSecret(expected: string, provided: string | null): boolean {
  if (!provided || !expected) {
    return false;
  }
  // Convert to buffers for timing-safe comparison
  const expectedBuffer = Buffer.from(expected, 'utf-8');
  const providedBuffer = Buffer.from(provided, 'utf-8');
  // If lengths differ, we still need to do a comparison to avoid timing leak
  if (expectedBuffer.length !== providedBuffer.length) {
    // Compare against expected to maintain constant time
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; baleybotId: string }> }
) {
  const startTime = Date.now();
  const { workspaceId, baleybotId } = await params;

  // Extract request metadata
  const userAgent = request.headers.get('user-agent') || undefined;
  const ipAddress = getClientIp(request);
  const webhookSecret = request.headers.get('x-webhook-secret');

  // Rate limiting: 60 requests per minute per IP
  const rateLimitKey = `webhook:baleybot:${ipAddress || 'unknown'}`;
  const rateLimitResult = await checkApiRateLimit(rateLimitKey, RATE_LIMITS.webhookPerMinute);

  if (rateLimitResult.limited) {
    log.warn('Rate limit exceeded for BaleyBot webhook', { ipAddress, baleybotId });
    return NextResponse.json(
      { success: false, error: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.` },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': String(RATE_LIMITS.webhookPerMinute.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.resetAt / 1000)),
        },
      }
    );
  }

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
      log.warn('Workspace not found', { workspaceId });
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
      log.warn('BaleyBot not found', { baleybotId, workspaceId });
      return NextResponse.json(
        { success: false, error: 'BaleyBot not found' },
        { status: 404 }
      );
    }

    // Check if webhook is enabled
    if (!baleybot.webhookEnabled) {
      log.warn('Webhook not enabled for BaleyBot', { baleybotId, baleybotName: baleybot.name });
      return NextResponse.json(
        { success: false, error: 'Webhook not enabled for this BaleyBot' },
        { status: 403 }
      );
    }

    // Verify webhook secret with timing-safe comparison
    if (!baleybot.webhookSecret || !verifyWebhookSecret(baleybot.webhookSecret, webhookSecret)) {
      log.warn('Invalid webhook secret', { baleybotId, baleybotName: baleybot.name, ipAddress });
      return NextResponse.json(
        { success: false, error: 'Invalid webhook secret' },
        { status: 401 }
      );
    }

    // Check if BB is in executable state
    if (baleybot.status !== 'active') {
      log.warn('BaleyBot not active', { baleybotId, baleybotName: baleybot.name, status: baleybot.status });
      return NextResponse.json(
        {
          success: false,
          error: `BaleyBot is not active (current status: ${baleybot.status})`,
        },
        { status: 400 }
      );
    }

    log.info('Executing BaleyBot via webhook', { baleybotId, baleybotName: baleybot.name, ipAddress });

    // Check for idempotency key to deduplicate webhook deliveries
    const idempotencyKey =
      request.headers.get('x-idempotency-key') ||
      request.headers.get('x-webhook-delivery-id') ||
      null;

    if (idempotencyKey) {
      const existing = await db.query.baleybotExecutions.findFirst({
        where: and(
          eq(baleybotExecutions.baleybotId, baleybot.id),
          eq(baleybotExecutions.idempotencyKey, idempotencyKey)
        ),
        columns: { id: true, status: true, output: true },
      });

      if (existing) {
        log.info('Deduplicated webhook execution', { baleybotId, idempotencyKey, existingExecutionId: existing.id });
        return NextResponse.json({
          success: true,
          executionId: existing.id,
          deduplicated: true,
          message: 'Execution already processed for this idempotency key',
        });
      }
    }

    // Create execution record
    const [execution] = await db
      .insert(baleybotExecutions)
      .values({
        baleybotId: baleybot.id,
        status: 'running',
        input: body as Record<string, unknown>,
        triggeredBy: 'webhook',
        triggerSource: ipAddress ?? 'unknown',
        idempotencyKey,
        startedAt: new Date(),
      })
      .returning({ id: baleybotExecutions.id });

    if (!execution) {
      throw new Error('Failed to create execution record');
    }

    // Get AI credentials from workspace connections
    const credentials = await getWorkspaceAICredentials(workspaceId);
    if (!credentials) {
      throw new Error('No AI provider configured for this workspace. Please add an OpenAI or Anthropic connection in Settings.');
    }

    // Execute the BaleyBot with the webhook payload as input
    const inputStr = body ? JSON.stringify(body) : undefined;
    const result = await executeBALCode(baleybot.balCode, {
      input: inputStr,
      model: credentials.model,
      apiKey: credentials.apiKey,
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

    log.info('BaleyBot execution completed', { baleybotId, baleybotName: baleybot.name, durationMs, executionId: execution.id });

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      message: 'BaleyBot execution completed successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const requestId = crypto.randomUUID();

    // Log with full context for debugging
    log.error('BaleyBot webhook execution failed', {
      requestId,
      baleybotId,
      workspaceId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      ipAddress,
      userAgent,
      endpoint: `/api/webhooks/baleybots/${workspaceId}/${baleybotId}`,
    });

    // Determine specific error type for client response
    let clientError = 'Failed to execute BaleyBot';
    let statusCode = 500;

    if (errorMessage.includes('API key') || errorMessage.includes('No AI provider')) {
      clientError = 'BaleyBot execution failed: AI provider not configured';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      clientError = 'BaleyBot execution timed out';
      statusCode = 504;
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('Rate limit')) {
      clientError = 'BaleyBot execution rate limited by AI provider';
      statusCode = 429;
    } else if (errorMessage.includes('parse') || errorMessage.includes('Parse') || errorMessage.includes('BAL')) {
      clientError = 'Invalid BAL code in BaleyBot';
    } else if (errorMessage.includes('execution record')) {
      clientError = 'Failed to create execution record';
    }

    return createErrorResponse(statusCode, error, { message: clientError, requestId });
  }
}

// Export config for Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 second timeout
