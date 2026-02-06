import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Hoisted mocks (available inside vi.mock factories)
// ============================================================================

const {
  mockFindFirstWorkspace,
  mockFindFirstBaleybot,
  mockFindFirstExecution,
  mockInsertReturning,
  mockUpdateSetWhere,
  mockCheckApiRateLimit,
  mockExecuteBALCode,
  mockGetWorkspaceAICredentials,
} = vi.hoisted(() => ({
  mockFindFirstWorkspace: vi.fn(),
  mockFindFirstBaleybot: vi.fn(),
  mockFindFirstExecution: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdateSetWhere: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
  mockExecuteBALCode: vi.fn(),
  mockGetWorkspaceAICredentials: vi.fn(),
}));

// ============================================================================
// Module mocks
// ============================================================================

vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      workspaces: { findFirst: (...args: unknown[]) => mockFindFirstWorkspace(...args) },
      baleybots: { findFirst: (...args: unknown[]) => mockFindFirstBaleybot(...args) },
      baleybotExecutions: { findFirst: (...args: unknown[]) => mockFindFirstExecution(...args) },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => mockInsertReturning()),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn((...args: unknown[]) => {
          mockUpdateSetWhere(...args);
          return Promise.resolve();
        }),
      })),
    })),
  },
  baleybots: { id: 'id', workspaceId: 'workspaceId' },
  baleybotExecutions: { id: 'id', baleybotId: 'baleybotId', idempotencyKey: 'idempotencyKey' },
  workspaces: { id: 'id' },
  eq: vi.fn((a: unknown, b: unknown) => ({ _type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  notDeleted: vi.fn(() => ({ _type: 'notDeleted' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkApiRateLimit: (...args: unknown[]) => mockCheckApiRateLimit(...args),
  RATE_LIMITS: {
    webhookPerMinute: { maxRequests: 60, windowMs: 60000 },
  },
}));

vi.mock('@baleyui/sdk', () => ({
  executeBALCode: (...args: unknown[]) => mockExecuteBALCode(...args),
}));

vi.mock('@/lib/baleybot/services', () => ({
  getWorkspaceAICredentials: (...args: unknown[]) => mockGetWorkspaceAICredentials(...args),
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
    createErrorResponse: (status: number, _err: unknown, opts?: { message?: string; requestId?: string }) =>
      NextResponse.json(
        { error: opts?.message ?? 'Error', requestId: opts?.requestId },
        { status }
      ),
  };
});

// Import route handler after all mocks
import { POST } from '../[workspaceId]/[baleybotId]/route';

// ============================================================================
// Helpers
// ============================================================================

function createRequest(options?: {
  body?: unknown;
  headers?: Record<string, string>;
  contentType?: string;
}): NextRequest {
  const ct = options?.contentType ?? 'application/json';
  const isJson = ct.includes('application/json');

  let requestBody: string | undefined;
  if (options?.body !== undefined) {
    requestBody = isJson ? JSON.stringify(options.body) : String(options.body);
  }

  return new NextRequest(
    'http://localhost:3000/api/webhooks/baleybots/ws-1/bb-1',
    {
      method: 'POST',
      body: requestBody,
      headers: {
        'content-type': ct,
        ...(options?.headers ?? {}),
      },
    }
  );
}

function createParams(
  workspaceId = 'ws-1',
  baleybotId = 'bb-1'
): { params: Promise<{ workspaceId: string; baleybotId: string }> } {
  return { params: Promise.resolve({ workspaceId, baleybotId }) };
}

const DEFAULT_BALEYBOT = {
  id: 'bb-1',
  name: 'Test Bot',
  balCode: 'assistant { "goal": "test" }',
  webhookSecret: 'secret-123',
  webhookEnabled: true,
  status: 'active',
};

function setupValidWebhook() {
  mockCheckApiRateLimit.mockResolvedValue({ limited: false, remaining: 59, resetAt: Date.now() + 60000 });
  mockFindFirstWorkspace.mockResolvedValue({ id: 'ws-1' });
  mockFindFirstBaleybot.mockResolvedValue({ ...DEFAULT_BALEYBOT });
  mockFindFirstExecution.mockResolvedValue(null);
  mockInsertReturning.mockResolvedValue([{ id: 'exec-1' }]);
  mockGetWorkspaceAICredentials.mockResolvedValue({
    apiKey: 'sk-test',
    model: 'anthropic:claude-sonnet-4-20250514',
  });
  mockExecuteBALCode.mockResolvedValue({ status: 'success', result: 'done' });
}

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/webhooks/baleybots/[workspaceId]/[baleybotId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckApiRateLimit.mockResolvedValue({ limited: false, remaining: 59, resetAt: Date.now() + 60000 });
    mockFindFirstWorkspace.mockResolvedValue(null);
    mockFindFirstBaleybot.mockResolvedValue(null);
    mockFindFirstExecution.mockResolvedValue(null);
    mockInsertReturning.mockResolvedValue([{ id: 'exec-1' }]);
  });

  // --------------------------------------------------------------------------
  // Authentication / Secret
  // --------------------------------------------------------------------------

  it('returns 401 for invalid webhook secret', async () => {
    setupValidWebhook();
    // Override with wrong secret header
    const req = createRequest({
      body: { data: 'test' },
      headers: { 'x-webhook-secret': 'wrong-secret' },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Invalid webhook secret');
  });

  it('returns 401 when no webhook secret header is provided', async () => {
    setupValidWebhook();
    // No x-webhook-secret header
    const req = createRequest({ body: { data: 'test' } });
    const response = await POST(req, createParams());

    expect(response.status).toBe(401);
  });

  it('timing-safe secret comparison (correct secret succeeds)', async () => {
    setupValidWebhook();
    const req = createRequest({
      body: { data: 'test' },
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    const response = await POST(req, createParams());

    // A valid secret should pass auth - should NOT be 401
    expect(response.status).not.toBe(401);
  });

  // --------------------------------------------------------------------------
  // Resource lookup
  // --------------------------------------------------------------------------

  it('returns 404 for non-existent workspace', async () => {
    mockCheckApiRateLimit.mockResolvedValue({ limited: false, remaining: 59, resetAt: Date.now() + 60000 });
    mockFindFirstWorkspace.mockResolvedValue(null);

    const req = createRequest({
      body: { data: 'test' },
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    const response = await POST(req, createParams('nonexistent-ws'));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('Workspace not found');
  });

  it('returns 404 for non-existent baleybot', async () => {
    mockCheckApiRateLimit.mockResolvedValue({ limited: false, remaining: 59, resetAt: Date.now() + 60000 });
    mockFindFirstWorkspace.mockResolvedValue({ id: 'ws-1' });
    mockFindFirstBaleybot.mockResolvedValue(null);

    const req = createRequest({
      body: { data: 'test' },
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    const response = await POST(req, createParams('ws-1', 'nonexistent-bb'));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('BaleyBot not found');
  });

  // --------------------------------------------------------------------------
  // Webhook state checks
  // --------------------------------------------------------------------------

  it('returns 403 when webhook not enabled', async () => {
    mockCheckApiRateLimit.mockResolvedValue({ limited: false, remaining: 59, resetAt: Date.now() + 60000 });
    mockFindFirstWorkspace.mockResolvedValue({ id: 'ws-1' });
    mockFindFirstBaleybot.mockResolvedValue({
      ...DEFAULT_BALEYBOT,
      webhookEnabled: false,
    });

    const req = createRequest({
      body: { data: 'test' },
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('Webhook not enabled');
  });

  it('returns 400 when baleybot not active', async () => {
    mockCheckApiRateLimit.mockResolvedValue({ limited: false, remaining: 59, resetAt: Date.now() + 60000 });
    mockFindFirstWorkspace.mockResolvedValue({ id: 'ws-1' });
    mockFindFirstBaleybot.mockResolvedValue({
      ...DEFAULT_BALEYBOT,
      status: 'draft',
    });

    const req = createRequest({
      body: { data: 'test' },
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('not active');
  });

  // --------------------------------------------------------------------------
  // Rate limiting
  // --------------------------------------------------------------------------

  it('returns 429 when rate limited', async () => {
    mockCheckApiRateLimit.mockResolvedValue({
      limited: true,
      remaining: 0,
      resetAt: Date.now() + 60000,
      retryAfter: 60,
    });

    const req = createRequest({
      body: { data: 'test' },
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain('Rate limit exceeded');
  });

  // --------------------------------------------------------------------------
  // Idempotency
  // --------------------------------------------------------------------------

  it('idempotency: same X-Idempotency-Key returns deduplicated response', async () => {
    setupValidWebhook();
    // Simulate an existing execution with same idempotency key
    mockFindFirstExecution.mockResolvedValue({
      id: 'existing-exec-1',
      status: 'completed',
      output: { result: 'done' },
    });

    const req = createRequest({
      body: { data: 'test' },
      headers: {
        'x-webhook-secret': 'secret-123',
        'x-idempotency-key': 'idem-key-1',
      },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deduplicated).toBe(true);
    expect(body.executionId).toBe('existing-exec-1');
  });

  it('idempotency: same X-Webhook-Delivery-Id returns deduplicated response', async () => {
    setupValidWebhook();
    mockFindFirstExecution.mockResolvedValue({
      id: 'existing-exec-2',
      status: 'completed',
      output: { result: 'done' },
    });

    const req = createRequest({
      body: { data: 'test' },
      headers: {
        'x-webhook-secret': 'secret-123',
        'x-webhook-delivery-id': 'delivery-id-1',
      },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deduplicated).toBe(true);
    expect(body.executionId).toBe('existing-exec-2');
  });

  // --------------------------------------------------------------------------
  // Successful execution
  // --------------------------------------------------------------------------

  it('successful execution returns 200 with executionId', async () => {
    setupValidWebhook();

    const req = createRequest({
      body: { data: 'test' },
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    const response = await POST(req, createParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.executionId).toBe('exec-1');
  });

  // --------------------------------------------------------------------------
  // Body parsing
  // --------------------------------------------------------------------------

  it('JSON body is passed as input', async () => {
    setupValidWebhook();

    const payload = { event: 'user.created', userId: 'u-1' };
    const req = createRequest({
      body: payload,
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    await POST(req, createParams());

    // executeBALCode should be called with JSON.stringify of the body as input
    expect(mockExecuteBALCode).toHaveBeenCalledWith(
      DEFAULT_BALEYBOT.balCode,
      expect.objectContaining({
        input: JSON.stringify(payload),
      })
    );
  });

  it('text body is passed as input', async () => {
    setupValidWebhook();

    const textPayload = 'plain text webhook payload';
    const req = createRequest({
      body: textPayload,
      contentType: 'text/plain',
      headers: { 'x-webhook-secret': 'secret-123' },
    });
    await POST(req, createParams());

    // executeBALCode should be called with the text body wrapped in JSON.stringify
    expect(mockExecuteBALCode).toHaveBeenCalledWith(
      DEFAULT_BALEYBOT.balCode,
      expect.objectContaining({
        input: JSON.stringify(textPayload),
      })
    );
  });
});
