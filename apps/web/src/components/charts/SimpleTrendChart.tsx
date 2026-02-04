'use client';

import { cn } from '@/lib/utils';

export interface TrendChartData {
  date: Date | string;
  value: number;
}

interface SimpleTrendChartProps {
  data: TrendChartData[];
  height?: number;
  color?: string;
  showDots?: boolean;
  valueFormatter?: (value: number) => string;
  dateFormatter?: (date: Date | string) => string;
  className?: string;
}

export function SimpleTrendChart({
  data,
  height = 200,
  color = 'hsl(var(--primary))',
  showDots = true,
  valueFormatter = (value) => value.toLocaleString(),
  dateFormatter = (date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },
  className,
}: SimpleTrendChartProps) {
  // Compute chart data
  const chartData = (() => {
    if (data.length === 0) return null;

    const values = data.map((d) => d.value);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;

    const padding = 20;
    const chartHeight = height - padding * 2;

    const points = data.map((item, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100;
      const normalizedValue = ((item.value - minValue) / range);
      const y = chartHeight - (normalizedValue * chartHeight);

      return { x, y, value: item.value, date: item.date };
    });

    // Create SVG path
    const pathData = points.map((p, i) => {
      const command = i === 0 ? 'M' : 'L';
      return `${command} ${p.x} ${p.y}`;
    }).join(' ');

    // Create area path (for fill)
    const lastPoint = points[points.length - 1]!;
    const areaData = pathData + ` L ${lastPoint.x} ${chartHeight} L 0 ${chartHeight} Z`;

    return {
      points,
      pathData,
      areaData,
      maxValue,
      minValue,
    };
  })();

  if (data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center text-muted-foreground text-sm', className)} style={{ height }}>
        No data available
      </div>
    );
  }

  if (!chartData) return null;

  return (
    <div className={cn('w-full', className)}>
      {/* Chart */}
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 100 ${height}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          {/* Area fill */}
          <path
            d={chartData.areaData}
            fill={color}
            fillOpacity="0.1"
          />

          {/* Line */}
          <path
            d={chartData.pathData}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots */}
          {showDots && chartData.points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="3"
              fill={color}
              className="hover:r-4 transition-all"
            >
              <title>
                {dateFormatter(point.date)}: {valueFormatter(point.value)}
              </title>
            </circle>
          ))}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-muted-foreground">
          <span>{valueFormatter(chartData.maxValue)}</span>
          <span>{valueFormatter(chartData.minValue)}</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        {data.length > 0 && (
          <>
            <span>{dateFormatter(data[0]!.date)}</span>
            {data.length > 1 && (
              <span>{dateFormatter(data[data.length - 1]!.date)}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
