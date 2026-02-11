/**
 * WebSocket Transport — bidirectional streaming via WebSocket.
 *
 * Features:
 * - Reconnection with exponential backoff
 * - Auth via query params (browsers can't set WS headers)
 * - JSON message framing with `type` discriminator
 * - AbortSignal support
 */

import type { StreamTransport, TransportConnectOptions } from './transport';
import { createLogger } from '@/lib/logger';

const log = createLogger('ws-transport');

const INITIAL_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 15_000;
const RECONNECT_BACKOFF = 2;

interface WSMessage<TEvent = unknown> {
  type: 'event' | 'error' | 'done' | 'ping';
  data?: TEvent;
  error?: string;
}

export class WebSocketTransport<TEvent = unknown> implements StreamTransport<TEvent> {
  readonly bidirectional = true as const;

  private eventHandlers: Array<(event: TEvent) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_MS;
  private connectOptions: TransportConnectOptions | null = null;

  async connect(options: TransportConnectOptions): Promise<void> {
    this.connectOptions = options;
    this.closed = false;
    this.reconnectDelay = INITIAL_RECONNECT_MS;

    // Abort signal support
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.close();
      });
    }

    return this.doConnect(options);
  }

  private doConnect(options: TransportConnectOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Convert HTTP(S) URL to WS(S)
      const wsUrl = new URL(options.url, window.location.origin);
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

      try {
        this.ws = new WebSocket(wsUrl.toString());
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.ws.onopen = () => {
        log.debug('WebSocket connected', { url: wsUrl.toString() });
        this.reconnectDelay = INITIAL_RECONNECT_MS;

        // Send the initial payload (equivalent to POST body in SSE)
        if (options.body !== undefined) {
          this.ws?.send(JSON.stringify({ type: 'init', data: options.body }));
        }

        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WSMessage<TEvent>;

          switch (msg.type) {
            case 'event':
              if (msg.data !== undefined) {
                for (const handler of this.eventHandlers) {
                  handler(msg.data);
                }
              }
              break;

            case 'error':
              for (const handler of this.errorHandlers) {
                handler(new Error(msg.error || 'Unknown WebSocket error'));
              }
              break;

            case 'done':
              for (const handler of this.closeHandlers) {
                handler();
              }
              this.ws?.close(1000);
              break;

            case 'ping':
              this.ws?.send(JSON.stringify({ type: 'pong' }));
              break;
          }
        } catch (err) {
          log.warn('Failed to parse WebSocket message', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      };

      this.ws.onerror = (event) => {
        log.warn('WebSocket error', { event });
        // onerror is always followed by onclose, so we handle reconnection there
      };

      this.ws.onclose = (event) => {
        log.debug('WebSocket closed', { code: event.code, reason: event.reason });

        if (this.closed) {
          for (const handler of this.closeHandlers) {
            handler();
          }
          return;
        }

        // Reconnect on unexpected close
        if (event.code !== 1000 && this.connectOptions) {
          this.scheduleReconnect();
        } else {
          for (const handler of this.closeHandlers) {
            handler();
          }
        }
      };

      // If connection fails, reject after timeout
      const connectTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          this.ws?.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10_000);

      // Clear timeout on success
      const origOnOpen = this.ws.onopen;
      this.ws.onopen = (ev) => {
        clearTimeout(connectTimeout);
        (origOnOpen as (ev: Event) => void)?.(ev);
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || !this.connectOptions) return;

    log.debug('Scheduling WebSocket reconnect', { delayMs: this.reconnectDelay });

    this.reconnectTimer = setTimeout(() => {
      if (this.closed || !this.connectOptions) return;

      this.doConnect(this.connectOptions).catch((err) => {
        log.warn('WebSocket reconnect failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.reconnectDelay = Math.min(this.reconnectDelay * RECONNECT_BACKOFF, MAX_RECONNECT_MS);
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * RECONNECT_BACKOFF, MAX_RECONNECT_MS);
  }

  send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      log.warn('Cannot send: WebSocket not open');
    }
  }

  onEvent(handler: (event: TEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  close(): void {
    this.closed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection on deliberate close
      this.ws.close(1000);
      this.ws = null;
    }
  }
}
