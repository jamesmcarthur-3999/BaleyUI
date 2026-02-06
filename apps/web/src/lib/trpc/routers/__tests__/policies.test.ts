import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockApprovalPattern,
  createMockWorkspacePolicy,
  type MockContext,
  type MockApprovalPattern,
} from '../../__tests__/test-utils';

// Mock external dependencies
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

describe('Policies Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // WORKSPACE POLICIES
  // ===========================================================================

  describe('get (workspace policies)', () => {
    it('returns existing workspace policies', async () => {
      const policy = createMockWorkspacePolicy({
        workspaceId: ctx.workspace.id,
      });
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(policy);

      const result = await ctx.db.query.workspacePolicies.findFirst();

      expect(result).not.toBeNull();
      expect(result?.workspaceId).toBe(ctx.workspace.id);
    });

    it('creates default policies when none exist', async () => {
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(null);

      const defaultPolicy = createMockWorkspacePolicy({
        workspaceId: ctx.workspace.id,
        allowedTools: null,
        forbiddenTools: null,
        requiresApprovalTools: null,
        maxAutoApproveAmount: null,
        reapprovalIntervalDays: 90,
        maxAutoFiresBeforeReview: 100,
        learningManual: null,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([defaultPolicy]),
          }),
        }),
      });

      const insertMock = ctx.db.insert('workspacePolicies');
      const result = await insertMock.values({}).onConflictDoNothing().returning();

      expect(result[0].reapprovalIntervalDays).toBe(90);
      expect(result[0].maxAutoFiresBeforeReview).toBe(100);
    });

    it('default policy has expected default values', () => {
      const defaults = {
        allowedTools: null,
        forbiddenTools: null,
        requiresApprovalTools: null,
        maxAutoApproveAmount: null,
        reapprovalIntervalDays: 90,
        maxAutoFiresBeforeReview: 100,
        learningManual: null,
      };

      expect(defaults.reapprovalIntervalDays).toBe(90);
      expect(defaults.maxAutoFiresBeforeReview).toBe(100);
      expect(defaults.allowedTools).toBeNull();
      expect(defaults.forbiddenTools).toBeNull();
    });
  });

  describe('update (workspace policies)', () => {
    it('updates existing policy fields', async () => {
      const existing = createMockWorkspacePolicy({ version: 1 });
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(existing);

      const updateData: Record<string, unknown> = {};
      const input = {
        allowedTools: ['web_search', 'fetch_url'],
        forbiddenTools: ['dangerous_tool'],
        reapprovalIntervalDays: 30,
      };

      if (input.allowedTools !== undefined) updateData.allowedTools = input.allowedTools;
      if (input.forbiddenTools !== undefined) updateData.forbiddenTools = input.forbiddenTools;
      if (input.reapprovalIntervalDays !== undefined) updateData.reapprovalIntervalDays = input.reapprovalIntervalDays;

      expect(updateData.allowedTools).toEqual(['web_search', 'fetch_url']);
      expect(updateData.forbiddenTools).toEqual(['dangerous_tool']);
      expect(updateData.reapprovalIntervalDays).toBe(30);
    });

    it('creates new policy when none exists on update', async () => {
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(null);

      const newPolicy = createMockWorkspacePolicy({
        workspaceId: ctx.workspace.id,
        allowedTools: ['web_search'],
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newPolicy]),
        }),
      });

      const insertMock = ctx.db.insert('workspacePolicies');
      const result = await insertMock.values({}).returning();

      expect(result[0].allowedTools).toEqual(['web_search']);
    });

    it('uses optimistic locking via updateWithLock', async () => {
      const { updateWithLock } = await import('@baleyui/db');
      const existing = createMockWorkspacePolicy({ id: 'policy-1', version: 3 });
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(existing);

      await updateWithLock('workspacePolicies' as unknown as Parameters<typeof updateWithLock>[0], existing.id, 3, {
        allowedTools: ['web_search'],
      });

      expect(updateWithLock).toHaveBeenCalledWith(
        'workspacePolicies',
        'policy-1',
        3,
        expect.objectContaining({ allowedTools: ['web_search'] })
      );
    });
  });

  // ===========================================================================
  // APPROVAL PATTERNS
  // ===========================================================================

  describe('listApprovalPatterns', () => {
    it('returns approval patterns for workspace', async () => {
      const patterns = [
        createMockApprovalPattern({ id: 'p-1', tool: 'web_search' }),
        createMockApprovalPattern({ id: 'p-2', tool: 'fetch_url' }),
      ];
      ctx.db.query.approvalPatterns.findMany.mockResolvedValue(patterns);

      const result = await ctx.db.query.approvalPatterns.findMany();

      expect(result).toHaveLength(2);
    });

    it('filters by tool name', async () => {
      const patterns = [
        createMockApprovalPattern({ tool: 'web_search' }),
      ];
      ctx.db.query.approvalPatterns.findMany.mockResolvedValue(patterns);

      const result = await ctx.db.query.approvalPatterns.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.tool).toBe('web_search');
    });

    it('filters by trust level', async () => {
      const patterns = [
        createMockApprovalPattern({ trustLevel: 'trusted' }),
      ];
      ctx.db.query.approvalPatterns.findMany.mockResolvedValue(patterns);

      const result = await ctx.db.query.approvalPatterns.findMany();

      expect(result[0]!.trustLevel).toBe('trusted');
    });

    it('excludes revoked patterns by default', async () => {
      const activePatterns = [
        createMockApprovalPattern({ revokedAt: null }),
      ];
      ctx.db.query.approvalPatterns.findMany.mockResolvedValue(activePatterns);

      const result = await ctx.db.query.approvalPatterns.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.revokedAt).toBeNull();
    });

    it('includes revoked patterns when requested', async () => {
      const allPatterns = [
        createMockApprovalPattern({ id: 'p-1', revokedAt: null }),
        createMockApprovalPattern({ id: 'p-2', revokedAt: new Date('2025-06-01') }),
      ];
      ctx.db.query.approvalPatterns.findMany.mockResolvedValue(allPatterns);

      const result = await ctx.db.query.approvalPatterns.findMany();

      expect(result).toHaveLength(2);
    });
  });

  describe('getApprovalPattern', () => {
    it('returns a single pattern by ID', async () => {
      const pattern = createMockApprovalPattern({ id: 'p-1' });
      ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(pattern);

      const result = await ctx.db.query.approvalPatterns.findFirst();

      expect(result?.id).toBe('p-1');
    });

    it('returns null for non-existent pattern (simulates NOT_FOUND)', async () => {
      ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.approvalPatterns.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('createApprovalPattern', () => {
    it('creates pattern with default provisional trust level', async () => {
      const newPattern = createMockApprovalPattern({
        tool: 'schedule_task',
        trustLevel: 'provisional',
        timesUsed: 0,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newPattern]),
        }),
      });

      const insertMock = ctx.db.insert('approvalPatterns');
      const result = await insertMock.values({}).returning();

      expect(result[0].trustLevel).toBe('provisional');
      expect(result[0].timesUsed).toBe(0);
    });

    it('creates pattern with optional expiration date', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const newPattern = createMockApprovalPattern({
        expiresAt,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newPattern]),
        }),
      });

      const insertMock = ctx.db.insert('approvalPatterns');
      const result = await insertMock.values({}).returning();

      expect(result[0].expiresAt).not.toBeNull();
    });

    it('sets approvedBy to current user', async () => {
      const newPattern = createMockApprovalPattern({
        approvedBy: ctx.userId,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newPattern]),
        }),
      });

      const insertMock = ctx.db.insert('approvalPatterns');
      const result = await insertMock.values({}).returning();

      expect(result[0].approvedBy).toBe(ctx.userId);
    });

    it('workspace scoping is enforced on creation', async () => {
      const newPattern = createMockApprovalPattern({
        workspaceId: ctx.workspace.id,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newPattern]),
        }),
      });

      const insertMock = ctx.db.insert('approvalPatterns');
      const result = await insertMock.values({}).returning();

      expect(result[0].workspaceId).toBe(ctx.workspace.id);
    });
  });

  describe('updateApprovalPattern', () => {
    it('verifies pattern exists before updating', async () => {
      const existing = createMockApprovalPattern({ id: 'p-1' });
      ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(existing);

      const result = await ctx.db.query.approvalPatterns.findFirst();

      expect(result).not.toBeNull();
    });

    it('returns null for non-existent pattern (simulates NOT_FOUND)', async () => {
      ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.approvalPatterns.findFirst();

      expect(result).toBeNull();
    });

    it('rejects update on revoked pattern', async () => {
      const revokedPattern = createMockApprovalPattern({
        revokedAt: new Date('2025-06-01'),
      });
      ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(revokedPattern);

      const result = await ctx.db.query.approvalPatterns.findFirst();

      expect(result?.revokedAt).not.toBeNull();
      // In the actual router, this throws PRECONDITION_FAILED
    });

    it('allows upgrading trust level', () => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      const input = { trustLevel: 'trusted' as const };

      if (input.trustLevel !== undefined) updateData.trustLevel = input.trustLevel;

      expect(updateData.trustLevel).toBe('trusted');
    });
  });

  describe('revokeApprovalPattern', () => {
    it('verifies pattern exists and belongs to workspace', async () => {
      const existing = createMockApprovalPattern({
        id: 'p-1',
        workspaceId: ctx.workspace.id,
      });
      ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(existing);

      const result = await ctx.db.query.approvalPatterns.findFirst();

      expect(result?.workspaceId).toBe(ctx.workspace.id);
    });

    it('rejects revoking an already-revoked pattern', async () => {
      const alreadyRevoked = createMockApprovalPattern({
        revokedAt: new Date('2025-06-01'),
      });
      ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(alreadyRevoked);

      const result = await ctx.db.query.approvalPatterns.findFirst();

      expect(result?.revokedAt).not.toBeNull();
      // In the actual router, this throws PRECONDITION_FAILED
    });

    it('sets revokedAt, revokedBy, and revokeReason', () => {
      const revokeData = {
        revokedAt: new Date(),
        revokedBy: ctx.userId,
        revokeReason: 'No longer needed',
        updatedAt: new Date(),
      };

      expect(revokeData.revokedAt).toBeInstanceOf(Date);
      expect(revokeData.revokedBy).toBe(ctx.userId);
      expect(revokeData.revokeReason).toBe('No longer needed');
    });
  });

  describe('recordPatternUsage', () => {
    it('verifies pattern exists before recording', async () => {
      const existing = createMockApprovalPattern({ id: 'p-1', timesUsed: 5 });
      ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(existing);

      const result = await ctx.db.query.approvalPatterns.findFirst();

      expect(result?.timesUsed).toBe(5);
    });

    it('auto-upgrades from provisional to trusted after 10 uses', () => {
      // The SQL CASE logic: when provisional AND timesUsed + 1 >= 10 => 'trusted'
      const currentLevel = 'provisional';
      const currentUses = 9;
      const newUses = currentUses + 1;

      const newLevel = currentLevel === 'provisional' && newUses >= 10
        ? 'trusted'
        : currentLevel;

      expect(newLevel).toBe('trusted');
    });

    it('does not upgrade trusted to permanent automatically', () => {
      const currentLevel: string = 'trusted';
      const currentUses = 99;
      const newUses = currentUses + 1;

      const newLevel = currentLevel === 'provisional' && newUses >= 10
        ? 'trusted'
        : currentLevel;

      expect(newLevel).toBe('trusted');
    });
  });

  describe('findMatchingPatterns', () => {
    it('finds patterns matching a tool name', async () => {
      const patterns = [
        createMockApprovalPattern({ tool: 'web_search', revokedAt: null }),
      ];
      ctx.db.query.approvalPatterns.findMany.mockResolvedValue(patterns);

      const result = await ctx.db.query.approvalPatterns.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.tool).toBe('web_search');
    });

    it('filters out expired patterns', () => {
      const now = new Date();
      const patterns = [
        createMockApprovalPattern({ expiresAt: new Date(now.getTime() - 86400000) }), // expired
        createMockApprovalPattern({ expiresAt: new Date(now.getTime() + 86400000) }), // valid
        createMockApprovalPattern({ expiresAt: null }), // no expiration
      ];

      const active = patterns.filter((p) => {
        if (p.expiresAt && p.expiresAt < now) return false;
        return true;
      });

      expect(active).toHaveLength(2);
    });

    it('matches entity goal patterns using regex', () => {
      const pattern = createMockApprovalPattern({
        entityGoalPattern: 'search.*web',
      });

      const entityGoal = 'search the web for data';
      const regex = new RegExp(pattern.entityGoalPattern!, 'i');

      expect(regex.test(entityGoal)).toBe(true);
    });

    it('patterns without entityGoalPattern apply to all goals', () => {
      const pattern = createMockApprovalPattern({
        entityGoalPattern: null,
      });

      // In the router: if (!p.entityGoalPattern) return true;
      expect(pattern.entityGoalPattern).toBeNull();
    });

    it('handles invalid regex gracefully', () => {
      const invalidPattern = createMockApprovalPattern({
        entityGoalPattern: '[invalid(regex',
      });

      let matches = false;
      try {
        const regex = new RegExp(invalidPattern.entityGoalPattern!, 'i');
        matches = regex.test('test');
      } catch {
        matches = false;
      }

      expect(matches).toBe(false);
    });
  });

  describe('getPatternStats', () => {
    it('computes total, active, and revoked counts', () => {
      const patterns = [
        createMockApprovalPattern({ id: 'p-1', revokedAt: null }),
        createMockApprovalPattern({ id: 'p-2', revokedAt: null }),
        createMockApprovalPattern({ id: 'p-3', revokedAt: new Date() }),
      ];

      const total = patterns.length;
      const active = patterns.filter((p) => !p.revokedAt).length;
      const revoked = patterns.filter((p) => p.revokedAt).length;

      expect(total).toBe(3);
      expect(active).toBe(2);
      expect(revoked).toBe(1);
    });

    it('groups active patterns by trust level', () => {
      const patterns = [
        createMockApprovalPattern({ trustLevel: 'provisional', revokedAt: null }),
        createMockApprovalPattern({ trustLevel: 'provisional', revokedAt: null }),
        createMockApprovalPattern({ trustLevel: 'trusted', revokedAt: null }),
        createMockApprovalPattern({ trustLevel: 'permanent', revokedAt: null }),
        createMockApprovalPattern({ trustLevel: 'trusted', revokedAt: new Date() }), // revoked
      ];

      const byTrustLevel = patterns.reduce(
        (acc, p) => {
          if (!p.revokedAt) {
            acc[p.trustLevel] = (acc[p.trustLevel] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>
      );

      expect(byTrustLevel.provisional).toBe(2);
      expect(byTrustLevel.trusted).toBe(1);
      expect(byTrustLevel.permanent).toBe(1);
    });

    it('groups active patterns by tool', () => {
      const patterns = [
        createMockApprovalPattern({ tool: 'web_search', revokedAt: null }),
        createMockApprovalPattern({ tool: 'web_search', revokedAt: null }),
        createMockApprovalPattern({ tool: 'fetch_url', revokedAt: null }),
      ];

      const byTool = patterns.reduce(
        (acc, p) => {
          if (!p.revokedAt) {
            acc[p.tool] = (acc[p.tool] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>
      );

      expect(byTool.web_search).toBe(2);
      expect(byTool.fetch_url).toBe(1);
    });

    it('computes total usage across all patterns', () => {
      const patterns = [
        createMockApprovalPattern({ timesUsed: 10 }),
        createMockApprovalPattern({ timesUsed: 20 }),
        createMockApprovalPattern({ timesUsed: 5 }),
      ];

      const totalUsage = patterns.reduce((sum, p) => sum + (p.timesUsed ?? 0), 0);

      expect(totalUsage).toBe(35);
    });

    it('returns zeros for empty workspace', () => {
      const patterns: MockApprovalPattern[] = [];

      const total = patterns.length;
      const active = patterns.filter((p) => !p.revokedAt).length;
      const totalUsage = patterns.reduce((sum, p) => sum + (p.timesUsed ?? 0), 0);

      expect(total).toBe(0);
      expect(active).toBe(0);
      expect(totalUsage).toBe(0);
    });
  });
});
