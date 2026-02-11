/**
 * SSE Transport — wraps the existing `streamPostSSE` into the StreamTransport interface.
 *
 * `send()` is a no-op since SSE is unidirectional.
 */

import type { StreamTransport, TransportConnectOptions } from './transport';
import { streamPostSSE } from './client-post-sse';

export class SSETransport<TEvent = unknown> implements StreamTransport<TEvent> {
  readonly bidirectional = false as const;

  private eventHandlers: Array<(event: TEvent) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private abortController: AbortController | null = null;

  async connect(options: TransportConnectOptions): Promise<void> {
    this.abortController = new AbortController();

    // Chain with external signal if provided
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.abortController?.abort();
      });
    }

    try {
      await streamPostSSE<TEvent>({
        url: options.url,
        body: options.body,
        headers: options.headers,
        signal: this.abortController.signal,
        onEvent: (event) => {
          for (const handler of this.eventHandlers) {
            handler(event);
          }
        },
        onDone: () => {
          for (const handler of this.closeHandlers) {
            handler();
          }
        },
      });
    } catch (error) {
      // Aborted connections are not errors
      if (this.abortController.signal.aborted) {
        for (const handler of this.closeHandlers) {
          handler();
        }
        return;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      for (const handler of this.errorHandlers) {
        handler(err);
      }
    }
  }

  send(_message: unknown): void {
    // No-op: SSE is unidirectional (server → client only)
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
    this.abortController?.abort();
    this.abortController = null;
  }
}
