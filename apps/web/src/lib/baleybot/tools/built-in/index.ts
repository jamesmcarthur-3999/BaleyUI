/**
 * Built-in Tools for BaleyBots
 *
 * These tools are always available to BaleyBots. They provide core functionality
 * like web search, URL fetching, inter-BB communication, notifications, and memory.
 */


// ============================================================================
// TOOL SCHEMAS (JSON Schema format for AI tool calling)
// ============================================================================

export const WEB_SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The search query',
    },
    num_results: {
      type: 'number',
      description: 'Number of results to return (default: 5, max: 20)',
      default: 5,
      minimum: 1,
      maximum: 20,
    },
    // NEW: Expose @baleybots/tools features
    search_depth: {
      type: 'string',
      enum: ['basic', 'advanced'],
      description: 'Search depth: basic (faster) or advanced (more relevant)',
      default: 'basic',
    },
    topic: {
      type: 'string',
      enum: ['general', 'news'],
      description: 'Topic category: general or news for real-time updates',
    },
    time_range: {
      type: 'string',
      enum: ['day', 'week', 'month', 'year'],
      description: 'Filter results by publish date',
    },
    include_answer: {
      type: 'boolean',
      description: 'Include AI-generated answer summarizing search results',
      default: false,
    },
    include_images: {
      type: 'boolean',
      description: 'Include image results',
      default: false,
    },
    include_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only search these specific domains',
    },
    exclude_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exclude these domains from results',
    },
  },
  required: ['query'],
} as const;

export const FETCH_URL_SCHEMA = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
      description: 'The URL to fetch content from',
      format: 'uri',
    },
    format: {
      type: 'string',
      enum: ['html', 'text', 'json'],
      description: 'Output format (default: text)',
      default: 'text',
    },
  },
  required: ['url'],
} as const;

export const SPAWN_BALEYBOT_SCHEMA = {
  type: 'object',
  properties: {
    baleybot: {
      type: 'string',
      description: 'BaleyBot name or ID to execute',
    },
    input: {
      description: 'Input to pass to the BaleyBot',
    },
  },
  required: ['baleybot'],
} as const;

export const SEND_NOTIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Notification title',
    },
    message: {
      type: 'string',
      description: 'Notification body text',
    },
    priority: {
      type: 'string',
      enum: ['low', 'normal', 'high'],
      description: 'Notification priority (default: normal)',
      default: 'normal',
    },
  },
  required: ['title', 'message'],
} as const;

export const SCHEDULE_TASK_SCHEMA = {
  type: 'object',
  properties: {
    baleybot: {
      type: 'string',
      description: 'BaleyBot name or ID to schedule (defaults to current BB)',
    },
    run_at: {
      type: 'string',
      description: 'When to run: ISO datetime string or cron expression',
    },
    input: {
      description: 'Input to pass when the task runs',
    },
  },
  required: ['run_at'],
} as const;

export const STORE_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['get', 'set', 'delete', 'list'],
      description: 'Memory operation to perform',
    },
    key: {
      type: 'string',
      description: 'Memory key (required for get, set, delete)',
    },
    value: {
      description: 'Value to store (required for set action)',
    },
  },
  required: ['action'],
} as const;

export const CREATE_AGENT_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Identifier for the temporary agent',
    },
    goal: {
      type: 'string',
      description: 'What the agent should accomplish',
    },
    model: {
      type: 'string',
      description: 'Model to use (e.g., "anthropic:claude-sonnet-4-20250514")',
    },
    tools: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tool names this agent can use',
    },
  },
  required: ['name', 'goal'],
} as const;

export const CREATE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Tool identifier',
    },
    description: {
      type: 'string',
      description: 'What the tool does',
    },
    input_schema: {
      type: 'object',
      description: 'JSON Schema for tool inputs',
    },
    implementation: {
      type: 'string',
      description: 'Natural language description of the tool behavior',
    },
  },
  required: ['name', 'description', 'implementation'],
} as const;

