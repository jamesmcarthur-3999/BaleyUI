/**
 * StreamTransport — transport-agnostic interface for streaming events.
 *
 * Both SSE and WebSocket transports implement this interface so all
 * streaming consumers (hooks, components) stay transport-agnostic.
 */

export interface TransportConnectOptions {
  url: string;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export interface StreamTransport<TEvent = unknown> {
  /** Open the transport connection. Resolves when the connection is established. */
  connect(options: TransportConnectOptions): Promise<void>;

  /** Send a message to the server. No-op for SSE (unidirectional). */
  send(message: unknown): void;

  /** Register an event handler. Multiple calls append handlers. */
  onEvent(handler: (event: TEvent) => void): void;

  /** Register an error handler. */
  onError(handler: (error: Error) => void): void;

  /** Register a close/done handler. */
  onClose(handler: () => void): void;

  /** Close the transport connection. */
  close(): void;

  /** Whether this transport supports bidirectional messaging. */
  readonly bidirectional: boolean;
}
