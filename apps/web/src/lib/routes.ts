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
    library: '/dashboard/baleybots/library',
    create: '/dashboard/baleybots/new',
    detail: (id: string) => `/dashboard/baleybots/${id}`,
    execute: (id: string) => `/dashboard/baleybots/${id}/execute`,
  },

  // Activity (execution history)
  activity: {
    list: '/dashboard/activity',
    execution: (id: string) => `/dashboard/activity/executions/${id}`,
  },

  // Capabilities (tools, connections, API keys)
  capabilities: {
    tools: '/dashboard/capabilities/tools',
    connections: '/dashboard/capabilities/connections',
    apiKeys: '/dashboard/capabilities/api-keys',
  },

  // Analytics
  analytics: {
    overview: '/dashboard/analytics',
  },

  // Settings
  settings: {
    root: '/dashboard/settings',
    general: '/dashboard/settings/general',
    profile: '/dashboard/settings/profile',
    team: '/dashboard/settings/team',
    approvals: '/dashboard/settings/approvals',
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
