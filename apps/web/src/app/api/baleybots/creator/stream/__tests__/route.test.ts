import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockAuth,
  mockCheckRateLimit,
  mockGetAuthenticatedWorkspace,
  mockBuildCreatorRequestContext,
  mockExecuteCreatorPipeline,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetAuthenticatedWorkspace: vi.fn(),
  mockBuildCreatorRequestContext: vi.fn(),
  mockExecuteCreatorPipeline: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock('@baleyui/db', () => ({
  db: {},
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMITS: {
    creatorMessage: { maxRequests: 10, windowMs: 60000 },
  },
}));

vi.mock('@/lib/auth/workspace-lookup', () => ({
  getAuthenticatedWorkspace: (...args: unknown[]) =>
    mockGetAuthenticatedWorkspace(...args),
}));

vi.mock('@/lib/baleybot/creator-request-context', () => ({
  buildCreatorRequestContext: (...args: unknown[]) =>
    mockBuildCreatorRequestContext(...args),
}));

vi.mock('@/lib/baleybot/creator-pipeline-adapter', () => ({
  executeCreatorPipeline: (...args: unknown[]) => mockExecuteCreatorPipeline(...args),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/lib/api/error-response', async () => {
  const { NextResponse } = await import('next/server');
  return {
    apiErrors: {
      unauthorized: (msg = 'Unauthorized') =>
        NextResponse.json({ error: msg }, { status: 401 }),
      notFound: (entity = 'Resource') =>
        NextResponse.json({ error: `${entity} not found` }, { status: 404 }),
      badRequest: (msg: string) =>
        NextResponse.json({ error: msg }, { status: 400 }),
      internal: () => NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    },
  };
});

import { POST } from '../route';

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/baleybots/creator/stream', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  });
}

async function readResponseStream(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

describe('POST /api/baleybots/creator/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockCheckRateLimit.mockResolvedValue(undefined);
    mockGetAuthenticatedWorkspace.mockResolvedValue({ id: 'ws-1' });
    mockBuildCreatorRequestContext.mockResolvedValue({
      sanitizedMessage: 'build me a bot',
      conversationHistory: [],
      context: {
        workspaceId: 'ws-1',
        availableTools: [],
        workspacePolicies: null,
        connections: [],
        existingBaleybots: [],
      },
    });
    mockExecuteCreatorPipeline.mockImplementation(async (args: { onEvent: (event: Record<string, unknown>) => void }) => {
      args.onEvent({
        type: 'creator_text_delta',
        content: 'Building your bot...',
        timestamp: Date.now(),
      });
      args.onEvent({
        type: 'creator_complete',
        result: {
          status: 'ready',
          entities: [{ id: 'entity-1', name: 'Entity', icon: '🤖', purpose: 'Test', tools: [] }],
          connections: [],
          balCode: 'entity { "goal": "test" }',
          name: 'Test Bot',
          description: 'test',
          icon: '🤖',
          message: 'Done',
        },
        summary: 'Built Test Bot with 1 entity.',
        timestamp: Date.now(),
      });
      return null;
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const response = await POST(createRequest({ message: 'hello' }));
    expect(response.status).toBe(401);
  });

  it('streams creator events and completion payload', async () => {
    const response = await POST(createRequest({ message: 'build me a bot' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const payload = await readResponseStream(response);
    expect(payload).toContain('"type":"creator_stream_started"');
    expect(payload).toContain('"type":"creator_text_delta"');
    expect(payload).toContain('"type":"creator_complete"');
    expect(payload).toContain('data: [DONE]');
  });

  it('streams conversational text for building (no spawn) turns', async () => {
    mockExecuteCreatorPipeline.mockImplementation(async (args: { onEvent: (event: Record<string, unknown>) => void }) => {
      args.onEvent({
        type: 'creator_text_delta',
        content: 'What matters most to you — speed or accuracy?',
        timestamp: Date.now(),
      });
      args.onEvent({
        type: 'creator_complete',
        result: {
          status: 'building',
          message: 'What matters most to you — speed or accuracy?',
          entities: [],
          connections: [],
          balCode: '',
          name: 'Unnamed BaleyBot',
          description: '',
          icon: '🤖',
        },
        summary: 'Gathering more details before building.',
        timestamp: Date.now(),
      });
      return null;
    });

    const response = await POST(createRequest({ message: 'build me a customer support bot' }));
    expect(response.status).toBe(200);

    const payload = await readResponseStream(response);
    expect(payload).toContain('"type":"creator_text_delta"');
    expect(payload).toContain('What matters most');
    expect(payload).toContain('"status":"building"');
    // No input_requested events in the new conversational flow
    expect(payload).not.toContain('creator_input_requested');
    expect(payload).toContain('data: [DONE]');
  });

  it('streams creator_error when processing fails', async () => {
    mockExecuteCreatorPipeline.mockRejectedValue(new Error('creator exploded'));

    const response = await POST(createRequest({ message: 'build me a bot' }));
    expect(response.status).toBe(200);

    const payload = await readResponseStream(response);
    expect(payload).toContain('"type":"creator_error"');
    expect(payload).toContain('creator exploded');
    expect(payload).toContain('data: [DONE]');
  });
});
