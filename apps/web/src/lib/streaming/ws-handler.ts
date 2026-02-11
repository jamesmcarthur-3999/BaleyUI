/**
 * Server-side WebSocket handler utility.
 *
 * Wraps any `(input, emit) => Promise<void>` handler into a
 * WebSocket-compatible route handler. Reuses the same execution logic
 * as SSE routes — only the transport framing changes.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('ws-handler');

const HEARTBEAT_INTERVAL_MS = 15_000;

export interface WSEmitter<TEvent = unknown> {
  emit(event: TEvent): void;
  done(): void;
  error(message: string): void;
}

type WSHandlerFn<TInput, TEvent> = (
  input: TInput,
  emitter: WSEmitter<TEvent>
) => Promise<void>;

interface WSRouteOptions<TInput, TEvent> {
  handler: WSHandlerFn<TInput, TEvent>;
  /** Optional input validator. Returns null on invalid input. */
  parseInput?: (raw: unknown) => TInput | null;
  /** Optional auth check. Return true to allow, false to reject. */
  authorize?: (req: Request) => Promise<boolean>;
}

/**
 * Create a Next.js route handler that upgrades to WebSocket.
 *
 * Note: Next.js on Vercel does NOT support WebSocket natively.
 * This handler works with custom Node.js servers or edge runtimes
 * that support the WebSocket upgrade pattern.
 *
 * For Vercel deployments, clients will auto-fallback to SSE via
 * the `createTransport('auto')` factory.
 */
export function createWSHandler<TInput = unknown, TEvent = unknown>(
  options: WSRouteOptions<TInput, TEvent>
) {
  return async function GET(req: Request): Promise<Response> {
    // Check for WebSocket upgrade
    const upgradeHeader = req.headers.get('upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Auth check
    if (options.authorize) {
      const authorized = await options.authorize(req);
      if (!authorized) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // Attempt upgrade via server-provided API
    // This requires a runtime that supports WebSocket (not Vercel serverless)
    // WebSocketPair is available in Cloudflare Workers and similar runtimes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const WebSocketPair = (globalThis as any).WebSocketPair;
    if (!WebSocketPair) {
      return new Response('WebSocket not supported on this runtime', { status: 501 });
    }
    const pair = new WebSocketPair() as [WebSocket, WebSocket];
    const [client, server] = pair;

    // Accept the WebSocket connection
    (server as unknown as { accept: () => void }).accept();

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const emitter: WSEmitter<TEvent> = {
      emit(event: TEvent) {
        try {
          server.send(JSON.stringify({ type: 'event', data: event }));
        } catch (err) {
          log.warn('Failed to send WS event', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
      done() {
        try {
          server.send(JSON.stringify({ type: 'done' }));
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          server.close(1000);
        } catch {
          // Connection may already be closed
        }
      },
      error(message: string) {
        try {
          server.send(JSON.stringify({ type: 'error', error: message }));
        } catch {
          // Connection may already be closed
        }
      },
    };

    // Start heartbeat
    heartbeatTimer = setInterval(() => {
      try {
        server.send(JSON.stringify({ type: 'ping' }));
      } catch {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Listen for init message
    server.addEventListener('message', async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; data?: unknown };

        if (msg.type === 'init') {
          const input = options.parseInput
            ? options.parseInput(msg.data)
            : (msg.data as TInput);

          if (input === null) {
            emitter.error('Invalid input');
            emitter.done();
            return;
          }

          try {
            await options.handler(input, emitter);
          } catch (err) {
            log.error('WS handler error', {
              error: err instanceof Error ? err.message : String(err),
            });
            emitter.error(err instanceof Error ? err.message : 'Internal error');
            emitter.done();
          }
        } else if (msg.type === 'pong') {
          // Heartbeat response — no action needed
        }
      } catch (err) {
        log.warn('Failed to parse WS message', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    server.addEventListener('close', () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    });

    // Return the upgrade response
    return new Response(null, {
      status: 101,
      // @ts-expect-error -- WebSocket pair response for compatible runtimes
      webSocket: client,
    });
  };
}
