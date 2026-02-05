/**
 * BaleyBot Services
 *
 * Backend services that power the built-in tools.
 * These services interact with the database and provide
 * the actual functionality behind tool operations.
 */

// Memory Storage
export {
  createMemoryStorageService,
  memoryStorageService,
  type MemoryStorageService,
} from './memory-storage';

// Notifications
export {
  createNotificationSender,
  notificationSender,
  type NotificationSender,
  type NotificationInput,
  type NotificationResult,
} from './notification-service';

// Spawn Executor
export {
  createSpawnBaleybotExecutor,
  spawnBaleybotExecutor,
  type SpawnBaleybotExecutor,
} from './spawn-executor';

// Schedule Service
export {
  createTaskScheduler,
  taskScheduler,
  type TaskScheduler,
  type ScheduleTaskInput,
  type ScheduleTaskResult,
} from './schedule-service';

// Web Search
export {
  createWebSearchService,
  configureWebSearch,
  getWebSearchService,
  type WebSearchService,
  type WebSearchServiceConfig,
  type SearchResult,
} from './web-search-service';

// Ephemeral Agent
export {
  createEphemeralAgentService,
  ephemeralAgentService,
  type EphemeralAgentService,
  type EphemeralAgentConfig,
} from './ephemeral-agent-service';

// Ephemeral Tool
export {
  createEphemeralToolService,
  ephemeralToolService,
  type EphemeralToolService,
  type EphemeralToolConfig,
} from './ephemeral-tool-service';

// AI Credentials
export {
  getWorkspaceAICredentials,
  hasAIConnection,
  type AICredentials,
  type AIProviderType,
} from './ai-credentials-service';

// Shared Storage
export {
  createSharedStorageService,
  sharedStorageService,
  createSharedStorageToolImpl,
  type SharedStorageService,
  type SharedStorageEntry,
  type SharedStorageResult,
} from './shared-storage-service';

// Analytics - Metrics
export {
  createMetricsService,
  metricsService,
  type MetricsService,
  type ExecutionContext as MetricsExecutionContext,
  type MetricValue,
  type AggregateQuery,
  type AggregateResult,
} from '../analytics/metrics-service';

// Analytics - Alerts
export {
  createAlertService,
  alertService,
  type AlertService,
  type Alert,
  type AlertCondition,
  type EvaluationContext as AlertEvaluationContext,
} from '../analytics/alert-service';

// Cost - Usage Tracker
export {
  recordUsage,
  recordUsageFromExecution,
  calculateCost,
  getUsageSummary,
  getWorkspaceUsageSummary,
  getUsageTrend,
  getTopBBsByUsage,
  getRecentUsage,
  type UsageRecord,
  type UsageSummary,
  type UsageTrend,
} from '../cost/usage-tracker';

// ============================================================================
// SERVICE INITIALIZATION
// ============================================================================

import {
  setMemoryStorage,
  setNotificationSender,
  setSpawnBaleybotExecutor,
  setTaskScheduler,
  configureWebSearch,
} from '../tools/catalog-service';
import { memoryStorageService } from './memory-storage';
import { notificationSender } from './notification-service';
import { spawnBaleybotExecutor } from './spawn-executor';
import { taskScheduler } from './schedule-service';

/**
 * Initialize all built-in tool services.
 * Call this once at application startup to wire up the tool implementations.
 *
 * @param options - Optional configuration for services
 * @param options.tavilyApiKey - Tavily API key for web search
 */
export function initializeBuiltInToolServices(options?: {
  tavilyApiKey?: string;
}): void {
  setMemoryStorage(memoryStorageService);
  setNotificationSender(notificationSender);
  setSpawnBaleybotExecutor(spawnBaleybotExecutor);
  setTaskScheduler(taskScheduler);
  configureWebSearch(options?.tavilyApiKey);
}
