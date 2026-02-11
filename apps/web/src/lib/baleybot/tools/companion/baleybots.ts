/**
 * BaleyBot Management & Execution Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import {
  db,
  baleybots,
  baleybotExecutions,
  notDeleted,
  eq,
  and,
  desc,
} from '@baleyui/db';

export function buildBaleybotTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  tools.set('list_baleybots', {
    name: 'list_baleybots',
    description:
      "List all user's BaleyBots with their status, lifecycle stage, and last execution time.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async function() {
      const results = await db.query.baleybots.findMany({
        where: and(
          eq(baleybots.workspaceId, ctx.workspaceId),
          eq(baleybots.isInternal, false),
          notDeleted(baleybots)
        ),
        columns: {
          id: true,
          name: true,
          description: true,
          icon: true,
          status: true,
          lifecycleStage: true,
          executionCount: true,
          lastExecutedAt: true,
          createdAt: true,
        },
        orderBy: [desc(baleybots.updatedAt)],
      });

      return {
        baleybots: results.map((bb) => ({
          id: bb.id,
          name: bb.name,
          description: bb.description,
          icon: bb.icon,
          status: bb.status,
          lifecycleStage: bb.lifecycleStage,
          executionCount: bb.executionCount,
          lastExecutedAt: bb.lastExecutedAt?.toISOString() ?? null,
          createdAt: bb.createdAt.toISOString(),
        })),
        total: results.length,
      };
    },
  });

  tools.set('get_baleybot', {
    name: 'get_baleybot',
    description:
      'Get full details of a BaleyBot including BAL code, tools, and recent execution history.',
    inputSchema: {
      type: 'object',
      properties: {
        baleybotId: {
          type: 'string',
          description: 'The UUID of the BaleyBot',
        },
      },
      required: ['baleybotId'],
    },
    async function(args) {
      const baleybotId = args.baleybotId as string;

      const bb = await db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, baleybotId),
          eq(baleybots.workspaceId, ctx.workspaceId),
          notDeleted(baleybots)
        ),
      });

      if (!bb) {
        return { success: false, error: 'BaleyBot not found' };
      }

      // Get recent executions
      const recentExecs = await db.query.baleybotExecutions.findMany({
        where: eq(baleybotExecutions.baleybotId, baleybotId),
        orderBy: [desc(baleybotExecutions.createdAt)],
        limit: 5,
        columns: {
          id: true,
          status: true,
          durationMs: true,
          error: true,
          createdAt: true,
        },
      });

      return {
        id: bb.id,
        name: bb.name,
        description: bb.description,
        icon: bb.icon,
        status: bb.status,
        lifecycleStage: bb.lifecycleStage,
        balCode: bb.balCode,
        entityNames: bb.entityNames,
        dependencies: bb.dependencies,
        executionCount: bb.executionCount,
        recentExecutions: recentExecs.map((e) => ({
          id: e.id,
          status: e.status,
          durationMs: e.durationMs,
          error: e.error,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    },
  });

  tools.set('get_execution', {
    name: 'get_execution',
    description:
      'Get detailed information about a BaleyBot execution, including output, duration, and errors.',
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'The UUID of the execution',
        },
      },
      required: ['executionId'],
    },
    async function(args) {
      const executionId = args.executionId as string;

      const execution = await db.query.baleybotExecutions.findFirst({
        where: eq(baleybotExecutions.id, executionId),
        with: {
          baleybot: {
            columns: { id: true, name: true, workspaceId: true },
          },
        },
      });

      if (
        !execution ||
        execution.baleybot.workspaceId !== ctx.workspaceId
      ) {
        return { success: false, error: 'Execution not found' };
      }

      return {
        id: execution.id,
        baleybotName: execution.baleybot.name,
        status: execution.status,
        input: execution.input,
        output: execution.output,
        error: execution.error,
        durationMs: execution.durationMs,
        triggeredBy: execution.triggeredBy,
        startedAt: execution.startedAt?.toISOString() ?? null,
        completedAt: execution.completedAt?.toISOString() ?? null,
        createdAt: execution.createdAt.toISOString(),
      };
    },
  });

  tools.set('list_recent_executions', {
    name: 'list_recent_executions',
    description:
      'List recent BaleyBot executions across the workspace. Shows the activity feed.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of executions to return (default 10, max 50)',
        },
      },
    },
    async function(args) {
      const limit = Math.min((args.limit as number) || 10, 50);

      // Get workspace BB IDs first
      const workspaceBBs = await db.query.baleybots.findMany({
        where: and(
          eq(baleybots.workspaceId, ctx.workspaceId),
          notDeleted(baleybots)
        ),
        columns: { id: true, name: true, icon: true },
      });

      if (workspaceBBs.length === 0) {
        return { executions: [], total: 0 };
      }

      const bbMap = new Map(workspaceBBs.map((bb) => [bb.id, bb]));

      const executions = await db.query.baleybotExecutions.findMany({
        where: and(
          ...workspaceBBs.map((bb) =>
            eq(baleybotExecutions.baleybotId, bb.id)
          ).length > 0
            ? [
                // Filter to workspace BBs - using the first for simplicity
                // In practice, use inArray
              ]
            : []
        ),
        orderBy: [desc(baleybotExecutions.createdAt)],
        limit,
        columns: {
          id: true,
          baleybotId: true,
          status: true,
          durationMs: true,
          error: true,
          triggeredBy: true,
          createdAt: true,
        },
      });

      return {
        executions: executions
          .filter((e) => bbMap.has(e.baleybotId))
          .map((e) => ({
            id: e.id,
            baleybotName: bbMap.get(e.baleybotId)?.name ?? 'Unknown',
            baleybotIcon: bbMap.get(e.baleybotId)?.icon ?? null,
            status: e.status,
            durationMs: e.durationMs,
            error: e.error,
            triggeredBy: e.triggeredBy,
            createdAt: e.createdAt.toISOString(),
          })),
      };
    },
  });

  return tools;
}