import { REQUEST_USER_INPUT_SCHEMA } from './request-user-input';
export { REQUEST_USER_INPUT_SCHEMA };

export const SHARED_STORAGE_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['write', 'read', 'delete', 'list'],
      description: 'Storage operation to perform',
    },
    key: {
      type: 'string',
      description: 'Storage key (required for write, read, delete)',
    },
    value: {
      description: 'Value to store (required for write action)',
    },
    ttl_seconds: {
      type: 'number',
      description: 'Time-to-live in seconds (optional, for write action)',
    },
    prefix: {
      type: 'string',
      description: 'Key prefix filter (optional, for list action)',
    },
  },
  required: ['action'],
} as const;

// ============================================================================
// TOOL METADATA
// ============================================================================

import type { ToolRequirement, ToolExample } from '../../types';

export interface BuiltInToolMetadata {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category: string;
  dangerLevel: 'safe' | 'moderate' | 'dangerous';
  approvalRequired: boolean;
  capabilities: string[];
  /** SDK-aligned read/write/both classification */
  capability: 'read' | 'write' | 'both';
  /** What this tool needs to work */
  requirements: ToolRequirement[];
  /** Searchable tags */
  tags: string[];
  /** Usage examples for AI context */
  examples: ToolExample[];
}

/**
 * Metadata for all built-in tools.
 * This is used by the tool catalog to provide tool information to the Creator Bot.
 */
