import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamPostSSE } from '../client-post-sse';

function createSSEBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('streamPostSSE', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses event frames and stops at [DONE]', async () => {
    const events: Array<{ type: string; value?: number }> = [];
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        createSSEBody([
          'data: {"type":"creator_progress","value":1}\n\n',
          'data: {"type":"creator_highlight","value":2}\n\n',
          'data: [DONE]\n\n',
        ]),
        {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
        }
      )
    );

    await streamPostSSE<{ type: string; value?: number }>({
      url: '/api/test',
      body: { hello: 'world' },
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      { type: 'creator_progress', value: 1 },
      { type: 'creator_highlight', value: 2 },
    ]);
  });

  it('throws when the response is not ok', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response('bad request', { status: 400 })
    );

    await expect(
      streamPostSSE({
        url: '/api/test',
        body: {},
      })
    ).rejects.toThrow('bad request');
  });
});

