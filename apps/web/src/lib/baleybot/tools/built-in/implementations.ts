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
  GetDesignPackageResult,
  RegisterComponentResult,
  GetOrchestrationRunResult,
  ListOrchestrationTasksResult,
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
  SHARED_STORAGE_SCHEMA,
  REQUEST_USER_INPUT_SCHEMA,
  GET_DESIGN_PACKAGE_SCHEMA,
  REGISTER_COMPONENT_SCHEMA,
  GET_ORCHESTRATION_RUN_SCHEMA,
  LIST_ORCHESTRATION_TASKS_SCHEMA,
  BUILT_IN_TOOLS_METADATA,
} from './index';
import type { RequestUserInputResult } from './request-user-input';
import { createSharedStorageToolImpl } from '../../services/shared-storage-service';
import { createSpawnBaleybotExecutor } from '../../services/spawn-executor';
import type { BaleybotStreamEvent } from '@baleybots/core';
import { createLogger } from '@/lib/logger';

const logger = createLogger('built-in-tools');
import {
  createWebSearchService,
  type WebSearchService,
} from '../../services/web-search-service';
import {
  ephemeralAgentService,
  type EphemeralAgentConfig,
} from '../../services/ephemeral-agent-service';
import {
  ephemeralToolService,
  type EphemeralToolConfig,
} from '../../services/ephemeral-tool-service';
import { promoteToolToWorkspace } from '../../services/promotion-service';
import { validateUrl } from './url-validator';
import {
  getOrchestrationRun as getOrchestrationRunRecord,
  listOrchestrationTasks as listOrchestrationTaskRecords,
} from '../../services/orchestration-runtime-service';

// ============================================================================
// WEB SEARCH
// ============================================================================

interface WebSearchArgs {
  query: string;
  num_results?: number;
}

// Web search service is injected at runtime with workspace config
let webSearchService: WebSearchService | null = null;

/**
 * Set the web search service instance.
 * This should be called during initialization with the workspace's config.
 */
export function setWebSearchService(service: WebSearchService): void {
  webSearchService = service;
}

/**
 * Create and set a web search service with the given Tavily API key.
 * Convenience function for configuring web search.
 */
export function configureWebSearch(tavilyApiKey?: string): void {
  webSearchService = createWebSearchService({ tavilyApiKey });
}

