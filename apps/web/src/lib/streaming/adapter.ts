/**
 * BaleyBots → AI SDK Stream Adapter
 *
 * Converts BaleyBots streaming events to Vercel AI SDK format.
 * This allows us to use the battle-tested AI SDK hooks (useChat, etc.)
 * while keeping BaleyBots as our backend.
 *
 * AI SDK Stream Protocol: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 */

import type { BaleybotStreamEvent } from './types';

// ============================================================================
// AI SDK Event Types (what we convert TO)
// ============================================================================

export type AISDKStreamEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'reasoning-delta'; reasoningDelta: string }
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
  | { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-output-available'; toolCallId: string; output: unknown }
  | { type: 'error'; error: string }
  | { type: 'step-finish'; finishReason: string }
  | { type: 'data'; data: unknown[] }; // For custom data like nested streams

// ============================================================================
// Event Conversion
// ============================================================================

/**
 * Convert a single BaleyBots event to AI SDK format.
 * Returns null for events that don't have a direct mapping.
 */
export function convertBaleybotEvent(event: BaleybotStreamEvent): AISDKStreamEvent | null {
  switch (event.type) {
    case 'text_delta':
      return { type: 'text-delta', textDelta: event.content };

    case 'reasoning':
      return { type: 'reasoning-delta', reasoningDelta: event.content };

    case 'tool_call_stream_start':
      return {
        type: 'tool-input-start',
        toolCallId: event.id,
        toolName: event.toolName,
      };

    case 'tool_call_arguments_delta':
      return {
        type: 'tool-input-delta',
        toolCallId: event.id,
        inputTextDelta: event.argumentsDelta,
      };

    case 'tool_call_stream_complete':
      return {
        type: 'tool-input-available',
        toolCallId: event.id,
        toolName: event.toolName,
        input: event.arguments,
      };

    case 'tool_execution_output':
      return {
        type: 'tool-output-available',
        toolCallId: event.id,
        output: event.error ? { error: event.error } : event.result,
      };

    case 'tool_execution_stream':
      // Nested bot streams - send as custom data
      return {
        type: 'data',
        data: [{
          nestedStream: {
            toolCallId: event.toolCallId,
            botName: event.childBotName || event.toolName,
            event: event.nestedEvent,
          },
        }],
      };

    case 'error':
      const errorMessage = event.error instanceof Error
        ? event.error.message
        : event.error.message;
      return { type: 'error', error: errorMessage };

    case 'done':
      return { type: 'step-finish', finishReason: event.reason };

    // Events without direct mapping
    case 'structured_output_delta':
      // Could be sent as custom data if needed
      return { type: 'data', data: [{ structuredOutput: event.content }] };

    case 'tool_execution_start':
      // AI SDK doesn't have a separate "execution started" event
      // The tool-input-available → tool-output-available flow handles this
      return null;

    case 'tool_validation_error':
      return {
        type: 'error',
        error: `Tool validation error for ${event.toolName}: ${JSON.stringify(event.validationErrors)}`,
      };

    default:
      return null;
  }
}

// ============================================================================
// Stream Transformer
// ============================================================================

/**
 * Format an AI SDK event as SSE.
 */
function formatSSE(event: AISDKStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * TransformStream that converts BaleyBots SSE to AI SDK SSE format.
 *
 * Usage:
 * ```ts
 * const baleyStream = await runBaleybot(request);
 * return new Response(
 *   baleyStream.pipeThrough(createBaleybotToAISDKStream()),
 *   { headers: { 'Content-Type': 'text/event-stream' } }
 * );
 * ```
 */
export function createBaleybotToAISDKStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      // Split on double newlines (SSE event separator)
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;

        // Parse the SSE event
        const dataMatch = part.match(/^data:\s*(.+)$/m);
        if (!dataMatch) continue;

        const data = dataMatch[1];

        // Handle [DONE] signal
        if (data === '[DONE]') {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        if (!data) continue;

        try {
          const parsed = JSON.parse(data) as unknown;

          // Handle wrapped ServerStreamEvent format
          const baleyEvent: BaleybotStreamEvent = (parsed as { event?: BaleybotStreamEvent }).event || (parsed as BaleybotStreamEvent);

          const aiEvent = convertBaleybotEvent(baleyEvent);
          if (aiEvent) {
            controller.enqueue(encoder.encode(formatSSE(aiEvent)));
          }
        } catch {
          // Skip malformed events
        }
      }
    },

    flush(controller) {
      // Process any remaining buffer
      if (buffer.trim()) {
        const dataMatch = buffer.match(/^data:\s*(.+)$/m);
        const data = dataMatch?.[1];
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data) as unknown;
            const baleyEvent: BaleybotStreamEvent = (parsed as { event?: BaleybotStreamEvent }).event || (parsed as BaleybotStreamEvent);
            const aiEvent = convertBaleybotEvent(baleyEvent);
            if (aiEvent) {
              controller.enqueue(encoder.encode(formatSSE(aiEvent)));
            }
          } catch {
            // Ignore
          }
        }
      }
      // Always end with [DONE]
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  });
}

// ============================================================================
// Helper for API Routes
// ============================================================================

/**
 * Wrap a BaleyBots Response to be compatible with AI SDK useChat.
 *
 * Usage in Next.js API route:
 * ```ts
 * export async function POST(req: Request) {
 *   const { messages } = await req.json();
 *   const baleyResponse = await fetch('your-baleybots-endpoint', {
 *     method: 'POST',
 *     body: JSON.stringify({ messages }),
 *   });
 *   return adaptBaleybotResponse(baleyResponse);
 * }
 * ```
 */
export function adaptBaleybotResponse(baleyResponse: Response): Response {
  if (!baleyResponse.body) {
    throw new Error('Response body is null');
  }

  const transformedStream = baleyResponse.body.pipeThrough(createBaleybotToAISDKStream());

  return new Response(transformedStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
}

// ============================================================================
// Direct Event Processing (for non-SSE sources)
// ============================================================================

/**
 * Create a ReadableStream of AI SDK events from BaleyBots events.
 * Useful when you have direct access to BaleyBots events (not SSE).
 */
export function createAISDKStreamFromEvents(
  events: AsyncIterable<BaleybotStreamEvent>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          const aiEvent = convertBaleybotEvent(event);
          if (aiEvent) {
            controller.enqueue(encoder.encode(formatSSE(aiEvent)));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
