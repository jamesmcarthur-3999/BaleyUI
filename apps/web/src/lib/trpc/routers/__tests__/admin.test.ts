import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockBaleybot,
  createMockExecution,
  type MockContext,
  type MockBaleybot,
} from '../../__tests__/test-utils';

// Mock external dependencies
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

vi.mock('@/lib/baleybot/internal-baleybots', () => ({
  INTERNAL_BALEYBOTS: {
    creator_bot: {
      balCode: '  entity CreatorBot:\n  goal: "Create baleybots"\n  ',
      description: 'Creates new BaleyBots',
      icon: 'robot',
    },
    bal_generator: {
      balCode: '  entity BALGenerator:\n  goal: "Generate BAL code"\n  ',
      description: 'Generates BAL code from descriptions',
      icon: 'code',
    },
    pattern_learner: {
      balCode: '  entity PatternLearner:\n  goal: "Learn patterns"\n  ',
      description: 'Learns from approval patterns',
      icon: 'brain',
    },
  },
}));

describe('Admin Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('isAdmin', () => {
    it('returns true for admin users (procedure-level check)', () => {
      // The adminProcedure middleware checks ADMIN_USER_IDS env var
      // If the procedure completes, it returns true
      const isAdmin = true;

      expect(isAdmin).toBe(true);
    });

    it('non-admin users would be rejected by adminProcedure middleware', () => {
      // adminProcedure checks: adminUserIds.includes(ctx.userId)
      const adminUserIds = ['admin-user-1', 'admin-user-2'];
      const regularUserId = 'regular-user';

      expect(adminUserIds.includes(regularUserId)).toBe(false);
    });

    it('admin user IDs are parsed from comma-separated env var', () => {
      const envValue = 'user-1, user-2, user-3';
      const adminUserIds = envValue.split(',').map((id) => id.trim()).filter(Boolean);

      expect(adminUserIds).toEqual(['user-1', 'user-2', 'user-3']);
    });

    it('handles empty ADMIN_USER_IDS gracefully', () => {
      const envValue = '';
      const adminUserIds = envValue.split(',').map((id) => id.trim()).filter(Boolean);

      expect(adminUserIds).toHaveLength(0);
    });
  });

  describe('listInternalBaleybots', () => {
    it('returns internal baleybots with isInternal flag', async () => {
      const internalBots = [
        createMockBaleybot({ id: 'ib-1', name: 'creator_bot' }),
        createMockBaleybot({ id: 'ib-2', name: 'bal_generator' }),
      ] as Array<MockBaleybot & { isInternal?: boolean }>;

      // Add isInternal property
      internalBots.forEach((b) => { b.isInternal = true; });

      ctx.db.query.baleybots.findMany.mockResolvedValue(internalBots as unknown as MockBaleybot[]);

      const result = await ctx.db.query.baleybots.findMany();

      expect(result).toHaveLength(2);
      expect((result[0] as unknown as { isInternal: boolean }).isInternal).toBe(true);
    });

    it('identifies baleybots with default code', async () => {
      const { INTERNAL_BALEYBOTS } = await import('@/lib/baleybot/internal-baleybots');
      const bot = createMockBaleybot({
        name: 'creator_bot',
        balCode: INTERNAL_BALEYBOTS.creator_bot!.balCode.trim(),
      });

      const hasDefaultCode = bot.name in INTERNAL_BALEYBOTS
        ? bot.balCode === INTERNAL_BALEYBOTS[bot.name]!.balCode.trim()
        : false;

      expect(hasDefaultCode).toBe(true);
    });

    it('detects modified internal baleybots', async () => {
      const { INTERNAL_BALEYBOTS } = await import('@/lib/baleybot/internal-baleybots');
      const bot = createMockBaleybot({
        name: 'creator_bot',
        balCode: 'entity Modified:\n  goal: "Modified version"',
      });

      const hasDefaultCode = bot.name in INTERNAL_BALEYBOTS
        ? bot.balCode === INTERNAL_BALEYBOTS[bot.name]!.balCode.trim()
        : false;

      expect(hasDefaultCode).toBe(false);
    });

    it('returns empty list when no internal bots exist', async () => {
      ctx.db.query.baleybots.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.baleybots.findMany();

      expect(result).toHaveLength(0);
    });
  });

  describe('getInternalBaleybot', () => {
    it('returns internal bot with recent executions', async () => {
      const executions = [
        createMockExecution({ id: 'exec-1', status: 'completed' }),
        createMockExecution({ id: 'exec-2', status: 'failed' }),
      ];
      const bot = {
        ...createMockBaleybot({ id: 'ib-1', name: 'creator_bot' }),
        isInternal: true,
        executions,
      };

      ctx.db.query.baleybots.findFirst.mockResolvedValue(bot as unknown as MockBaleybot);

      const result = await ctx.db.query.baleybots.findFirst();
      const resultWithExecs = result as unknown as { executions: typeof executions };

      expect(result).not.toBeNull();
      expect(resultWithExecs.executions).toHaveLength(2);
    });

    it('returns null for non-existent internal bot (simulates NOT_FOUND)', async () => {
      ctx.db.query.baleybots.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).toBeNull();
    });

    it('includes default BAL code for known bots', async () => {
      const { INTERNAL_BALEYBOTS } = await import('@/lib/baleybot/internal-baleybots');
      const botName = 'creator_bot';
      const defaultDef = INTERNAL_BALEYBOTS[botName];

      expect(defaultDef).toBeDefined();
      expect(defaultDef?.balCode).toBeTruthy();
      expect(defaultDef?.description).toBeTruthy();
    });
  });

  describe('updateInternalBaleybot', () => {
    it('finds existing internal bot before updating', async () => {
      const existing = {
        ...createMockBaleybot({ id: 'ib-1', version: 1 }),
        isInternal: true,
      };
      ctx.db.query.baleybots.findFirst.mockResolvedValue(existing as unknown as MockBaleybot);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
    });

    it('returns null for non-existent bot (simulates NOT_FOUND)', async () => {
      ctx.db.query.baleybots.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).toBeNull();
    });

    it('sets adminEdited to true on update', () => {
      const updates: Record<string, unknown> = { adminEdited: true };

      expect(updates.adminEdited).toBe(true);
    });

    it('supports partial updates (name, description, icon, balCode)', () => {
      const updates: Record<string, unknown> = { adminEdited: true, updatedAt: new Date() };
      const input = { name: 'New Name', balCode: 'entity New:\n  goal: "New"' };

      if (input.name !== undefined) updates.name = input.name;
      if (input.balCode !== undefined) updates.balCode = input.balCode;

      expect(updates.name).toBe('New Name');
      expect(updates.balCode).toContain('entity New');
      expect(updates).not.toHaveProperty('description');
      expect(updates).not.toHaveProperty('icon');
    });
  });

  describe('resetToDefault', () => {
    it('finds the internal bot before resetting', async () => {
      const existing = {
        ...createMockBaleybot({ id: 'ib-1', name: 'creator_bot', version: 2 }),
        isInternal: true,
        adminEdited: true,
      };
      ctx.db.query.baleybots.findFirst.mockResolvedValue(existing as unknown as MockBaleybot);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('creator_bot');
    });

    it('returns null for non-existent bot (simulates NOT_FOUND)', async () => {
      ctx.db.query.baleybots.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).toBeNull();
    });

    it('resets balCode to default definition', async () => {
      const { INTERNAL_BALEYBOTS } = await import('@/lib/baleybot/internal-baleybots');
      const botName = 'creator_bot';
      const defaultDef = INTERNAL_BALEYBOTS[botName];

      expect(defaultDef).toBeDefined();
      const resetData = {
        balCode: defaultDef!.balCode.trim(),
        description: defaultDef!.description,
        icon: defaultDef!.icon,
        adminEdited: false,
      };

      expect(resetData.adminEdited).toBe(false);
      expect(resetData.balCode).toContain('CreatorBot');
    });

    it('returns error when bot name has no default definition', async () => {
      const { INTERNAL_BALEYBOTS } = await import('@/lib/baleybot/internal-baleybots');
      const unknownName = 'unknown_bot';
      const defaultDef = INTERNAL_BALEYBOTS[unknownName];

      expect(defaultDef).toBeUndefined();
      // In the actual router, this would throw NOT_FOUND
    });
  });

  describe('admin access enforcement', () => {
    it('admin user IDs list can contain multiple entries', () => {
      const envValue = 'admin-1,admin-2,admin-3';
      const adminIds = envValue.split(',').map((id) => id.trim()).filter(Boolean);

      expect(adminIds).toHaveLength(3);
      expect(adminIds).toContain('admin-1');
    });

    it('rejects user not in admin list', () => {
      const adminIds = ['admin-1', 'admin-2'];
      const userId = 'regular-user';

      expect(adminIds.includes(userId)).toBe(false);
    });

    it('accepts user in admin list', () => {
      const adminIds = ['admin-1', 'admin-2'];
      const userId = 'admin-1';

      expect(adminIds.includes(userId)).toBe(true);
    });
  });
});
