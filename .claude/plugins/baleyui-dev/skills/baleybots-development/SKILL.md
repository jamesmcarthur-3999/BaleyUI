---
name: baleybots-development
description: Patterns for BaleyBots AI blocks, function blocks, and streaming events
---

# BaleyBots Development

Reference: `/Users/jamesmcarthur/Documents/GitHub/baleybots/typescript/packages/core/src/`

## Streaming Event Types

From `stream-event-schemas.ts`. **Use exact field names.**

```typescript
// Text - use 'content'
{ type: 'text_delta', content: string }
{ type: 'structured_output_delta', content: string }
{ type: 'reasoning', content: string }  // o1, DeepSeek-R1

// Tool call streaming - use 'id' for tool call ID
{ type: 'tool_call_stream_start', id: string, toolName: string }
{ type: 'tool_call_arguments_delta', id: string, argumentsDelta: string }
{ type: 'tool_call_stream_complete', id: string, toolName: string, arguments: unknown }

// Tool execution
{ type: 'tool_execution_start', id: string, toolName: string, arguments: unknown }
{ type: 'tool_execution_output', id: string, toolName: string, result: unknown, error?: string }
{ type: 'tool_execution_stream', toolCallId: string, toolName: string, nestedEvent: BaleybotStreamEvent, childBotName?: string }

// Errors
{ type: 'tool_validation_error', toolName: string, validationErrors: unknown, receivedArguments: unknown }
{ type: 'error', error: Error | { message: string, name?: string, stack?: string } }

// Done - use 'reason'
{ type: 'done', reason: DoneReason, timestamp: number, duration_ms: number, agent_id: string, parent_agent_id?: string }

type DoneReason = 'turn_yielded' | 'out_of_iterations' | 'max_tokens_reached' | 'error' | 'interrupted' | 'no_applicable_tools' | 'max_depth_reached' | 'graceful_shutdown';
```

## Baleybot.create() - AI Blocks

From `baleybot.ts`:

```typescript
import { Baleybot } from '@baleybots/core';
import { openai, anthropic, ollama } from '@baleybots/core';  // Providers exported from root

const bot = Baleybot.create({
  name: 'my-bot',
  goal: 'What the bot should accomplish',

  // Model: string or ModelConfig. Auto-selects if omitted.
  model: 'gpt-4o-mini',  // or: openai('gpt-4o', { apiKey })

  // Optional structured output
  outputSchema: z.object({ sentiment: z.string() }),

  // Optional tools
  tools: { myTool: { name: 'myTool', description: '...', inputSchema: z.object({...}), function: async (args) => {...} } },

  maxToolIterations: 25,  // Default
  verbose: false,
});

// Execute
const result = await bot.process(input, {
  onToken: (botName, event) => { /* handle streaming event */ },
  signal: abortController.signal,
  conversationHistory: [],  // ChatMessage[]
});
```

## Deterministic.create() - Function Blocks

From `deterministic.ts`:

```typescript
import { Deterministic } from '@baleybots/core';

const processor = Deterministic.create({
  name: 'my-processor',
  processFn: async (input, options) => {
    // Your logic here
    return { result: 'processed' };
  },
  schema: z.object({ result: z.string() }),  // Optional validation
});

const result = await processor.process(input, { signal });

// Also callable directly
const result2 = await processor(input);
```

## Provider Factory Functions

```typescript
import { openai, anthropic, ollama } from '@baleybots/core';

// Returns ModelConfig
openai('gpt-4o', { apiKey: '...', baseUrl: '...' })
anthropic('claude-3-5-sonnet-20241022', { apiKey: '...' })
ollama('llama3', { baseUrl: 'http://localhost:11434' })
```

## Processable Interface

All BaleyBots primitives implement this interface:

```typescript
interface Processable<TInput, TOutput> {
  process(input: TInput, options?: ProcessOptions): Promise<TOutput>;
  subscribeToAll(options): Subscription;
  getId(): string;
  getName?(): string;
  getBotNames?(): string[];
}
```

## Key Source Files

| File | Purpose |
|------|---------|
| `baleybot.ts` | Main Baleybot class |
| `deterministic.ts` | Deterministic processor |
| `stream-event-schemas.ts` | Event type definitions |
| `providers/factories.ts` | openai(), anthropic(), ollama() |
| `pipeline/` | Composition patterns |
| `patterns/` | Loop, router, parallel, etc. |
