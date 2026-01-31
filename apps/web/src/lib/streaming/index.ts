/**
 * BaleyUI Streaming Infrastructure
 *
 * Uses Vercel AI SDK for React hooks and state management.
 * Provides adapter to convert BaleyBots events to AI SDK format.
 *
 * @example
 * ```tsx
 * // In your API route (pages/api/chat.ts or app/api/chat/route.ts)
 * import { adaptBaleybotResponse } from '@/lib/streaming';
 *
 * export async function POST(req: Request) {
 *   const baleyResponse = await runBaleybot(req);
 *   return adaptBaleybotResponse(baleyResponse);
 * }
 *
 * // In your React component
 * import { useChat } from '@ai-sdk/react';
 *
 * function Chat() {
 *   const { messages, sendMessage, status } = useChat();
 *   // All streaming, tools, state handled by AI SDK
 * }
 * ```
 */

// BaleyBots event types (documents the contract)
export * from './types';

// Adapter to convert BaleyBots → AI SDK format
export {
  convertBaleybotEvent,
  createBaleybotToAISDKStream,
  adaptBaleybotResponse,
  createAISDKStreamFromEvents,
} from './adapter';
export type { AISDKStreamEvent } from './adapter';

// Re-export AI SDK hooks for convenience
export { useChat, useCompletion } from '@ai-sdk/react';

// Utilities (SSE parsing, partial JSON)
export { parseSSEChunk, parsePartialJSON } from './utils';
