/**
 * Metrics Service
 *
 * Records metrics on each BB execution and computes aggregations
 * (hourly, daily, weekly) for trend analysis and dashboards.
 */

import {
  db,
  baleybotMetrics,
  baleybotMetricAggregates,
  eq,
  and,
  gte,
  lte,
  sql,
} from '@baleyui/db';
import type { MetricDefinition, MetricType } from './schema-parser';
import { createLogger } from '@/lib/logger';

const log = createLogger('metrics');

// ============================================================================
// TYPES
// ============================================================================

export interface MetricValue {
  name: string;
  type: MetricType;
  value: number | null;
  dimensions?: Record<string, unknown>;
}

export interface ExecutionContext {
  workspaceId: string;
  baleybotId: string;
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  output: unknown;
}

export interface AggregateQuery {
  baleybotId: string;
  metricName: string;
  period: 'hour' | 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
}

export interface AggregateResult {
  periodStart: Date;
  periodEnd: Date;
  value: number | null;
  minValue: number | null;
  maxValue: number | null;
  sampleCount: number;
  changePercent: number | null;
}

export interface MetricsService {
  /**
   * Record metrics for an execution based on metric definitions
   */
  recordMetrics(
    ctx: ExecutionContext,
    metricDefinitions: MetricDefinition[]
  ): Promise<void>;

  /**
   * Record a single metric value
   */
  recordMetric(
    workspaceId: string,
    baleybotId: string,
    executionId: string,
    metric: MetricValue
  ): Promise<void>;

  /**
   * Get aggregated metrics for a period
   */
  getAggregates(query: AggregateQuery): Promise<AggregateResult[]>;

  /**
   * Compute and store aggregates (called by cron job)
   */
  computeAggregates(
    workspaceId: string,
    baleybotId: string,
    period: 'hour' | 'day' | 'week' | 'month'
  ): Promise<void>;

  /**
   * Get current metric value for a baleybot
   */
  getCurrentValue(
    baleybotId: string,
    metricName: string
  ): Promise<number | null>;

