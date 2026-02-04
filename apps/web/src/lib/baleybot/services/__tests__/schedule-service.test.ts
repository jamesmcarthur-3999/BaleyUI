/**
 * Schedule Service Tests
 *
 * Tests for the schedule_task built-in tool's service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTaskScheduler } from '../schedule-service';

// Helper to create partial BB mock data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockBB(data: { id: string; name: string }): any {
  return data;
}

// Mock the database module
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybots: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          { id: 'task-123', runAt: new Date('2024-12-01T10:00:00Z') },
        ]),
      })),
    })),
  },
  baleybots: {
    id: 'id',
    workspaceId: 'workspaceId',
    name: 'name',
  },
  scheduledTasks: {
    id: 'id',
    runAt: 'runAt',
  },
  eq: vi.fn(),
  and: vi.fn(),
  notDeleted: vi.fn(),
}));

describe('ScheduleService', () => {
  const scheduler = createTaskScheduler();
  const ctx = {
    workspaceId: 'ws-1',
    baleybotId: 'bb-1',
    executionId: 'exec-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scheduleTask', () => {
    it('should schedule a task for a future datetime', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'target-bb-123',
          name: 'report-generator',
        })
      );

      const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const result = await scheduler(
        {
          baleybotIdOrName: 'report-generator',
          runAt: futureDate,
          input: { reportType: 'daily' },
        },
        ctx
      );

      expect(result.scheduled).toBe(true);
      expect(result.task_id).toBe('task-123');
      expect(result.run_at).toBeDefined();
    });

    it('should look up BaleyBot by name', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-by-name',
          name: 'my-bot',
        })
      );

      const futureDate = new Date(Date.now() + 3600000).toISOString();
      await scheduler(
        {
          baleybotIdOrName: 'my-bot',
          runAt: futureDate,
          input: {},
        },
        ctx
      );

      expect(db.query.baleybots.findFirst).toHaveBeenCalled();
    });

    it('should throw if BaleyBot not found', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(undefined);

      const futureDate = new Date(Date.now() + 3600000).toISOString();
      await expect(
        scheduler(
          {
            baleybotIdOrName: 'non-existent-bot',
            runAt: futureDate,
            input: {},
          },
          ctx
        )
      ).rejects.toThrow(/BaleyBot not found.*non-existent-bot/);
    });

    it('should throw for invalid datetime format', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'test',
        })
      );

      await expect(
        scheduler(
          {
            baleybotIdOrName: 'test',
            runAt: 'not-a-valid-date',
            input: {},
          },
          ctx
        )
      ).rejects.toThrow(/Invalid run_at value/);
    });

    it('should throw for dates significantly in the past', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'test',
        })
      );

      const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      await expect(
        scheduler(
          {
            baleybotIdOrName: 'test',
            runAt: pastDate,
            input: {},
          },
          ctx
        )
      ).rejects.toThrow(/Cannot schedule tasks in the past/);
    });

    it('should accept cron expressions', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'cron-bot',
        })
      );

      const result = await scheduler(
        {
          baleybotIdOrName: 'cron-bot',
          runAt: '0 9 * * 1-5', // Every weekday at 9 AM
          input: {},
        },
        ctx
      );

      expect(result.scheduled).toBe(true);
    });

    it('should throw if database insert fails', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'test',
        })
      );
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const futureDate = new Date(Date.now() + 3600000).toISOString();
      await expect(
        scheduler(
          {
            baleybotIdOrName: 'test',
            runAt: futureDate,
            input: {},
          },
          ctx
        )
      ).rejects.toThrow('Failed to create scheduled task');
    });
  });
});
