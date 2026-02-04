import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  seedInternalBaleybots,
  getInternalBaleybot,
  INTERNAL_BALEYBOTS,
} from '../internal-baleybots';

// Mock external dependencies for integration test
vi.mock('@baleyui/db', () => {
  const mockBaleybots: Map<string, { id: string; name: string; balCode: string; isInternal: boolean }> = new Map();

  return {
    db: {
      query: {
        baleybots: {
          findFirst: vi.fn().mockImplementation(({ where }) => {
            // Return null to simulate "not found" - will trigger creation
            return Promise.resolve(null);
          }),
          findMany: vi.fn().mockImplementation(() => {
            return Promise.resolve(Array.from(mockBaleybots.values()));
          }),
        },
        workspaces: {
          findFirst: vi.fn().mockResolvedValue({ id: 'system-ws-id', slug: '__system__' }),
        },
      },
      insert: vi.fn().mockImplementation((table) => ({
        values: vi.fn().mockImplementation((values) => ({
          returning: vi.fn().mockImplementation(() => {
            // Simulate successful insertion
            const id = `bb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const created = { id, ...values, isInternal: true };
            mockBaleybots.set(values.name, created);
            return Promise.resolve([created]);
          }),
        })),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    },
    baleybots: { isInternal: {} },
    baleybotExecutions: {},
    workspaces: {},
    eq: vi.fn().mockReturnValue(true),
    and: vi.fn(),
    notDeleted: vi.fn(),
  };
});

// Mock system workspace
vi.mock('@/lib/system-workspace', () => ({
  getOrCreateSystemWorkspace: vi.fn().mockResolvedValue('system-ws-id'),
  clearSystemWorkspaceCache: vi.fn(),
}));

// Mock executor
vi.mock('../executor', () => ({
  executeBaleybot: vi.fn().mockResolvedValue({
    status: 'completed',
    output: { result: 'test' },
    error: null,
    segments: [],
  }),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('internal-baleybots integration', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  describe('INTERNAL_BALEYBOTS definitions', () => {
    const expectedBots = [
      'creator_bot',
      'bal_generator',
      'pattern_learner',
      'execution_reviewer',
      'nl_to_sql_postgres',
      'nl_to_sql_mysql',
      'web_search_fallback',
    ];

    it('defines all 7 internal bots', () => {
      expect(Object.keys(INTERNAL_BALEYBOTS).length).toBe(7);
      for (const name of expectedBots) {
        expect(INTERNAL_BALEYBOTS[name]).toBeDefined();
      }
    });

    it('each bot has required properties', () => {
      for (const [name, def] of Object.entries(INTERNAL_BALEYBOTS)) {
        expect(def.name).toBe(name);
        expect(typeof def.description).toBe('string');
        expect(typeof def.icon).toBe('string');
        expect(typeof def.balCode).toBe('string');
        expect(def.balCode).toContain(name); // BAL code contains entity name
      }
    });

    it('creator_bot has proper BAL structure', () => {
      const def = INTERNAL_BALEYBOTS.creator_bot;
      expect(def.balCode).toContain('"goal"');
      expect(def.balCode).toContain('"model"');
      expect(def.balCode).toContain('"output"');
    });

    it('SQL bots are configured for different databases', () => {
      expect(INTERNAL_BALEYBOTS.nl_to_sql_postgres.balCode).toContain('PostgreSQL');
      expect(INTERNAL_BALEYBOTS.nl_to_sql_mysql.balCode).toContain('MySQL');
    });
  });

  describe('seedInternalBaleybots', () => {
    it('can seed all internal BaleyBots', async () => {
      // Should not throw
      await expect(seedInternalBaleybots()).resolves.not.toThrow();
    });
  });

  describe('getInternalBaleybot', () => {
    it('returns bot definition for known bots', async () => {
      const bot = await getInternalBaleybot('creator_bot');
      expect(bot).not.toBeNull();
      expect(bot?.name).toBe('creator_bot');
    });

    it('returns null for unknown bots', async () => {
      const bot = await getInternalBaleybot('nonexistent_bot');
      expect(bot).toBeNull();
    });
  });
});
