/**
 * Analytics Schema Parser
 *
 * Parses the "analytics" block from BAL code and validates metric definitions.
 * Supports various metric types for tracking BB execution outcomes.
 *
 * Example BAL analytics block:
 * ```bal
 * analytics {
 *   "track": [
 *     { "name": "total_runs", "type": "count" },
 *     { "name": "avg_duration", "type": "average", "field": "duration_ms" },
 *     { "name": "success_rate", "type": "percentage", "condition": "status = 'completed'" },
 *     { "name": "top_intents", "type": "top_n", "field": "intent", "n": 5 },
 *     { "name": "usage_trend", "type": "trend", "field": "total_runs" },
 *     { "name": "duration_dist", "type": "distribution", "field": "duration_ms" }
 *   ],
 *   "compare": "week_over_week",
 *   "alert_when": "success_rate < 80%"
 * }
 * ```
 */

import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Types of metrics that can be tracked
 */
export type MetricType =
  | 'count'        // Total count of executions
  | 'average'      // Average of a numeric field
  | 'percentage'   // Percentage meeting a condition
  | 'top_n'        // Top N values of a field
  | 'trend'        // Trend over time
  | 'distribution' // Distribution of values

/**
 * Comparison periods for trend analysis
 */
export type ComparisonPeriod =
  | 'day_over_day'
  | 'week_over_week'
  | 'month_over_month';

/**
 * Definition of a single metric
 */
export interface MetricDefinition {
  /** Unique name for this metric */
  name: string;
  /** Type of metric calculation */
  type: MetricType;
  /** Field to calculate on (for average, top_n, distribution) */
  field?: string;
  /** SQL-like condition (for percentage) */
  condition?: string;
  /** Number of items (for top_n) */
  n?: number;
  /** Description of the metric */
  description?: string;
}

/**
 * Complete analytics schema for a BaleyBot
 */
export interface AnalyticsSchema {
  /** Metrics to track */
  track: MetricDefinition[];
  /** Comparison period for trend analysis */
  compare?: ComparisonPeriod;
  /** Condition that triggers an alert */
  alertWhen?: string;
}

/**
 * Validation result with errors and warnings
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const metricTypeSchema = z.enum([
  'count',
  'average',
  'percentage',
  'top_n',
  'trend',
  'distribution',
]);

const comparisonPeriodSchema = z.enum([
  'day_over_day',
  'week_over_week',
  'month_over_month',
]);

const metricDefinitionSchema = z.object({
  name: z.string().min(1, 'Metric name is required'),
  type: metricTypeSchema,
  field: z.string().optional(),
  condition: z.string().optional(),
  n: z.number().int().positive().optional(),
  description: z.string().optional(),
});

const analyticsSchemaZod = z.object({
  track: z.array(metricDefinitionSchema).min(1, 'At least one metric is required'),
  compare: comparisonPeriodSchema.optional(),
  alert_when: z.string().optional(),
  alertWhen: z.string().optional(),
});

// ============================================================================
// PARSER FUNCTIONS
// ============================================================================

/**
 * Parse analytics schema from a raw config object
 */
export function parseAnalyticsSchema(
  config: unknown
): AnalyticsSchema | null {
  if (!config || typeof config !== 'object') {
    return null;
  }

  try {
    const parsed = analyticsSchemaZod.parse(config);

    return {
      track: parsed.track.map((m) => ({
        name: m.name,
        type: m.type,
        field: m.field,
        condition: m.condition,
        n: m.n,
        description: m.description,
      })),
      compare: parsed.compare,
      alertWhen: parsed.alert_when || parsed.alertWhen,
    };
  } catch {
    return null;
  }
}

/**
 * Extract analytics schema from BAL code
 */
