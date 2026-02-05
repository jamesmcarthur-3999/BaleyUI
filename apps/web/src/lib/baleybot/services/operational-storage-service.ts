/**
 * Operational Storage Service
 *
 * Stores BB execution results and analytics in the customer's database
 * if they have configured an "operational" database connection.
 * Falls back to BaleyUI's internal database if no operational DB is configured.
 *
 * This allows customers to keep their BB execution data in their own infrastructure
 * for compliance, analysis, or integration purposes.
 */

import {
  db,
  connections,
  baleybotExecutions,
  eq,
  and,
  notDeleted,
} from '@baleyui/db';
import { createDatabaseExecutor } from '../tools/connection-derived/database-executor';
import type { DatabaseConnectionConfig } from '@/lib/connections/providers';
import { createLogger } from '@/lib/logger';

const log = createLogger('operational-storage');

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutionRecord {
  id: string;
  baleybotId: string;
  baleybotName?: string;
  workspaceId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  input: unknown;
  output: unknown;
  error?: string;
  triggeredBy: 'manual' | 'schedule' | 'webhook' | 'other_bb';
  triggerSource?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  tokenCount?: number;
  entityStatuses?: unknown;
}

export interface AnalyticsRecord {
  id: string;
  baleybotId: string;
  workspaceId: string;
  metricName: string;
  metricType: string;
  value: number;
  dimensions?: Record<string, unknown>;
  timestamp: Date;
}

export interface OperationalStorageService {
  /**
   * Store an execution result
   */
  storeExecution(record: ExecutionRecord): Promise<void>;

  /**
   * Store analytics data
   */
  storeAnalytics(record: AnalyticsRecord): Promise<void>;

