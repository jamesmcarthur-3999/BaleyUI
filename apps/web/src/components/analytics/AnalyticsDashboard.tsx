'use client';

import { MetricCard } from './MetricCard';
import { TrendChart } from './TrendChart';
import { TopNList } from './TopNList';
import type { MetricDefinition, AnalyticsSchema } from '@/lib/baleybot/analytics/schema-parser';
import { cn } from '@/lib/utils';

interface MetricData {
  name: string;
  value: number | null;
  change?: number;
  trendData?: Array<{ label: string; value: number; previousValue?: number }>;
  topNData?: Array<{ label: string; value: number; percentage?: number }>;
}

interface AnalyticsDashboardProps {
  schema: AnalyticsSchema;
  metricsData: MetricData[];
  loading?: boolean;
  className?: string;
}

export function AnalyticsDashboard({
  schema,
  metricsData,
  loading = false,
  className,
}: AnalyticsDashboardProps) {
  // Create a lookup map for metric data
  const dataMap = new Map(metricsData.map((d) => [d.name, d]));

  // Separate metrics by display type
  const cardMetrics = schema.track.filter(
    (m) => m.type === 'count' || m.type === 'average' || m.type === 'percentage'
  );
  const trendMetrics = schema.track.filter((m) => m.type === 'trend');
  const topNMetrics = schema.track.filter((m) => m.type === 'top_n');
  const distributionMetrics = schema.track.filter(
    (m) => m.type === 'distribution'
  );

  const getMetricUnit = (def: MetricDefinition): string | undefined => {
    if (def.type === 'percentage') return '%';
    if (def.field === 'duration_ms') return 'ms';
    return undefined;
  };

  const getComparisonLabel = (): string => {
    switch (schema.compare) {
      case 'day_over_day':
        return 'vs yesterday';
      case 'week_over_week':
        return 'vs last week';
      case 'month_over_month':
        return 'vs last month';
      default:
        return 'vs last period';
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* KPI Cards */}
      {cardMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cardMetrics.map((metric) => {
            const data = dataMap.get(metric.name);
            return (
              <MetricCard
                key={metric.name}
                title={formatMetricName(metric.name)}
                value={data?.value ?? 0}
                unit={getMetricUnit(metric)}
                change={data?.change}
                changePeriod={getComparisonLabel()}
                description={metric.description}
                loading={loading}
              />
            );
          })}
        </div>
      )}

      {/* Trend Charts */}
      {trendMetrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {trendMetrics.map((metric) => {
            const data = dataMap.get(metric.name);
            return (
              <TrendChart
                key={metric.name}
                title={formatMetricName(metric.name)}
                data={data?.trendData ?? []}
                showComparison={!!schema.compare}
                height={200}
              />
            );
          })}
        </div>
      )}

      {/* Top N Lists */}
      {topNMetrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {topNMetrics.map((metric) => {
            const data = dataMap.get(metric.name);
            return (
              <TopNList
                key={metric.name}
                title={formatMetricName(metric.name)}
                items={data?.topNData ?? []}
                maxItems={metric.n ?? 5}
              />
            );
          })}
        </div>
      )}

      {/* Distribution Charts (rendered as bar charts) */}
      {distributionMetrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {distributionMetrics.map((metric) => {
            const data = dataMap.get(metric.name);
            // Convert distribution data to trend chart format
            const chartData = (data?.topNData ?? []).map((item) => ({
              label: item.label,
              value: item.value,
            }));
            return (
              <TrendChart
                key={metric.name}
                title={formatMetricName(metric.name)}
                data={chartData}
                height={200}
              />
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {schema.track.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No metrics configured for this BaleyBot.</p>
          <p className="text-sm mt-2">
            Add an analytics block to your BAL code to track metrics.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Convert snake_case metric name to readable format
 */
function formatMetricName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Export individual components for custom layouts
 */
export { MetricCard, TrendChart, TopNList };