export const BUILT_IN_TOOLS_METADATA: BuiltInToolMetadata[] = [
  {
    name: 'web_search',
    description: 'Search the web for information using Tavily search API. Requires a Tavily API key (TAVILY_API_KEY). Returns search results with titles, URLs, and snippets. If no API key is configured, this tool will not return results — use fetch_url as an alternative.',
    inputSchema: WEB_SEARCH_SCHEMA,
    category: 'information',
    dangerLevel: 'safe',
    approvalRequired: false,
    capabilities: ['read'],
    capability: 'read',
    requirements: [
      { type: 'api_key', description: 'Tavily API key (TAVILY_API_KEY) — required. Get a free key at https://tavily.com' },
    ],
    tags: ['search', 'web', 'information', 'research'],
    examples: [
      { input: { query: 'latest AI news' }, description: 'Search for recent AI news articles' },
      { input: { query: 'React hooks tutorial', num_results: 3 }, description: 'Find React tutorials with limited results' },
    ],
  },
  {
    name: 'fetch_url',
    description: 'Fetch content from a URL. Supports HTML, text, and JSON formats. Useful for reading web pages, APIs, or documents.',
    inputSchema: FETCH_URL_SCHEMA,
    category: 'information',
    dangerLevel: 'safe',
    approvalRequired: false,
    capabilities: ['read'],
    capability: 'read',
    requirements: [],
    tags: ['web', 'http', 'api', 'scraping', 'read'],
    examples: [
      { input: { url: 'https://api.example.com/data', format: 'json' }, description: 'Fetch JSON data from an API endpoint' },
      { input: { url: 'https://example.com/page', format: 'text' }, description: 'Extract text content from a web page' },
    ],
  },
  {
    name: 'spawn_baleybot',
    description: 'Execute another BaleyBot and return its result. Use this to delegate work to specialized BaleyBots or chain multiple BBs together.',
    inputSchema: SPAWN_BALEYBOT_SCHEMA,
    category: 'orchestration',
    dangerLevel: 'safe',
    approvalRequired: false,
    capabilities: ['execute'],
    capability: 'both',
    requirements: [],
    tags: ['orchestration', 'delegation', 'chain', 'multi-bot'],
    examples: [
      { input: { baleybot: 'data_analyzer', input: 'Summarize Q4 sales data' }, description: 'Delegate data analysis to a specialized bot' },
    ],
  },
  {
    name: 'send_notification',
    description: 'Send an in-app notification to the user. Use for alerts, status updates, or important information that the user should see.',
    inputSchema: SEND_NOTIFICATION_SCHEMA,
    category: 'notification',
    dangerLevel: 'safe',
    approvalRequired: false,
    capabilities: ['write'],
    capability: 'write',
    requirements: [],
    tags: ['notification', 'alert', 'communication', 'user'],
    examples: [
      { input: { title: 'Task Complete', message: 'Data export finished', priority: 'normal' }, description: 'Notify user of completed task' },
    ],
  },
  {
    name: 'schedule_task',
    description: 'Schedule a BaleyBot to run at a specific time or on a cron schedule. Useful for delayed or recurring tasks.',
    inputSchema: SCHEDULE_TASK_SCHEMA,
    category: 'orchestration',
    dangerLevel: 'moderate',
    approvalRequired: true,
    capabilities: ['write', 'execute'],
    capability: 'write',
    requirements: [
      { type: 'permission', description: 'Schedule tasks approval' },
    ],
    tags: ['scheduling', 'cron', 'automation', 'recurring'],
    examples: [
      { input: { run_at: '0 9 * * 1', input: 'Generate weekly report' }, description: 'Schedule a weekly report every Monday at 9am' },
    ],
  },
  {
    name: 'store_memory',
    description: 'Persist key-value data that survives across BaleyBot executions. Use for storing state, preferences, or cached data.',
    inputSchema: STORE_MEMORY_SCHEMA,
    category: 'storage',
    dangerLevel: 'safe',
    approvalRequired: false,
    capabilities: ['read', 'write', 'delete'],
    capability: 'both',
    requirements: [],
    tags: ['storage', 'memory', 'state', 'persistence', 'cache'],
    examples: [
      { input: { action: 'set', key: 'last_run', value: '2026-01-15' }, description: 'Store a timestamp for later use' },
      { input: { action: 'get', key: 'user_preferences' }, description: 'Retrieve stored user preferences' },
    ],
  },
  {
    name: 'create_agent',
    description: 'Create a temporary specialized AI agent for a specific task. The agent exists only for the current execution unless promoted.',
    inputSchema: CREATE_AGENT_SCHEMA,
    category: 'orchestration',
    dangerLevel: 'moderate',
    approvalRequired: true,
    capabilities: ['execute'],
    capability: 'write',
    requirements: [
      { type: 'permission', description: 'Create agent approval' },
    ],
    tags: ['agent', 'ephemeral', 'dynamic', 'orchestration'],
    examples: [
      { input: { name: 'code_reviewer', goal: 'Review pull request for security issues', tools: ['fetch_url'] }, description: 'Create a code review agent' },
    ],
  },
  {
    name: 'create_tool',
    description: 'Define a custom tool for the current execution. The tool behavior is described in natural language and interpreted by AI.',
    inputSchema: CREATE_TOOL_SCHEMA,
    category: 'orchestration',
    dangerLevel: 'moderate',
    approvalRequired: true,
    capabilities: ['execute'],
    capability: 'write',
    requirements: [
      { type: 'permission', description: 'Create tool approval' },
    ],
    tags: ['tool', 'ephemeral', 'dynamic', 'custom'],
    examples: [
      { input: { name: 'format_csv', description: 'Convert JSON to CSV', implementation: 'Take JSON input and output comma-separated values' }, description: 'Create a CSV formatter tool' },
    ],
  },
  {
    name: 'shared_storage',
    description: 'Read and write workspace-scoped shared data. Other BaleyBots in the same workspace can access this data, enabling cross-BB async communication.',
    inputSchema: SHARED_STORAGE_SCHEMA,
    category: 'storage',
    dangerLevel: 'safe',
    approvalRequired: false,
    capabilities: ['read', 'write', 'delete'],
    capability: 'both',
    requirements: [],
    tags: ['storage', 'shared', 'cross-bot', 'communication', 'async'],
    examples: [
      { input: { action: 'write', key: 'pipeline_result', value: { status: 'done' } }, description: 'Share results across bots' },
      { input: { action: 'list', prefix: 'cache_' }, description: 'List all cached items' },
    ],
  },
  {
    name: 'request_user_input',
    description: 'Ask the user a question and wait for their response. Use this to gather information mid-execution when you need clarification or a decision from the user.',
    inputSchema: REQUEST_USER_INPUT_SCHEMA as Record<string, unknown>,
    category: 'interaction',
    dangerLevel: 'safe',
    approvalRequired: false,
    capabilities: ['read'],
    capability: 'read',
    requirements: [],
    tags: ['interaction', 'user', 'input', 'question', 'clarification'],
    examples: [
      { input: { question: 'Which database should I query?', options: ['Production', 'Staging'] }, description: 'Ask user to choose a database' },
    ],
  },
];

