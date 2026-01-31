/**
 * Vercel Edge Function Integration Template
 *
 * This template shows how to integrate BaleyUI with Vercel Edge Functions
 * for low-latency AI-powered endpoints.
 *
 * File location: app/api/chat/route.ts (App Router)
 *               or pages/api/chat.ts (Pages Router)
 *
 * Prerequisites:
 * - npm install @baleyui/sdk
 */

import { NextRequest, NextResponse } from 'next/server';
import { BaleyUI } from '@baleyui/sdk';

// Edge runtime for low latency
export const runtime = 'edge';

// Initialize BaleyUI client
const baleyui = new BaleyUI({
  apiKey: process.env.BALEYUI_API_KEY!,
});

// ============================================================================
// Standard Response Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const { message, flowId } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const targetFlowId = flowId || process.env.BALEYUI_DEFAULT_FLOW_ID!;

    // Execute the flow
    const execution = await baleyui.flows.execute(targetFlowId, {
      input: {
        message,
        timestamp: new Date().toISOString(),
      },
    });

    // Wait for completion
    const result = await execution.waitForCompletion();

    if (result.status === 'failed') {
      return NextResponse.json(
        { error: result.error?.message || 'Execution failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      response: result.output,
      executionId: execution.id,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Streaming Response Handler
// ============================================================================

// File: app/api/chat/stream/route.ts

export async function POSTStream(request: NextRequest) {
  try {
    const { message, flowId } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const targetFlowId = flowId || process.env.BALEYUI_DEFAULT_FLOW_ID!;

    // Execute the flow
    const execution = await baleyui.flows.execute(targetFlowId, {
      input: { message },
    });

    // Create a ReadableStream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of execution.stream()) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          const errorData = `data: ${JSON.stringify({ error: 'Stream error' })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Stream error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Block Execution Handler
// ============================================================================

// File: app/api/blocks/[id]/run/route.ts

interface BlockRouteContext {
  params: Promise<{ id: string }>;
}

export async function POSTBlock(
  request: NextRequest,
  context: BlockRouteContext
) {
  try {
    const { id: blockId } = await context.params;
    const { input } = await request.json();

    // Execute the block
    const execution = await baleyui.blocks.run(blockId, {
      input: input || {},
    });

    // Wait for completion
    const result = await execution.waitForCompletion();

    if (result.status === 'failed') {
      return NextResponse.json(
        { error: result.error?.message || 'Block execution failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      output: result.output,
      executionId: execution.id,
    });
  } catch (error) {
    console.error('Block execution error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Webhook Handler with Signature Verification
// ============================================================================

// File: app/api/webhooks/baleyui/route.ts

export async function POSTWebhook(request: NextRequest) {
  try {
    const signature = request.headers.get('x-baleyui-signature');
    const body = await request.text();

    // Verify signature
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    const webhookSecret = process.env.BALEYUI_WEBHOOK_SECRET!;
    const expectedSignature = await computeSignature(body, webhookSecret);

    if (signature !== `sha256=${expectedSignature}`) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Process the webhook
    const event = JSON.parse(body);

    switch (event.type) {
      case 'execution.completed':
        console.log('Execution completed:', event.data.executionId);
        // Handle completion
        break;

      case 'execution.failed':
        console.log('Execution failed:', event.data.executionId);
        // Handle failure
        break;

      default:
        console.log('Unknown event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function computeSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Environment Variables:
 * - BALEYUI_API_KEY: Your BaleyUI API key
 * - BALEYUI_DEFAULT_FLOW_ID: Default flow ID for chat
 * - BALEYUI_WEBHOOK_SECRET: Secret for webhook signature verification
 *
 * Example Usage (Frontend):
 *
 * // Standard request
 * const response = await fetch('/api/chat', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ message: 'Hello!' }),
 * });
 * const data = await response.json();
 *
 * // Streaming request
 * const response = await fetch('/api/chat/stream', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ message: 'Hello!' }),
 * });
 *
 * const reader = response.body.getReader();
 * const decoder = new TextDecoder();
 *
 * while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   const chunk = decoder.decode(value);
 *   // Parse SSE events from chunk
 * }
 */
