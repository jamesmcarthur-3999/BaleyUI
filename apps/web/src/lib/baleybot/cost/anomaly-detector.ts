/**
 * Anomaly Detection Service
 *
 * Detects unusual patterns in BaleyBot execution:
 * - Unusual execution frequency
 * - Cost spikes
 * - Long-running executions
 *
 * Compares against rolling baseline with configurable variance threshold.
 */

import {
  db,
  baleybotUsage,
  baleybotAlerts,
  notifications,
  baleybots,
  eq,
  and,
  gte,
  desc,
  sql,
} from '@baleyui/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('anomaly-detector');

// ============================================================================
// TYPES
// ============================================================================

export interface AnomalyConfig {
  /** Variance threshold as decimal (0.2 = 20%) */
  varianceThreshold: number;
  /** Number of days to look back for baseline */
  lookbackDays: number;
  /** Minimum samples needed to establish baseline */
  minSamples: number;
}

export type AnomalyType = 'frequency' | 'cost' | 'duration' | 'tokens';

export interface Anomaly {
  type: AnomalyType;
  baleybotId: string;
  baleybotName?: string;
  currentValue: number;
  expectedValue: number;
  variance: number;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface BaselineStats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  sampleCount: number;
}

const DEFAULT_CONFIG: AnomalyConfig = {
  varianceThreshold: 0.2, // 20%
  lookbackDays: 7,
  minSamples: 5,
};

// ============================================================================
// BASELINE CALCULATION
// ============================================================================

/**
 * Calculate baseline statistics for a metric
 */
async function calculateBaseline(
  baleybotId: string,
  metric: 'cost' | 'duration' | 'tokens',
  lookbackDays: number
): Promise<BaselineStats | null> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  const column =
    metric === 'cost'
      ? baleybotUsage.estimatedCost
      : metric === 'duration'
        ? baleybotUsage.durationMs
        : baleybotUsage.tokenTotal;

  const result = await db
    .select({
      mean: sql<number>`avg(${column})`,
      stdDev: sql<number>`stddev(${column})`,
      min: sql<number>`min(${column})`,
      max: sql<number>`max(${column})`,
      sampleCount: sql<number>`count(*)`,
    })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.baleybotId, baleybotId),
        gte(baleybotUsage.timestamp, startDate)
      )
    );

  const row = result[0];
  if (!row || Number(row.sampleCount) === 0) {
    return null;
  }

  return {
    mean: Number(row.mean) || 0,
    stdDev: Number(row.stdDev) || 0,
    min: Number(row.min) || 0,
    max: Number(row.max) || 0,
    sampleCount: Number(row.sampleCount) || 0,
  };
}

/**
 * Calculate execution frequency baseline (executions per hour)
 */
async function calculateFrequencyBaseline(
  baleybotId: string,
  lookbackDays: number
): Promise<BaselineStats | null> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  // Get hourly execution counts
  const result = await db
    .select({
      hourlyCount: sql<number>`count(*)`,
    })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.baleybotId, baleybotId),
        gte(baleybotUsage.timestamp, startDate)
      )
    )
    .groupBy(sql`date_trunc('hour', ${baleybotUsage.timestamp})`);

  if (result.length === 0) {
    return null;
  }

  const counts = result.map((r) => Number(r.hourlyCount) || 0);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance =
    counts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    counts.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    stdDev,
    min: Math.min(...counts),
    max: Math.max(...counts),
    sampleCount: counts.length,
  };
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Determine severity based on variance
 */
function determineSeverity(
  variance: number,
  threshold: number
): 'info' | 'warning' | 'critical' {
  if (variance >= threshold * 3) return 'critical';
  if (variance >= threshold * 1.5) return 'warning';
  return 'info';
}

/**
 * Detect anomalies for a single BaleyBot
 */
