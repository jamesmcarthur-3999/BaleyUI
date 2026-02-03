'use client';

import { cn } from '@/lib/utils';

interface DataPoint {
  label: string;
  value: number;
  previousValue?: number;
}

interface TrendChartProps {
  title: string;
  data: DataPoint[];
  showComparison?: boolean;
  height?: number;
  className?: string;
}

export function TrendChart({
  title,
  data,
  showComparison = false,
  height = 200,
  className,
}: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-border/50 bg-card/50 p-5',
          className
        )}
      >
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div
          className="flex items-center justify-center text-muted-foreground text-sm"
          style={{ height }}
        >
          No data available
        </div>
      </div>
    );
  }

  // Find min/max for scaling
  const allValues = data.flatMap((d) =>
    showComparison && d.previousValue !== undefined
      ? [d.value, d.previousValue]
      : [d.value]
  );
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(0, ...allValues);
  const range = maxValue - minValue || 1;

  // Calculate bar positions
  const barWidth = 100 / data.length;
  const barPadding = 0.1; // 10% padding between bars

  // Scale value to chart height
  const scaleY = (value: number): number => {
    return ((value - minValue) / range) * (height - 40);
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/50 bg-card/50 p-5',
        className
      )}
    >
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>

      <div className="relative" style={{ height }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between text-xs text-muted-foreground">
          <span>{formatNumber(maxValue)}</span>
          <span>{formatNumber((maxValue + minValue) / 2)}</span>
          <span>{formatNumber(minValue)}</span>
        </div>

        {/* Chart area */}
        <div className="absolute left-14 right-0 top-0 bottom-8">
          <svg width="100%" height="100%" className="overflow-visible">
            {/* Grid lines */}
            <line
              x1="0"
              y1="0"
              x2="100%"
              y2="0"
              stroke="currentColor"
              strokeOpacity="0.1"
            />
            <line
              x1="0"
              y1="50%"
              x2="100%"
              y2="50%"
              stroke="currentColor"
              strokeOpacity="0.1"
            />
            <line
              x1="0"
              y1="100%"
              x2="100%"
              y2="100%"
              stroke="currentColor"
              strokeOpacity="0.1"
            />

            {/* Bars */}
            {data.map((point, i) => {
              const x = `${i * barWidth + barPadding * barWidth}%`;
              const barActualWidth = `${barWidth * (1 - 2 * barPadding)}%`;

              return (
                <g key={i}>
                  {/* Previous value bar (if comparison enabled) */}
                  {showComparison && point.previousValue !== undefined && (
                    <rect
                      x={x}
                      y={height - 40 - scaleY(point.previousValue)}
                      width={barActualWidth}
                      height={scaleY(point.previousValue)}
                      fill="currentColor"
                      fillOpacity="0.1"
                      rx="4"
                    />
                  )}

                  {/* Current value bar */}
                  <rect
                    x={x}
                    y={height - 40 - scaleY(point.value)}
                    width={barActualWidth}
                    height={scaleY(point.value)}
                    className="fill-primary"
                    fillOpacity="0.8"
                    rx="4"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* X-axis labels */}
        <div
          className="absolute left-14 right-0 bottom-0 h-8 flex justify-between items-end"
          style={{ padding: `0 ${barPadding * barWidth}%` }}
        >
          {data.map((point, i) => (
            <span
              key={i}
              className="text-xs text-muted-foreground truncate"
              style={{ width: `${barWidth}%` }}
            >
              {point.label}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      {showComparison && (
        <div className="flex items-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-primary/80" />
            <span className="text-muted-foreground">Current</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-current opacity-10" />
            <span className="text-muted-foreground">Previous</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}
