import { describe, it, expect, vi } from 'vitest';
import {
  getInternalBaleybot,
  INTERNAL_BALEYBOTS,
} from '../internal-baleybots';

// Mock the database
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybots: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 'bb-internal-1', name: 'creator_bot', balCode: 'creator_bot {}' },
        ]),
      }),
    }),
  },
  baleybots: {},
  baleybotExecutions: {},
  eq: vi.fn(),
  and: vi.fn(),
  notDeleted: vi.fn(),
}));

// Mock system workspace
vi.mock('@/lib/system-workspace', () => ({
  getOrCreateSystemWorkspace: vi.fn().mockResolvedValue('system-ws-id'),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('internal-baleybots', () => {
  describe('INTERNAL_BALEYBOTS', () => {
    it('defines creator_bot', () => {
      expect(INTERNAL_BALEYBOTS.creator_bot).toBeDefined();
      expect(INTERNAL_BALEYBOTS.creator_bot.name).toBe('creator_bot');
      expect(INTERNAL_BALEYBOTS.creator_bot.balCode).toContain('creator_bot');
    });

    it('defines all internal bots', () => {
      const expectedBots = [
        'creator_bot',
        'bal_generator',
        'pattern_learner',
        'execution_reviewer',
        'nl_to_sql_postgres',
        'nl_to_sql_mysql',
        'web_search_fallback',
      ];

      for (const name of expectedBots) {
        expect(INTERNAL_BALEYBOTS[name]).toBeDefined();
      }
    });
  });

  describe('getInternalBaleybot', () => {
    it('returns internal bot definition', async () => {
      const bot = await getInternalBaleybot('creator_bot');
      expect(bot).toBeDefined();
      expect(bot?.name).toBe('creator_bot');
    });

    it('returns null for unknown bot', async () => {
      const bot = await getInternalBaleybot('unknown_bot');
      expect(bot).toBeNull();
    });
  });
});
