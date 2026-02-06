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

  // Activity (execution history)
  activity: {
    list: '/dashboard/activity',
    execution: (id: string) => `/dashboard/activity/executions/${id}`,
  },

  // Connections (AI providers & databases)
  connections: {
    list: '/dashboard/connections',
  },

  // Tools (tool catalog)
  tools: {
    list: '/dashboard/tools',
  },

  // Analytics
  analytics: {
    overview: '/dashboard/analytics',
  },

  // Settings
  settings: {
    root: '/dashboard/settings',
    workspace: '/dashboard/settings/workspace',
    apiKeys: '/dashboard/settings/api-keys',
    // Alias: connections page is at /dashboard/connections, not under settings
    connections: '/dashboard/connections',
  },

  // Admin (internal BaleyBots management)
  admin: {
    baleybots: '/dashboard/admin/baleybots',
    baleybot: (id: string) => `/dashboard/admin/baleybots/${id}`,
  },

  // Playground
  playground: '/dashboard/playground',

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
  // Prefix match for nested routes (e.g., /dashboard/baleybots/123 matches /dashboard/baleybots)
  if (route !== '/dashboard' && currentPath.startsWith(route)) return true;
  return false;
}
