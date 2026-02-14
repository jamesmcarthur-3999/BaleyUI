/**
 * Navigation & Context Tools for Baley
 *
 * Valid routes and labels are derived from the PAGE_REGISTRY in routes.ts
 * — no hardcoded route sets here.
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import { db, connections, notDeleted, eq, and } from '@baleyui/db';
import { getPageInfo, getValidDashboardPaths } from '@/lib/routes';

function stripQueryString(path: string): string {
  const idx = path.indexOf('?');
  return idx >= 0 ? path.slice(0, idx) : path;
}

function isValidDashboardPath(path: string): boolean {
  const pathOnly = stripQueryString(path);
  const { static: staticPaths, dynamicPrefixes } = getValidDashboardPaths();
  if (staticPaths.has(pathOnly)) return true;
  return dynamicPrefixes.some((prefix) => pathOnly.startsWith(prefix));
}

/** Human-readable label for a dashboard path, derived from PAGE_REGISTRY */
function labelForPath(path: string): string {
  const pathOnly = stripQueryString(path);
  return getPageInfo(pathOnly)?.label ?? pathOnly.split('/').pop() ?? 'Page';
}

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
      'Navigate the user to a specific dashboard page. Shows a confirmation chip the user must approve. Use /dashboard/baleybots/new to start building a new bot, /dashboard/capabilities/connections for connection setup, /dashboard/activity for execution history, /dashboard/actions for AI recommendations, /dashboard/analytics for usage stats, /dashboard/settings/general for workspace config. Always include a reason explaining why this navigation helps.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The dashboard path to navigate to',
        },
        reason: {
          type: 'string',
          description: 'Brief reason for navigation (shown to the user)',
        },
      },
      required: ['path'],
    },
    async function(args) {
      const path = args.path as string;
      const reason = args.reason ? String(args.reason) : undefined;

      if (!isValidDashboardPath(path)) {
        return {
          success: false,
          error: `Invalid path: "${path}". Must be a valid /dashboard/* route.`,
        };
      }

      return {
        action: 'navigate_request',
        path,
        label: labelForPath(path),
        reason,
        message: `Navigation request sent — waiting for user to confirm.`,
      };
    },
  });

  return tools;
}
