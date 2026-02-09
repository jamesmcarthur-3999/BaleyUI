import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockAuth,
  mockCheckRateLimit,
  mockGetAuthenticatedWorkspace,
  mockBuildCreatorRequestContext,
  mockRunCreatorOrchestrator,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetAuthenticatedWorkspace: vi.fn(),
  mockBuildCreatorRequestContext: vi.fn(),
  mockRunCreatorOrchestrator: vi.fn(),
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

vi.mock('@/lib/baleybot/creator-bot', () => ({
  // imported only for types in route
}));

vi.mock('@/lib/baleybot/creator-orchestrator', () => ({
  runCreatorOrchestrator: (...args: unknown[]) => mockRunCreatorOrchestrator(...args),
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
    mockRunCreatorOrchestrator.mockResolvedValue({
      result: {
        status: 'ready',
        entities: [
          {
            id: 'entity-1',
            name: 'Entity',
            icon: '🤖',
            purpose: 'Test',
            tools: [],
          },
        ],
        connections: [],
        balCode: 'entity { "goal": "test" }',
        name: 'Test Bot',
        description: 'test',
        icon: '🤖',
        message: 'Done',
      },
      planDelta: {
        summary: 'ok',
      },
      guidanceActions: [],
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const response = await POST(createRequest({ message: 'hello' }));
    expect(response.status).toBe(401);
  });

  it('streams creator events and completion payload', async () => {
    mockRunCreatorOrchestrator.mockImplementation(async (options: { onEvent?: (event: unknown) => void }) => {
      options.onEvent?.({
        type: 'creator_progress',
        payload: {
          phase: 'discovery',
          message: 'Collecting required details',
          highlight: 'Detected a missing data source',
          highlightType: 'status',
        },
      });
      options.onEvent?.({
        type: 'creator_plan_delta',
        payload: {
          summary: 'Captured one blocker',
        },
      });
      options.onEvent?.({
        type: 'creator_action_suggestions',
        payload: {
          actions: [
            {
              label: 'Answer missing source',
              prompt: 'Activity data source: Postgres',
              mode: 'insert',
            },
          ],
        },
      });
      return {
        result: {
          status: 'ready',
          entities: [
            {
              id: 'entity-1',
              name: 'Entity',
              icon: '🤖',
              purpose: 'Test',
              tools: ['web_search'],
            },
          ],
          connections: [],
          balCode: 'entity { "goal": "test" }',
          name: 'Test Bot',
          description: 'test',
          icon: '🤖',
          message: 'Done',
        },
        planDelta: {
          summary: 'done',
        },
        guidanceActions: [],
      };
    });

    const response = await POST(createRequest({ message: 'build me a bot' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const payload = await readResponseStream(response);
    expect(payload).toContain('"type":"creator_stream_started"');
    expect(payload).toContain('"type":"creator_progress"');
    expect(payload).toContain('"type":"creator_highlight"');
    expect(payload).toContain('"type":"creator_plan_delta"');
    expect(payload).toContain('"type":"creator_action_suggestions"');
    expect(payload).toContain('"type":"creator_complete"');
    expect(payload).toContain('data: [DONE]');
  });

  it('streams creator_error when processing fails', async () => {
    mockRunCreatorOrchestrator.mockRejectedValue(new Error('creator exploded'));

    const response = await POST(createRequest({ message: 'build me a bot' }));
    expect(response.status).toBe(200);

    const payload = await readResponseStream(response);
    expect(payload).toContain('"type":"creator_error"');
    expect(payload).toContain('creator exploded');
    expect(payload).toContain('data: [DONE]');
  });
});