  /**
   * Query executions (from customer DB if available)
   */
  queryExecutions(
    workspaceId: string,
    options?: {
      baleybotId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ExecutionRecord[]>;

  /**
   * Check if operational storage is available
   */
  isOperationalStorageAvailable(): boolean;
}

// ============================================================================
// OPERATIONAL DATABASE SETUP
// ============================================================================

const EXECUTIONS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS baleybot_executions (
  id UUID PRIMARY KEY,
  baleybot_id UUID NOT NULL,
  baleybot_name VARCHAR(255),
  workspace_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,
  input JSONB,
  output JSONB,
  error TEXT,
  triggered_by VARCHAR(50) NOT NULL,
  trigger_source VARCHAR(255),
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  token_count INTEGER,
  entity_statuses JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bb_executions_workspace ON baleybot_executions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bb_executions_baleybot ON baleybot_executions(baleybot_id);
CREATE INDEX IF NOT EXISTS idx_bb_executions_status ON baleybot_executions(status);
CREATE INDEX IF NOT EXISTS idx_bb_executions_started ON baleybot_executions(started_at);
`;

const ANALYTICS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS baleybot_analytics (
  id UUID PRIMARY KEY,
  baleybot_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  metric_name VARCHAR(255) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  dimensions JSONB,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bb_analytics_workspace ON baleybot_analytics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bb_analytics_baleybot ON baleybot_analytics(baleybot_id);
CREATE INDEX IF NOT EXISTS idx_bb_analytics_metric ON baleybot_analytics(metric_name);
CREATE INDEX IF NOT EXISTS idx_bb_analytics_timestamp ON baleybot_analytics(timestamp);
`;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Create an operational storage service for a workspace
 */
export async function createOperationalStorageService(
  workspaceId: string
): Promise<OperationalStorageService> {
  // Check if workspace has an operational database configured
  const operationalConnection = await db.query.connections.findFirst({
    where: and(
      eq(connections.workspaceId, workspaceId),
      eq(connections.isOperational, true),
      notDeleted(connections)
    ),
  });

  // If no operational DB, use BaleyUI's internal storage
  if (!operationalConnection) {
    log.debug('No operational DB configured, using internal storage', { workspaceId });
    return createInternalStorageService(workspaceId);
  }

  // Validate connection type is a database
  if (!['postgres', 'mysql'].includes(operationalConnection.type)) {
    log.warn('Operational connection is not a database type, using internal storage', {
      connectionId: operationalConnection.id,
      type: operationalConnection.type,
    });
    return createInternalStorageService(workspaceId);
  }

  try {
    // Create database executor for the operational DB
    const config = operationalConnection.config as DatabaseConnectionConfig;
    const executor = createDatabaseExecutor(
      operationalConnection.type as 'postgres' | 'mysql',
      config
    );

    // Ensure tables exist
    await ensureTablesExist(executor, operationalConnection.type);

    log.info(`Using operational DB "${operationalConnection.name}"`, {
      workspaceId,
      connectionName: operationalConnection.name,
    });

    return createExternalStorageService(workspaceId, executor);
  } catch (error) {
    log.error('Failed to connect to operational DB, falling back to internal', error);
    return createInternalStorageService(workspaceId);
  }
}

/**
 * Ensure required tables exist in the operational database
 */
async function ensureTablesExist(
  executor: ReturnType<typeof createDatabaseExecutor>,
  dbType: string
): Promise<void> {
  try {
    // For PostgreSQL, we can run the schema directly
    // For MySQL, we'd need to adjust the syntax
    if (dbType === 'postgres') {
      await executor.query(EXECUTIONS_TABLE_SCHEMA);
      await executor.query(ANALYTICS_TABLE_SCHEMA);
    } else if (dbType === 'mysql') {
      // MySQL version would need DATETIME instead of TIMESTAMP, etc.
      log.warn('MySQL operational storage table creation not yet implemented');
    }
  } catch {
    // Tables might already exist, which is fine
    log.debug('Table setup completed (may have pre-existed)');
  }
}

/**
 * Create storage service that uses BaleyUI's internal database
 */
function createInternalStorageService(
  _workspaceId: string
): OperationalStorageService {
  return {
    async storeExecution(record: ExecutionRecord): Promise<void> {
      // Store in BaleyUI's baleybotExecutions table
      await db.insert(baleybotExecutions).values({
        id: record.id,
        baleybotId: record.baleybotId,
        status: record.status,
        input: record.input as Record<string, unknown>,
        output: record.output as Record<string, unknown>,
        error: record.error,
        triggeredBy: record.triggeredBy,
        triggerSource: record.triggerSource,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        durationMs: record.durationMs,
        tokenCount: record.tokenCount,
      });
    },

    async storeAnalytics(_record: AnalyticsRecord): Promise<void> {
      // TODO(ANALYTICS-001): Implement when analytics tables are created
      log.debug('Analytics storage not yet implemented for internal DB');
    },

    async queryExecutions(
      wsId: string,
      options?: {
        baleybotId?: string;
        status?: string;
        limit?: number;
        offset?: number;
      }
    ): Promise<ExecutionRecord[]> {
      const results = await db.query.baleybotExecutions.findMany({
        where: options?.baleybotId
          ? and(
              eq(baleybotExecutions.baleybotId, options.baleybotId)
            )
          : undefined,
        limit: options?.limit || 100,
        offset: options?.offset || 0,
        orderBy: (executions, { desc }) => [desc(executions.startedAt)],
        with: {
          baleybot: {
            columns: {
              name: true,
            },
          },
        },
      });

      return results.map((r) => ({
        id: r.id,
        baleybotId: r.baleybotId,
        baleybotName: r.baleybot?.name,
        workspaceId: wsId,
        status: r.status as ExecutionRecord['status'],
        input: r.input,
        output: r.output,
        error: r.error ?? undefined,
        triggeredBy: r.triggeredBy as ExecutionRecord['triggeredBy'],
        triggerSource: r.triggerSource ?? undefined,
        startedAt: r.startedAt ?? new Date(),
        completedAt: r.completedAt ?? undefined,
        durationMs: r.durationMs ?? undefined,
        tokenCount: r.tokenCount ?? undefined,
      }));
    },

    isOperationalStorageAvailable(): boolean {
      return false;
    },
  };
}

/**
 * Create storage service that uses customer's operational database
 */
function createExternalStorageService(
  workspaceId: string,
  executor: ReturnType<typeof createDatabaseExecutor>
): OperationalStorageService {
  return {
    async storeExecution(record: ExecutionRecord): Promise<void> {
      const sql = `
        INSERT INTO baleybot_executions (
          id, baleybot_id, baleybot_name, workspace_id, status,
          input, output, error, triggered_by, trigger_source,
          started_at, completed_at, duration_ms, token_count, entity_statuses
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
      `;

      await executor.queryWithParams(sql, [
        record.id,
        record.baleybotId,
        record.baleybotName ?? null,
        record.workspaceId,
        record.status,
        JSON.stringify(record.input),
        JSON.stringify(record.output),
        record.error ?? null,
        record.triggeredBy,
        record.triggerSource ?? null,
        record.startedAt.toISOString(),
        record.completedAt?.toISOString() ?? null,
        record.durationMs ?? null,
        record.tokenCount ?? null,
        record.entityStatuses ? JSON.stringify(record.entityStatuses) : null,
      ]);
    },

    async storeAnalytics(record: AnalyticsRecord): Promise<void> {
      const sql = `
        INSERT INTO baleybot_analytics (
          id, baleybot_id, workspace_id, metric_name, metric_type,
          value, dimensions, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await executor.queryWithParams(sql, [
        record.id,
        record.baleybotId,
        record.workspaceId,
        record.metricName,
        record.metricType,
        record.value,
        record.dimensions ? JSON.stringify(record.dimensions) : null,
        record.timestamp.toISOString(),
      ]);
    },

    async queryExecutions(
      _wsId: string,
      options?: {
        baleybotId?: string;
        status?: string;
        limit?: number;
        offset?: number;
      }
    ): Promise<ExecutionRecord[]> {
      let sql = `
        SELECT * FROM baleybot_executions
        WHERE workspace_id = $1
      `;
      const params: unknown[] = [workspaceId];
      let paramIndex = 2;

      if (options?.baleybotId) {
        sql += ` AND baleybot_id = $${paramIndex++}`;
        params.push(options.baleybotId);
      }

      if (options?.status) {
        sql += ` AND status = $${paramIndex++}`;
        params.push(options.status);
      }

      sql += ` ORDER BY started_at DESC`;
      sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(options?.limit || 100);
      params.push(options?.offset || 0);

      const results = await executor.queryWithParams<{
        id: string;
        baleybot_id: string;
        baleybot_name: string | null;
        workspace_id: string;
        status: string;
        input: unknown;
        output: unknown;
        error: string | null;
        triggered_by: string;
        trigger_source: string | null;
        started_at: string;
        completed_at: string | null;
        duration_ms: number | null;
        token_count: number | null;
        entity_statuses: unknown;
      }>(sql, params);

      return results.map((r) => ({
        id: r.id,
        baleybotId: r.baleybot_id,
        baleybotName: r.baleybot_name ?? undefined,
        workspaceId: r.workspace_id,
        status: r.status as ExecutionRecord['status'],
        input: r.input,
        output: r.output,
        error: r.error ?? undefined,
        triggeredBy: r.triggered_by as ExecutionRecord['triggeredBy'],
        triggerSource: r.trigger_source ?? undefined,
        startedAt: new Date(r.started_at),
        completedAt: r.completed_at ? new Date(r.completed_at) : undefined,
        durationMs: r.duration_ms ?? undefined,
        tokenCount: r.token_count ?? undefined,
        entityStatuses: r.entity_statuses,
      }));
    },

    isOperationalStorageAvailable(): boolean {
      return true;
    },
  };
}

// ============================================================================
// SINGLETON CACHE
// ============================================================================

// Cache operational storage services by workspace
const serviceCache = new Map<string, OperationalStorageService>();

/**
 * Get or create an operational storage service for a workspace
 * Caches the service for efficiency
 */
export async function getOperationalStorageService(
  workspaceId: string
): Promise<OperationalStorageService> {
  let service = serviceCache.get(workspaceId);

  if (!service) {
    service = await createOperationalStorageService(workspaceId);
    serviceCache.set(workspaceId, service);
  }

  return service;
}

/**
 * Clear cached service for a workspace (call when operational connection changes)
 */
export function clearOperationalStorageCache(workspaceId: string): void {
  serviceCache.delete(workspaceId);
}
