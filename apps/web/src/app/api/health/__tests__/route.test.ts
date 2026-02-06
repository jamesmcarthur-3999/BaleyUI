import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();

vi.mock('@baleyui/db', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => strings.join(''),
    { raw: (s: string) => s }
  ),
}));

import { GET } from '../route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with healthy status when DB is up', async () => {
    mockExecute.mockResolvedValue([{ '1': 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
  });

  it('returns 503 with degraded status when DB is down', async () => {
    mockExecute.mockRejectedValue(new Error('Connection refused'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
  });

  it('response includes timestamp', async () => {
    mockExecute.mockResolvedValue([{ '1': 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('response includes checks object with database key', async () => {
    mockExecute.mockResolvedValue([{ '1': 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(body.checks).toBeDefined();
    expect(body.checks).toHaveProperty('database');
  });

  it('checks.database is ok when DB is up', async () => {
    mockExecute.mockResolvedValue([{ '1': 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(body.checks.database).toBe('ok');
  });

  it('checks.database is fail when DB is down', async () => {
    mockExecute.mockRejectedValue(new Error('Connection refused'));

    const response = await GET();
    const body = await response.json();

    expect(body.checks.database).toBe('fail');
  });

  it('response includes version field', async () => {
    mockExecute.mockResolvedValue([{ '1': 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty('version');
    expect(typeof body.version).toBe('string');
  });

  it('database check calls db.execute', async () => {
    mockExecute.mockResolvedValue([{ '1': 1 }]);

    await GET();

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
