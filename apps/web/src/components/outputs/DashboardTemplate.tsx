'use client';

import type { OutputData, LayoutConfig, LayoutSection } from '@/lib/outputs/types';
import { MetricCard } from './components/MetricCard';
import { InsightCard } from './components/InsightCard';
import { ChartCard } from './components/ChartCard';
import { DataTable } from './components/DataTable';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardTemplateProps {
  data: OutputData;
  layout?: LayoutConfig;
  className?: string;
}

// ============================================================================
// GRID LAYOUT HELPER
// ============================================================================

function getGridSpan(section: LayoutSection): string {
  const colSpan = section.span?.columns ?? 1;
  const rowSpan = section.span?.rows ?? 1;

  const colClasses: Record<number, string> = {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
  };

  const rowClasses: Record<number, string> = {
    1: '',
    2: 'row-span-2',
    3: 'row-span-3',
  };

  return cn(colClasses[colSpan] || 'col-span-1', rowClasses[rowSpan] || '');
}

// ============================================================================
// SECTION RENDERER
// ============================================================================

function renderSection(
  section: LayoutSection,
  data: OutputData
): React.ReactNode {
  switch (section.componentType) {
    case 'metric-card': {
      // Look for a metric matching this section ID or render all if ID is generic
      const metricKey = section.id.replace('metric-', '');
      const metric = data.metrics?.[metricKey] || data.metrics?.[section.id];

      if (metric) {
        return <MetricCard config={metric} className="h-full" />;
      }

      // For generic metric slots (metric-1, metric-2, etc.), render by index
      if (section.id.startsWith('metric-') && data.metrics) {
        const index = parseInt(section.id.replace('metric-', '')) - 1;
        const metrics = Object.values(data.metrics);
        if (metrics[index]) {
          return <MetricCard config={metrics[index]} className="h-full" />;
        }
      }

      return null;
    }

    case 'chart': {
      const chartKey = section.id.replace('-chart', '');
      const chart =
        data.charts?.[chartKey] ||
        data.charts?.[section.id] ||
        data.charts?.['main'] ||
        data.charts?.['secondary'];

      if (chart) {
        return <ChartCard config={chart} className="h-full" />;
      }

      // For generic chart slots, render by index
      if (section.id.includes('chart') && data.charts) {
        const isMain = section.id.includes('main');
        const charts = Object.values(data.charts);
        const chart = isMain ? charts[0] : charts[1];
        if (chart) {
          return <ChartCard config={chart} className="h-full" />;
        }
      }

      return null;
    }

    case 'insight-card': {
      const insights = data.insights;
      if (!insights || Object.keys(insights).length === 0) {
        return null;
      }

      return (
        <div className="space-y-3 h-full">
          {section.name && (
            <h3 className="text-sm font-medium text-muted-foreground">
              {section.name}
            </h3>
          )}
          <div className="space-y-2">
            {Object.entries(insights)
              .slice(0, 3)
              .map(([key, config]) => (
                <InsightCard key={key} config={config} />
              ))}
          </div>
        </div>
      );
    }

    case 'data-table': {
      const tableKey = section.id.replace('-table', '').replace('-data', '');
      const table =
        data.tables?.[tableKey] ||
        data.tables?.[section.id] ||
        data.tables?.['main'] ||
        data.tables?.['recent'];

      if (!table && data.tables) {
        const tables = Object.values(data.tables);
        if (tables[0]) {
          return (
            <div className="h-full">
              {section.name && (
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  {section.name}
                </h3>
              )}
              <DataTable config={tables[0]} />
            </div>
          );
        }
      }

      if (table) {
        return (
          <div className="h-full">
            {section.name && (
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {section.name}
              </h3>
            )}
            <DataTable config={table} />
          </div>
        );
      }

      return null;
    }

    default:
      return null;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DashboardTemplate({
  data,
  layout,
  className,
}: DashboardTemplateProps) {
  const columns = layout?.columns ?? 4;
  const gap = layout?.gap ?? 4;
  const sections = layout?.sections ?? [];

  // Default grid layout if no layout provided
  const defaultSections: LayoutSection[] = [
    { id: 'metric-1', componentType: 'metric-card', span: { columns: 1 } },
    { id: 'metric-2', componentType: 'metric-card', span: { columns: 1 } },
    { id: 'metric-3', componentType: 'metric-card', span: { columns: 1 } },
    { id: 'metric-4', componentType: 'metric-card', span: { columns: 1 } },
    { id: 'main-chart', componentType: 'chart', span: { columns: 2, rows: 2 } },
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
  ];

  const activeSections = sections.length > 0 ? sections : defaultSections;

  const gridClasses: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    6: 'grid-cols-6',
  };

  return (
    <div
      className={cn(
        'grid',
        gridClasses[columns] || 'grid-cols-4',
        className
      )}
      style={{ gap: `${gap * 0.25}rem` }}
    >
      {activeSections.map((section) => {
        const content = renderSection(section, data);
        if (!content) return null;

        return (
          <div key={section.id} className={getGridSpan(section)}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