export async function detectAnomalies(
  baleybotId: string,
  currentValues?: {
    cost?: number;
    duration?: number;
    tokens?: number;
  },
  config: Partial<AnomalyConfig> = {}
): Promise<Anomaly[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const anomalies: Anomaly[] = [];

  // Get BB name for messages
  const bb = await db.query.baleybots.findFirst({
    where: eq(baleybots.id, baleybotId),
    columns: { name: true },
  });
  const baleybotName = bb?.name ?? 'Unknown';

  // Check each metric
  const metrics = ['cost', 'duration', 'tokens'] as const;

  for (const metric of metrics) {
    const currentValue = currentValues?.[metric];
    if (currentValue === undefined) continue;

    const baseline = await calculateBaseline(
      baleybotId,
      metric,
      mergedConfig.lookbackDays
    );

    if (!baseline || baseline.sampleCount < mergedConfig.minSamples) {
      continue; // Not enough data for baseline
    }

    // Calculate variance from expected
    const variance =
      baseline.mean > 0 ? (currentValue - baseline.mean) / baseline.mean : 0;

    // Only flag if above threshold (positive variance = higher than expected)
    if (variance > mergedConfig.varianceThreshold) {
      const severity = determineSeverity(variance, mergedConfig.varianceThreshold);
      const metricLabel =
        metric === 'cost'
          ? 'cost'
          : metric === 'duration'
            ? 'execution time'
            : 'token usage';

      anomalies.push({
        type: metric,
        baleybotId,
        baleybotName,
        currentValue,
        expectedValue: baseline.mean,
        variance,
        severity,
        message:
          `${baleybotName} has ${Math.round(variance * 100)}% higher ${metricLabel} ` +
          `than average (${formatValue(currentValue, metric)} vs ${formatValue(baseline.mean, metric)} expected)`,
      });
    }
  }

  return anomalies;
}

/**
 * Detect frequency anomalies (execution spikes)
 */
export async function detectFrequencyAnomaly(
  baleybotId: string,
  recentHoursCount: number,
  config: Partial<AnomalyConfig> = {}
): Promise<Anomaly | null> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const baseline = await calculateFrequencyBaseline(
    baleybotId,
    mergedConfig.lookbackDays
  );

  if (!baseline || baseline.sampleCount < mergedConfig.minSamples) {
    return null;
  }

  const variance =
    baseline.mean > 0 ? (recentHoursCount - baseline.mean) / baseline.mean : 0;

  if (variance > mergedConfig.varianceThreshold) {
    const bb = await db.query.baleybots.findFirst({
      where: eq(baleybots.id, baleybotId),
      columns: { name: true },
    });

    const severity = determineSeverity(variance, mergedConfig.varianceThreshold);

    return {
      type: 'frequency',
      baleybotId,
      baleybotName: bb?.name ?? 'Unknown',
      currentValue: recentHoursCount,
      expectedValue: baseline.mean,
      variance,
      severity,
      message:
        `${bb?.name ?? 'BaleyBot'} has ${Math.round(variance * 100)}% higher execution frequency ` +
        `(${recentHoursCount} this hour vs ${baseline.mean.toFixed(1)} average)`,
    };
  }

  return null;
}

/**
 * Run full anomaly detection for a workspace
 */
export async function detectWorkspaceAnomalies(
  workspaceId: string,
  config: Partial<AnomalyConfig> = {}
): Promise<Anomaly[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const anomalies: Anomaly[] = [];

  // Get all BBs with recent activity
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 1);

  const activeBBs = await db
    .selectDistinct({ baleybotId: baleybotUsage.baleybotId })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.workspaceId, workspaceId),
        gte(baleybotUsage.timestamp, recentDate)
      )
    );

  for (const { baleybotId } of activeBBs) {
    // Get most recent execution values
    const recent = await db
      .select({
        cost: baleybotUsage.estimatedCost,
        duration: baleybotUsage.durationMs,
        tokens: baleybotUsage.tokenTotal,
      })
      .from(baleybotUsage)
      .where(eq(baleybotUsage.baleybotId, baleybotId))
      .orderBy(desc(baleybotUsage.timestamp))
      .limit(1);

    if (recent[0]) {
      const bbAnomalies = await detectAnomalies(
        baleybotId,
        {
          cost: recent[0].cost ?? undefined,
          duration: recent[0].duration ?? undefined,
          tokens: recent[0].tokens ?? undefined,
        },
        mergedConfig
      );
      anomalies.push(...bbAnomalies);
    }

    // Check frequency anomaly
    const hourAgo = new Date();
    hourAgo.setHours(hourAgo.getHours() - 1);

    const hourlyCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(baleybotUsage)
      .where(
        and(
          eq(baleybotUsage.baleybotId, baleybotId),
          gte(baleybotUsage.timestamp, hourAgo)
        )
      );

    const frequencyAnomaly = await detectFrequencyAnomaly(
      baleybotId,
      Number(hourlyCount[0]?.count) || 0,
      mergedConfig
    );

    if (frequencyAnomaly) {
      anomalies.push(frequencyAnomaly);
    }
  }

  return anomalies;
}

// ============================================================================
// ALERTING
// ============================================================================

/**
 * Create an alert from an anomaly
 */
