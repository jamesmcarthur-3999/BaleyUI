/**
 * MCP Server Library
 *
 * Curated catalog of MCP servers with verified remote HTTP/SSE endpoints.
 * All entries use remote transports compatible with Vercel serverless deployment.
 *
 * Sources:
 * - https://github.com/jaw9c/awesome-remote-mcp-servers
 * - Official MCP server documentation from each vendor
 */

export type MCPAuthMethod = 'open' | 'api_key' | 'oauth';

export type MCPCategory =
  | 'communication'
  | 'crm'
  | 'productivity'
  | 'developer'
  | 'data'
  | 'automation'
  | 'payments'
  | 'design';

export interface MCPLibraryEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: MCPCategory;
  /** How the user authenticates with this MCP server */
  authMethod: MCPAuthMethod;
  /** Pre-filled config template with the server URL */
  configTemplate: {
    transportType: 'http' | 'sse';
    url: string;
    toolPrefix?: string;
  };
  /** What credentials the user needs to provide */
  requiredCredentials: Array<{
    name: string;
    label: string;
    type: 'text' | 'password' | 'url';
    placeholder?: string;
    helpUrl?: string;
  }>;
  /** URL to the MCP server docs */
  docsUrl?: string;
  /** Tags for search */
  tags: string[];
}

