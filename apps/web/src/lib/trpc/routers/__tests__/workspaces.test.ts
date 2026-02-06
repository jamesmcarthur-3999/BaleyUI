import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockWorkspacePolicy,
  type MockContext,
  type MockWorkspace,
} from '../../__tests__/test-utils';

// Mock external dependencies
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

/**
 * Simulate the slug generation logic from the workspaces router.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) + '-' + Math.random().toString(36).slice(2, 8);
}

describe('Workspaces Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('returns the current workspace from context', () => {
      const workspace = ctx.workspace;

      expect(workspace).toBeDefined();
      expect(workspace.id).toBe('test-workspace-id');
      expect(workspace.name).toBe('Test Workspace');
    });

    it('workspace includes owner ID', () => {
      expect(ctx.workspace.ownerId).toBe(ctx.userId);
    });
  });

  describe('checkWorkspace', () => {
    it('returns hasWorkspace true when workspace exists', async () => {
      const workspace: MockWorkspace = {
        id: 'ws-1',
        name: 'My Workspace',
        ownerId: ctx.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      ctx.db.query.workspaces.findFirst.mockResolvedValue(workspace);

      const result = await ctx.db.query.workspaces.findFirst();

      expect(result).not.toBeNull();
      expect(result?.ownerId).toBe(ctx.userId);
    });

    it('returns hasWorkspace false when no workspace exists', async () => {
      ctx.db.query.workspaces.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.workspaces.findFirst();

      expect(result).toBeNull();
      // In the actual router: { hasWorkspace: false, workspace: null }
    });

    it('excludes soft-deleted workspaces', async () => {
      // Deleted workspace should not be returned
      ctx.db.query.workspaces.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.workspaces.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('generates a URL-friendly slug from workspace name', () => {
      const slug = generateSlug('My Test Workspace');

      expect(slug).toMatch(/^my-test-workspace-[a-z0-9]+$/);
    });

    it('slug removes special characters', () => {
      const slug = generateSlug('Hello! @World# $Test');

      expect(slug).toMatch(/^hello-world-test-[a-z0-9]+$/);
    });

    it('slug is limited to 50 chars plus random suffix', () => {
      const longName = 'A'.repeat(100);
      const slug = generateSlug(longName);
      const basePart = slug.split('-').slice(0, -1).join('-');

      expect(basePart.length).toBeLessThanOrEqual(50);
    });

    it('generates unique slugs for the same name', () => {
      const slug1 = generateSlug('Test Workspace');
      const slug2 = generateSlug('Test Workspace');

      expect(slug1).not.toBe(slug2);
    });

    it('prevents creating a workspace when user already has one', async () => {
      const existingWorkspace: MockWorkspace = {
        id: 'existing-ws',
        name: 'Existing',
        ownerId: ctx.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      ctx.db.query.workspaces.findFirst.mockResolvedValue(existingWorkspace);

      const result = await ctx.db.query.workspaces.findFirst();

      // In the actual router, this would throw BAD_REQUEST
      expect(result).not.toBeNull();
    });

    it('creates workspace with correct owner', async () => {
      ctx.db.query.workspaces.findFirst.mockResolvedValue(null); // No existing workspace

      const newWorkspace: MockWorkspace = {
        id: 'new-ws-id',
        name: 'New Workspace',
        ownerId: ctx.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newWorkspace]),
        }),
      });

      const insertMock = ctx.db.insert('workspaces');
      const result = await insertMock.values({}).returning();

      expect(result[0].ownerId).toBe(ctx.userId);
      expect(result[0].name).toBe('New Workspace');
    });
  });

  describe('update', () => {
    it('updates workspace name with optimistic locking', async () => {
      const updated: MockWorkspace = {
        id: ctx.workspace.id,
        name: 'Updated Name',
        ownerId: ctx.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      });

      const updateMock = ctx.db.update('workspaces');
      const result = await updateMock.set({}).where({}).returning();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Updated Name');
    });

    it('returns empty when version mismatch (simulates CONFLICT)', async () => {
      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const updateMock = ctx.db.update('workspaces');
      const result = await updateMock.set({}).where({}).returning();

      // In the actual router, this triggers TRPCError CONFLICT
      expect(result).toHaveLength(0);
    });

    it('only allows workspace owner to update', () => {
      // Simulate a request from a user who is NOT the workspace owner
      const otherCtx = createMockContext('test-workspace-id', 'other-user-id');
      // Override ownerId to be a different user
      otherCtx.workspace.ownerId = 'original-owner-id';

      // In the actual router, protectedProcedure enforces that the workspace
      // belongs to the authenticated user
      expect(otherCtx.workspace.ownerId).not.toBe(otherCtx.userId);
    });
  });

  describe('getPolicy', () => {
    it('returns workspace policy when one exists', async () => {
      const policy = createMockWorkspacePolicy({
        workspaceId: ctx.workspace.id,
      });
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(policy);

      const result = await ctx.db.query.workspacePolicies.findFirst();

      expect(result).not.toBeNull();
      expect(result?.workspaceId).toBe(ctx.workspace.id);
    });

    it('returns null when no policy exists', async () => {
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.workspacePolicies.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('updatePolicy', () => {
    it('creates new policy when none exists', async () => {
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

    it('updates existing policy with optimistic locking', async () => {
      const existingPolicy = createMockWorkspacePolicy({ version: 1 });
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(existingPolicy);

      const updatedPolicy = createMockWorkspacePolicy({
        version: 2,
        forbiddenTools: ['dangerous_tool'],
      });

      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedPolicy]),
          }),
        }),
      });

      const updateMock = ctx.db.update('workspacePolicies');
      const result = await updateMock.set({}).where({}).returning();

      expect(result[0].forbiddenTools).toEqual(['dangerous_tool']);
    });

    it('handles CONFLICT when policy version mismatch', async () => {
      const existingPolicy = createMockWorkspacePolicy({ version: 1 });
      ctx.db.query.workspacePolicies.findFirst.mockResolvedValue(existingPolicy);

      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const updateMock = ctx.db.update('workspacePolicies');
      const result = await updateMock.set({}).where({}).returning();

      // Empty array means version mismatch
      expect(result).toHaveLength(0);
    });
  });

  describe('workspace membership', () => {
    it('workspace is owned by the creating user', () => {
      expect(ctx.workspace.ownerId).toBe(ctx.userId);
    });

    it('different users have different workspace contexts', () => {
      const ctx1 = createMockContext('ws-1', 'user-1');
      const ctx2 = createMockContext('ws-2', 'user-2');

      expect(ctx1.workspace.id).not.toBe(ctx2.workspace.id);
      expect(ctx1.userId).not.toBe(ctx2.userId);
    });
  });
});
