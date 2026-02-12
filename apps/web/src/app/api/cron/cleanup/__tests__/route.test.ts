import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const { mockExecuteSQL } = vi.hoisted(() => ({
  mockExecuteSQL: vi.fn(),
}));

// ============================================================================
// Module mocks
// ============================================================================

vi.mock('@baleyui/db', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecuteSQL(...args),
  },
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      append: () => strings.join(''),
    }),
    { raw: (s: string) => s }
  ),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/lib/env', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'CRON_SECRET') return 'test-cron-secret';
    return undefined;
  }),
}));

vi.mock('@/lib/api/error-response', () => ({
  apiErrors: {
    unauthorized: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    internal: (_err: unknown, opts?: { requestId?: string }) =>
      new Response(JSON.stringify({ error: 'Internal error', requestId: opts?.requestId }), { status: 500 }),
  },
  createErrorResponse: (status: number, _err: unknown, opts?: { message?: string }) =>
    new Response(JSON.stringify({ error: opts?.message ?? 'Error' }), { status }),
}));

import { GET } from '../route';

// ============================================================================
// Helpers
// ============================================================================

function createCronRequest(secret?: string): Request {
  const headers = new Headers();
  if (secret) {
    headers.set('authorization', `Bearer ${secret}`);
  }
  return new Request('http://localhost:3000/api/cron/cleanup', {
    headers,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('GET /api/cron/cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await GET(createCronRequest());
    expect(response.status).toBe(401);
  });

  it('rejects requests with wrong secret', async () => {
    const response = await GET(createCronRequest('wrong-secret'));
    expect(response.status).toBe(401);
  });

  it('returns cleanup stats on success', async () => {
    // Each SQL execution returns a count
    mockExecuteSQL.mockResolvedValue({ count: 10 });

    const response = await GET(createCronRequest('test-cron-secret'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.results).toBeDefined();
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles database errors gracefully', async () => {
    mockExecuteSQL.mockRejectedValue(new Error('Connection timeout'));

    const response = await GET(createCronRequest('test-cron-secret'));
    expect(response.status).toBe(500);
  });
});
