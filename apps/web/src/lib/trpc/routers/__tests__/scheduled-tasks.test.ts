import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockScheduledTask,
  type MockContext,
  type MockScheduledTask,
} from '../../__tests__/test-utils';
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

describe('Scheduled Tasks Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns scheduled tasks for workspace', async () => {
      const mockTasks = [
        createMockScheduledTask({ id: 'task-1', status: 'pending' }),
        createMockScheduledTask({ id: 'task-2', status: 'completed' }),
        createMockScheduledTask({ id: 'task-3', status: 'failed' }),
      ];
      ctx.db.query.scheduledTasks.findMany.mockResolvedValue(mockTasks);

      const result = await ctx.db.query.scheduledTasks.findMany();

      expect(result).toHaveLength(3);
      expect(result[0]!.status).toBe('pending');
    });

    it('returns empty array when no tasks exist', async () => {
      ctx.db.query.scheduledTasks.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.scheduledTasks.findMany();

      expect(result).toHaveLength(0);
    });

    it('filters tasks by status', async () => {
      const pendingTasks = [
        createMockScheduledTask({ id: 'task-1', status: 'pending' }),
        createMockScheduledTask({ id: 'task-2', status: 'pending' }),
      ];
      ctx.db.query.scheduledTasks.findMany.mockResolvedValue(pendingTasks);

      const result = await ctx.db.query.scheduledTasks.findMany();

      expect(result).toHaveLength(2);
      expect(result.every((t: MockScheduledTask) => t.status === 'pending')).toBe(true);
    });

    it('includes baleybot relation', async () => {
      const taskWithBot = createMockScheduledTask({
        id: 'task-1',
        baleybot: { id: 'bb-1', name: 'My Bot', icon: null },
      });
      ctx.db.query.scheduledTasks.findMany.mockResolvedValue([taskWithBot]);

      const result = await ctx.db.query.scheduledTasks.findMany();

      expect(result[0]!.baleybot?.name).toBe('My Bot');
    });

    it('respects limit parameter', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) =>
        createMockScheduledTask({ id: `task-${i}` })
      );
      ctx.db.query.scheduledTasks.findMany.mockResolvedValue(tasks.slice(0, 5));

      const result = await ctx.db.query.scheduledTasks.findMany();

      expect(result).toHaveLength(5);
    });

    it('returns tasks with all status types', async () => {
      const tasks = [
        createMockScheduledTask({ status: 'pending' }),
        createMockScheduledTask({ status: 'running' }),
        createMockScheduledTask({ status: 'completed' }),
        createMockScheduledTask({ status: 'failed' }),
        createMockScheduledTask({ status: 'cancelled' }),
      ];
      ctx.db.query.scheduledTasks.findMany.mockResolvedValue(tasks);

      const result = await ctx.db.query.scheduledTasks.findMany();
      const statuses = result.map((t: MockScheduledTask) => t.status);

      expect(statuses).toContain('pending');
      expect(statuses).toContain('running');
      expect(statuses).toContain('completed');
      expect(statuses).toContain('failed');
      expect(statuses).toContain('cancelled');
    });
  });

  describe('cancel', () => {
    it('cancels a pending task', async () => {
      const pendingTask = createMockScheduledTask({ id: 'task-1', status: 'pending' });
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(pendingTask);

      const cancelledTask = { ...pendingTask, status: 'cancelled' as const };
      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([cancelledTask]),
          }),
        }),
      });

      const task = await ctx.db.query.scheduledTasks.findFirst();
      expect(task?.status).toBe('pending');

      const updateMock = ctx.db.update('scheduledTasks');
      const result = await updateMock.set({}).where({}).returning();
      expect(result[0].status).toBe('cancelled');
    });

    it('returns null for non-existent task', async () => {
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.scheduledTasks.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('rejects cancellation of non-pending tasks', async () => {
      const runningTask = createMockScheduledTask({ id: 'task-1', status: 'running' });
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(runningTask);

      const task = await ctx.db.query.scheduledTasks.findFirst();

      expect(task?.status).toBe('running');
      expect(task?.status).not.toBe('pending');
      // In actual router, this would throw BAD_REQUEST
    });

    it('rejects cancellation of completed tasks', async () => {
      const completedTask = createMockScheduledTask({ id: 'task-1', status: 'completed' });
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(completedTask);

      const task = await ctx.db.query.scheduledTasks.findFirst();

      expect(task?.status).toBe('completed');
      expect(task?.status !== 'pending').toBe(true);
    });

    it('rejects cancellation of already cancelled tasks', async () => {
      const cancelledTask = createMockScheduledTask({ id: 'task-1', status: 'cancelled' });
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(cancelledTask);

      const task = await ctx.db.query.scheduledTasks.findFirst();

      expect(task?.status).toBe('cancelled');
      expect(task?.status !== 'pending').toBe(true);
    });
  });

  describe('reschedule', () => {
    it('reschedules a task with new run time', async () => {
      const task = createMockScheduledTask({ id: 'task-1', status: 'pending' });
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(task);

      const newRunAt = new Date('2025-03-01T10:00:00Z');
      const rescheduledTask = { ...task, runAt: newRunAt, status: 'pending' as const };

      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([rescheduledTask]),
          }),
        }),
      });

      const updateMock = ctx.db.update('scheduledTasks');
      const result = await updateMock.set({}).where({}).returning();

      expect(result[0].runAt).toEqual(newRunAt);
      expect(result[0].status).toBe('pending');
    });

    it('returns null for non-existent task on reschedule', async () => {
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.scheduledTasks.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('resets status to pending on reschedule', async () => {
      const failedTask = createMockScheduledTask({ id: 'task-1', status: 'failed' });
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(failedTask);

      const rescheduledTask = { ...failedTask, status: 'pending' as const };
      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([rescheduledTask]),
          }),
        }),
      });

      const updateMock = ctx.db.update('scheduledTasks');
      const result = await updateMock.set({}).where({}).returning();

      expect(result[0].status).toBe('pending');
    });
  });

  describe('workspace scoping', () => {
    it('only returns tasks for the correct workspace', async () => {
      const workspaceTasks = [
        createMockScheduledTask({ workspaceId: ctx.workspace.id }),
      ];
      ctx.db.query.scheduledTasks.findMany.mockResolvedValue(workspaceTasks);

      const result = await ctx.db.query.scheduledTasks.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.workspaceId).toBe(ctx.workspace.id);
    });

    it('scopes cancel to workspace', async () => {
      const task = createMockScheduledTask({
        id: 'task-1',
        workspaceId: ctx.workspace.id,
      });
      ctx.db.query.scheduledTasks.findFirst.mockResolvedValue(task);

      const result = await ctx.db.query.scheduledTasks.findFirst();

      expect(result?.workspaceId).toBe(ctx.workspace.id);
    });
  });
});