export async function createAlert(
  workspaceId: string,
  anomaly: Anomaly
): Promise<string> {
  const [alert] = await db
    .insert(baleybotAlerts)
    .values({
      workspaceId,
      baleybotId: anomaly.baleybotId,
      alertCondition: `${anomaly.type}_anomaly`,
      triggeredValue: anomaly.currentValue,
      thresholdValue: anomaly.expectedValue,
      metricName: anomaly.type,
      severity: anomaly.severity,
      message: anomaly.message,
      context: {
        variance: anomaly.variance,
        baleybotName: anomaly.baleybotName,
      },
    })
    .returning({ id: baleybotAlerts.id });

  log.info(`Created ${anomaly.severity} alert for BB ${anomaly.baleybotId}`, {
    baleybotId: anomaly.baleybotId,
    severity: anomaly.severity,
    message: anomaly.message,
  });

  return alert!.id;
}

/**
 * Create notification for workspace users about an anomaly
 */
export async function notifyAnomaly(
  workspaceId: string,
  userId: string,
  anomaly: Anomaly
): Promise<string> {
  const priority =
    anomaly.severity === 'critical'
      ? 'high'
      : anomaly.severity === 'warning'
        ? 'normal'
        : 'low';

  const [notification] = await db
    .insert(notifications)
    .values({
      workspaceId,
      userId,
      title: `${anomaly.severity === 'critical' ? '🚨' : anomaly.severity === 'warning' ? '⚠️' : 'ℹ️'} ${anomaly.type.charAt(0).toUpperCase() + anomaly.type.slice(1)} Anomaly Detected`,
      message: anomaly.message,
      priority,
      sourceType: 'baleybot',
      sourceId: anomaly.baleybotId,
    })
    .returning({ id: notifications.id });

  return notification!.id;
}

/**
 * Process anomalies and create alerts/notifications
 */
export async function processAnomalies(
  workspaceId: string,
  anomalies: Anomaly[],
  notifyUserIds?: string[]
): Promise<{
  alertIds: string[];
  notificationIds: string[];
}> {
  const alertIds: string[] = [];
  const notificationIds: string[] = [];

  for (const anomaly of anomalies) {
    // Create alert
    const alertId = await createAlert(workspaceId, anomaly);
    alertIds.push(alertId);

    // Create notifications for specified users
    if (notifyUserIds && notifyUserIds.length > 0) {
      for (const userId of notifyUserIds) {
        const notificationId = await notifyAnomaly(workspaceId, userId, anomaly);
        notificationIds.push(notificationId);
      }
    }
  }

  return { alertIds, notificationIds };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format value for display based on metric type
 */
function formatValue(value: number, metric: 'cost' | 'duration' | 'tokens'): string {
  switch (metric) {
    case 'cost':
      return `$${value.toFixed(4)}`;
    case 'duration':
      return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
    case 'tokens':
      return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
    default:
      return String(value);
  }
}

/**
 * Get anomaly threshold recommendations based on historical data
 */
export async function getThresholdRecommendations(
  baleybotId: string
): Promise<{
  cost: { recommended: number; reason: string };
  duration: { recommended: number; reason: string };
  tokens: { recommended: number; reason: string };
  frequency: { recommended: number; reason: string };
}> {
  const recommendations = {
    cost: { recommended: 0.2, reason: 'Default threshold (20%)' },
    duration: { recommended: 0.2, reason: 'Default threshold (20%)' },
    tokens: { recommended: 0.2, reason: 'Default threshold (20%)' },
    frequency: { recommended: 0.3, reason: 'Default threshold (30%)' },
  };

  // Calculate coefficient of variation for each metric
  const metrics = ['cost', 'duration', 'tokens'] as const;

  for (const metric of metrics) {
    const baseline = await calculateBaseline(baleybotId, metric, 30);
    if (baseline && baseline.sampleCount >= 10 && baseline.mean > 0) {
      const cv = baseline.stdDev / baseline.mean;

      // Recommend threshold based on natural variance
      if (cv < 0.1) {
        recommendations[metric] = {
          recommended: 0.15,
          reason: `Low variance (CV=${(cv * 100).toFixed(1)}%) - tight threshold`,
        };
      } else if (cv > 0.5) {
        recommendations[metric] = {
          recommended: Math.min(cv * 1.5, 0.5),
          reason: `High variance (CV=${(cv * 100).toFixed(1)}%) - loose threshold`,
        };
      } else {
        recommendations[metric] = {
          recommended: cv * 1.2,
          reason: `Based on historical variance (CV=${(cv * 100).toFixed(1)}%)`,
        };
      }
    }
  }

  return recommendations;
}
