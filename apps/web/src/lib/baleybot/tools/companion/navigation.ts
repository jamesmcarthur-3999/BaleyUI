/**
 * Navigation & Context Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import { db, connections, notDeleted, eq, and } from '@baleyui/db';

/** Valid dashboard routes derived from actual page.tsx files */
const VALID_DASHBOARD_ROUTES = new Set([
  '/dashboard',
  '/dashboard/baleybots',
  '/dashboard/baleybots/library',
  '/dashboard/actions',
  '/dashboard/activity',
  '/dashboard/analytics',
  '/dashboard/connections',
  '/dashboard/tools',
  '/dashboard/shared-context',
  '/dashboard/capabilities/connections',
  '/dashboard/capabilities/api-keys',
  '/dashboard/capabilities/tools',
  '/dashboard/settings',
  '/dashboard/settings/general',
  '/dashboard/settings/profile',
  '/dashboard/settings/api-keys',
  '/dashboard/settings/approvals',
  '/dashboard/settings/team',
  '/dashboard/settings/workspace',
  '/dashboard/admin',
  '/dashboard/admin/users',
  '/dashboard/admin/sessions',
  '/dashboard/admin/baleybots',
]);

/** Dynamic routes that accept a trailing ID segment */
const DYNAMIC_ROUTE_PREFIXES = [
  '/dashboard/baleybots/',
  '/dashboard/activity/executions/',
  '/dashboard/admin/users/',
  '/dashboard/admin/baleybots/',
];

function stripQueryString(path: string): string {
  const idx = path.indexOf('?');
  return idx >= 0 ? path.slice(0, idx) : path;
}

function isValidDashboardPath(path: string): boolean {
  const pathOnly = stripQueryString(path);
  if (VALID_DASHBOARD_ROUTES.has(pathOnly)) return true;
  return DYNAMIC_ROUTE_PREFIXES.some((prefix) => pathOnly.startsWith(prefix));
}

/** Human-readable label for a dashboard path */
function labelForPath(path: string): string {
  const pathOnly = stripQueryString(path);
  const labels: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/dashboard/baleybots': 'BaleyBots',
    '/dashboard/baleybots/library': 'Bot Library',
    '/dashboard/actions': 'Actions',
    '/dashboard/activity': 'Activity',
    '/dashboard/analytics': 'Analytics',
    '/dashboard/connections': 'Connections',
    '/dashboard/tools': 'Tools',
    '/dashboard/shared-context': 'Shared Context',
    '/dashboard/capabilities/connections': 'Connections',
    '/dashboard/capabilities/api-keys': 'API Keys',
    '/dashboard/capabilities/tools': 'Tools',
    '/dashboard/settings': 'Settings',
    '/dashboard/settings/general': 'General Settings',
    '/dashboard/settings/profile': 'Profile',
    '/dashboard/settings/api-keys': 'API Keys',
    '/dashboard/settings/approvals': 'Approvals',
    '/dashboard/settings/team': 'Team',
    '/dashboard/settings/workspace': 'Workspace',
    '/dashboard/admin': 'Admin',
    '/dashboard/admin/users': 'User Management',
    '/dashboard/admin/sessions': 'Sessions',
    '/dashboard/admin/baleybots': 'Bot Management',
  };
  return labels[pathOnly] ?? pathOnly.split('/').pop() ?? 'Page';
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
      'Navigate the user to a specific page in BaleyUI. Shows a confirmation chip — the user must approve. Use dashboard paths like "/dashboard/baleybots", "/dashboard/capabilities/connections", "/dashboard/settings/general", etc.',
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