export const MCP_LIBRARY: MCPLibraryEntry[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // OPEN (No Auth)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'exa-search',
    name: 'Exa Search',
    description: 'AI-powered web search with semantic understanding and content retrieval',
    icon: 'Search',
    category: 'data',
    authMethod: 'open',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.exa.ai/mcp',
      toolPrefix: 'exa_',
    },
    requiredCredentials: [],
    docsUrl: 'https://docs.exa.ai',
    tags: ['search', 'web', 'ai', 'semantic'],
  },
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    description: 'Search and retrieve knowledge about open-source repositories and documentation',
    icon: 'BookOpen',
    category: 'developer',
    authMethod: 'open',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.deepwiki.com/sse',
      toolPrefix: 'wiki_',
    },
    requiredCredentials: [],
    docsUrl: 'https://deepwiki.com',
    tags: ['knowledge', 'docs', 'open-source', 'code'],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Access ML models, datasets, and Spaces on Hugging Face',
    icon: 'Brain',
    category: 'data',
    authMethod: 'open',
    configTemplate: {
      transportType: 'http',
      url: 'https://hf.co/mcp',
      toolPrefix: 'hf_',
    },
    requiredCredentials: [],
    docsUrl: 'https://huggingface.co/docs',
    tags: ['ml', 'models', 'datasets', 'ai'],
  },
  {
    id: 'semgrep',
    name: 'Semgrep',
    description: 'Static code analysis, vulnerability scanning, and security rule enforcement',
    icon: 'Shield',
    category: 'developer',
    authMethod: 'open',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.semgrep.ai/sse',
      toolPrefix: 'semgrep_',
    },
    requiredCredentials: [],
    docsUrl: 'https://semgrep.dev/docs',
    tags: ['security', 'code-analysis', 'sast', 'vulnerabilities'],
  },
  {
    id: 'aws-knowledge',
    name: 'AWS Knowledge',
    description: 'Search AWS documentation, best practices, and service guides',
    icon: 'Cloud',
    category: 'developer',
    authMethod: 'open',
    configTemplate: {
      transportType: 'http',
      url: 'https://knowledge-mcp.global.api.aws',
      toolPrefix: 'aws_',
    },
    requiredCredentials: [],
    docsUrl: 'https://aws.amazon.com',
    tags: ['aws', 'cloud', 'infrastructure', 'documentation'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // API KEY AUTH
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Manage payments, subscriptions, customers, and invoices via Stripe',
    icon: 'CreditCard',
    category: 'payments',
    authMethod: 'api_key',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.stripe.com/',
      toolPrefix: 'stripe_',
    },
    requiredCredentials: [
      {
        name: 'STRIPE_API_KEY',
        label: 'Stripe Secret Key',
        type: 'password',
        placeholder: 'sk_live_...',
        helpUrl: 'https://dashboard.stripe.com/apikeys',
      },
    ],
    docsUrl: 'https://docs.stripe.com/mcp',
    tags: ['payments', 'billing', 'subscriptions', 'invoices'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Manage contacts, deals, companies, and tickets in HubSpot CRM',
    icon: 'Users',
    category: 'crm',
    authMethod: 'api_key',
    configTemplate: {
      transportType: 'http',
      url: 'https://app.hubspot.com/mcp/v1/http',
      toolPrefix: 'hubspot_',
    },
    requiredCredentials: [
      {
        name: 'HUBSPOT_ACCESS_TOKEN',
        label: 'HubSpot Access Token',
        type: 'password',
        placeholder: 'pat-...',
        helpUrl: 'https://developers.hubspot.com/docs/api/private-apps',
      },
    ],
    docsUrl: 'https://developers.hubspot.com',
    tags: ['crm', 'contacts', 'deals', 'sales'],
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Geocoding, directions, place search, and distance calculations',
    icon: 'MapPin',
    category: 'data',
    authMethod: 'api_key',
    configTemplate: {
      transportType: 'http',
      url: 'https://mapstools.googleapis.com/mcp',
      toolPrefix: 'maps_',
    },
    requiredCredentials: [
      {
        name: 'GOOGLE_MAPS_API_KEY',
        label: 'Google Maps API Key',
        type: 'password',
        placeholder: 'AIza...',
        helpUrl: 'https://console.cloud.google.com/apis/credentials',
      },
    ],
    docsUrl: 'https://developers.google.com/maps',
    tags: ['maps', 'geocoding', 'directions', 'places'],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Trigger automations and connect 7,000+ apps via Zapier workflows',
    icon: 'Zap',
    category: 'automation',
    authMethod: 'api_key',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.zapier.com/api/mcp/mcp',
      toolPrefix: 'zapier_',
    },
    requiredCredentials: [
      {
        name: 'ZAPIER_API_KEY',
        label: 'Zapier MCP API Key',
        type: 'password',
        placeholder: 'zap_...',
        helpUrl: 'https://actions.zapier.com/credentials',
      },
    ],
    docsUrl: 'https://actions.zapier.com/docs/platform/mcp',
    tags: ['automation', 'workflows', 'integrations', 'no-code'],
  },
  {
    id: 'telnyx',
    name: 'Telnyx',
    description: 'Send SMS, make calls, manage phone numbers, and voice applications',
    icon: 'Phone',
    category: 'communication',
    authMethod: 'api_key',
    configTemplate: {
      transportType: 'http',
      url: 'https://api.telnyx.com/v2/mcp',
      toolPrefix: 'telnyx_',
    },
    requiredCredentials: [
      {
        name: 'TELNYX_API_KEY',
        label: 'Telnyx API Key',
        type: 'password',
        placeholder: 'KEY...',
        helpUrl: 'https://portal.telnyx.com/#/app/api-keys',
      },
    ],
    docsUrl: 'https://developers.telnyx.com',
    tags: ['sms', 'voice', 'phone', 'telephony'],
  },
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    description: 'Process payments, manage orders, and handle refunds across Latin America',
    icon: 'CreditCard',
    category: 'payments',
    authMethod: 'api_key',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.mercadopago.com/mcp',
      toolPrefix: 'mp_',
    },
    requiredCredentials: [
      {
        name: 'MERCADOPAGO_ACCESS_TOKEN',
        label: 'Mercado Pago Access Token',
        type: 'password',
        placeholder: 'APP_USR-...',
        helpUrl: 'https://www.mercadopago.com/developers/en/docs/your-integrations/credentials',
      },
    ],
    docsUrl: 'https://www.mercadopago.com/developers',
    tags: ['payments', 'latam', 'checkout', 'orders'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OAUTH
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Developer Tools ────────────────────────────────────────────────────
  {
    id: 'github',
    name: 'GitHub',
    description: 'Manage repos, issues, pull requests, and code search on GitHub',
    icon: 'Github',
    category: 'developer',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'http',
      url: 'https://api.githubcopilot.com/mcp',
      toolPrefix: 'github_',
    },
    requiredCredentials: [
      {
        name: 'GITHUB_ACCESS_TOKEN',
        label: 'GitHub Personal Access Token',
        type: 'password',
        placeholder: 'ghp_...',
        helpUrl: 'https://github.com/settings/tokens',
      },
    ],
    docsUrl: 'https://docs.github.com/en/copilot/using-github-copilot/using-extensions-to-integrate-external-tools-with-copilot-chat',
    tags: ['git', 'code', 'issues', 'pull-requests'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Manage issues, projects, cycles, and team workflows in Linear',
    icon: 'LayoutList',
    category: 'developer',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.linear.app/sse',
      toolPrefix: 'linear_',
    },
    requiredCredentials: [
      {
        name: 'LINEAR_ACCESS_TOKEN',
        label: 'Linear Access Token',
        type: 'password',
        placeholder: 'lin_api_...',
        helpUrl: 'https://linear.app/settings/api',
      },
    ],
    docsUrl: 'https://developers.linear.app',
    tags: ['issues', 'projects', 'sprints', 'tracking'],
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    description: 'Manage Jira issues, Confluence pages, and project workflows',
    icon: 'LayoutList',
    category: 'developer',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.atlassian.com/v1/sse',
      toolPrefix: 'atlassian_',
    },
    requiredCredentials: [
      {
        name: 'ATLASSIAN_API_TOKEN',
        label: 'Atlassian API Token',
        type: 'password',
        placeholder: 'ATATT...',
        helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
      },
    ],
    docsUrl: 'https://developer.atlassian.com',
    tags: ['jira', 'confluence', 'issues', 'wiki', 'project-management'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Monitor errors, query issues, and analyze application performance',
    icon: 'Bug',
    category: 'developer',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.sentry.dev/sse',
      toolPrefix: 'sentry_',
    },
    requiredCredentials: [
      {
        name: 'SENTRY_AUTH_TOKEN',
        label: 'Sentry Auth Token',
        type: 'password',
        placeholder: 'sntrys_...',
        helpUrl: 'https://sentry.io/settings/account/api/auth-tokens/',
      },
    ],
    docsUrl: 'https://docs.sentry.io',
    tags: ['errors', 'monitoring', 'performance', 'debugging'],
  },
  {
    id: 'buildkite',
    name: 'Buildkite',
    description: 'Manage CI/CD pipelines, trigger builds, and view build logs',
    icon: 'Cog',
    category: 'developer',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.buildkite.com/mcp',
      toolPrefix: 'buildkite_',
    },
    requiredCredentials: [
      {
        name: 'BUILDKITE_API_TOKEN',
        label: 'Buildkite API Token',
        type: 'password',
        placeholder: 'bkua_...',
        helpUrl: 'https://buildkite.com/user/api-access-tokens',
      },
    ],
    docsUrl: 'https://buildkite.com/docs/apis',
    tags: ['ci', 'cd', 'builds', 'pipelines', 'deployment'],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Manage Workers, KV storage, R2 buckets, and DNS configurations',
    icon: 'Cloud',
    category: 'developer',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://bindings.mcp.cloudflare.com/sse',
      toolPrefix: 'cf_',
    },
    requiredCredentials: [
      {
        name: 'CLOUDFLARE_API_TOKEN',
        label: 'Cloudflare API Token',
        type: 'password',
        placeholder: '',
        helpUrl: 'https://dash.cloudflare.com/profile/api-tokens',
      },
    ],
    docsUrl: 'https://developers.cloudflare.com',
    tags: ['cdn', 'workers', 'dns', 'edge', 'infrastructure'],
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Manage serverless Postgres databases, branches, and connection pooling',
    icon: 'Database',
    category: 'data',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.neon.tech/mcp',
      toolPrefix: 'neon_',
    },
    requiredCredentials: [
      {
        name: 'NEON_API_KEY',
        label: 'Neon API Key',
        type: 'password',
        placeholder: 'neon_...',
        helpUrl: 'https://console.neon.tech/app/settings/api-keys',
      },
    ],
    docsUrl: 'https://neon.tech/docs',
    tags: ['postgres', 'database', 'serverless', 'branching'],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Manage Postgres databases, auth, storage, and edge functions',
    icon: 'Database',
    category: 'data',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.supabase.com/mcp',
      toolPrefix: 'supabase_',
    },
    requiredCredentials: [
      {
        name: 'SUPABASE_ACCESS_TOKEN',
        label: 'Supabase Access Token',
        type: 'password',
        placeholder: 'sbp_...',
        helpUrl: 'https://supabase.com/dashboard/account/tokens',
      },
    ],
    docsUrl: 'https://supabase.com/docs',
    tags: ['postgres', 'database', 'auth', 'storage', 'realtime'],
  },

  // ─── Productivity ───────────────────────────────────────────────────────
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search, read, and create pages and databases in Notion workspaces',
    icon: 'BookOpen',
    category: 'productivity',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.notion.com/sse',
      toolPrefix: 'notion_',
    },
    requiredCredentials: [
      {
        name: 'NOTION_API_KEY',
        label: 'Notion Integration Token',
        type: 'password',
        placeholder: 'ntn_...',
        helpUrl: 'https://www.notion.so/my-integrations',
      },
    ],
    docsUrl: 'https://developers.notion.com',
    tags: ['wiki', 'notes', 'databases', 'pages'],
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Manage projects, tasks, milestones, and team workloads in Asana',
    icon: 'LayoutList',
    category: 'productivity',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.asana.com/sse',
      toolPrefix: 'asana_',
    },
    requiredCredentials: [
      {
        name: 'ASANA_ACCESS_TOKEN',
        label: 'Asana Personal Access Token',
        type: 'password',
        placeholder: '1/...',
        helpUrl: 'https://app.asana.com/0/developer-console',
      },
    ],
    docsUrl: 'https://developers.asana.com',
    tags: ['tasks', 'projects', 'milestones', 'project-management'],
  },
  {
    id: 'box',
    name: 'Box',
    description: 'Search, read, and manage files and folders in Box cloud storage',
    icon: 'FolderOpen',
    category: 'productivity',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.box.com',
      toolPrefix: 'box_',
    },
    requiredCredentials: [
      {
        name: 'BOX_DEVELOPER_TOKEN',
        label: 'Box Developer Token',
        type: 'password',
        placeholder: '',
        helpUrl: 'https://developer.box.com/guides/authentication/',
      },
    ],
    docsUrl: 'https://developer.box.com',
    tags: ['files', 'documents', 'storage', 'collaboration'],
  },

  // ─── Communication ──────────────────────────────────────────────────────
  {
    id: 'intercom',
    name: 'Intercom',
    description: 'Manage customer conversations, contacts, and help center articles',
    icon: 'MessageSquare',
    category: 'communication',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.intercom.com/sse',
      toolPrefix: 'intercom_',
    },
    requiredCredentials: [
      {
        name: 'INTERCOM_ACCESS_TOKEN',
        label: 'Intercom Access Token',
        type: 'password',
        placeholder: 'dG9r...',
        helpUrl: 'https://developers.intercom.com/docs/build-an-integration/learn-more/authentication',
      },
    ],
    docsUrl: 'https://developers.intercom.com',
    tags: ['chat', 'support', 'customers', 'messaging'],
  },

  // ─── Payments ───────────────────────────────────────────────────────────
  {
    id: 'paypal',
    name: 'PayPal',
    description: 'Process payments, manage orders, subscriptions, and payouts via PayPal',
    icon: 'CreditCard',
    category: 'payments',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.paypal.com/sse',
      toolPrefix: 'paypal_',
    },
    requiredCredentials: [
      {
        name: 'PAYPAL_ACCESS_TOKEN',
        label: 'PayPal Access Token',
        type: 'password',
        placeholder: 'A21AAF...',
        helpUrl: 'https://developer.paypal.com/api/rest/',
      },
    ],
    docsUrl: 'https://developer.paypal.com',
    tags: ['payments', 'checkout', 'orders', 'subscriptions'],
  },
  {
    id: 'square',
    name: 'Square',
    description: 'Manage payments, catalog items, customers, and inventory with Square',
    icon: 'CreditCard',
    category: 'payments',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.squareup.com/sse',
      toolPrefix: 'square_',
    },
    requiredCredentials: [
      {
        name: 'SQUARE_ACCESS_TOKEN',
        label: 'Square Access Token',
        type: 'password',
        placeholder: 'EAAAl...',
        helpUrl: 'https://developer.squareup.com/apps',
      },
    ],
    docsUrl: 'https://developer.squareup.com/docs',
    tags: ['payments', 'pos', 'inventory', 'catalog'],
  },
  {
    id: 'ramp',
    name: 'Ramp',
    description: 'Manage corporate cards, expenses, reimbursements, and spend controls',
    icon: 'CreditCard',
    category: 'payments',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'http',
      url: 'https://ramp-mcp-remote.ramp.com/mcp',
      toolPrefix: 'ramp_',
    },
    requiredCredentials: [
      {
        name: 'RAMP_CLIENT_ID',
        label: 'Ramp Client ID',
        type: 'text',
        placeholder: '',
        helpUrl: 'https://docs.ramp.com/developer-api',
      },
    ],
    docsUrl: 'https://docs.ramp.com',
    tags: ['expenses', 'cards', 'finance', 'spend-management'],
  },

  // ─── Design ─────────────────────────────────────────────────────────────
  {
    id: 'canva',
    name: 'Canva',
    description: 'Create and manage designs, templates, and brand assets in Canva',
    icon: 'Palette',
    category: 'design',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'http',
      url: 'https://mcp.canva.com/mcp',
      toolPrefix: 'canva_',
    },
    requiredCredentials: [
      {
        name: 'CANVA_ACCESS_TOKEN',
        label: 'Canva Access Token',
        type: 'password',
        placeholder: '',
        helpUrl: 'https://www.canva.dev/docs/connect/quick-start/',
      },
    ],
    docsUrl: 'https://www.canva.dev/docs',
    tags: ['design', 'graphics', 'templates', 'brand'],
  },
  {
    id: 'webflow',
    name: 'Webflow',
    description: 'Manage sites, CMS collections, and publish web content via Webflow',
    icon: 'Globe',
    category: 'design',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.webflow.com/sse',
      toolPrefix: 'webflow_',
    },
    requiredCredentials: [
      {
        name: 'WEBFLOW_API_TOKEN',
        label: 'Webflow API Token',
        type: 'password',
        placeholder: '',
        helpUrl: 'https://developers.webflow.com/data/reference/authorization',
      },
    ],
    docsUrl: 'https://developers.webflow.com',
    tags: ['web', 'cms', 'design', 'publishing'],
  },
  {
    id: 'wix',
    name: 'Wix',
    description: 'Manage Wix sites, blogs, stores, and business solutions',
    icon: 'Globe',
    category: 'design',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://mcp.wix.com/sse',
      toolPrefix: 'wix_',
    },
    requiredCredentials: [
      {
        name: 'WIX_API_KEY',
        label: 'Wix API Key',
        type: 'password',
        placeholder: 'IST...',
        helpUrl: 'https://dev.wix.com/docs/rest/getting-started/api-keys',
      },
    ],
    docsUrl: 'https://dev.wix.com',
    tags: ['web', 'ecommerce', 'design', 'hosting'],
  },

  // ─── Data & Assets ──────────────────────────────────────────────────────
  {
    id: 'cloudinary',
    name: 'Cloudinary',
    description: 'Upload, transform, and manage images, videos, and media assets',
    icon: 'Image',
    category: 'data',
    authMethod: 'oauth',
    configTemplate: {
      transportType: 'sse',
      url: 'https://asset-management.mcp.cloudinary.com/sse',
      toolPrefix: 'cloudinary_',
    },
    requiredCredentials: [
      {
        name: 'CLOUDINARY_API_KEY',
        label: 'Cloudinary API Key',
        type: 'password',
        placeholder: '',
        helpUrl: 'https://cloudinary.com/console',
      },
    ],
    docsUrl: 'https://cloudinary.com/documentation',
    tags: ['images', 'video', 'media', 'cdn', 'assets'],
  },
];

/**
 * Get all MCP library entries.
 */
export function getMCPLibrary(): MCPLibraryEntry[] {
  return MCP_LIBRARY;
}

/**
 * Get an MCP library entry by ID.
 */
export function getMCPLibraryEntry(id: string): MCPLibraryEntry | undefined {
  return MCP_LIBRARY.find((entry) => entry.id === id);
}

/**
 * Get MCP library entries by category.
 */
export function getMCPLibraryByCategory(category: MCPCategory): MCPLibraryEntry[] {
  return MCP_LIBRARY.filter((entry) => entry.category === category);
}

/**
 * Search MCP library entries by query string.
 */
export function searchMCPLibrary(query: string): MCPLibraryEntry[] {
  const q = query.toLowerCase();
  return MCP_LIBRARY.filter(
    (entry) =>
      entry.name.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.tags.some((tag) => tag.includes(q))
  );
}
