/**
 * Transport factory — creates the best available StreamTransport.
 *
 * `'auto'` detects WebSocket support and falls back to SSE.
 * `'sse'` always uses SSE.
 * `'websocket'` always uses WebSocket (throws if unavailable).
 */

import type { StreamTransport } from './transport';
import { SSETransport } from './sse-transport';
import { WebSocketTransport } from './ws-transport';

export type TransportPreference = 'sse' | 'websocket' | 'auto';

/**
 * Check if WebSocket is available in the current environment.
 * Returns false in SSR, environments without WebSocket, or when
 * the server doesn't expose WS endpoints (e.g., Vercel serverless).
 */
function isWebSocketAvailable(): boolean {
  return typeof window !== 'undefined' && typeof WebSocket !== 'undefined';
}

export function createTransport<TEvent = unknown>(
  preference: TransportPreference = 'auto'
): StreamTransport<TEvent> {
  switch (preference) {
    case 'websocket':
      if (!isWebSocketAvailable()) {
        throw new Error('WebSocket is not available in this environment');
      }
      return new WebSocketTransport<TEvent>();

    case 'sse':
      return new SSETransport<TEvent>();

    case 'auto':
    default:
      // For now, default to SSE since Vercel doesn't support WS.
      // When deployed to a WS-capable runtime, this can probe the
      // /api/ws/health endpoint to determine support.
      return new SSETransport<TEvent>();
  }
}
