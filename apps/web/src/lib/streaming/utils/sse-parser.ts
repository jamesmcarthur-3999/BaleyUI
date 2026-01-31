/**
 * Server-Sent Events Parser
 *
 * Handles parsing SSE chunks from a streaming response.
 * Handles edge cases like split chunks and incomplete events.
 */

import type { ServerStreamEvent, BaleybotStreamEvent } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ParsedSSEResult<T = ServerStreamEvent> {
  /** Successfully parsed events */
  events: T[];
  /** Remaining unparsed buffer (incomplete event) */
  remainder: string;
}

// ============================================================================
// SSE Parser
// ============================================================================

/**
 * Parse SSE chunks into events.
 *
 * SSE format:
 * ```
 * event: message
 * data: {"json": "data"}
 *
 * event: message
 * data: {"more": "data"}
 * ```
 *
 * Events are separated by double newlines.
 */
export function parseSSEChunk(
  buffer: string,
  existingRemainder: string = ''
): ParsedSSEResult {
  const fullBuffer = existingRemainder + buffer;
  const events: ServerStreamEvent[] = [];

  // Split by double newline (event separator)
  const parts = fullBuffer.split(/\r?\n\r?\n/);

  // Last part might be incomplete
  const remainder = parts.pop() || '';

  for (const part of parts) {
    if (!part.trim()) continue;

    const event = parseSSEEvent(part);
    if (event) {
      events.push(event);
    }
  }

  return { events, remainder };
}

/**
 * Parse a single SSE event block.
 */
function parseSSEEvent(eventBlock: string): ServerStreamEvent | null {
  const lines = eventBlock.split(/\r?\n/);
  let data = '';

  for (const line of lines) {
    if (line.startsWith('data:')) {
      // Handle both "data: " and "data:" formats
      data = line.slice(line.startsWith('data: ') ? 6 : 5);
    }
    // Ignore other fields (event:, id:, retry:, comments starting with :)
  }

  if (!data) {
    return null;
  }

  // Handle [DONE] signal (OpenAI style)
  if (data === '[DONE]') {
    return {
      botId: '',
      botName: '',
      event: { type: 'done', reason: 'end_turn', agent_id: '' },
      timestamp: Date.now(),
    };
  }

  try {
    const parsed = JSON.parse(data);

    // If the parsed data is already a ServerStreamEvent, return it
    if (parsed.event && parsed.botId !== undefined) {
      return parsed as ServerStreamEvent;
    }

    // If it's just a BaleybotStreamEvent, wrap it
    if (parsed.type) {
      return {
        botId: parsed.agent_id || '',
        botName: parsed.botName || '',
        event: parsed as BaleybotStreamEvent,
        timestamp: Date.now(),
      };
    }

    // Unknown format, skip
    return null;
  } catch (e) {
    // Invalid JSON, skip this event
    console.warn('Failed to parse SSE event:', data, e);
    return null;
  }
}

// ============================================================================
// Stream Reader
// ============================================================================

/**
 * Creates an async iterator from a ReadableStream that yields parsed SSE events.
 */
export async function* createSSEIterator(
  response: Response
): AsyncGenerator<ServerStreamEvent, void, unknown> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          const { events } = parseSSEChunk('', buffer);
          for (const event of events) {
            yield event;
          }
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const { events, remainder } = parseSSEChunk(chunk, buffer);
      buffer = remainder;

      for (const event of events) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// JSON Parsing Utilities
// ============================================================================

/**
 * Attempt to parse partial JSON.
 * Returns the parsed value if successful, null otherwise.
 *
 * Handles common incomplete patterns:
 * - Unclosed strings
 * - Unclosed objects/arrays
 * - Trailing commas
 */
export function parsePartialJSON(json: string): unknown | null {
  if (!json.trim()) return null;

  // Try direct parse first
  try {
    return JSON.parse(json);
  } catch {
    // Continue with repair attempts
  }

  // Attempt to repair common issues
  const repaired = repairJSON(json);
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

/**
 * Attempt to repair incomplete JSON.
 */
function repairJSON(json: string): string {
  let repaired = json.trim();

  // Count brackets/braces to determine what's unclosed
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escaped = false;

  for (const char of repaired) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
  }

  // Close unclosed string
  if (inString) {
    repaired += '"';
  }

  // Remove trailing comma
  repaired = repaired.replace(/,\s*$/, '');

  // Close unclosed brackets/braces
  while (bracketCount > 0) {
    repaired += ']';
    bracketCount--;
  }

  while (braceCount > 0) {
    repaired += '}';
    braceCount--;
  }

  return repaired;
}