async function webSearchImpl(
  args: WebSearchArgs,
  ctx: BuiltInToolContext
): Promise<WebSearchResult[]> {
  const numResults = Math.min(args.num_results ?? 5, 20);

  logger.debug('Searching web', { query: args.query, limit: numResults });

  // Use injected service if available, otherwise create one without API key
  const service = webSearchService ?? createWebSearchService({});

  const results = await service.search(args.query, numResults, {
    workspaceId: ctx.workspaceId,
  });

  return results;
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
  _ctx: BuiltInToolContext
): Promise<FetchUrlResult> {
  const format = args.format ?? 'text';

  // SSRF protection: validate URL before fetching
  validateUrl(args.url);

  try {
    let response = await fetch(args.url, {
      headers: {
        'User-Agent': 'BaleyBot/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    // Handle redirects manually to validate each hop against SSRF
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return {
          content: `Error fetching URL: redirect with no Location header`,
          contentType: 'text/plain',
          statusCode: response.status,
        };
      }
      // Validate redirect target against SSRF
      const redirectUrl = new URL(location, args.url).href;
      validateUrl(redirectUrl);

      response = await fetch(redirectUrl, {
        headers: { 'User-Agent': 'BaleyBot/1.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });

      // If still redirecting after one hop, stop
      if (response.status >= 300 && response.status < 400) {
        return {
          content: 'Error fetching URL: too many redirects',
          contentType: 'text/plain',
          statusCode: response.status,
        };
      }
    }

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
  model?: 'fast' | 'balanced' | 'powerful';
  taskId?: string;
  parentTaskId?: string;
  objective?: string;
  expectedArtifact?: string;
  strategyHints?: string[];
  allowChildSpawns?: boolean;
}

// This will be injected at runtime with actual execution capability
type SpawnBaleybotExecutor = (
  baleybotIdOrName: string,
  input: unknown,
  ctx: BuiltInToolContext,
  options?: {
    modelTierOverride?: string;
    toolCallId?: string;
    taskId?: string;
    parentTaskId?: string;
    objective?: string;
    expectedArtifact?: string;
    strategyHints?: string[];
    allowChildSpawns?: boolean;
  }
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

  const executorOptions = {
    ...(args.model ? { modelTierOverride: args.model } : {}),
    ...(args.taskId ? { taskId: args.taskId } : {}),
    ...(args.parentTaskId ? { parentTaskId: args.parentTaskId } : {}),
    ...(args.objective ? { objective: args.objective } : {}),
    ...(args.expectedArtifact ? { expectedArtifact: args.expectedArtifact } : {}),
    ...(args.strategyHints ? { strategyHints: args.strategyHints } : {}),
    ...(typeof args.allowChildSpawns === 'boolean' ? { allowChildSpawns: args.allowChildSpawns } : {}),
  };

  return spawnBaleybotExecutor(
    args.baleybot,
    args.input,
    ctx,
    Object.keys(executorOptions).length > 0 ? executorOptions : undefined
  );
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
    logger.info('Notification sent (fallback)', { priority, title: args.title, message: args.message });
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
// CREATE AGENT
// ============================================================================

interface CreateAgentArgs {
  name: string;
  goal: string;
  model?: string;
  tools?: string[];
  input?: unknown;
}

// ============================================================================
// CREATE TOOL
// ============================================================================

interface CreateToolArgs {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
  implementation: string;
}

// ============================================================================
// REQUEST USER INPUT
// ============================================================================

interface RequestUserInputArgs {
  question: string;
}

/**
 * Injected request_user_input handler.
 * The creator pipeline adapter injects this so the concierge can pause
 * and wait for user responses mid-execution.
 */
type RequestUserInputHandler = (
  args: RequestUserInputArgs,
  ctx: BuiltInToolContext
) => Promise<RequestUserInputResult>;

let requestUserInputHandler: RequestUserInputHandler | null = null;

export function setRequestUserInputHandler(handler: RequestUserInputHandler | null): void {
  requestUserInputHandler = handler;
}

async function requestUserInputImpl(
  args: RequestUserInputArgs,
  _ctx: BuiltInToolContext
): Promise<RequestUserInputResult> {
  if (!requestUserInputHandler) {
    throw new Error('request_user_input handler not configured');
  }
  return requestUserInputHandler(args, _ctx);
}

// ============================================================================
// GET DESIGN PACKAGE
// ============================================================================

import { db, designPackages, eq, and, isNull } from '@baleyui/db';
import { generateTailwindTheme } from '@/lib/design-packages/tailwind-theme';
import { formatDesignBrief, createEmptyRegistry, upsertComponent } from '@/lib/design-packages/component-registry';
import type { DesignPackageData, ComponentDefinition, ComponentCategory } from '@/lib/design-packages/types';
import { ensureDesignPackageDataV2 } from '@/lib/design-packages/schema';
import { buildArtifactBundle } from '@/lib/design-packages/artifact-bundle';

interface GetDesignPackageArgs {
  package_id?: string;
  format?:
    | 'brief'
    | 'full'
    | 'tailwind_only'
    | 'registry_only'
    | 'blueprints'
    | 'artifact_bundle_manifest'
    | 'brand_dossier'
    | 'quality_report'
    | 'concept_pack_manifest'
    | 'verification_report';
}

async function getDesignPackageImpl(
  args: GetDesignPackageArgs,
  ctx: BuiltInToolContext
): Promise<GetDesignPackageResult> {
  const format = args.format ?? 'brief';

  // Fetch package: by ID or workspace default
  const pkg = args.package_id
    ? await db.query.designPackages.findFirst({
        where: and(
          eq(designPackages.id, args.package_id),
          eq(designPackages.workspaceId, ctx.workspaceId),
          isNull(designPackages.deletedAt)
        ),
      })
    : await db.query.designPackages.findFirst({
        where: and(
          eq(designPackages.workspaceId, ctx.workspaceId),
          eq(designPackages.isDefault, true),
          isNull(designPackages.deletedAt)
        ),
      });

  if (!pkg) {
    return { found: false, format, content: 'No design package found for this workspace.' };
  }

  const data = ensureDesignPackageDataV2(pkg.packageData);
  const designData = data as unknown as DesignPackageData;
  const theme = data.tailwindTheme ?? generateTailwindTheme(designData);
  const registry = data.componentRegistry ?? createEmptyRegistry();

  switch (format) {
    case 'brief':
      return {
        found: true,
        format,
        content: formatDesignBrief(pkg.name, designData, theme, registry),
      };
    case 'full':
      return {
        found: true,
        format,
        content: { ...data, tailwindTheme: theme, componentRegistry: registry },
      };
    case 'tailwind_only':
      return { found: true, format, content: theme as unknown as Record<string, unknown> };
    case 'registry_only':
      return { found: true, format, content: registry as unknown as Record<string, unknown> };
    case 'blueprints':
      return {
        found: true,
        format,
        content: data.surfaceBlueprints as unknown as Record<string, unknown>,
      };
    case 'artifact_bundle_manifest': {
      const bundle = buildArtifactBundle(pkg.name, data);
      return {
        found: true,
        format,
        content: {
          packageName: pkg.name,
          manifest: data.artifactManifest,
          files: bundle.files.map(({ path, kind, description }) => ({ path, kind, description })),
        } as Record<string, unknown>,
      };
    }
    case 'brand_dossier':
      return {
        found: true,
        format,
        content: data.brandDossier as unknown as Record<string, unknown>,
      };
    case 'quality_report':
      return {
        found: true,
        format,
        content: data.generationReport as unknown as Record<string, unknown>,
      };
    case 'concept_pack_manifest':
      return {
        found: true,
        format,
        content: {
          selectedConceptId: data.generationReport.selectedConceptId,
          conceptScores: data.generationReport.conceptScores,
          artifacts: data.artifactManifest.artifacts.filter((artifact) =>
            artifact.path.startsWith('concepts/')
          ),
        } as Record<string, unknown>,
      };
    case 'verification_report':
      return {
        found: true,
        format,
        content: {
          selectedConceptId: data.generationReport.selectedConceptId,
          verificationStatus: data.generationReport.verificationStatus,
          verificationIssues: data.generationReport.verificationIssues,
          repairTrace: data.generationReport.repairTrace,
          failedChecks: data.generationReport.failedChecks,
          qualityChecks: data.generationReport.qualityChecks,
          overallScore: data.generationReport.overallScore,
        } as Record<string, unknown>,
      };
    default:
      return { found: true, format, content: formatDesignBrief(pkg.name, designData, theme, registry) };
  }
}

interface GetOrchestrationRunArgs {
  run_id: string;
}

async function getOrchestrationRunImpl(
  args: GetOrchestrationRunArgs,
  ctx: BuiltInToolContext
): Promise<GetOrchestrationRunResult> {
  const run = await getOrchestrationRunRecord({
    workspaceId: ctx.workspaceId,
    runId: args.run_id,
  });

  if (!run) {
    return {
      found: false,
    };
  }

  return {
    found: true,
    run: {
      id: run.id,
      rootExecutionId: run.rootExecutionId,
      entryBot: run.entryBot,
      status: run.status,
      objective: run.objective,
      strategy: run.strategy,
      summary: run.summary,
      metrics: run.metrics,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    },
  };
}

interface ListOrchestrationTasksArgs {
  run_id?: string;
  task_ids?: string[];
  limit?: number;
}

async function listOrchestrationTasksImpl(
  args: ListOrchestrationTasksArgs,
  ctx: BuiltInToolContext
): Promise<ListOrchestrationTasksResult> {
  const rows = await listOrchestrationTaskRecords({
    workspaceId: ctx.workspaceId,
    runId: args.run_id,
    ids: args.task_ids,
    limit: args.limit,
  });

  return {
    found: rows.length > 0,
    tasks: rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      parentTaskId: row.parentTaskId,
      assignedBot: row.assignedBot,
      expectedArtifact: row.expectedArtifact,
      status: row.status,
      attempt: row.attempt,
      depth: row.depth,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      durationMs: row.durationMs,
      error: row.error,
    })),
  };
}

// ============================================================================
// REGISTER COMPONENT
// ============================================================================

interface RegisterComponentArgs {
  name: string;
  category: string;
  variants: Array<{
    name: string;
    classes: string;
    usage?: string;
    animations?: Record<string, string>;
    customCSS?: string;
    typographyOverrides?: Record<string, string>;
    designNotes?: string;
  }>;
}

async function registerComponentImpl(
  args: RegisterComponentArgs,
  ctx: BuiltInToolContext
): Promise<RegisterComponentResult> {
  // Find workspace default design package
  const pkg = await db.query.designPackages.findFirst({
    where: and(
      eq(designPackages.workspaceId, ctx.workspaceId),
      eq(designPackages.isDefault, true),
      isNull(designPackages.deletedAt)
    ),
  });

  if (!pkg) {
    throw new Error('No default design package found. Create and save a design package first.');
  }

  const data = pkg.packageData as DesignPackageData;
  const registry = data.componentRegistry ?? createEmptyRegistry();

  const existingIdx = registry.components.findIndex(
    (c) => c.name.toLowerCase() === args.name.toLowerCase()
  );
  const action: 'created' | 'updated' = existingIdx >= 0 ? 'updated' : 'created';

  const component: ComponentDefinition = {
    name: args.name,
    category: args.category as ComponentCategory,
    variants: args.variants.map((v) => ({
      name: v.name,
      classes: v.classes,
      usage: v.usage ?? '',
      ...(v.animations ? { animations: v.animations } : {}),
      ...(v.customCSS ? { customCSS: v.customCSS } : {}),
      ...(v.typographyOverrides ? { typographyOverrides: v.typographyOverrides } : {}),
      ...(v.designNotes ? { designNotes: v.designNotes } : {}),
    })),
    source: 'bb-contributed',
    contributedBy: ctx.baleybotId,
  };

  const updatedRegistry = upsertComponent(registry, component);
  const updatedData: DesignPackageData = {
    ...data,
    componentRegistry: updatedRegistry,
  };

  await db
    .update(designPackages)
    .set({
      packageData: updatedData as unknown as DesignPackageData,
      updatedAt: new Date(),
      version: pkg.version + 1,
    })
    .where(eq(designPackages.id, pkg.id));

  return { success: true, componentName: args.name, action };
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
  impl: (args: Record<string, unknown>, ctx: BuiltInToolContext, executionOptions?: { toolCallId?: string }) => Promise<unknown>,
  ctx: BuiltInToolContext
): RuntimeToolDefinition {
  const metadata = BUILT_IN_TOOLS_METADATA.find((t) => t.name === name);

  return {
    name,
    description,
    inputSchema,
    function: async (args: Record<string, unknown>, executionOptions?: { toolCallId?: string }) => impl(args, ctx, executionOptions),
    category: metadata?.category,
    dangerLevel: metadata?.dangerLevel,
    needsApproval: metadata?.approvalRequired ?? false,
  };
}

/**
 * Get all built-in tools as RuntimeToolDefinitions, bound to the provided context.
 */
export function getBuiltInRuntimeTools(
  ctx: BuiltInToolContext,
  options?: { onChildSegment?: (event: BaleybotStreamEvent) => void }
): Map<string, RuntimeToolDefinition> {
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

  // If onChildSegment is provided, create a streaming-aware spawn executor.
  // Otherwise fall back to the globally-configured executor.
  if (options?.onChildSegment) {
    const streamingSpawnExecutor = createSpawnBaleybotExecutor({
      onChildSegment: options.onChildSegment,
    });
    tools.set('spawn_baleybot', createRuntimeTool(
      'spawn_baleybot',
      'Execute another BaleyBot and return its result',
      SPAWN_BALEYBOT_SCHEMA as Record<string, unknown>,
      async (args: Record<string, unknown>, toolCtx: BuiltInToolContext, executionOptions?: { toolCallId?: string }) =>
        streamingSpawnExecutor(String(args.baleybot), args.input, toolCtx, {
          toolCallId: executionOptions?.toolCallId,
          modelTierOverride: typeof args.model === 'string' ? args.model : undefined,
          taskId: typeof args.taskId === 'string' ? args.taskId : undefined,
          parentTaskId: typeof args.parentTaskId === 'string' ? args.parentTaskId : undefined,
          objective: typeof args.objective === 'string' ? args.objective : undefined,
          expectedArtifact: typeof args.expectedArtifact === 'string' ? args.expectedArtifact : undefined,
          strategyHints: Array.isArray(args.strategyHints)
            ? args.strategyHints.filter((hint): hint is string => typeof hint === 'string')
            : undefined,
          allowChildSpawns: typeof args.allowChildSpawns === 'boolean' ? args.allowChildSpawns : undefined,
        }),
      ctx
    ));
  } else {
    tools.set('spawn_baleybot', createRuntimeTool(
      'spawn_baleybot',
      'Execute another BaleyBot and return its result',
      SPAWN_BALEYBOT_SCHEMA as Record<string, unknown>,
      wrapImpl<SpawnBaleybotArgs>(spawnBaleybotImpl),
      ctx
    ));
  }

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

  // Create agent needs access to available tools via closure (not module state)
  tools.set('create_agent', createRuntimeTool(
    'create_agent',
    'Create a temporary specialized AI agent',
    CREATE_AGENT_SCHEMA as Record<string, unknown>,
    async (args: Record<string, unknown>, _toolCtx: BuiltInToolContext) => {
      const { name, goal, model, tools: agentTools, input } = args as unknown as CreateAgentArgs;
      const agentConfig: EphemeralAgentConfig = { name, goal, model, tools: agentTools };
      return ephemeralAgentService.createAndExecute(
        agentConfig,
        input ?? '',
        tools // captured from getBuiltInRuntimeTools closure
      );
    },
    ctx
  ));

  tools.set('create_tool', createRuntimeTool(
    'create_tool',
    'Define a custom tool for the current execution',
    CREATE_TOOL_SCHEMA as Record<string, unknown>,
    async (args: Record<string, unknown>, toolCtx: BuiltInToolContext) => {
      const typedArgs = args as unknown as CreateToolArgs;
      logger.info('Creating ephemeral tool', { name: typedArgs.name });
      const config: EphemeralToolConfig = {
        name: typedArgs.name,
        description: typedArgs.description,
        inputSchema: typedArgs.input_schema,
        implementation: typedArgs.implementation,
      };
      const result = await ephemeralToolService.create(config, toolCtx);
      if (result.created) {
        const tool = ephemeralToolService.getTool(typedArgs.name);
        if (tool) {
          tools.set(typedArgs.name, tool);
        }
        promoteToolToWorkspace(toolCtx.workspaceId, config).catch((err) => {
          logger.warn('Failed to auto-promote ephemeral tool', {
            name: typedArgs.name,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      return result;
    },
    ctx
  ));

  // Shared storage - workspace-scoped cross-BB key-value store
  const sharedStorageImpl = createSharedStorageToolImpl();
  tools.set('shared_storage', createRuntimeTool(
    'shared_storage',
    'Read and write workspace-scoped shared data for cross-BB communication',
    SHARED_STORAGE_SCHEMA as Record<string, unknown>,
    async (args: Record<string, unknown>, toolCtx: BuiltInToolContext) => {
      return sharedStorageImpl(
        args as { action: 'write' | 'read' | 'delete' | 'list'; key?: string; value?: unknown; ttl_seconds?: number; prefix?: string },
        { workspaceId: toolCtx.workspaceId, baleybotId: toolCtx.baleybotId, executionId: toolCtx.executionId }
      );
    },
    ctx
  ));

  tools.set('request_user_input', createRuntimeTool(
    'request_user_input',
    'Ask the user a question and wait for their response',
    REQUEST_USER_INPUT_SCHEMA as Record<string, unknown>,
    wrapImpl<RequestUserInputArgs>(requestUserInputImpl),
    ctx
  ));

  tools.set('get_design_package', createRuntimeTool(
    'get_design_package',
    'Retrieve the workspace design package with tokens, components, and theme',
    GET_DESIGN_PACKAGE_SCHEMA as Record<string, unknown>,
    wrapImpl<GetDesignPackageArgs>(getDesignPackageImpl),
    ctx
  ));

  tools.set('get_orchestration_run', createRuntimeTool(
    'get_orchestration_run',
    'Retrieve orchestration run telemetry for a swarm execution',
    GET_ORCHESTRATION_RUN_SCHEMA as Record<string, unknown>,
    wrapImpl<GetOrchestrationRunArgs>(getOrchestrationRunImpl),
    ctx
  ));

  tools.set('list_orchestration_tasks', createRuntimeTool(
    'list_orchestration_tasks',
    'List orchestration task telemetry and statuses for a run or recent activity',
    LIST_ORCHESTRATION_TASKS_SCHEMA as Record<string, unknown>,
    wrapImpl<ListOrchestrationTasksArgs>(listOrchestrationTasksImpl),
    ctx
  ));

  tools.set('register_component', createRuntimeTool(
    'register_component',
    'Register or update a UI component in the workspace component registry',
    REGISTER_COMPONENT_SCHEMA as Record<string, unknown>,
    wrapImpl<RegisterComponentArgs>(registerComponentImpl),
    ctx
  ));

  return tools;
}
