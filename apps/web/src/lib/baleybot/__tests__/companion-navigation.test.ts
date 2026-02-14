import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @baleyui/db before importing
// ---------------------------------------------------------------------------
vi.mock('@baleyui/db', () => {
  const eq = vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b }));
  const and = vi.fn((...args: unknown[]) => ({ type: 'and', args }));
  const notDeleted = vi.fn(() => ({ type: 'notDeleted' }));

  return {
    db: {
      query: {
        connections: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    },
    connections: {
      workspaceId: 'connections.workspaceId',
      id: 'connections.id',
      name: 'connections.name',
      type: 'connections.type',
      status: 'connections.status',
      lastCheckedAt: 'connections.lastCheckedAt',
    },
    eq,
    and,
    notDeleted,
  };
});

const { buildNavigationTools } = await import('../tools/companion/navigation');

const ctx = { workspaceId: 'ws-1', userId: 'user-1' };

describe('buildNavigationTools', () => {
  describe('navigate_user_to', () => {
    it('returns navigate_request action for valid path', async () => {
      const tools = buildNavigationTools(ctx);
      const tool = tools.get('navigate_user_to')!;
      const result = await tool.function({
        path: '/dashboard/baleybots',
        reason: 'View your bots',
      });

      expect(result).toEqual(
        expect.objectContaining({
          action: 'navigate_request',
          path: '/dashboard/baleybots',
          label: 'BaleyBots',
          reason: 'View your bots',
        }),
      );
    });

    it('accepts dynamic route paths', async () => {
      const tools = buildNavigationTools(ctx);
      const tool = tools.get('navigate_user_to')!;
      const result = await tool.function({
        path: '/dashboard/baleybots/abc-123',
      });

      expect(result).toEqual(
        expect.objectContaining({
          action: 'navigate_request',
          path: '/dashboard/baleybots/abc-123',
        }),
      );
    });

    it('accepts paths with query strings', async () => {
      const tools = buildNavigationTools(ctx);
      const tool = tools.get('navigate_user_to')!;
      const result = await tool.function({
        path: '/dashboard/actions?highlight=rec-1',
      });

      expect(result).toEqual(
        expect.objectContaining({
          action: 'navigate_request',
          path: '/dashboard/actions?highlight=rec-1',
          label: 'Actions',
        }),
      );
    });

    it('rejects invalid paths', async () => {
      const tools = buildNavigationTools(ctx);
      const tool = tools.get('navigate_user_to')!;
      const result = await tool.function({
        path: '/some/random/path',
      });

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid path'),
        }),
      );
    });
  });
});
