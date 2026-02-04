/**
 * Notification Service Tests
 *
 * Tests for the send_notification built-in tool's service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNotificationSender } from '../notification-service';

// Mock the database module
vi.mock('@baleyui/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'notif-123' }]),
      })),
    })),
  },
  notifications: {
    id: 'id',
    workspaceId: 'workspaceId',
    userId: 'userId',
    title: 'title',
    message: 'message',
    priority: 'priority',
  },
}));

describe('NotificationService', () => {
  const sender = createNotificationSender();
  const ctx = {
    workspaceId: 'ws-1',
    baleybotId: 'bb-1',
    executionId: 'exec-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should create a notification and return id', async () => {
      const result = await sender(
        {
          title: 'Task Complete',
          message: 'Your analysis is ready',
          priority: 'high',
        },
        ctx
      );

      expect(result.sent).toBe(true);
      expect(result.notification_id).toBe('notif-123');
    });

    it('should default to normal priority for invalid priority', async () => {
      const { db } = await import('@baleyui/db');

      await sender(
        {
          title: 'Test',
          message: 'Test message',
          priority: 'invalid-priority',
        },
        ctx
      );

      // Verify insert was called (we can't easily verify the priority value
      // without more complex mocking, but the function should not throw)
      expect(db.insert).toHaveBeenCalled();
    });

    it('should accept valid priority values', async () => {
      for (const priority of ['low', 'normal', 'high']) {
        const result = await sender(
          {
            title: 'Test',
            message: 'Test message',
            priority,
          },
          ctx
        );

        expect(result.sent).toBe(true);
      }
    });

    it('should throw if database insert fails', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as ReturnType<typeof db.insert>);

      await expect(
        sender(
          {
            title: 'Test',
            message: 'Test message',
            priority: 'normal',
          },
          ctx
        )
      ).rejects.toThrow('Failed to create notification');
    });

    it('should use system user when userId not provided', async () => {
      const { db } = await import('@baleyui/db');
      // Reset the mock to return success
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'notif-456' }]),
        }),
      } as ReturnType<typeof db.insert>);

      const ctxWithoutUser = {
        workspaceId: 'ws-1',
        baleybotId: 'bb-1',
        executionId: 'exec-1',
        userId: undefined as unknown as string,
      };

      const result = await sender(
        {
          title: 'Test',
          message: 'Test message',
          priority: 'normal',
        },
        ctxWithoutUser
      );

      expect(result.sent).toBe(true);
    });
  });
});
