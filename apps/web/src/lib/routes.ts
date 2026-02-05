/**
 * Centralized route constants for consistent navigation.
 * All routes should use these constants instead of hardcoded strings.
 */

export const ROUTES = {
  // Dashboard (Home)
  dashboard: '/dashboard',

  // BaleyBots (primary feature)
  baleybots: {
    list: '/dashboard/baleybots',
    create: '/dashboard/baleybots/new',
    detail: (id: string) => `/dashboard/baleybots/${id}`,
    execute: (id: string) => `/dashboard/baleybots/${id}/execute`,
  },

  // Activity (executions, decisions, analytics combined)
  activity: {
    list: '/dashboard/activity',
    execution: (id: string) => `/dashboard/activity/executions/${id}`,
    decisions: '/dashboard/activity/decisions',
    analytics: '/dashboard/activity/analytics',
  },

  // Legacy routes (kept for backwards compatibility during transition)
  // TODO: Remove after migration complete

  // Blocks
  blocks: {
    list: '/dashboard/blocks',
    create: '/dashboard/blocks/new',
    detail: (id: string) => `/dashboard/blocks/${id}`,
    patterns: (id: string) => `/dashboard/blocks/${id}/patterns`,
    test: (id: string) => `/dashboard/blocks/${id}/test`,
  },

  // Flows
  flows: {
    list: '/dashboard/flows',
    create: '/dashboard/flows/new',
    detail: (id: string) => `/dashboard/flows/${id}`,
  },

  // Executions
  executions: {
    list: '/dashboard/executions',
    detail: (id: string) => `/dashboard/executions/${id}`,
  },

  // Decisions
  decisions: {
    list: '/dashboard/decisions',
    detail: (id: string) => `/dashboard/decisions/${id}`,
  },

  // Analytics
  analytics: {
    overview: '/dashboard/analytics',
    costs: '/dashboard/analytics/costs',
    latency: '/dashboard/analytics/latency',
    export: '/dashboard/analytics/export',
  },

  // Settings
  settings: {
    root: '/dashboard/settings',
    connections: '/dashboard/settings/connections',
    apiKeys: '/dashboard/settings/api-keys',
    workspace: '/dashboard/settings/workspace',
    policies: '/dashboard/settings/policies',
    approvals: '/dashboard/settings/approvals',
  },

  // Tools
  tools: {
    list: '/dashboard/tools',
  },

  // Notifications
  notifications: {
    list: '/dashboard/notifications',
  },

  // Scheduled Tasks
  scheduledTasks: {
    list: '/dashboard/scheduled-tasks',
  },

  // Connections
  connections: {
    list: '/dashboard/connections',
  },

  // Companion
  companion: '/dashboard/companion',

  // Auth
  auth: {
    signIn: '/sign-in',
    signUp: '/sign-up',
  },

  // Onboarding
  onboarding: '/onboarding',

  // API Documentation
  apiDocs: '/api/docs',
} as const;

/**
 * Helper to build query strings
 */
export function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

/**
 * Check if current path matches a route (for active link highlighting)
 */
export function isActiveRoute(currentPath: string, route: string): boolean {
  // Exact match
  if (currentPath === route) return true;
  // Prefix match for nested routes (e.g., /dashboard/blocks/123 matches /dashboard/blocks)
  if (route !== '/dashboard' && currentPath.startsWith(route)) return true;
  return false;
}
