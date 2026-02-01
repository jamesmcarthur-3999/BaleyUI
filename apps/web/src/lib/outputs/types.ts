/**
 * Output System Types
 *
 * Defines the type system for AI-generated outputs including templates,
 * components, and interactive elements.
 */

import { z } from 'zod';

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

/**
 * Available output template types
 */
export type OutputTemplateType =
  | 'report'
  | 'dashboard'
  | 'heatmap'
  | 'data-table'
  | 'chat'
  | 'custom';

/**
 * Template metadata
 */
export interface OutputTemplate {
  id: string;
  type: OutputTemplateType;
  name: string;
  description: string;
  schema: z.ZodType;
  defaultLayout: LayoutConfig;
}

// ============================================================================
// LAYOUT TYPES
// ============================================================================

export type LayoutType = 'single' | 'split' | 'grid' | 'stack' | 'tabs';

export interface LayoutConfig {
  type: LayoutType;
  columns?: number;
  rows?: number;
  gap?: number;
  sections: LayoutSection[];
}

export interface LayoutSection {
  id: string;
  name?: string;
  componentType: ComponentType;
  span?: { columns?: number; rows?: number };
  props?: Record<string, unknown>;
}

// ============================================================================
// COMPONENT TYPES
// ============================================================================

export type ComponentType =
  | 'chart'
  | 'metric-card'
  | 'insight-card'
  | 'data-table'
  | 'text-block'
  | 'heatmap'
  | 'timeline'
  | 'funnel'
  | 'action-card'
  | 'filter-bar'
  | 'custom';

// ============================================================================
// CHART TYPES
// ============================================================================

export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'donut'
  | 'area'
  | 'scatter'
  | 'funnel'
  | 'radar';

export interface ChartConfig {
  type: ChartType;
  title?: string;
  data: ChartDataPoint[];
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  legend?: LegendConfig;
  colors?: string[];
}

export interface ChartDataPoint {
  label: string;
  value: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface AxisConfig {
  label?: string;
  min?: number;
  max?: number;
  format?: string;
}

export interface LegendConfig {
  show: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
}

// ============================================================================
// METRIC CARD TYPES
// ============================================================================

export interface MetricCardConfig {
  title: string;
  value: string | number;
  change?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    period?: string;
  };
  icon?: string;
  color?: 'default' | 'success' | 'warning' | 'error';
  subtitle?: string;
}

// ============================================================================
// INSIGHT CARD TYPES
// ============================================================================

export type InsightSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface InsightCardConfig {
  title: string;
  description: string;
  severity: InsightSeverity;
  evidence?: string[];
  recommendations?: string[];
  relatedMetrics?: string[];
}

// ============================================================================
// DATA TABLE TYPES
// ============================================================================

export interface DataTableConfig {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  pagination?: {
    enabled: boolean;
    pageSize: number;
  };
  sorting?: {
    enabled: boolean;
    defaultColumn?: string;
    defaultDirection?: 'asc' | 'desc';
  };
  filtering?: {
    enabled: boolean;
    columns?: string[];
  };
}

export interface TableColumn {
  key: string;
  header: string;
  type?: 'string' | 'number' | 'date' | 'currency' | 'percentage' | 'badge';
  sortable?: boolean;
  filterable?: boolean;
  width?: number | string;
  format?: string;
}

// ============================================================================
// TEXT BLOCK TYPES
// ============================================================================

export type TextBlockFormat = 'plain' | 'markdown' | 'html';

export interface TextBlockConfig {
  content: string;
  format: TextBlockFormat;
  variant?: 'default' | 'callout' | 'quote' | 'code';
}

// ============================================================================
// ACTION CARD TYPES
// ============================================================================

export interface ActionCardConfig {
  title: string;
  description: string;
  actions: ActionItem[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ActionItem {
  label: string;
  type: 'primary' | 'secondary' | 'link';
  href?: string;
  onClick?: string; // Function name to call
}

// ============================================================================
// OUTPUT ARTIFACT
// ============================================================================

/**
 * A complete output artifact generated by AI
 */
export interface OutputArtifact {
  id: string;
  type: OutputTemplateType;
  title: string;
  description?: string;
  createdAt: Date;
  createdBy: {
    type: 'user' | 'ai-agent';
    id: string;
    name: string;
  };
  layout: LayoutConfig;
  data: OutputData;
  metadata?: {
    executionId?: string;
    blockId?: string;
    flowId?: string;
    version?: number;
  };
}

/**
 * Data payload for an output artifact
 */
export interface OutputData {
  charts?: Record<string, ChartConfig>;
  metrics?: Record<string, MetricCardConfig>;
  insights?: Record<string, InsightCardConfig>;
  tables?: Record<string, DataTableConfig>;
  text?: Record<string, TextBlockConfig>;
  actions?: Record<string, ActionCardConfig>;
  raw?: Record<string, unknown>;
}

// ============================================================================
// ZOD SCHEMAS FOR VALIDATION
// ============================================================================

export const ChartDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  category: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ChartConfigSchema = z.object({
  type: z.enum(['line', 'bar', 'pie', 'donut', 'area', 'scatter', 'funnel', 'radar']),
  title: z.string().optional(),
  data: z.array(ChartDataPointSchema),
  colors: z.array(z.string()).optional(),
});

export const MetricCardConfigSchema = z.object({
  title: z.string(),
  value: z.union([z.string(), z.number()]),
  change: z
    .object({
      value: z.number(),
      direction: z.enum(['up', 'down', 'neutral']),
      period: z.string().optional(),
    })
    .optional(),
  icon: z.string().optional(),
  color: z.enum(['default', 'success', 'warning', 'error']).optional(),
  subtitle: z.string().optional(),
});

export const InsightCardConfigSchema = z.object({
  title: z.string(),
  description: z.string(),
  severity: z.enum(['info', 'success', 'warning', 'critical']),
  evidence: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
});

export const OutputDataSchema = z.object({
  charts: z.record(z.string(), ChartConfigSchema).optional(),
  metrics: z.record(z.string(), MetricCardConfigSchema).optional(),
  insights: z.record(z.string(), InsightCardConfigSchema).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});
