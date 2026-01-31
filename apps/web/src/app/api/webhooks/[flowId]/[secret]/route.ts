/**
 * Webhook API Route
 *
 * POST /api/webhooks/[flowId]/[secret]
 *
 * Accepts external webhook requests to trigger flow execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, flows, webhookLogs, eq, and, notDeleted } from '@baleyui/db';
import { FlowExecutor } from '@/lib/execution';

/**
 * Extract webhook secret from triggers array
 */
function getWebhookSecret(triggers: unknown): string | null {
  if (!Array.isArray(triggers)) return null;

  const webhookTrigger = triggers.find(
    (t: any) => t?.type === 'webhook' && t?.enabled === true
  );

  return webhookTrigger?.secret || null;
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

    if (!expectedSecret || expectedSecret !== secret) {
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
    console.error('Webhook execution error:', error);

    // Log error
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
        error: error instanceof Error ? error.message : 'Unknown error',
        ipAddress,
        userAgent,
      })
      .catch((logError) => {
        console.error('Failed to log webhook error:', logError);
      });

    return NextResponse.json(
      {
        error: 'Failed to execute flow',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
