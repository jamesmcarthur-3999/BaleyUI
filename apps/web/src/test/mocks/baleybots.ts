/**
 * BaleyBots Mock System
 *
 * Provides mock implementations of BaleyBots functionality for testing
 * without consuming AI tokens. Easily extensible for new scenarios.
 */

import type { BaleybotStreamEvent, DoneReason } from '@/lib/streaming/types';

// ============================================================================
// Types
// ============================================================================

export interface MockBaleybotConfig {
  name: string;
  /** Simulated response text (streamed character by character) */
  responseText?: string;
  /** Simulated structured output */
  structuredOutput?: unknown;
  /** Simulated tool calls */
  toolCalls?: MockToolCall[];
  /** Simulated reasoning (for reasoning models) */
  reasoning?: string;
  /** Delay between events in ms (default: 10) */
  streamDelay?: number;
  /** Simulate an error */
  error?: Error;
  /** Done reason (default: 'end_turn') */
  doneReason?: DoneReason;
}

export interface MockToolCall {
  id: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
  /** Simulate tool error */
  error?: string;
  /** Execution delay in ms */
  executionDelay?: number;
}

// ============================================================================
// Mock Stream Generator
// ============================================================================

/**
 * Creates an async generator that yields BaleyBots stream events.
 * Use this to test streaming UI without calling real AI.
 */
export async function* createMockBaleybotStream(
  config: MockBaleybotConfig
): AsyncGenerator<BaleybotStreamEvent> {
  const delay = config.streamDelay ?? 10;

  // Helper to delay between events
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // 1. Stream reasoning (if provided)
  if (config.reasoning) {
    for (const char of config.reasoning) {
      yield { type: 'reasoning', content: char };
      await wait(delay);
    }
  }

  // 2. Stream tool calls (if provided)
  if (config.toolCalls) {
    for (const tool of config.toolCalls) {
      // Tool call start
      yield {
        type: 'tool_call_stream_start',
        id: tool.id,
        toolName: tool.toolName,
      };
      await wait(delay);

      // Stream arguments character by character
      const argsStr = JSON.stringify(tool.arguments);
      for (const char of argsStr) {
        yield {
          type: 'tool_call_arguments_delta',
          id: tool.id,
          argumentsDelta: char,
        };
        await wait(delay / 2);
      }

      // Tool call complete
      yield {
        type: 'tool_call_stream_complete',
        id: tool.id,
        toolName: tool.toolName,
        arguments: tool.arguments,
      };
      await wait(delay);

      // Tool execution start
      yield {
        type: 'tool_execution_start',
        id: tool.id,
        toolName: tool.toolName,
        arguments: tool.arguments,
      };

      // Simulate execution delay
      await wait(tool.executionDelay ?? 100);

      // Tool execution output
      yield {
        type: 'tool_execution_output',
        id: tool.id,
        toolName: tool.toolName,
        result: tool.result,
        error: tool.error,
      };
      await wait(delay);
    }
  }

  // 3. Stream text response
  if (config.responseText) {
    for (const char of config.responseText) {
      yield { type: 'text_delta', content: char };
      await wait(delay);
    }
  }

  // 4. Stream structured output
  if (config.structuredOutput) {
    const outputStr = JSON.stringify(config.structuredOutput, null, 2);
    for (const char of outputStr) {
      yield { type: 'structured_output_delta', content: char };
      await wait(delay / 2);
    }
  }

  // 5. Emit error if configured
  if (config.error) {
    yield { type: 'error', error: config.error };
  }

  // 6. Done
  yield {
    type: 'done',
    reason: config.doneReason ?? 'end_turn',
    agent_id: `mock-${config.name}`,
  };
}

// ============================================================================
// Mock Event Collector
// ============================================================================

/**
 * Collects all events from a mock stream into an array.
 * Useful for testing event processing.
 */
export async function collectMockEvents(
  config: MockBaleybotConfig
): Promise<BaleybotStreamEvent[]> {
  const events: BaleybotStreamEvent[] = [];
  for await (const event of createMockBaleybotStream(config)) {
    events.push(event);
  }
  return events;
}

// ============================================================================
// Pre-built Mock Scenarios
// ============================================================================

export const mockScenarios = {
  /**
   * Simple text response without tools
   */
  simpleText: (text: string): MockBaleybotConfig => ({
    name: 'simple-text',
    responseText: text,
    streamDelay: 5,
  }),

  /**
   * Structured output response (e.g., sentiment analysis)
   */
  structuredOutput: <T>(output: T): MockBaleybotConfig => ({
    name: 'structured-output',
    structuredOutput: output,
    streamDelay: 5,
  }),

  /**
   * Response with tool calls
   */
  withToolCalls: (
    text: string,
    toolCalls: MockToolCall[]
  ): MockBaleybotConfig => ({
    name: 'with-tools',
    responseText: text,
    toolCalls,
    streamDelay: 10,
  }),

  /**
   * Reasoning model response (e.g., o1, DeepSeek-R1)
   */
  withReasoning: (reasoning: string, text: string): MockBaleybotConfig => ({
    name: 'reasoning-model',
    reasoning,
    responseText: text,
    streamDelay: 10,
  }),

  /**
   * Error scenario
   */
  error: (message: string): MockBaleybotConfig => ({
    name: 'error',
    error: new Error(message),
    streamDelay: 5,
  }),

  /**
   * Slow response (for testing loading states)
   */
  slow: (text: string): MockBaleybotConfig => ({
    name: 'slow',
    responseText: text,
    streamDelay: 100,
  }),

  /**
   * Calculator example with tool call
   */
  calculator: (): MockBaleybotConfig => ({
    name: 'calculator',
    toolCalls: [
      {
        id: 'call_123',
        toolName: 'add',
        arguments: { a: 5, b: 3 },
        result: 8,
        executionDelay: 50,
      },
      {
        id: 'call_124',
        toolName: 'multiply',
        arguments: { a: 8, b: 2 },
        result: 16,
        executionDelay: 50,
      },
    ],
    responseText: 'The result of (5 + 3) * 2 is 16.',
    streamDelay: 10,
  }),

  /**
   * Sentiment analysis example
   */
  sentimentAnalysis: (
    sentiment: 'positive' | 'negative' | 'neutral',
    confidence: number
  ): MockBaleybotConfig => ({
    name: 'sentiment-analyzer',
    structuredOutput: { sentiment, confidence },
    streamDelay: 5,
  }),
};

// ============================================================================
// SSE Format Helpers
// ============================================================================

/**
 * Converts events to SSE format string for testing API routes
 */
export function eventsToSSE(events: BaleybotStreamEvent[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';
}

/**
 * Creates a mock ReadableStream from events (for testing API responses)
 */
export function createMockSSEStream(
  config: MockBaleybotConfig
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for await (const event of createMockBaleybotStream(config)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}
