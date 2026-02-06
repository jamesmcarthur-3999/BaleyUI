import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Hoisted mocks (available inside vi.mock factories)
// ============================================================================

const {
  mockAuth,
  mockFindFirstWorkspace,
  mockFindFirstBaleybot,
  mockInsertReturning,
  mockCheckRateLimit,
  mockValidateApiKey,
  mockDbInsert,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFindFirstWorkspace: vi.fn(),
  mockFindFirstBaleybot: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockValidateApiKey: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

// ============================================================================
// Module mocks
// ============================================================================

vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      workspaces: { findFirst: (...args: unknown[]) => mockFindFirstWorkspace(...args) },
      baleybots: { findFirst: (...args: unknown[]) => mockFindFirstBaleybot(...args) },
    },
    insert: (...args: unknown[]) => {
      mockDbInsert(...args);
      return {
        values: vi.fn(() => ({
          returning: () => mockInsertReturning(),
        })),
      };
    },
    update: (...args: unknown[]) => {
      mockDbUpdate(...args);
      return {
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      };
    },
  },
  baleybots: { id: 'id', workspaceId: 'workspaceId', executionCount: 'executionCount' },
  baleybotExecutions: { id: 'id', baleybotId: 'baleybotId' },
  eq: vi.fn((a: unknown, b: unknown) => ({ _type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  notDeleted: vi.fn(() => ({ _type: 'notDeleted' })),
  sql: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMITS: {
    execute: { maxRequests: 10, windowMs: 60000 },
  },
}));

vi.mock('@/lib/api/validate-api-key', () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

vi.mock('@baleyui/sdk', () => ({
  streamBALExecution: vi.fn(),
}));

vi.mock('@/lib/baleybot/tools/built-in/implementations', () => ({
  getBuiltInRuntimeTools: vi.fn(() => new Map()),
  configureWebSearch: vi.fn(),
}));

vi.mock('@/lib/baleybot/services', () => ({
  initializeBuiltInToolServices: vi.fn(),
}));

vi.mock('@/lib/baleybot/executor', () => ({
  getPreferredModel: vi.fn(() => 'anthropic:claude-sonnet-4-20250514'),
}));

vi.mock('@/lib/baleybot/services/bb-completion-trigger-service', () => ({
  processBBCompletion: vi.fn().mockResolvedValue(undefined),
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
      internal: (err: unknown, opts?: { requestId?: string }) =>
        NextResponse.json(
          { error: 'Internal server error', requestId: opts?.requestId },
          { status: 500 }
        ),
    },
    createErrorResponse: (status: number, _err: unknown, opts?: { message?: string; requestId?: string }) =>
      NextResponse.json(
        { error: opts?.message ?? 'Error', requestId: opts?.requestId },
        { status }
      ),
  };
});

// Import the handler after mocks
import { POST } from '../route';

// ============================================================================
// Helpers
// ============================================================================

