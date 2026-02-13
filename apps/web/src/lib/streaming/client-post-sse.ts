import { createLogger } from '@/lib/logger';

const log = createLogger('client-post-sse');

export interface StreamPostSSEOptions<TEvent = Record<string, unknown>> {
  url: string;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  onOpen?: (response: Response) => void;
  onEvent?: (event: TEvent) => void;
  onDone?: () => void;
}

interface ParsedFrame<TEvent> {
  done: boolean;
  event?: TEvent;
}

function parseSSEFrame<TEvent>(frame: string): ParsedFrame<TEvent> | null {
  if (!frame.trim()) return null;

  const dataLines: string[] = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    if (!rawLine.startsWith('data:')) continue;
    dataLines.push(rawLine.slice(rawLine.startsWith('data: ') ? 6 : 5));
  }

  if (dataLines.length === 0) return null;

  const data = dataLines.join('\n').trim();
  if (!data) return null;

  if (data === '[DONE]') {
    return { done: true };
  }

  try {
    return {
      done: false,
      event: JSON.parse(data) as TEvent,
    };
  } catch (error) {
    log.warn('Failed to parse SSE frame payload', {
      preview: data.slice(0, 200),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function streamPostSSE<TEvent = Record<string, unknown>>(
  options: StreamPostSSEOptions<TEvent>
): Promise<void> {
  const response = await fetch(options.url, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Streaming request failed (${response.status})`);
  }

  // Detect HTML responses (e.g. auth redirect) before the SSE parser chokes
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(
      `Expected event-stream but received text/html (status ${response.status}). Session may have expired.`,
    );
  }

  options.onOpen?.(response);

  if (!response.body) {
    throw new Error('Streaming response did not include a body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneReceived = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const parsed = parseSSEFrame<TEvent>(frame);
        if (!parsed) continue;

        if (parsed.done) {
          doneReceived = true;
          options.onDone?.();
          return;
        }

        if (parsed.event !== undefined) {
          options.onEvent?.(parsed.event);
        }
      }
    }

    // Parse any trailing frame if the stream closed without a blank line terminator.
    if (buffer.trim()) {
      const parsed = parseSSEFrame<TEvent>(buffer);
      if (parsed?.done) {
        doneReceived = true;
        options.onDone?.();
      } else if (parsed?.event !== undefined) {
        options.onEvent?.(parsed.event);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!doneReceived && !options.signal?.aborted) {
    throw new Error('Streaming response closed before [DONE]');
  }
}

