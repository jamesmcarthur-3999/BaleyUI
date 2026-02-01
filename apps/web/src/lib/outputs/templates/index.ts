/**
 * Output Templates Registry
 *
 * Pre-built layouts for common output types.
 */

import { z } from 'zod';
import type { OutputTemplate, LayoutConfig } from '../types';

// ============================================================================
// REPORT TEMPLATE
// ============================================================================

const reportLayout: LayoutConfig = {
  type: 'stack',
  gap: 6,
  sections: [
    {
      id: 'header',
      name: 'Report Header',
      componentType: 'text-block',
      props: { variant: 'default' },
    },
    {
      id: 'key-metrics',
      name: 'Key Metrics',
      componentType: 'metric-card',
    },
    {
      id: 'insights',
      name: 'Key Insights',
      componentType: 'insight-card',
    },
    {
      id: 'main-chart',
      name: 'Main Visualization',
      componentType: 'chart',
    },
    {
      id: 'data-table',
      name: 'Detailed Data',
      componentType: 'data-table',
    },
    {
      id: 'recommendations',
      name: 'Recommendations',
      componentType: 'action-card',
    },
  ],
};

const ReportDataSchema = z.object({
  title: z.string(),
  summary: z.string(),
  metrics: z.array(
    z.object({
      title: z.string(),
      value: z.union([z.string(), z.number()]),
      change: z
        .object({
          value: z.number(),
          direction: z.enum(['up', 'down', 'neutral']),
        })
        .optional(),
    })
  ),
  insights: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      severity: z.enum(['info', 'success', 'warning', 'critical']),
    })
  ),
  chartData: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
    })
  ),
  recommendations: z.array(z.string()).optional(),
});

export const reportTemplate: OutputTemplate = {
  id: 'report',
  type: 'report',
  name: 'Report',
  description: 'Text + charts + recommendations layout for analysis outputs',
  schema: ReportDataSchema,
  defaultLayout: reportLayout,
};

// ============================================================================
// DASHBOARD TEMPLATE
// ============================================================================

const dashboardLayout: LayoutConfig = {
  type: 'grid',
  columns: 4,
  gap: 4,
  sections: [
    {
      id: 'metric-1',
      componentType: 'metric-card',
      span: { columns: 1 },
    },
    {
      id: 'metric-2',
      componentType: 'metric-card',
      span: { columns: 1 },
    },
    {
      id: 'metric-3',
      componentType: 'metric-card',
      span: { columns: 1 },
    },
    {
      id: 'metric-4',
      componentType: 'metric-card',
      span: { columns: 1 },
    },
    {
      id: 'main-chart',
      componentType: 'chart',
      span: { columns: 2, rows: 2 },
    },
    {
      id: 'secondary-chart',
      componentType: 'chart',
      span: { columns: 2, rows: 2 },
    },
    {
      id: 'alerts',
      name: 'Active Alerts',
      componentType: 'insight-card',
      span: { columns: 2 },
    },
    {
      id: 'recent-data',
      name: 'Recent Activity',
      componentType: 'data-table',
      span: { columns: 2 },
    },
  ],
};

const DashboardDataSchema = z.object({
  metrics: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      value: z.union([z.string(), z.number()]),
      change: z
        .object({
          value: z.number(),
          direction: z.enum(['up', 'down', 'neutral']),
        })
        .optional(),
      color: z.enum(['default', 'success', 'warning', 'error']).optional(),
    })
  ),
  charts: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['line', 'bar', 'pie', 'area']),
      title: z.string(),
      data: z.array(
        z.object({
          label: z.string(),
          value: z.number(),
        })
      ),
    })
  ),
  alerts: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        severity: z.enum(['info', 'success', 'warning', 'critical']),
      })
    )
    .optional(),
  recentActivity: z
    .array(z.record(z.string(), z.unknown()))
    .optional(),
});

export const dashboardTemplate: OutputTemplate = {
  id: 'dashboard',
  type: 'dashboard',
  name: 'Dashboard',
  description: 'Live metrics + alerts layout for monitoring',
  schema: DashboardDataSchema,
  defaultLayout: dashboardLayout,
};

// ============================================================================
// DATA TABLE TEMPLATE
// ============================================================================

const dataTableLayout: LayoutConfig = {
  type: 'stack',
  gap: 4,
  sections: [
    {
      id: 'filters',
      componentType: 'filter-bar',
    },
    {
      id: 'summary-metrics',
      componentType: 'metric-card',
    },
    {
      id: 'main-table',
      componentType: 'data-table',
    },
  ],
};

const DataTableDataSchema = z.object({
  title: z.string(),
  columns: z.array(
    z.object({
      key: z.string(),
      header: z.string(),
      type: z
        .enum(['string', 'number', 'date', 'currency', 'percentage', 'badge'])
        .optional(),
      sortable: z.boolean().optional(),
    })
  ),
  data: z.array(z.record(z.string(), z.unknown())),
  summaryMetrics: z
    .array(
      z.object({
        title: z.string(),
        value: z.union([z.string(), z.number()]),
      })
    )
    .optional(),
});

export const dataTableTemplate: OutputTemplate = {
  id: 'data-table',
  type: 'data-table',
  name: 'Data Table',
  description: 'Sortable, filterable data table with drill-down',
  schema: DataTableDataSchema,
  defaultLayout: dataTableLayout,
};

// ============================================================================
// TEMPLATE REGISTRY
// ============================================================================

export const templates: Record<string, OutputTemplate> = {
  report: reportTemplate,
  dashboard: dashboardTemplate,
  'data-table': dataTableTemplate,
};

export function getTemplate(templateId: string): OutputTemplate | undefined {
  return templates[templateId];
}

export function listTemplates(): OutputTemplate[] {
  return Object.values(templates);
}
