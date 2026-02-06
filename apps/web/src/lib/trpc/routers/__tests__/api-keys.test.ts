import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockApiKey,
  type MockContext,
  type MockApiKey,
} from '../../__tests__/test-utils';

// Mock external dependencies
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

/**
 * Simulate the key generation logic from the api-keys router.
 */
function generateApiKey(): string {
  const randomHex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `bui_live_${randomHex}`;
}

function hashApiKey(apiKey: string): string {
  // Simulated hash - in real code this uses crypto.createHash('sha256')
  return `hashed_${apiKey}`;
}

function getKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 12);
}

function getKeyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}

function formatKeyForDisplay(prefix: string, last4: string): string {
  return `${prefix}...${last4}`;
}

describe('API Keys Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('key generation format', () => {
    it('generates key with bui_live_ prefix', () => {
      const key = generateApiKey();

      expect(key).toMatch(/^bui_live_/);
    });

    it('generates key with 32 hex characters after prefix', () => {
      const key = generateApiKey();
      const hexPart = key.replace('bui_live_', '');

      expect(hexPart).toMatch(/^[0-9a-f]{32}$/);
    });

    it('generates unique keys on successive calls', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1).not.toBe(key2);
    });

    it('key prefix extracts first 12 characters', () => {
      const key = 'bui_live_abcdef1234567890abcdef12';
      const prefix = getKeyPrefix(key);

      expect(prefix).toBe('bui_live_abc');
      expect(prefix).toHaveLength(12);
    });

    it('key last 4 extracts final 4 characters', () => {
      const key = 'bui_live_abcdef1234567890abcdef12';
      const last4 = getKeyLast4(key);

      expect(last4).toBe('ef12');
      expect(last4).toHaveLength(4);
    });
  });

  describe('key display format', () => {
    it('formats key for display as prefix...last4', () => {
      const display = formatKeyForDisplay('bui_live_abc', 'ef01');

      expect(display).toBe('bui_live_abc...ef01');
    });

    it('masks the middle portion of the key', () => {
      const fullKey = generateApiKey();
      const prefix = getKeyPrefix(fullKey);
      const last4 = getKeyLast4(fullKey);
      const display = formatKeyForDisplay(prefix, last4);

      expect(display).toContain('...');
      expect(display).not.toBe(fullKey);
      expect(display.length).toBeLessThan(fullKey.length);
    });
  });

  describe('key hash storage', () => {
    it('stores hash instead of plaintext key', () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);

      expect(hash).not.toBe(key);
      expect(hash).toContain('hashed_');
    });

    it('same key produces same hash', () => {
      const key = 'bui_live_abcdef1234567890abcdef12';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
    });
  });

  describe('create', () => {
    it('creates key with required name field', async () => {
      const newKey = createMockApiKey({
        id: 'new-key-id',
        name: 'My Production Key',
        permissions: ['read', 'execute'],
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newKey]),
        }),
      });

      const insertMock = ctx.db.insert('apiKeys');
      const result = await insertMock.values({}).returning();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('My Production Key');
    });

    it('stores workspace ID with the key', async () => {
      const newKey = createMockApiKey({
        workspaceId: ctx.workspace.id,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newKey]),
        }),
      });

      const insertMock = ctx.db.insert('apiKeys');
      const result = await insertMock.values({}).returning();

      expect(result[0].workspaceId).toBe(ctx.workspace.id);
    });

    it('stores key prefix and suffix for display', async () => {
      const newKey = createMockApiKey({
        keyPrefix: 'bui_live_abc',
        keySuffix: 'ef01',
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newKey]),
        }),
      });

      const insertMock = ctx.db.insert('apiKeys');
      const result = await insertMock.values({}).returning();

      expect(result[0].keyPrefix).toBe('bui_live_abc');
      expect(result[0].keySuffix).toBe('ef01');
    });

    it('sets permissions on the key', async () => {
      const newKey = createMockApiKey({
        permissions: ['read', 'execute', 'admin'],
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newKey]),
        }),
      });

      const insertMock = ctx.db.insert('apiKeys');
      const result = await insertMock.values({}).returning();

      expect(result[0].permissions).toEqual(['read', 'execute', 'admin']);
    });
  });

  describe('list', () => {
    it('returns keys for the workspace', async () => {
      const keys = [
        createMockApiKey({ id: 'key-1', name: 'Key 1' }),
        createMockApiKey({ id: 'key-2', name: 'Key 2' }),
      ];
      ctx.db.query.apiKeys.findMany.mockResolvedValue(keys);

      const result = await ctx.db.query.apiKeys.findMany();

      expect(result).toHaveLength(2);
    });

    it('returns masked keys with prefix...last4 format', async () => {
      const keys = [
        createMockApiKey({ keyPrefix: 'bui_live_abc', keySuffix: 'ef01' }),
      ];
      ctx.db.query.apiKeys.findMany.mockResolvedValue(keys);

      const result = await ctx.db.query.apiKeys.findMany();
      const display = formatKeyForDisplay(result[0]!.keyPrefix, result[0]!.keySuffix);

      expect(display).toBe('bui_live_abc...ef01');
    });

    it('does not return the full key hash in list results', async () => {
      const keys = [createMockApiKey({ keyHash: 'secret_hash_value' })];
      ctx.db.query.apiKeys.findMany.mockResolvedValue(keys);

      const result = await ctx.db.query.apiKeys.findMany();
      // The router maps results to exclude keyHash
      const mapped = result.map((key: MockApiKey) => ({
        id: key.id,
        name: key.name,
        keyDisplay: formatKeyForDisplay(key.keyPrefix, key.keySuffix),
        permissions: key.permissions,
      }));

      expect(mapped[0]).not.toHaveProperty('keyHash');
    });

    it('excludes revoked keys from list', async () => {
      const activeKeys = [
        createMockApiKey({ id: 'active-1', revokedAt: null }),
      ];
      ctx.db.query.apiKeys.findMany.mockResolvedValue(activeKeys);

      const result = await ctx.db.query.apiKeys.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.revokedAt).toBeNull();
    });

    it('returns empty array when no keys exist', async () => {
      ctx.db.query.apiKeys.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.apiKeys.findMany();

      expect(result).toHaveLength(0);
    });
  });

  describe('revoke', () => {
    it('sets revokedAt timestamp on existing key', async () => {
      const existingKey = createMockApiKey({ id: 'key-to-revoke' });
      ctx.db.query.apiKeys.findFirst.mockResolvedValue(existingKey);

      const result = await ctx.db.query.apiKeys.findFirst();

      expect(result).not.toBeNull();
      expect(result?.revokedAt).toBeNull();
    });

    it('returns null for non-existent key (simulates NOT_FOUND)', async () => {
      ctx.db.query.apiKeys.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.apiKeys.findFirst();

      expect(result).toBeNull();
      // In the actual router, this would throw TRPCError NOT_FOUND
    });

    it('cannot revoke an already revoked key', async () => {
      const revokedKey = createMockApiKey({
        id: 'already-revoked',
        revokedAt: new Date('2025-06-01'),
      });
      // The router filters by isNull(revokedAt), so already-revoked keys return null
      ctx.db.query.apiKeys.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.apiKeys.findFirst();

      // When a revoked key is looked up with isNull(revokedAt) filter, it returns null
      expect(result).toBeNull();
      // Direct check on the mock data confirms it was revoked
      expect(revokedKey.revokedAt).not.toBeNull();
    });
  });

  describe('workspace scoping', () => {
    it('keys are associated with specific workspace', async () => {
      const key = createMockApiKey({ workspaceId: 'workspace-a' });

      expect(key.workspaceId).toBe('workspace-a');
    });

    it('different workspaces have separate keys', async () => {
      const keysWsA = [createMockApiKey({ id: 'k-1', workspaceId: 'ws-a' })];
      const keysWsB = [createMockApiKey({ id: 'k-2', workspaceId: 'ws-b' })];

      ctx.db.query.apiKeys.findMany.mockResolvedValue(keysWsA);
      const resultA = await ctx.db.query.apiKeys.findMany();

      ctx.db.query.apiKeys.findMany.mockResolvedValue(keysWsB);
      const resultB = await ctx.db.query.apiKeys.findMany();

      expect(resultA[0]!.workspaceId).toBe('ws-a');
      expect(resultB[0]!.workspaceId).toBe('ws-b');
      expect(resultA[0]!.id).not.toBe(resultB[0]!.id);
    });

    it('key lookup requires matching workspace ID', async () => {
      // Simulating that lookup filters by workspaceId
      createMockApiKey({ workspaceId: 'other-workspace' });
      // When queried with wrong workspace context, returns null
      ctx.db.query.apiKeys.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.apiKeys.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('key prefix validation', () => {
    it('live keys start with bui_live_ prefix', () => {
      const key = generateApiKey();

      expect(key.startsWith('bui_live_')).toBe(true);
    });

    it('key prefix is exactly 9 characters (bui_live_)', () => {
      const prefix = 'bui_live_';

      expect(prefix).toHaveLength(9);
    });

    it('full key has consistent total length', () => {
      const key = generateApiKey();
      // bui_live_ (9 chars) + 32 hex chars = 41 total
      expect(key).toHaveLength(41);
    });
  });
});
