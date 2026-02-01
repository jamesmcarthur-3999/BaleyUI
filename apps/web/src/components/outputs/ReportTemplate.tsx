'use client';

import type { OutputData, LayoutConfig } from '@/lib/outputs/types';
import { MetricCard } from './components/MetricCard';
import { InsightCard } from './components/InsightCard';
import { ChartCard } from './components/ChartCard';
import { DataTable } from './components/DataTable';
import { TextBlock } from './components/TextBlock';
import { ActionCard } from './components/ActionCard';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface ReportTemplateProps {
  data: OutputData;
  layout?: LayoutConfig;
  className?: string;
  title?: string;
  description?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ReportTemplate({
  data,
  layout,
  className,
  title,
  description,
}: ReportTemplateProps) {
  const gap = layout?.gap ?? 6;

  return (
    <div className={cn('flex flex-col', className)} style={{ gap: `${gap * 0.25}rem` }}>
      {/* Header Section */}
      {(title || description) && (
        <div className="space-y-2">
          {title && <h2 className="text-2xl font-bold tracking-tight">{title}</h2>}
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      {/* Text Blocks */}
      {data.text && Object.entries(data.text).length > 0 && (
        <div className="space-y-4">
          {Object.entries(data.text).map(([key, config]) => (
            <TextBlock key={key} config={config} />
          ))}
        </div>
      )}

      {/* Key Metrics */}
      {data.metrics && Object.entries(data.metrics).length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data.metrics).map(([key, config]) => (
            <MetricCard key={key} config={config} />
          ))}
        </div>
      )}

      {/* Insights */}
      {data.insights && Object.entries(data.insights).length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(data.insights).map(([key, config]) => (
            <InsightCard key={key} config={config} />
          ))}
        </div>
      )}

      {/* Charts */}
      {data.charts && Object.entries(data.charts).length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(data.charts).map(([key, config]) => (
            <ChartCard key={key} config={config} />
          ))}
        </div>
      )}

      {/* Data Tables */}
      {data.tables && Object.entries(data.tables).length > 0 && (
        <div className="space-y-4">
          {Object.entries(data.tables).map(([key, config]) => (
            <DataTable key={key} config={config} />
          ))}
        </div>
      )}

      {/* Actions/Recommendations */}
      {data.actions && Object.entries(data.actions).length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(data.actions).map(([key, config]) => (
            <ActionCard key={key} config={config} />
          ))}
        </div>
      )}
    </div>
  );
}
