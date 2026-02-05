/**
 * Alert Service
 *
 * Evaluates alert conditions against metrics and creates alerts when triggered.
 * Integrates with the notification system to alert workspace users.
 */

import {
  db,
  baleybotAlerts,
  baleybotMetrics,
  notifications,
  eq,
  and,
  desc,
} from '@baleyui/db';
import { metricsService } from './metrics-service';
import { createLogger } from '@/lib/logger';

const log = createLogger('alerts');

// ============================================================================
// TYPES
// ============================================================================

export interface AlertCondition {
  /** Raw condition string from BAL (e.g., "success_rate < 80%") */
  raw: string;
  /** Parsed metric name */
  metricName: string;
  /** Comparison operator */
  operator: '<' | '>' | '<=' | '>=' | '=' | '!=';
  /** Threshold value */
  threshold: number;
  /** Whether threshold is a percentage */
  isPercentage: boolean;
}

export interface Alert {
  id: string;
  baleybotId: string;
  workspaceId: string;
  alertCondition: string;
  triggeredValue: number | null;
  thresholdValue: number | null;
  metricName: string | null;
  status: 'active' | 'acknowledged' | 'resolved';
  severity: 'info' | 'warning' | 'critical';
  triggeredAt: Date;
  message: string | null;
}

export interface EvaluationContext {
  workspaceId: string;
  baleybotId: string;
  baleybotName?: string;
  executionId?: string;
}

export interface AlertService {
  /**
   * Evaluate alert conditions against current metrics
   */
  evaluateAlerts(
    ctx: EvaluationContext,
    alertCondition: string
  ): Promise<Alert | null>;

  /**
   * Get active alerts for a baleybot
   */
  getActiveAlerts(baleybotId: string): Promise<Alert[]>;

  /**
   * Get all alerts for a baleybot (with pagination)
   */
  getAlerts(
    baleybotId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Alert[]>;

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, userId: string): Promise<void>;

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, userId: string): Promise<void>;

  /**
   * Create notification for an alert
   */
  notifyAlert(alert: Alert, userIds: string[]): Promise<void>;
}

// ============================================================================
// CONDITION PARSER
// ============================================================================

/**
 * Parse an alert condition string
 */
export function parseAlertCondition(condition: string): AlertCondition | null {
  // Match patterns like "metric_name < 80" or "success_rate >= 90%"
  const match = condition.match(
    /([a-z_][a-z0-9_]*)\s*(<=|>=|<|>|=|!=)\s*(-?\d+(?:\.\d+)?)\s*(%)?/i
  );

  if (!match) {
    log.warn(` Failed to parse condition: ${condition}`);
    return null;
  }

  const [, metricName, operator, thresholdStr, percentSign] = match;

  if (!metricName || !operator || !thresholdStr) {
    return null;
  }

  return {
    raw: condition,
    metricName,
    operator: operator as AlertCondition['operator'],
    threshold: parseFloat(thresholdStr),
    isPercentage: percentSign === '%',
  };
}

/**
 * Evaluate a condition against a value
 */
function evaluateCondition(
  condition: AlertCondition,
  value: number
): boolean {
  const threshold = condition.isPercentage ? condition.threshold : condition.threshold;

  switch (condition.operator) {
    case '<':
      return value < threshold;
    case '>':
      return value > threshold;
    case '<=':
      return value <= threshold;
    case '>=':
      return value >= threshold;
    case '=':
      return value === threshold;
    case '!=':
      return value !== threshold;
    default:
      return false;
  }
}

/**
 * Determine severity based on condition and value
 */
