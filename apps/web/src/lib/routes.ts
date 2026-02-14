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

  // Shared Context (workspace-level knowledge)
  sharedContext: '/dashboard/shared-context',

  // Admin (system management)
  admin: {
    overview: '/dashboard/admin',
    baleybots: '/dashboard/admin/baleybots',
    baleybot: (id: string) => `/dashboard/admin/baleybots/${id}`,
    users: '/dashboard/admin/users',
    user: (id: string) => `/dashboard/admin/users/${id}`,
    sessions: '/dashboard/admin/sessions',
    platformIssues: '/dashboard/admin/platform-issues',
    models: '/dashboard/admin/models',
  },

  // Actions (recommendations hub)
  actions: {
    list: '/dashboard/actions',
  },

  // Playground
  playground: '/dashboard/playground',

  // Auth
  auth: {
    signIn: '/sign-in',
    signUp: '/sign-up',
    forgotPassword: '/forgot-password',
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

// ============================================================================
// PAGE REGISTRY — single source of truth for page metadata
// ============================================================================

export interface PageInfo {
  path: string;
  label: string;
  description: string;
  baleyHints: string[];
  /** If true, this is a prefix pattern (e.g., /dashboard/baleybots/ matches /dashboard/baleybots/abc123) */
  isDynamic?: boolean;
  /** If true, companion is hidden on this page (creator mode takes over) */
  hasOwnChat?: boolean;
}

export const PAGE_REGISTRY: PageInfo[] = [
  {
    path: ROUTES.dashboard,
    label: 'Dashboard Home',
    description: 'Overview redirecting to BaleyBots list.',
    baleyHints: ['Navigate to specific areas', 'Check workspace health'],
  },
  {
    path: ROUTES.baleybots.list,
    label: 'BaleyBots',
    description: 'Lists all BaleyBots with status, filters, smart views. "New BaleyBot" button creates a new one.',
    baleyHints: ['Build a new bot (navigate to create page)', 'Explain what an existing bot does', 'Suggest improvements based on execution history'],
  },
  {
    path: ROUTES.baleybots.library,
    label: 'Bot Library',
    description: 'Pre-built BaleyBot templates the user can clone and customize.',
    baleyHints: ['Help choose a template', 'Explain what a template does'],
  },
  {
    path: ROUTES.baleybots.create,
    label: 'Create BaleyBot',
    description: 'Empty creation page with chat input asking "What should your BaleyBot do?". This is where building starts.',
    baleyHints: ['Guide the creation conversation', 'Help design the bot architecture', 'Suggest tools and connections needed'],
    hasOwnChat: true,
  },
  {
    path: '/dashboard/baleybots/',
    label: 'BaleyBot Builder',
    description: 'Bot builder with Plan, Visual, Code, Test, and Integrate tabs. Creator chat is active here.',
    baleyHints: ['Help iterate on the design', 'Guide through testing', 'Help with deployment'],
    isDynamic: true,
    hasOwnChat: true,
  },
  {
    path: ROUTES.activity.list,
    label: 'Activity',
    description: 'Execution history with logs, durations, statuses, and filters.',
    baleyHints: ['Explain what happened in an execution', 'Diagnose failures', 'Review execution patterns'],
  },
  {
    path: '/dashboard/activity/executions/',
    label: 'Execution Detail',
    description: 'Detailed view of a single BaleyBot execution with logs and tool calls.',
    baleyHints: ['Explain execution steps', 'Diagnose issues'],
    isDynamic: true,
  },
  {
    path: ROUTES.actions.list,
    label: 'Actions',
    description: 'AI-generated recommendations hub with prioritized improvement suggestions.',
    baleyHints: ['Explain a recommendation', 'Apply an action', 'Review pending actions'],
  },
  {
    path: ROUTES.analytics.overview,
    label: 'Analytics',
    description: 'Usage stats, execution trends, cost breakdown, and performance metrics.',
    baleyHints: ['Interpret usage trends', 'Identify cost optimization opportunities', 'Explain metrics'],
  },
  {
    path: ROUTES.capabilities.connections,
    label: 'Connections',
    description: 'Manage integrations: AI providers, databases, APIs. Add, test, and configure connections.',
    baleyHints: ['Set up a new connection', 'Troubleshoot connection errors', 'Explain what connections are needed'],
  },
  {
    path: ROUTES.capabilities.tools,
    label: 'Tools',
    description: 'Manage workspace tools that BaleyBots can use. Create, edit, and organize tools.',
    baleyHints: ['Create a new tool', 'Explain available tools', 'Suggest tools for a use case'],
  },
  {
    path: ROUTES.capabilities.apiKeys,
    label: 'API Keys',
    description: 'Manage API keys for programmatic access to BaleyUI.',
    baleyHints: ['Create an API key', 'Explain API key usage', 'Revoke unused keys'],
  },
  {
    path: ROUTES.sharedContext,
    label: 'Shared Context',
    description: 'Workspace-level knowledge entries that all BaleyBots can access during execution.',
    baleyHints: ['Add context entries', 'Explain how shared context works', 'Organize knowledge'],
  },
  {
    path: ROUTES.settings.root,
    label: 'Settings',
    description: 'Workspace settings hub.',
    baleyHints: ['Navigate to specific settings', 'Explain workspace configuration'],
  },
  {
    path: ROUTES.settings.general,
    label: 'General Settings',
    description: 'Workspace name, default AI provider, and global configuration.',
    baleyHints: ['Update workspace settings', 'Configure defaults'],
  },
  {
    path: ROUTES.settings.profile,
    label: 'Profile',
    description: 'User profile: name, avatar, password, account settings.',
    baleyHints: ['Update profile information', 'Change password'],
  },
  {
    path: ROUTES.settings.team,
    label: 'Team',
    description: 'Team member management and roles.',
    baleyHints: ['Invite team members', 'Manage roles'],
  },
  {
    path: ROUTES.settings.approvals,
    label: 'Approvals',
    description: 'Approval patterns that control which tool calls auto-approve vs require user confirmation.',
    baleyHints: ['Review approval patterns', 'Explain auto-approval rules', 'Revoke risky patterns'],
  },
  {
    path: ROUTES.playground,
    label: 'Playground',
    description: 'Interactive sandbox for testing BaleyBots and BAL code.',
    baleyHints: ['Help test a bot', 'Explain test results'],
  },
  {
    path: ROUTES.admin.overview,
    label: 'Admin',
    description: 'System admin overview: user counts, session stats, platform health.',
    baleyHints: ['Check platform health', 'Review system stats'],
  },
  {
    path: ROUTES.admin.users,
    label: 'User Management',
    description: 'Admin user list with management actions.',
    baleyHints: ['Manage users', 'Review user activity'],
  },
  {
    path: '/dashboard/admin/users/',
    label: 'User Detail',
    description: 'Detailed admin view of a specific user.',
    baleyHints: ['Review user details'],
    isDynamic: true,
  },
  {
    path: ROUTES.admin.sessions,
    label: 'Sessions',
    description: 'Active session management.',
    baleyHints: ['Review active sessions', 'Terminate sessions'],
  },
  {
    path: ROUTES.admin.baleybots,
    label: 'Bot Management',
    description: 'Admin view of all BaleyBots across workspaces.',
    baleyHints: ['Review all bots', 'Manage bot lifecycle'],
  },
  {
    path: '/dashboard/admin/baleybots/',
    label: 'Admin Bot Detail',
    description: 'Admin view of a specific BaleyBot.',
    baleyHints: ['Inspect bot details'],
    isDynamic: true,
  },
  {
    path: ROUTES.admin.platformIssues,
    label: 'Platform Issues',
    description: 'Tracked platform bugs and errors.',
    baleyHints: ['Review platform issues', 'Triage errors'],
  },
  {
    path: ROUTES.admin.models,
    label: 'Model Library',
    description: 'AI model registry with providers, tiers, pricing, and capabilities.',
    baleyHints: ['Review available models', 'Check model capabilities', 'Compare pricing'],
  },
];

/** Look up page info for a given pathname */
export function getPageInfo(pathname: string): PageInfo | null {
  // Try exact match first
  const exact = PAGE_REGISTRY.find(p => !p.isDynamic && p.path === pathname);
  if (exact) return exact;
  // Try dynamic prefix match
  return PAGE_REGISTRY.find(p => p.isDynamic && pathname.startsWith(p.path)) ?? null;
}

/** Get all valid dashboard paths (for navigation validation) */
export function getValidDashboardPaths(): { static: Set<string>; dynamicPrefixes: string[] } {
  const staticPaths = new Set<string>();
  const dynamicPrefixes: string[] = [];
  for (const page of PAGE_REGISTRY) {
    if (page.isDynamic) {
      dynamicPrefixes.push(page.path);
    } else if (page.path.startsWith('/dashboard')) {
      staticPaths.add(page.path);
    }
  }
  return { static: staticPaths, dynamicPrefixes };
}
