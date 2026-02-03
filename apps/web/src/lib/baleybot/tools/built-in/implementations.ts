/**
 * Built-in Tool Implementations
 *
 * This file contains the actual implementations for all built-in tools.
 * Each tool function receives arguments and a context object with workspace info.
 */

import type { RuntimeToolDefinition } from '../../executor';
import type {
  BuiltInToolContext,
  WebSearchResult,
  FetchUrlResult,
  SpawnBaleybotResult,
  SendNotificationResult,
  ScheduleTaskResult,
  StoreMemoryResult,
  CreateAgentResult,
  CreateToolResult,
} from './index';

// Re-export BuiltInToolContext for use by catalog-service
export type { BuiltInToolContext } from './index';
import {
  WEB_SEARCH_SCHEMA,
  FETCH_URL_SCHEMA,
  SPAWN_BALEYBOT_SCHEMA,
  SEND_NOTIFICATION_SCHEMA,
  SCHEDULE_TASK_SCHEMA,
  STORE_MEMORY_SCHEMA,
  CREATE_AGENT_SCHEMA,
  CREATE_TOOL_SCHEMA,
  BUILT_IN_TOOLS_METADATA,
} from './index';

// ============================================================================
// WEB SEARCH
// ============================================================================

interface WebSearchArgs {
  query: string;
  num_results?: number;
}

async function webSearchImpl(
  args: WebSearchArgs,
  ctx: BuiltInToolContext
): Promise<WebSearchResult[]> {
  const numResults = Math.min(args.num_results ?? 5, 20);

  // TODO: Integrate with Tavily API or similar search service
  // For now, return a placeholder indicating the tool needs configuration
  console.log(`[web_search] Searching for: "${args.query}" (limit: ${numResults})`);

  // In production, this would call Tavily API:
  // const response = await fetch('https://api.tavily.com/search', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${apiKey}`,
  //   },
  //   body: JSON.stringify({
  //     query: args.query,
  //     max_results: numResults,
  //   }),
  // });

  // Placeholder response
  return [
    {
      title: `Search results for: ${args.query}`,
      url: 'https://example.com/search',
      snippet: 'Web search requires Tavily API configuration. Please add a Tavily API key to your workspace settings.',
    },
  ];
}

// ============================================================================
// FETCH URL
// ============================================================================

interface FetchUrlArgs {
  url: string;
  format?: 'html' | 'text' | 'json';
}