function createRequest(options?: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  noBody?: boolean;
}): NextRequest {
  const url = 'http://localhost:3000/api/baleybots/bb-123/execute-stream';
  if (options?.noBody) {
    return new NextRequest(url, { method: 'POST', headers: options?.headers });
  }
  return new NextRequest(url, {
    method: options?.method ?? 'POST',
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    headers: {
      'content-type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
}

function createParams(id = 'bb-123'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Set up mocks for an authenticated session with a valid baleybot */
function setupAuthenticatedSession() {
  mockAuth.mockResolvedValue({ userId: 'user-1' });
  mockFindFirstWorkspace.mockResolvedValue({ id: 'ws-1', ownerId: 'user-1' });
  mockFindFirstBaleybot.mockResolvedValue({
    id: 'bb-123',
    name: 'Test Bot',
    balCode: 'assistant { "goal": "test" }',
    workspaceId: 'ws-1',
    status: 'active',
    executionCount: 0,
  });
  mockCheckRateLimit.mockResolvedValue(undefined);
  mockInsertReturning.mockResolvedValue([{ id: 'exec-1' }]);
}

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/baleybots/[id]/execute-stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: null });
    mockFindFirstWorkspace.mockResolvedValue(null);
    mockFindFirstBaleybot.mockResolvedValue(null);
    mockCheckRateLimit.mockResolvedValue(undefined);
    mockInsertReturning.mockResolvedValue([{ id: 'exec-1' }]);
  });

  // --------------------------------------------------------------------------
  // Authentication
  // --------------------------------------------------------------------------

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    mockValidateApiKey.mockRejectedValue(new Error('Invalid API key'));

    const req = createRequest({ body: {} });
    const response = await POST(req, createParams());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Unauthorized');
  });

  it('session auth works', async () => {
    setupAuthenticatedSession();

    const req = createRequest({ noBody: true });
    const response = await POST(req, createParams());

    // Should not be 401 - streaming means 200 with SSE
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
  });

  it('API key auth works (Bearer bui_live_*)', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    mockFindFirstWorkspace.mockResolvedValue(null);
    mockValidateApiKey.mockResolvedValue({
      workspaceId: 'ws-1',
      keyId: 'key-1',
      permissions: ['admin'],
    });
    mockFindFirstBaleybot.mockResolvedValue({
      id: 'bb-123',
      name: 'Test Bot',
      balCode: 'assistant { "goal": "test" }',
      workspaceId: 'ws-1',
      status: 'active',
      executionCount: 0,
    });
    mockInsertReturning.mockResolvedValue([{ id: 'exec-1' }]);

    const req = createRequest({
      headers: { authorization: 'Bearer bui_live_testkey123456' },
      noBody: true,
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
  });

  // --------------------------------------------------------------------------
  // Resource lookup
  // --------------------------------------------------------------------------

  it('returns 404 for non-existent baleybot', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockFindFirstWorkspace.mockResolvedValue({ id: 'ws-1', ownerId: 'user-1' });
    mockFindFirstBaleybot.mockResolvedValue(null);

    const req = createRequest({ body: {} });
    const response = await POST(req, createParams('nonexistent'));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('not found');
  });

  it('returns 400 for baleybot in error state', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockFindFirstWorkspace.mockResolvedValue({ id: 'ws-1', ownerId: 'user-1' });
    mockFindFirstBaleybot.mockResolvedValue({
      id: 'bb-123',
      name: 'Error Bot',
      balCode: 'assistant { "goal": "test" }',
      workspaceId: 'ws-1',
      status: 'error',
    });

    const req = createRequest({ body: {} });
    const response = await POST(req, createParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('error state');
  });

  // --------------------------------------------------------------------------
  // Rate limiting
  // --------------------------------------------------------------------------

  it('returns 429 when rate limited', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockFindFirstWorkspace.mockResolvedValue({ id: 'ws-1', ownerId: 'user-1' });
    mockCheckRateLimit.mockRejectedValue(new Error('Rate limit exceeded'));

    const req = createRequest({ body: {} });
    const response = await POST(req, createParams());

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain('Rate limit');
  });

  // --------------------------------------------------------------------------
  // Body validation
  // --------------------------------------------------------------------------

  it('validates request body - invalid triggeredBy returns 400', async () => {
    setupAuthenticatedSession();

    const req = createRequest({
      body: { triggeredBy: 'invalid_value' },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid request body');
  });

  it('accepts valid request body', async () => {
    setupAuthenticatedSession();

    const req = createRequest({
      body: { input: 'hello', triggeredBy: 'manual' },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(200);
  });

  it('empty body is accepted (input is optional)', async () => {
    setupAuthenticatedSession();

    // Send request with no body at all
    const req = createRequest({ noBody: true });
    const response = await POST(req, createParams());

    // Empty body causes JSON parse error which is caught -> input stays undefined
    expect(response.status).toBe(200);
  });

  it('strict body rejects unknown fields', async () => {
    setupAuthenticatedSession();

    const req = createRequest({
      body: { input: 'hello', triggeredBy: 'manual', unknownField: 'bad' },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid request body');
  });

  // --------------------------------------------------------------------------
  // Execution record & SSE
  // --------------------------------------------------------------------------

  it('creates execution record before streaming', async () => {
    setupAuthenticatedSession();

    const req = createRequest({ body: { input: 'test' } });
    await POST(req, createParams());

    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockInsertReturning).toHaveBeenCalled();
  });

  it('returns SSE content-type header', async () => {
    setupAuthenticatedSession();

    const req = createRequest({ body: { input: 'test' } });
    const response = await POST(req, createParams());

    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
  });
});