function determineSeverity(
  condition: AlertCondition,
  value: number
): 'info' | 'warning' | 'critical' {
  // Calculate how far from threshold we are
  const deviation = Math.abs(value - condition.threshold);
  const deviationPercent = (deviation / condition.threshold) * 100;

  if (deviationPercent >= 50) return 'critical';
  if (deviationPercent >= 20) return 'warning';
  return 'info';
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Create an alert service instance
 */
export function createAlertService(): AlertService {
  return {
    async evaluateAlerts(
      ctx: EvaluationContext,
      alertCondition: string
    ): Promise<Alert | null> {
      const parsed = parseAlertCondition(alertCondition);

      if (!parsed) {
        log.warn(` Could not parse alert condition: ${alertCondition}`);
        return null;
      }

      // Get current metric value
      const currentValue = await metricsService.getCurrentValue(
        ctx.baleybotId,
        parsed.metricName
      );

      if (currentValue === null) {
        log.info(
          ` No value for metric "${parsed.metricName}", skipping evaluation`
        );
        return null;
      }

      // Evaluate condition
      const triggered = evaluateCondition(parsed, currentValue);

      if (!triggered) {
        return null;
      }

      // Check if there's already an active alert for this condition
      const existingAlert = await db.query.baleybotAlerts.findFirst({
        where: and(
          eq(baleybotAlerts.baleybotId, ctx.baleybotId),
          eq(baleybotAlerts.alertCondition, alertCondition),
          eq(baleybotAlerts.status, 'active')
        ),
      });

      if (existingAlert) {
        log.info(
          ` Alert already active for condition: ${alertCondition}`
        );
        return null;
      }

      // Create new alert
      const severity = determineSeverity(parsed, currentValue);
      const message = generateAlertMessage(
        ctx.baleybotName || ctx.baleybotId,
        parsed,
        currentValue
      );

      const [newAlert] = await db
        .insert(baleybotAlerts)
        .values({
          workspaceId: ctx.workspaceId,
          baleybotId: ctx.baleybotId,
          alertCondition,
          triggeredValue: currentValue,
          thresholdValue: parsed.threshold,
          metricName: parsed.metricName,
          status: 'active',
          severity,
          message,
          context: {
            executionId: ctx.executionId,
            timestamp: new Date().toISOString(),
          },
        })
        .returning();

      if (!newAlert) {
        throw new Error('Failed to create alert');
      }

      log.info(
        `Created ${severity} alert for "${ctx.baleybotName}": ${message}`
      );

      return {
        id: newAlert.id,
        baleybotId: newAlert.baleybotId,
        workspaceId: newAlert.workspaceId,
        alertCondition: newAlert.alertCondition,
        triggeredValue: newAlert.triggeredValue,
        thresholdValue: newAlert.thresholdValue,
        metricName: newAlert.metricName,
        status: newAlert.status as Alert['status'],
        severity: newAlert.severity as Alert['severity'],
        triggeredAt: newAlert.triggeredAt,
        message: newAlert.message,
      };
    },

    async getActiveAlerts(baleybotId: string): Promise<Alert[]> {
      const results = await db.query.baleybotAlerts.findMany({
        where: and(
          eq(baleybotAlerts.baleybotId, baleybotId),
          eq(baleybotAlerts.status, 'active')
        ),
        orderBy: [desc(baleybotAlerts.triggeredAt)],
      });

      return results.map(mapAlertFromDB);
    },

    async getAlerts(
      baleybotId: string,
      options?: { limit?: number; offset?: number }
    ): Promise<Alert[]> {
      const results = await db.query.baleybotAlerts.findMany({
        where: eq(baleybotAlerts.baleybotId, baleybotId),
        orderBy: [desc(baleybotAlerts.triggeredAt)],
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      });

      return results.map(mapAlertFromDB);
    },

    async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
      await db
        .update(baleybotAlerts)
        .set({
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          acknowledgedBy: userId,
        })
        .where(eq(baleybotAlerts.id, alertId));

      log.info(` Alert ${alertId} acknowledged by ${userId}`);
    },

    async resolveAlert(alertId: string, userId: string): Promise<void> {
      await db
        .update(baleybotAlerts)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: userId,
        })
        .where(eq(baleybotAlerts.id, alertId));

      log.info(` Alert ${alertId} resolved by ${userId}`);
    },

    async notifyAlert(alert: Alert, userIds: string[]): Promise<void> {
      const notificationPromises = userIds.map((userId) =>
        db.insert(notifications).values({
          workspaceId: alert.workspaceId,
          userId,
          title: `Alert: ${alert.metricName || 'Metric'} threshold breached`,
          message: alert.message || alert.alertCondition,
          priority: alert.severity === 'critical' ? 'high' : 'normal',
          sourceType: 'baleybot',
          sourceId: alert.baleybotId,
        })
      );

      await Promise.all(notificationPromises);

      log.info(
        `Sent notifications to ${userIds.length} users for alert ${alert.id}`
      );
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function mapAlertFromDB(row: {
  id: string;
  baleybotId: string;
  workspaceId: string;
  alertCondition: string;
  triggeredValue: number | null;
  thresholdValue: number | null;
  metricName: string | null;
  status: string;
  severity: string;
  triggeredAt: Date;
  message: string | null;
}): Alert {
  return {
    id: row.id,
    baleybotId: row.baleybotId,
    workspaceId: row.workspaceId,
    alertCondition: row.alertCondition,
    triggeredValue: row.triggeredValue,
    thresholdValue: row.thresholdValue,
    metricName: row.metricName,
    status: row.status as Alert['status'],
    severity: row.severity as Alert['severity'],
    triggeredAt: row.triggeredAt,
    message: row.message,
  };
}

function generateAlertMessage(
  baleybotName: string,
  condition: AlertCondition,
  value: number
): string {
  const metricLabel = formatMetricName(condition.metricName);
  const unit = condition.isPercentage ? '%' : '';

  return `${baleybotName}: ${metricLabel} is ${value}${unit}, which is ${condition.operator} ${condition.threshold}${unit} threshold`;
}

function formatMetricName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Default alert service instance
 */
export const alertService = createAlertService();