async function fetchUrlImpl(
  args: FetchUrlArgs,
  ctx: BuiltInToolContext
): Promise<FetchUrlResult> {
  const format = args.format ?? 'text';

  try {
    const response = await fetch(args.url, {
      headers: {
        'User-Agent': 'BaleyBot/1.0',
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      return {
        content: `Error fetching URL: HTTP ${response.status} ${response.statusText}`,
        contentType: 'text/plain',
        statusCode: response.status,
      };
    }

    const contentType = response.headers.get('content-type') || 'text/plain';
    let content: string;

    if (format === 'json') {
      const json = await response.json();
      content = JSON.stringify(json, null, 2);
    } else if (format === 'html') {
      content = await response.text();
    } else {
      // text format - strip HTML tags for cleaner output
      const html = await response.text();
      content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Truncate very long content
    const maxLength = 50000;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '\n\n[Content truncated...]';
    }

    return {
      content,
      contentType,
      statusCode: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: `Error fetching URL: ${message}`,
      contentType: 'text/plain',
      statusCode: 0,
    };
  }
}

// ============================================================================
// SPAWN BALEYBOT
// ============================================================================

interface SpawnBaleybotArgs {
  baleybot: string;
  input?: unknown;
}

// This will be injected at runtime with actual execution capability
type SpawnBaleybotExecutor = (
  baleybotIdOrName: string,
  input: unknown,
  ctx: BuiltInToolContext
) => Promise<SpawnBaleybotResult>;

let spawnBaleybotExecutor: SpawnBaleybotExecutor | null = null;

export function setSpawnBaleybotExecutor(executor: SpawnBaleybotExecutor): void {
  spawnBaleybotExecutor = executor;
}

async function spawnBaleybotImpl(
  args: SpawnBaleybotArgs,
  ctx: BuiltInToolContext
): Promise<SpawnBaleybotResult> {
  if (!spawnBaleybotExecutor) {
    throw new Error('spawn_baleybot executor not configured');
  }

  return spawnBaleybotExecutor(args.baleybot, args.input, ctx);
}

// ============================================================================
// SEND NOTIFICATION
// ============================================================================

interface SendNotificationArgs {
  title: string;
  message: string;
  priority?: 'low' | 'normal' | 'high';
}

// This will be injected at runtime with actual notification capability
type NotificationSender = (
  notification: { title: string; message: string; priority: string },
  ctx: BuiltInToolContext
) => Promise<SendNotificationResult>;

let notificationSender: NotificationSender | null = null;

export function setNotificationSender(sender: NotificationSender): void {
  notificationSender = sender;
}

async function sendNotificationImpl(
  args: SendNotificationArgs,
  ctx: BuiltInToolContext
): Promise<SendNotificationResult> {
  const priority = args.priority ?? 'normal';

  if (!notificationSender) {
    // Fallback: log the notification
    console.log(`[send_notification] ${priority.toUpperCase()}: ${args.title} - ${args.message}`);
    return {
      sent: true,
      notification_id: `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };
  }

  return notificationSender(
    { title: args.title, message: args.message, priority },
    ctx
  );
}

// ============================================================================
// SCHEDULE TASK
// ============================================================================

interface ScheduleTaskArgs {
  baleybot?: string;
  run_at: string;
  input?: unknown;
}

// This will be injected at runtime with actual scheduling capability
type TaskScheduler = (
  task: { baleybotIdOrName: string; runAt: string; input: unknown },
  ctx: BuiltInToolContext
) => Promise<ScheduleTaskResult>;

let taskScheduler: TaskScheduler | null = null;

export function setTaskScheduler(scheduler: TaskScheduler): void {
  taskScheduler = scheduler;
}

async function scheduleTaskImpl(
  args: ScheduleTaskArgs,
  ctx: BuiltInToolContext
): Promise<ScheduleTaskResult> {
  if (!taskScheduler) {
    throw new Error('schedule_task scheduler not configured');
  }

  return taskScheduler(
    {
      baleybotIdOrName: args.baleybot ?? ctx.baleybotId,
      runAt: args.run_at,
      input: args.input,
    },
    ctx
  );
}

// ============================================================================
// STORE MEMORY
// ============================================================================

interface StoreMemoryArgs {
  action: 'get' | 'set' | 'delete' | 'list';
  key?: string;
  value?: unknown;
}

// This will be injected at runtime with actual storage capability
type MemoryStorage = {
  get: (key: string, ctx: BuiltInToolContext) => Promise<unknown>;
  set: (key: string, value: unknown, ctx: BuiltInToolContext) => Promise<void>;
  delete: (key: string, ctx: BuiltInToolContext) => Promise<void>;
  list: (ctx: BuiltInToolContext) => Promise<string[]>;
};

let memoryStorage: MemoryStorage | null = null;

export function setMemoryStorage(storage: MemoryStorage): void {
  memoryStorage = storage;
}

async function storeMemoryImpl(
  args: StoreMemoryArgs,
  ctx: BuiltInToolContext
): Promise<StoreMemoryResult> {
  if (!memoryStorage) {
    throw new Error('store_memory storage not configured');
  }

  switch (args.action) {
    case 'get': {
      if (!args.key) {
        throw new Error('Key required for get action');
      }
      const value = await memoryStorage.get(args.key, ctx);
      return { success: true, value };
    }
    case 'set': {
      if (!args.key) {
        throw new Error('Key required for set action');
      }
      if (args.value === undefined) {
        throw new Error('Value required for set action');
      }
      await memoryStorage.set(args.key, args.value, ctx);
      return { success: true };
    }
    case 'delete': {
      if (!args.key) {
        throw new Error('Key required for delete action');
      }
      await memoryStorage.delete(args.key, ctx);
      return { success: true };
    }
    case 'list': {
      const keys = await memoryStorage.list(ctx);
      return { success: true, keys };
    }
    default:
      throw new Error(`Unknown action: ${args.action}`);
  }
}

// ============================================================================
// CREATE AGENT (Phase 8 - placeholder for now)
// ============================================================================

interface CreateAgentArgs {
  name: string;
  goal: string;
  model?: string;
  tools?: string[];
}

async function createAgentImpl(
  args: CreateAgentArgs,
  ctx: BuiltInToolContext
): Promise<CreateAgentResult> {
  // Phase 8 implementation - for now, return a placeholder
  console.log(`[create_agent] Would create agent: ${args.name} with goal: ${args.goal}`);

  return {
    output: {
      message: 'create_agent is planned for Phase 8. The agent would be created with the specified configuration.',
      agentConfig: args,
    },
    agentName: args.name,
  };
}

// ============================================================================
// CREATE TOOL (Phase 8 - placeholder for now)
// ============================================================================

interface CreateToolArgs {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
  implementation: string;
}

async function createToolImpl(
  args: CreateToolArgs,
  ctx: BuiltInToolContext
): Promise<CreateToolResult> {
  // Phase 8 implementation - for now, return a placeholder
  console.log(`[create_tool] Would create tool: ${args.name} - ${args.description}`);

  return {
    created: false,
    tool_name: args.name,
  };
}

// ============================================================================
// EXPORT: Create RuntimeToolDefinition for executor
// ============================================================================

/**
 * Create a RuntimeToolDefinition for a built-in tool.
 * The function is bound to the provided context.
 */
function createRuntimeTool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  impl: (args: Record<string, unknown>, ctx: BuiltInToolContext) => Promise<unknown>,
  ctx: BuiltInToolContext
): RuntimeToolDefinition {
  const metadata = BUILT_IN_TOOLS_METADATA.find((t) => t.name === name);

  return {
    name,
    description,
    inputSchema,
    function: async (args: Record<string, unknown>) => impl(args, ctx),
    category: metadata?.category,
    dangerLevel: metadata?.dangerLevel,
  };
}

/**
 * Get all built-in tools as RuntimeToolDefinitions, bound to the provided context.
 */
export function getBuiltInRuntimeTools(ctx: BuiltInToolContext): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  // Helper to wrap typed implementations as generic tool functions
  const wrapImpl = <T>(impl: (args: T, ctx: BuiltInToolContext) => Promise<unknown>) => {
    return (args: Record<string, unknown>, ctx: BuiltInToolContext) => impl(args as T, ctx);
  };

  tools.set('web_search', createRuntimeTool(
    'web_search',
    'Search the web for information',
    WEB_SEARCH_SCHEMA as Record<string, unknown>,
    wrapImpl<WebSearchArgs>(webSearchImpl),
    ctx
  ));

  tools.set('fetch_url', createRuntimeTool(
    'fetch_url',
    'Fetch content from a URL',
    FETCH_URL_SCHEMA as Record<string, unknown>,
    wrapImpl<FetchUrlArgs>(fetchUrlImpl),
    ctx
  ));

  tools.set('spawn_baleybot', createRuntimeTool(
    'spawn_baleybot',
    'Execute another BaleyBot and return its result',
    SPAWN_BALEYBOT_SCHEMA as Record<string, unknown>,
    wrapImpl<SpawnBaleybotArgs>(spawnBaleybotImpl),
    ctx
  ));

  tools.set('send_notification', createRuntimeTool(
    'send_notification',
    'Send an in-app notification to the user',
    SEND_NOTIFICATION_SCHEMA as Record<string, unknown>,
    wrapImpl<SendNotificationArgs>(sendNotificationImpl),
    ctx
  ));

  tools.set('schedule_task', createRuntimeTool(
    'schedule_task',
    'Schedule a BaleyBot to run at a specific time',
    SCHEDULE_TASK_SCHEMA as Record<string, unknown>,
    wrapImpl<ScheduleTaskArgs>(scheduleTaskImpl),
    ctx
  ));

  tools.set('store_memory', createRuntimeTool(
    'store_memory',
    'Persist key-value data across BaleyBot executions',
    STORE_MEMORY_SCHEMA as Record<string, unknown>,
    wrapImpl<StoreMemoryArgs>(storeMemoryImpl),
    ctx
  ));

  tools.set('create_agent', createRuntimeTool(
    'create_agent',
    'Create a temporary specialized AI agent',
    CREATE_AGENT_SCHEMA as Record<string, unknown>,
    wrapImpl<CreateAgentArgs>(createAgentImpl),
    ctx
  ));

  tools.set('create_tool', createRuntimeTool(
    'create_tool',
    'Define a custom tool for the current execution',
    CREATE_TOOL_SCHEMA as Record<string, unknown>,
    wrapImpl<CreateToolArgs>(createToolImpl),
    ctx
  ));

  return tools;
}
