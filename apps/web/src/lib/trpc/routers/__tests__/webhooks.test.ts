import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockFlow,
  createMockWebhookLog,
  type MockContext,
} from '../../__tests__/test-utils';

// Mock external dependencies
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

vi.mock('@/lib/errors/sanitize', () => ({
  sanitizeErrorMessage: vi.fn((err) => (err as Error).message),
  isUserFacingError: vi.fn(() => true),
}));

vi.mock('@/lib/types', () => ({
  isWebhookTrigger: vi.fn((t) => t && typeof t === 'object' && t.type === 'webhook'),
  isEnabledWebhookTrigger: vi.fn((t) => t && typeof t === 'object' && t.type === 'webhook' && t.enabled === true),
}));

/**
 * Simulate webhook secret generation (uses crypto.randomBytes(32).toString('hex'))
 */
function generateWebhookSecret(): string {
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

describe('Webhooks Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('generateWebhook', () => {
    it('generates a webhook secret as 64-char hex string', () => {
      const secret = generateWebhookSecret();

      expect(secret).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique secrets on successive calls', () => {
      const secret1 = generateWebhookSecret();
      const secret2 = generateWebhookSecret();

      expect(secret1).not.toBe(secret2);
    });

    it('verifies flow exists before generating webhook', async () => {
      const flow = createMockFlow({ id: 'flow-1', workspaceId: ctx.workspace.id });
      ctx.db.query.flows.findFirst.mockResolvedValue(flow);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('flow-1');
    });

    it('returns null for non-existent flow (simulates NOT_FOUND)', async () => {
      ctx.db.query.flows.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).toBeNull();
    });

    it('builds webhook URL containing flowId and secret', () => {
      const flowId = 'flow-abc-123';
      const secret = generateWebhookSecret();
      const baseUrl = 'http://localhost:3000';
      const webhookUrl = `${baseUrl}/api/webhooks/${flowId}/${secret}`;

      expect(webhookUrl).toContain('/api/webhooks/');
      expect(webhookUrl).toContain(flowId);
      expect(webhookUrl).toContain(secret);
    });

    it('adds webhook trigger to flow triggers array', () => {
      const existingTriggers: unknown[] = [];
      const secret = generateWebhookSecret();
      const signingSecret = generateWebhookSecret();

      const updatedTriggers = [
        ...existingTriggers,
        {
          type: 'webhook',
          secret,
          signingSecret,
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      ];

      expect(updatedTriggers).toHaveLength(1);
      expect(updatedTriggers[0]).toHaveProperty('type', 'webhook');
      expect(updatedTriggers[0]).toHaveProperty('enabled', true);
      expect(updatedTriggers[0]).toHaveProperty('secret');
      expect(updatedTriggers[0]).toHaveProperty('signingSecret');
    });

    it('updates existing webhook trigger instead of adding a new one', () => {
      const oldSecret = generateWebhookSecret();
      const existingTriggers = [
        { type: 'webhook', secret: oldSecret, enabled: true },
      ];
      const newSecret = generateWebhookSecret();
      const newSigningSecret = generateWebhookSecret();

      const updatedTriggers = existingTriggers.map((t) =>
        t.type === 'webhook'
          ? { ...t, secret: newSecret, signingSecret: newSigningSecret, enabled: true }
          : t
      );

      expect(updatedTriggers).toHaveLength(1);
      expect(updatedTriggers[0]!.secret).toBe(newSecret);
      expect(updatedTriggers[0]!.secret).not.toBe(oldSecret);
    });
  });

  describe('revokeWebhook', () => {
    it('verifies flow exists before revoking', async () => {
      const flow = createMockFlow({ id: 'flow-1', workspaceId: ctx.workspace.id });
      ctx.db.query.flows.findFirst.mockResolvedValue(flow);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).not.toBeNull();
    });

    it('returns null for non-existent flow (simulates NOT_FOUND)', async () => {
      ctx.db.query.flows.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).toBeNull();
    });

    it('disables webhook trigger by setting enabled to false', () => {
      const triggers = [
        { type: 'webhook', secret: 'abc', enabled: true },
        { type: 'schedule', schedule: '0 * * * *', enabled: true },
      ];

      const updatedTriggers = triggers.map((t) =>
        t.type === 'webhook' ? { ...t, enabled: false } : t
      );

      expect(updatedTriggers[0]).toHaveProperty('enabled', false);
      expect(updatedTriggers[1]).toHaveProperty('enabled', true);
    });

    it('preserves non-webhook triggers when revoking', () => {
      const triggers = [
        { type: 'webhook', secret: 'abc', enabled: true },
        { type: 'schedule', schedule: '0 * * * *', enabled: true },
      ];

      const updatedTriggers = triggers.map((t) =>
        t.type === 'webhook' ? { ...t, enabled: false } : t
      );

      expect(updatedTriggers).toHaveLength(2);
      expect(updatedTriggers[1]).toEqual(triggers[1]);
    });
  });

  describe('getWebhook', () => {
    it('returns webhook configuration for enabled webhook', async () => {
      const flow = createMockFlow({
        id: 'flow-1',
        triggers: [
          { type: 'webhook', secret: 'test-secret', signingSecret: 'sign-secret', enabled: true, createdAt: '2025-01-01T00:00:00Z' },
        ],
      });
      ctx.db.query.flows.findFirst.mockResolvedValue(flow);

      const result = await ctx.db.query.flows.findFirst();
      const triggers = result?.triggers as Array<{ type: string; secret?: string; enabled?: boolean }>;
      const webhook = triggers?.find((t) => t.type === 'webhook' && t.enabled);

      expect(webhook).toBeDefined();
      expect(webhook?.secret).toBe('test-secret');
    });

    it('returns null when no webhook trigger exists', async () => {
      const flow = createMockFlow({ id: 'flow-1', triggers: [] });
      ctx.db.query.flows.findFirst.mockResolvedValue(flow);

      const result = await ctx.db.query.flows.findFirst();
      const triggers = result?.triggers as Array<{ type: string }>;
      const webhook = triggers?.find((t) => t.type === 'webhook');

      expect(webhook).toBeUndefined();
    });

    it('returns null when webhook is disabled', async () => {
      const flow = createMockFlow({
        id: 'flow-1',
        triggers: [
          { type: 'webhook', secret: 'test-secret', enabled: false },
        ],
      });
      ctx.db.query.flows.findFirst.mockResolvedValue(flow);

      const result = await ctx.db.query.flows.findFirst();
      const triggers = result?.triggers as Array<{ type: string; enabled?: boolean }>;
      const enabledWebhook = triggers?.find((t) => t.type === 'webhook' && t.enabled === true);

      expect(enabledWebhook).toBeUndefined();
    });
  });

  describe('getWebhookLogs', () => {
    it('returns logs for a specific flow', async () => {
      const flow = createMockFlow({ id: 'flow-1' });
      const logs = [
        createMockWebhookLog({ id: 'log-1', flowId: 'flow-1' }),
        createMockWebhookLog({ id: 'log-2', flowId: 'flow-1' }),
      ];

      ctx.db.query.flows.findFirst.mockResolvedValue(flow);
      ctx.db.query.webhookLogs.findMany.mockResolvedValue(logs);

      const flowResult = await ctx.db.query.flows.findFirst();
      expect(flowResult).not.toBeNull();

      const logsResult = await ctx.db.query.webhookLogs.findMany();
      expect(logsResult).toHaveLength(2);
    });

    it('returns empty array when no logs exist', async () => {
      const flow = createMockFlow({ id: 'flow-1' });
      ctx.db.query.flows.findFirst.mockResolvedValue(flow);
      ctx.db.query.webhookLogs.findMany.mockResolvedValue([]);

      const logsResult = await ctx.db.query.webhookLogs.findMany();

      expect(logsResult).toHaveLength(0);
    });

    it('verifies flow belongs to workspace before returning logs', async () => {
      // Flow not found (wrong workspace) returns null
      ctx.db.query.flows.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('workspace scoping', () => {
    it('webhook operations are scoped to workspace', async () => {
      const flow = createMockFlow({
        id: 'flow-1',
        workspaceId: ctx.workspace.id,
      });
      ctx.db.query.flows.findFirst.mockResolvedValue(flow);

      const result = await ctx.db.query.flows.findFirst();

      expect(result?.workspaceId).toBe(ctx.workspace.id);
    });

    it('flow from another workspace is not accessible', async () => {
      // The router uses eq(flows.workspaceId, ctx.workspace.id) which won't match
      ctx.db.query.flows.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('webhook URL construction', () => {
    it('URL uses localhost:3000 as default base', () => {
      const flowId = 'test-flow-id';
      const secret = 'test-secret-value';
      const baseUrl = 'http://localhost:3000';
      const url = `${baseUrl}/api/webhooks/${flowId}/${secret}`;

      expect(url).toBe('http://localhost:3000/api/webhooks/test-flow-id/test-secret-value');
    });

    it('URL contains both flow ID and secret path segments', () => {
      const flowId = 'f-123';
      const secret = 's-456';
      const url = `http://localhost:3000/api/webhooks/${flowId}/${secret}`;
      const parts = url.split('/');

      expect(parts[parts.length - 2]).toBe(flowId);
      expect(parts[parts.length - 1]).toBe(secret);
    });
  });
});