// ============================================================================
// TOOL RESULT TYPES
// ============================================================================

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface FetchUrlResult {
  content: string;
  contentType: string;
  statusCode: number;
}

export interface SpawnBaleybotResult {
  output: unknown;
  executionId: string;
  durationMs: number;
}

export interface SendNotificationResult {
  sent: boolean;
  notification_id: string;
}

export interface ScheduleTaskResult {
  scheduled: boolean;
  task_id: string;
  run_at: string;
}

export interface StoreMemoryResult {
  success: boolean;
  value?: unknown;
  keys?: string[];
}

export interface CreateAgentResult {
  output: unknown;
  agentName: string;
}

export interface CreateToolResult {
  created: boolean;
  tool_name: string;
}

export type { RequestUserInputResult } from './request-user-input';

// ============================================================================
// TOOL CONTEXT (passed to tool implementations)
// ============================================================================

/**
 * Context provided to built-in tool implementations.
 * This allows tools to access workspace data, database, etc.
 *
 * NOTE: All ID fields must be valid UUIDs as they are used as foreign keys
 * in the database. Passing non-UUID strings will cause database errors.
 */
export interface BuiltInToolContext {
  /** Workspace UUID - must be a valid UUID from the workspaces table */
  workspaceId: string;
  /** BaleyBot UUID - must be a valid UUID from the baleybots table */
  baleybotId: string;
  /** Execution UUID - must be a valid UUID from the baleybot_executions table */
  executionId: string;
  /** User ID from authentication provider */
  userId?: string;
}

// ============================================================================
// TOOL IMPLEMENTATION TYPE
// ============================================================================

export type BuiltInToolFunction<TInput, TOutput> = (
  args: TInput,
  ctx: BuiltInToolContext
) => Promise<TOutput>;

// ============================================================================
// HELPER: Convert metadata to ToolDefinition format
// ============================================================================

/**
 * Convert built-in tool metadata to the enriched ToolDefinition format.
 * Populates source, healthStatus, tags, requirements, examples, and capability.
 */
export function getBuiltInToolDefinitions(): Array<import('../../types').ToolDefinition> {
  return BUILT_IN_TOOLS_METADATA.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Record<string, unknown>,
    category: tool.category,
    dangerLevel: tool.dangerLevel,
    capabilities: tool.capabilities,
    // Enrichment fields
    capability: tool.capability,
    requirements: tool.requirements,
    tags: tool.tags,
    examples: tool.examples,
    source: { kind: 'built-in' as const },
    healthStatus: tool.requirements.length === 0 ? ('ready' as const) : ('unknown' as const),
  }));
}

/**
 * Get list of tools that require approval
 */
export function getApprovalRequiredTools(): string[] {
  return BUILT_IN_TOOLS_METADATA
    .filter((tool) => tool.approvalRequired)
    .map((tool) => tool.name);
}

/**
 * Check if a tool is a built-in tool
 */
export function isBuiltInTool(toolName: string): boolean {
  return BUILT_IN_TOOLS_METADATA.some((tool) => tool.name === toolName);
}

/**
 * Get metadata for a specific built-in tool
 */
export function getBuiltInToolMetadata(toolName: string): BuiltInToolMetadata | undefined {
  return BUILT_IN_TOOLS_METADATA.find((tool) => tool.name === toolName);
}