  /**
   * Get comparison data (e.g., week-over-week)
   */
  getComparison(
    baleybotId: string,
    metricName: string,
    period: 'day' | 'week' | 'month'
  ): Promise<{ current: number | null; previous: number | null; changePercent: number | null }>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Create a metrics service instance
 */
export function createMetricsService(): MetricsService {
  return {
    async recordMetrics(
      ctx: ExecutionContext,
      metricDefinitions: MetricDefinition[]
    ): Promise<void> {
      const timestamp = new Date();

      for (const def of metricDefinitions) {
        const value = computeMetricValue(def, ctx);

        await db.insert(baleybotMetrics).values({
          workspaceId: ctx.workspaceId,
          baleybotId: ctx.baleybotId,
          executionId: ctx.executionId,
          metricName: def.name,
          metricType: def.type,
          value: value.value,
          dimensions: value.dimensions as Record<string, unknown>,
          timestamp,
        });
      }

      log.info(
        `[metrics] Recorded ${metricDefinitions.length} metrics for execution ${ctx.executionId}`
      );
    },

    async recordMetric(
      workspaceId: string,
      baleybotId: string,
      executionId: string,
      metric: MetricValue
    ): Promise<void> {
      await db.insert(baleybotMetrics).values({
        workspaceId,
        baleybotId,
        executionId,
        metricName: metric.name,
        metricType: metric.type,
        value: metric.value,
        dimensions: metric.dimensions as Record<string, unknown>,
        timestamp: new Date(),
      });
    },

    async getAggregates(query: AggregateQuery): Promise<AggregateResult[]> {
      const results = await db.query.baleybotMetricAggregates.findMany({
        where: and(
          eq(baleybotMetricAggregates.baleybotId, query.baleybotId),
          eq(baleybotMetricAggregates.metricName, query.metricName),
          eq(baleybotMetricAggregates.period, query.period),
          gte(baleybotMetricAggregates.periodStart, query.startDate),
          lte(baleybotMetricAggregates.periodEnd, query.endDate)
        ),
        orderBy: (agg, { asc }) => [asc(agg.periodStart)],
      });

      return results.map((r) => ({
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        value: r.value,
        minValue: r.minValue,
        maxValue: r.maxValue,
        sampleCount: r.sampleCount,
        changePercent: r.changePercent,
      }));
    },

    async computeAggregates(
      workspaceId: string,
      baleybotId: string,
      period: 'hour' | 'day' | 'week' | 'month'
    ): Promise<void> {
      // Calculate period boundaries
      const now = new Date();
      const { periodStart, periodEnd } = getPeriodBoundaries(now, period);

      // Get all unique metric names for this baleybot in the period
      const metricsInPeriod = await db
        .selectDistinct({ metricName: baleybotMetrics.metricName })
        .from(baleybotMetrics)
        .where(
          and(
            eq(baleybotMetrics.baleybotId, baleybotId),
            gte(baleybotMetrics.timestamp, periodStart),
            lte(baleybotMetrics.timestamp, periodEnd)
          )
        );

      for (const { metricName } of metricsInPeriod) {
        if (!metricName) continue;

        // Compute aggregates for this metric
        const aggResult = await db
          .select({
            avg: sql<number>`AVG(${baleybotMetrics.value})`,
            min: sql<number>`MIN(${baleybotMetrics.value})`,
            max: sql<number>`MAX(${baleybotMetrics.value})`,
            sum: sql<number>`SUM(${baleybotMetrics.value})`,
            count: sql<number>`COUNT(*)`,
          })
          .from(baleybotMetrics)
          .where(
            and(
              eq(baleybotMetrics.baleybotId, baleybotId),
              eq(baleybotMetrics.metricName, metricName),
              gte(baleybotMetrics.timestamp, periodStart),
              lte(baleybotMetrics.timestamp, periodEnd)
            )
          );

        const agg = aggResult[0];
        if (!agg) continue;

        // Get previous period for comparison
        const { periodStart: prevStart, periodEnd: prevEnd } =
          getPreviousPeriodBoundaries(periodStart, period);

        const prevResult = await db
          .select({
            avg: sql<number>`AVG(${baleybotMetrics.value})`,
          })
          .from(baleybotMetrics)
          .where(
            and(
              eq(baleybotMetrics.baleybotId, baleybotId),
              eq(baleybotMetrics.metricName, metricName),
              gte(baleybotMetrics.timestamp, prevStart),
              lte(baleybotMetrics.timestamp, prevEnd)
            )
          );

        const previousValue = prevResult[0]?.avg ?? null;
        const currentValue = agg.avg;
        const changePercent =
          previousValue && currentValue
            ? ((currentValue - previousValue) / previousValue) * 100
            : null;

        // Upsert aggregate
        await db
          .insert(baleybotMetricAggregates)
          .values({
            workspaceId,
            baleybotId,
            metricName,
            period,
            periodStart,
            periodEnd,
            value: agg.avg,
            minValue: agg.min,
            maxValue: agg.max,
            sumValue: agg.sum,
            sampleCount: Number(agg.count),
            previousPeriodValue: previousValue,
            changePercent,
          })
          .onConflictDoUpdate({
            target: [
              baleybotMetricAggregates.baleybotId,
              baleybotMetricAggregates.metricName,
              baleybotMetricAggregates.period,
              baleybotMetricAggregates.periodStart,
            ],
            set: {
              value: agg.avg,
              minValue: agg.min,
              maxValue: agg.max,
              sumValue: agg.sum,
              sampleCount: Number(agg.count),
              previousPeriodValue: previousValue,
              changePercent,
              updatedAt: new Date(),
            },
          });
      }

      log.info(
        `[metrics] Computed ${period} aggregates for baleybot ${baleybotId}`
      );
    },

    async getCurrentValue(
      baleybotId: string,
      metricName: string
    ): Promise<number | null> {
      const result = await db.query.baleybotMetrics.findFirst({
        where: and(
          eq(baleybotMetrics.baleybotId, baleybotId),
          eq(baleybotMetrics.metricName, metricName)
        ),
        orderBy: (m, { desc }) => [desc(m.timestamp)],
      });

      return result?.value ?? null;
    },

    async getComparison(
      baleybotId: string,
      metricName: string,
      period: 'day' | 'week' | 'month'
    ): Promise<{
      current: number | null;
      previous: number | null;
      changePercent: number | null;
    }> {
      const now = new Date();
      const { periodStart: currentStart, periodEnd: currentEnd } =
        getPeriodBoundaries(now, period);
      const { periodStart: prevStart, periodEnd: prevEnd } =
        getPreviousPeriodBoundaries(currentStart, period);

      // Get current period average
      const currentResult = await db
        .select({ avg: sql<number>`AVG(${baleybotMetrics.value})` })
        .from(baleybotMetrics)
        .where(
          and(
            eq(baleybotMetrics.baleybotId, baleybotId),
            eq(baleybotMetrics.metricName, metricName),
            gte(baleybotMetrics.timestamp, currentStart),
            lte(baleybotMetrics.timestamp, currentEnd)
          )
        );

      // Get previous period average
      const prevResult = await db
        .select({ avg: sql<number>`AVG(${baleybotMetrics.value})` })
        .from(baleybotMetrics)
        .where(
          and(
            eq(baleybotMetrics.baleybotId, baleybotId),
            eq(baleybotMetrics.metricName, metricName),
            gte(baleybotMetrics.timestamp, prevStart),
            lte(baleybotMetrics.timestamp, prevEnd)
          )
        );

      const current = currentResult[0]?.avg ?? null;
      const previous = prevResult[0]?.avg ?? null;
      const changePercent =
        previous && current ? ((current - previous) / previous) * 100 : null;

      return { current, previous, changePercent };
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute a metric value from execution context
 */
function computeMetricValue(
  def: MetricDefinition,
  ctx: ExecutionContext
): MetricValue {
  switch (def.type) {
    case 'count':
      return { name: def.name, type: 'count', value: 1 };

    case 'average':
      if (def.field === 'duration_ms') {
        return { name: def.name, type: 'average', value: ctx.durationMs };
      }
      // For other fields, try to extract from output
      const avgValue = extractFieldValue(ctx.output, def.field);
      return { name: def.name, type: 'average', value: avgValue };

    case 'percentage':
      // Evaluate condition against context
      const passes = evaluateCondition(def.condition, ctx);
      return { name: def.name, type: 'percentage', value: passes ? 100 : 0 };

    case 'top_n':
      // For top_n, we record individual values and aggregate later
      const topValue = extractFieldValue(ctx.output, def.field);
      return {
        name: def.name,
        type: 'top_n',
        value: null,
        dimensions: { field: def.field, value: topValue },
      };

    case 'trend':
      // Trend is calculated from historical data, not individual records
      return { name: def.name, type: 'trend', value: null };

    case 'distribution':
      const distValue = extractFieldValue(ctx.output, def.field);
      return {
        name: def.name,
        type: 'distribution',
        value: distValue,
        dimensions: { bucket: getBucket(distValue) },
      };

    default:
      return { name: def.name, type: def.type, value: null };
  }
}

/**
 * Extract a field value from output
 */
function extractFieldValue(output: unknown, field?: string): number | null {
  if (!field || !output || typeof output !== 'object') {
    return null;
  }

  const value = (output as Record<string, unknown>)[field];

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  return null;
}

/**
 * Evaluate a simple condition against execution context
 */
function evaluateCondition(condition?: string, ctx?: ExecutionContext): boolean {
  if (!condition || !ctx) return false;

  // Simple evaluation for common conditions
  if (condition.includes("status = 'completed'")) {
    return ctx.status === 'completed';
  }
  if (condition.includes("status = 'failed'")) {
    return ctx.status === 'failed';
  }

  // For more complex conditions, we'd need a proper parser
  // For now, default to true for unknown conditions
  return true;
}

/**
 * Get a bucket label for distribution metrics
 */
function getBucket(value: number | null): string {
  if (value === null) return 'unknown';

  if (value < 100) return '0-100';
  if (value < 500) return '100-500';
  if (value < 1000) return '500-1000';
  if (value < 5000) return '1000-5000';
  return '5000+';
}

/**
 * Get period boundaries for aggregation
 */
function getPeriodBoundaries(
  date: Date,
  period: 'hour' | 'day' | 'week' | 'month'
): { periodStart: Date; periodEnd: Date } {
  const start = new Date(date);

  switch (period) {
    case 'hour':
      start.setMinutes(0, 0, 0);
      break;
    case 'day':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
      break;
    case 'month':
      start.setHours(0, 0, 0, 0);
      start.setDate(1);
      break;
  }

  const end = new Date(start);
  switch (period) {
    case 'hour':
      end.setHours(end.getHours() + 1);
      break;
    case 'day':
      end.setDate(end.getDate() + 1);
      break;
    case 'week':
      end.setDate(end.getDate() + 7);
      break;
    case 'month':
      end.setMonth(end.getMonth() + 1);
      break;
  }

  return { periodStart: start, periodEnd: end };
}

/**
 * Get previous period boundaries
 */
function getPreviousPeriodBoundaries(
  currentPeriodStart: Date,
  period: 'hour' | 'day' | 'week' | 'month'
): { periodStart: Date; periodEnd: Date } {
  const start = new Date(currentPeriodStart);

  switch (period) {
    case 'hour':
      start.setHours(start.getHours() - 1);
      break;
    case 'day':
      start.setDate(start.getDate() - 1);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
  }

  return { periodStart: start, periodEnd: currentPeriodStart };
}

/**
 * Default metrics service instance
 */
export const metricsService = createMetricsService();