export function extractAnalyticsFromBAL(balCode: string): AnalyticsSchema | null {
  // Match the analytics block
  const analyticsMatch = balCode.match(/analytics\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);

  if (!analyticsMatch || !analyticsMatch[1]) {
    return null;
  }

  try {
    // Convert BAL-style config to JSON
    let configStr = analyticsMatch[1].trim();

    // Handle BAL-style keys (unquoted)
    configStr = configStr.replace(/(\w+)\s*:/g, '"$1":');

    // Parse as JSON
    const config = JSON.parse(`{${configStr}}`);

    return parseAnalyticsSchema(config);
  } catch (error) {
    console.error('[analytics] Failed to parse analytics block:', error);
    return null;
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate an analytics schema
 */
export function validateAnalyticsSchema(
  schema: AnalyticsSchema
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for unique metric names
  const names = new Set<string>();
  for (const metric of schema.track) {
    if (names.has(metric.name)) {
      errors.push(`Duplicate metric name: "${metric.name}"`);
    }
    names.add(metric.name);
  }

  // Validate each metric
  for (const metric of schema.track) {
    validateMetric(metric, errors, warnings);
  }

  // Validate alert condition
  if (schema.alertWhen) {
    validateAlertCondition(schema.alertWhen, names, errors, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a single metric definition
 */
function validateMetric(
  metric: MetricDefinition,
  errors: string[],
  warnings: string[]
): void {
  // Validate name format
  if (!/^[a-z][a-z0-9_]*$/.test(metric.name)) {
    errors.push(
      `Metric name "${metric.name}" must start with a letter and contain only lowercase letters, numbers, and underscores`
    );
  }

  // Type-specific validation
  switch (metric.type) {
    case 'count':
      // Count doesn't require additional fields
      if (metric.field) {
        warnings.push(
          `Metric "${metric.name}": "field" is ignored for count metrics`
        );
      }
      break;

    case 'average':
    case 'distribution':
      // These require a field
      if (!metric.field) {
        errors.push(
          `Metric "${metric.name}": "${metric.type}" metrics require a "field" property`
        );
      }
      break;

    case 'percentage':
      // Percentage requires a condition
      if (!metric.condition) {
        errors.push(
          `Metric "${metric.name}": percentage metrics require a "condition" property`
        );
      }
      break;

    case 'top_n':
      // Top N requires field and n
      if (!metric.field) {
        errors.push(
          `Metric "${metric.name}": top_n metrics require a "field" property`
        );
      }
      if (!metric.n || metric.n < 1) {
        errors.push(
          `Metric "${metric.name}": top_n metrics require a positive "n" value`
        );
      }
      if (metric.n && metric.n > 100) {
        warnings.push(
          `Metric "${metric.name}": n=${metric.n} is unusually large for top_n`
        );
      }
      break;

    case 'trend':
      // Trend requires a field
      if (!metric.field) {
        errors.push(
          `Metric "${metric.name}": trend metrics require a "field" property`
        );
      }
      break;
  }
}

/**
 * Validate alert condition syntax
 */
function validateAlertCondition(
  condition: string,
  metricNames: Set<string>,
  errors: string[],
  warnings: string[]
): void {
  // Simple validation - check for metric references
  const metricRefs = condition.match(/[a-z_][a-z0-9_]*/g) || [];

  for (const ref of metricRefs) {
    // Skip operators and common keywords
    if (['and', 'or', 'not', 'true', 'false'].includes(ref)) {
      continue;
    }

    // Check if it's a known metric
    if (!metricNames.has(ref)) {
      warnings.push(
        `Alert condition references unknown metric or variable: "${ref}"`
      );
    }
  }

  // Check for basic syntax issues
  if (!condition.match(/[<>=!]/)) {
    errors.push('Alert condition must include a comparison operator (<, >, =, !=, <=, >=)');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get a human-readable description of a metric type
 */
export function getMetricTypeDescription(type: MetricType): string {
  switch (type) {
    case 'count':
      return 'Total count of executions';
    case 'average':
      return 'Average value of a numeric field';
    case 'percentage':
      return 'Percentage of executions meeting a condition';
    case 'top_n':
      return 'Most frequent values of a field';
    case 'trend':
      return 'Change over time';
    case 'distribution':
      return 'Distribution of values across ranges';
  }
}

/**
 * Get default metrics for a BaleyBot
 */
export function getDefaultMetrics(): MetricDefinition[] {
  return [
    {
      name: 'total_executions',
      type: 'count',
      description: 'Total number of executions',
    },
    {
      name: 'success_rate',
      type: 'percentage',
      condition: "status = 'completed'",
      description: 'Percentage of successful executions',
    },
    {
      name: 'avg_duration',
      type: 'average',
      field: 'duration_ms',
      description: 'Average execution duration in milliseconds',
    },
  ];
}

/**
 * Serialize an analytics schema back to BAL format
 */
export function serializeToBAL(schema: AnalyticsSchema): string {
  const lines: string[] = ['analytics {'];

  // Track array
  lines.push('  "track": [');
  for (let i = 0; i < schema.track.length; i++) {
    const metric = schema.track[i]!;
    const parts: string[] = [
      `"name": "${metric.name}"`,
      `"type": "${metric.type}"`,
    ];

    if (metric.field) parts.push(`"field": "${metric.field}"`);
    if (metric.condition) parts.push(`"condition": "${metric.condition}"`);
    if (metric.n) parts.push(`"n": ${metric.n}`);
    if (metric.description) parts.push(`"description": "${metric.description}"`);

    const suffix = i < schema.track.length - 1 ? ',' : '';
    lines.push(`    { ${parts.join(', ')} }${suffix}`);
  }
  lines.push('  ],');

  // Compare
  if (schema.compare) {
    lines.push(`  "compare": "${schema.compare}",`);
  }

  // Alert when
  if (schema.alertWhen) {
    lines.push(`  "alert_when": "${schema.alertWhen}"`);
  }

  lines.push('}');

  return lines.join('\n');
}
