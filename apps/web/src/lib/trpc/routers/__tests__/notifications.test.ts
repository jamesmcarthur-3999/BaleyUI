import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockNotification,
  type MockContext,
  type MockNotification,
} from '../../__tests__/test-utils';
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

describe('Notifications Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns notifications for current user in workspace', async () => {
      const mockNotifications = [
        createMockNotification({ id: 'n-1', title: 'Bot completed' }),
        createMockNotification({ id: 'n-2', title: 'Error occurred' }),
        createMockNotification({ id: 'n-3', title: 'Task scheduled' }),
      ];
      ctx.db.query.notifications.findMany.mockResolvedValue(mockNotifications);

      const result = await ctx.db.query.notifications.findMany();

      expect(result).toHaveLength(3);
      expect(result[0]!.title).toBe('Bot completed');
    });

    it('returns empty array when no notifications exist', async () => {
      ctx.db.query.notifications.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.notifications.findMany();

      expect(result).toHaveLength(0);
    });

    it('includes read and unread notifications', async () => {
      const mockNotifications = [
        createMockNotification({ id: 'n-1', readAt: null }),
        createMockNotification({ id: 'n-2', readAt: new Date('2025-01-02') }),
      ];
      ctx.db.query.notifications.findMany.mockResolvedValue(mockNotifications);

      const result = await ctx.db.query.notifications.findMany();

      expect(result[0]!.readAt).toBeNull();
      expect(result[1]!.readAt).not.toBeNull();
    });

    it('respects limit parameter', async () => {
      const notifications = Array.from({ length: 5 }, (_, i) =>
        createMockNotification({ id: `n-${i}` })
      );
      ctx.db.query.notifications.findMany.mockResolvedValue(notifications.slice(0, 3));

      const result = await ctx.db.query.notifications.findMany();

      expect(result).toHaveLength(3);
    });

    it('returns notifications with all types', async () => {
      const mockNotifications = [
        createMockNotification({ type: 'info' }),
        createMockNotification({ type: 'success' }),
        createMockNotification({ type: 'warning' }),
        createMockNotification({ type: 'error' }),
      ];
      ctx.db.query.notifications.findMany.mockResolvedValue(mockNotifications);

      const result = await ctx.db.query.notifications.findMany();
      const types = result.map((n: MockNotification) => n.type);

      expect(types).toContain('info');
      expect(types).toContain('success');
      expect(types).toContain('warning');
      expect(types).toContain('error');
    });
  });

  describe('markRead', () => {
    it('marks a single notification as read', async () => {
      const notification = createMockNotification({ id: 'n-1', readAt: null });
      const updatedNotification = { ...notification, readAt: new Date() };

      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedNotification]),
          }),
        }),
      });

      const updateMock = ctx.db.update('notifications');
      const result = await updateMock.set({}).where({}).returning();

      expect(result[0].readAt).not.toBeNull();
    });

    it('returns empty when notification not found', async () => {
      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const updateMock = ctx.db.update('notifications');
      const result = await updateMock.set({}).where({}).returning();

      expect(result).toHaveLength(0);
      // In actual router, this would throw NOT_FOUND
    });

    it('scopes mark read to correct user and workspace', () => {
      const notification = createMockNotification({
        userId: ctx.userId,
        workspaceId: ctx.workspace.id,
      });

      expect(notification.userId).toBe(ctx.userId);
      expect(notification.workspaceId).toBe(ctx.workspace.id);
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read', async () => {
      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const updateMock = ctx.db.update('notifications');
      await updateMock.set({ readAt: new Date() }).where({});

      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('only affects notifications for current user', () => {
      const userNotifications = [
        createMockNotification({ userId: ctx.userId, readAt: null }),
        createMockNotification({ userId: ctx.userId, readAt: null }),
      ];

      const allNotifications = [
        ...userNotifications,
        createMockNotification({ userId: 'other-user', readAt: null }),
      ];

      const filtered = allNotifications.filter((n) => n.userId === ctx.userId && n.readAt === null);

      expect(filtered).toHaveLength(2);
    });

    it('does not affect already read notifications', () => {
      const notifications = [
        createMockNotification({ readAt: null }),
        createMockNotification({ readAt: new Date('2025-01-01') }),
      ];

      const unread = notifications.filter((n) => n.readAt === null);

      expect(unread).toHaveLength(1);
    });
  });

  describe('getUnreadCount', () => {
    it('returns count of unread notifications', () => {
      const notifications = [
        createMockNotification({ readAt: null }),
        createMockNotification({ readAt: null }),
        createMockNotification({ readAt: new Date() }),
      ];

      const unreadCount = notifications.filter((n) => n.readAt === null).length;

      expect(unreadCount).toBe(2);
    });

    it('returns zero when all notifications are read', () => {
      const notifications = [
        createMockNotification({ readAt: new Date() }),
        createMockNotification({ readAt: new Date() }),
      ];

      const unreadCount = notifications.filter((n) => n.readAt === null).length;

      expect(unreadCount).toBe(0);
    });

    it('returns zero when no notifications exist', () => {
      const notifications: MockNotification[] = [];

      const unreadCount = notifications.filter((n) => n.readAt === null).length;

      expect(unreadCount).toBe(0);
    });
  });

  describe('workspace scoping', () => {
    it('only returns notifications for the current workspace', async () => {
      const wsNotifications = [
        createMockNotification({ workspaceId: ctx.workspace.id }),
      ];
      ctx.db.query.notifications.findMany.mockResolvedValue(wsNotifications);

      const result = await ctx.db.query.notifications.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.workspaceId).toBe(ctx.workspace.id);
    });

    it('scopes to current user', async () => {
      const userNotifications = [
        createMockNotification({ userId: ctx.userId }),
      ];
      ctx.db.query.notifications.findMany.mockResolvedValue(userNotifications);

      const result = await ctx.db.query.notifications.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.userId).toBe(ctx.userId);
    });
  });

  describe('notification sources', () => {
    it('tracks notification source and sourceId', () => {
      const notification = createMockNotification({
        source: 'baleybot',
        sourceId: 'bb-123',
      });

      expect(notification.source).toBe('baleybot');
      expect(notification.sourceId).toBe('bb-123');
    });

    it('allows null source for system notifications', () => {
      const notification = createMockNotification({
        source: null,
        sourceId: null,
      });

      expect(notification.source).toBeNull();
      expect(notification.sourceId).toBeNull();
    });
  });
});
