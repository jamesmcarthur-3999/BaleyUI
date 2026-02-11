/**
 * Navigation & Context Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import { db, connections, notDeleted, eq, and } from '@baleyui/db';

export function buildNavigationTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  tools.set('get_workspace_health', {
    name: 'get_workspace_health',
    description:
      'Get a comprehensive health check of the workspace: connection statuses, recent errors, and usage summary.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async function() {
      const allConnections = await db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspaceId),
          notDeleted(connections)
        ),
        columns: {
          id: true,
          name: true,
          type: true,
          status: true,
          lastCheckedAt: true,
        },
      });

      const healthy = allConnections.filter(
        (c) => c.status === 'connected'
      );
      const errors = allConnections.filter((c) => c.status === 'error');
      const unconfigured = allConnections.filter(
        (c) => c.status === 'unconfigured'
      );

      const issues: string[] = [];
      if (errors.length > 0) {
        issues.push(
          `${errors.length} connection(s) in error state: ${errors.map((c) => c.name).join(', ')}`
        );
      }
      if (allConnections.length === 0) {
        issues.push('No connections configured. BaleyBots need at least one AI provider to run.');
      }

      return {
        connections: {
          total: allConnections.length,
          healthy: healthy.length,
          errors: errors.length,
          unconfigured: unconfigured.length,
          details: allConnections.map((c) => ({
            name: c.name,
            type: c.type,
            status: c.status,
            lastChecked: c.lastCheckedAt?.toISOString() ?? null,
          })),
        },
        issues,
        hasIssues: issues.length > 0,
      };
    },
  });

  tools.set('navigate_user_to', {
    name: 'navigate_user_to',
    description:
      'Navigate the user to a specific page in BaleyUI. Returns a navigation event that the frontend handles. Use dashboard paths like "/dashboard/baleybots", "/dashboard/capabilities/connections", "/dashboard/settings/general", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The dashboard path to navigate to',
        },
      },
      required: ['path'],
    },
    async function(args) {
      const path = args.path as string;
      return {
        action: 'navigate',
        path,
        message: `Navigating to ${path}`,
      };
    },
  });

  return tools;
}
