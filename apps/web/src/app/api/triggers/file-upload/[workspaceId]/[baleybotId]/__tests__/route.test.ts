import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockFindFirstBaleybot,
  mockFindFirstTrigger,
  mockInsertReturning,
  mockUpdateWhere,
  mockCheckApiRateLimit,
  mockExecuteBaleybot,
  mockLoadExecutionTools,
} = vi.hoisted(() => ({
  mockFindFirstBaleybot: vi.fn(),
  mockFindFirstTrigger: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
  mockExecuteBaleybot: vi.fn(),
  mockLoadExecutionTools: vi.fn(),
}));

vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybots: { findFirst: (...args: unknown[]) => mockFindFirstBaleybot(...args) },
      baleybotTriggers: { findFirst: (...args: unknown[]) => mockFindFirstTrigger(...args) },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: (...args: unknown[]) => mockInsertReturning(...args),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: (...args: unknown[]) => {
          mockUpdateWhere(...args);
          return Promise.resolve();
        },
      })),
    })),
  },
  baleybots: { id: 'id', workspaceId: 'workspaceId', status: 'status' },
  baleybotTriggers: {
    workspaceId: 'workspaceId',
    targetBaleybotId: 'targetBaleybotId',
    enabled: 'enabled',
    staticInput: 'staticInput',
  },
  baleybotExecutions: { id: 'id' },
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

vi.mock('@/lib/baleybot/executor', () => ({
  executeBaleybot: (...args: unknown[]) => mockExecuteBaleybot(...args),
}));

vi.mock('@/lib/baleybot/services/execution-tools-loader', () => ({
  loadExecutionTools: (...args: unknown[]) => mockLoadExecutionTools(...args),
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
      NextResponse.json({ error: opts?.message ?? 'Error', requestId: opts?.requestId }, { status }),
  };
});

import { POST } from '../route';

function createParams(
  workspaceId = 'ws-1',
  baleybotId = 'bb-1'
): { params: Promise<{ workspaceId: string; baleybotId: string }> } {
  return { params: Promise.resolve({ workspaceId, baleybotId }) };
}

function createRequest(formData: FormData, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/triggers/file-upload/ws-1/bb-1', {
    method: 'POST',
    body: formData,
    headers,
  });
}

function baseBaleybot() {
  return {
    id: 'bb-1',
    workspaceId: 'ws-1',
    balCode: 'assistant { "goal": "Process file" }',
    status: 'active',
    name: 'File Bot',
  };
}

describe('POST /api/triggers/file-upload/[workspaceId]/[baleybotId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckApiRateLimit.mockResolvedValue({
      limited: false,
      remaining: 59,
      resetAt: Date.now() + 60000,
    });
    mockFindFirstBaleybot.mockResolvedValue(baseBaleybot());
    mockFindFirstTrigger.mockResolvedValue({
      staticInput: {
        type: 'file_upload',
        acceptedMimeTypes: ['text/plain'],
        maxFileSizeMb: 2,
        multiple: false,
        payloadMode: 'metadata',
      },
    });
    mockInsertReturning.mockResolvedValue([{ id: 'exec-1' }]);
    mockLoadExecutionTools.mockResolvedValue({ runtimeTools: new Map(), toolNames: [] });
    mockExecuteBaleybot.mockResolvedValue({ status: 'completed', output: { ok: true }, error: null });
  });

  it('returns 404 when baleybot is missing', async () => {
    mockFindFirstBaleybot.mockResolvedValue(null);

    const form = new FormData();
    form.append('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    const response = await POST(createRequest(form), createParams());

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('BaleyBot not found');
  });

  it('returns 400 when file_upload trigger is not configured', async () => {
    mockFindFirstTrigger.mockResolvedValue({ staticInput: { type: 'manual' } });

    const form = new FormData();
    form.append('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    const response = await POST(createRequest(form), createParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('not configured');
  });

  it('returns 400 when no files are uploaded', async () => {
    const form = new FormData();
    form.append('notes', 'no files here');

    const response = await POST(createRequest(form), createParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('No files were uploaded');
  });

  it('returns 400 when multiple files are uploaded but trigger is single-file', async () => {
    const form = new FormData();
    form.append('fileA', new File(['a'], 'a.txt', { type: 'text/plain' }));
    form.append('fileB', new File(['b'], 'b.txt', { type: 'text/plain' }));

    const response = await POST(createRequest(form), createParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('single file');
  });

  it('returns 400 when uploaded file type is disallowed', async () => {
    const form = new FormData();
    form.append('file', new File(['{}'], 'payload.json', { type: 'application/json' }));

    const response = await POST(createRequest(form), createParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('not allowed');
  });

  it('executes baleybot and persists completion state on valid upload', async () => {
    const form = new FormData();
    form.append('file', new File(['hello world'], 'hello.txt', { type: 'text/plain' }));
    form.append('topic', 'onboarding');

    const response = await POST(createRequest(form), createParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('completed');
    expect(body.executionId).toBe('exec-1');

    expect(mockLoadExecutionTools).toHaveBeenCalled();
    expect(mockExecuteBaleybot).toHaveBeenCalledTimes(1);

    const call = mockExecuteBaleybot.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(call[0]).toContain('assistant');

    const input = JSON.parse(call[1]);
    expect(input.source).toBe('file_upload');
    expect(input.payloadMode).toBe('metadata');
    expect(input.files).toHaveLength(1);
    expect(input.files[0]).toMatchObject({ name: 'hello.txt', type: 'text/plain' });
    expect(input.fields).toMatchObject({ topic: 'onboarding' });
  });
});
