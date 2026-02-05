/**
 * Webhook API Route
 *
 * POST /api/webhooks/[flowId]/[secret]
 *
 * Accepts external webhook requests to trigger flow execution.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db, flows, webhookLogs, eq, and, notDeleted } from '@baleyui/db';
import { FlowExecutor } from '@/lib/execution';
import { checkApiRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('flow-webhook');

/**
 * Webhook trigger shape
 */
interface WebhookTrigger {
  type: 'webhook';
  secret: string;
  enabled: boolean;
}

/**
 * Type guard for webhook trigger
 */
function isWebhookTrigger(trigger: unknown): trigger is WebhookTrigger {
  return (
    typeof trigger === 'object' &&
    trigger !== null &&
    'type' in trigger &&
    trigger.type === 'webhook' &&
    'secret' in trigger &&
    typeof (trigger as WebhookTrigger).secret === 'string'
  );
}

/**
 * Extract webhook secret from triggers array
 */
function getWebhookSecret(triggers: unknown): string | null {
  if (!Array.isArray(triggers)) return null;

  const webhookTrigger = triggers.find(
    (t): t is WebhookTrigger => isWebhookTrigger(t) && t.enabled === true
  );

  return webhookTrigger?.secret ?? null;
}

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ flowId: string; secret: string }> }
) {
  const startTime = Date.now();
  const { flowId, secret } = await params;

  // Extract request data
  const userAgent = request.headers.get('user-agent') || undefined;
  const ipAddress = getClientIp(request);
  const method = request.method;

  // Rate limiting: 60 requests per minute per IP
  const rateLimitKey = `webhook:flow:${ipAddress || 'unknown'}`;
  const rateLimitResult = checkApiRateLimit(rateLimitKey, RATE_LIMITS.webhookPerMinute);

  if (rateLimitResult.limited) {
    // Log rate limited attempt
    await db.insert(webhookLogs).values({
      flowId,
      webhookSecret: secret,
      method,
      headers: {},
      body: {},
      query: {},
      status: 'failed',
      statusCode: 429,
      error: 'Rate limit exceeded',
      ipAddress,
      userAgent,
    }).catch(() => {
      // Ignore logging errors for rate limited requests
    });

    return NextResponse.json(
      { error: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.` },
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
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  // Extract headers (excluding sensitive ones)
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!key.toLowerCase().includes('authorization') && !key.toLowerCase().includes('cookie')) {
      headers[key] = value;
    }
  });

  // Extract query parameters
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  try {
    // Verify flow exists
    const flow = await db.query.flows.findFirst({
      where: and(eq(flows.id, flowId), notDeleted(flows)),
    });

    if (!flow) {
      // Log failed attempt
      await db.insert(webhookLogs).values({
        flowId,
        webhookSecret: secret,
        method,
        headers,
        body: body as Record<string, unknown>,
        query,
        status: 'failed',
        statusCode: 404,
        error: 'Flow not found',
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    // Verify webhook secret
    const expectedSecret = getWebhookSecret(flow.triggers);

    // Use timing-safe comparison to prevent timing attacks
    const secretsMatch = expectedSecret
      ? (() => {
          const expected = Buffer.from(expectedSecret, 'utf-8');
          const provided = Buffer.from(secret, 'utf-8');
          return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
        })()
      : false;

    if (!secretsMatch) {
      // Log invalid secret attempt
      await db.insert(webhookLogs).values({
        flowId,
        webhookSecret: secret,
        method,
        headers,
        body: body as Record<string, unknown>,
        query,
        status: 'invalid_secret',
        statusCode: 401,
        error: 'Invalid webhook secret',
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        { error: 'Invalid webhook secret' },
        { status: 401 }
      );
    }

    // Check if flow is enabled
    if (!flow.enabled) {
      // Log failed attempt
      await db.insert(webhookLogs).values({
        flowId,
        webhookSecret: secret,
        method,
        headers,
        body: body as Record<string, unknown>,
        query,
        status: 'failed',
        statusCode: 400,
        error: 'Flow is disabled',
        ipAddress,
        userAgent,
      });

      return NextResponse.json(
        { error: 'Flow is disabled' },
        { status: 400 }
      );
    }

    // Start flow execution
    const executor = await FlowExecutor.start({
      flowId,
      input: body,
      triggeredBy: {
        type: 'webhook',
        webhookSecret: secret,
        ipAddress,
        userAgent,
      },
    });

    // Log successful invocation
    await db.insert(webhookLogs).values({
      flowId,
      webhookSecret: secret,
      method,
      headers,
      body: body as Record<string, unknown>,
      query,
      status: 'success',
      statusCode: 200,
      executionId: executor.executionId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      executionId: executor.executionId,
      message: 'Flow execution started successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const requestId = crypto.randomUUID();

    // Log with full context using structured logger
    log.error('Flow webhook execution failed', {
      requestId,
      flowId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      ipAddress,
      userAgent,
      endpoint: `/api/webhooks/${flowId}/${secret.slice(0, 8)}...`,
    });

    // Log to database
    await db
      .insert(webhookLogs)
      .values({
        flowId,
        webhookSecret: secret,
        method,
        headers,
        body: body as Record<string, unknown>,
        query,
        status: 'failed',
        statusCode: 500,
        error: errorMessage,
        ipAddress,
        userAgent,
      })
      .catch((logError) => {
        log.error('Failed to log webhook error to database', {
          requestId,
          flowId,
          logError: logError instanceof Error ? logError.message : String(logError),
        });
      });

    // Determine specific error type for client response
    let clientError = 'Failed to execute flow';
    let statusCode = 500;

    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      clientError = 'Flow execution timed out';
      statusCode = 504;
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('Rate limit')) {
      clientError = 'Flow execution rate limited';
      statusCode = 429;
    } else if (errorMessage.includes('not found') || errorMessage.includes('Not found')) {
      clientError = 'Required resource not found';
      statusCode = 404;
    } else if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
      clientError = 'Permission denied for flow execution';
      statusCode = 403;
    }

    return NextResponse.json(
      {
        error: clientError,
        requestId, // Include for support/debugging
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: statusCode }
    );
  }
}
