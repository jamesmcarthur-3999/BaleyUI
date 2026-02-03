'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChartConfig } from '@/lib/outputs/types';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface ChartCardProps {
  config: ChartConfig;
  className?: string;
}

// ============================================================================
// SIMPLE BAR CHART (NATIVE)
// ============================================================================

function SimpleBarChart({ data, colors }: { data: ChartConfig['data']; colors?: string[] }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value));
  const defaultColors = [
    'hsl(var(--primary))',
    'hsl(var(--chart-1, var(--primary)))',
    'hsl(var(--chart-2, var(--primary)))',
    'hsl(var(--chart-3, var(--primary)))',
    'hsl(var(--chart-4, var(--primary)))',
  ];
  const chartColors = colors || defaultColors;

  return (
    <div className="h-48 flex items-end gap-2 pt-4">
      {data.map((item, index) => {
        const height = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        const color = chartColors[index % chartColors.length];

        return (
          <div key={index} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex flex-col items-center justify-end h-36">
              <span className="text-xs font-medium mb-1">{item.value}</span>
              <div
                className="w-full rounded-t transition-all duration-300"
                style={{
                  height: `${height}%`,
                  backgroundColor: color,
                  minHeight: height > 0 ? '4px' : '0',
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-full px-1">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// SIMPLE LINE CHART (NATIVE SVG)
// ============================================================================

function SimpleLineChart({ data, colors }: { data: ChartConfig['data']; colors?: string[] }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(...data.map((d) => d.value));
  const range = maxValue - minValue || 1;
  const padding = 24;
  const width = 100;
  const height = 48;

  const color = colors?.[0] || 'hsl(var(--primary))';

  // Generate SVG path
  const points = data.map((item, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * (width - padding * 2);
    const y = height - padding - ((item.value - minValue) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  return (
    <div className="h-48 w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {/* Grid lines */}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="currentColor"
          strokeOpacity={0.1}
        />
        <line
          x1={padding}
          y1={padding}
          x2={width - padding}
          y2={padding}
          stroke="currentColor"
          strokeOpacity={0.1}
        />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {data.map((item, index) => {
          const x = padding + (index / (data.length - 1 || 1)) * (width - padding * 2);
          const y = height - padding - ((item.value - minValue) / range) * (height - padding * 2);
          return (
            <circle key={index} cx={x} cy={y} r={1} fill={color} />
          );
        })}
      </svg>

      {/* Labels */}
      <div className="flex justify-between px-2 mt-2">
        <span className="text-xs text-muted-foreground">{data[0]?.label}</span>
        <span className="text-xs text-muted-foreground">{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

// ============================================================================
// SIMPLE PIE CHART (NATIVE SVG)
// ============================================================================

function SimplePieChart({ data, colors }: { data: ChartConfig['data']; colors?: string[] }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  const defaultColors = [
    'hsl(var(--primary))',
    'hsl(var(--chart-1, 220 70% 50%))',
    'hsl(var(--chart-2, 160 60% 45%))',
    'hsl(var(--chart-3, 30 80% 55%))',
    'hsl(var(--chart-4, 280 65% 60%))',
  ];
  const chartColors = colors || defaultColors;

  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = -90; // Start at top

  const slices = data.map((item, index) => {
    const percentage = total > 0 ? item.value / total : 0;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    // SVG arc calculation
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;

    const pathD =
      angle >= 360
        ? `M 50 10 A 40 40 0 1 1 49.99 10 Z`
        : `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return {
      ...item,
      pathD,
      color: chartColors[index % chartColors.length],
      percentage: Math.round(percentage * 100),
    };
  });

  return (
    <div className="h-48 flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-full aspect-square">
        {slices.map((slice, index) => (
          <path
            key={index}
            d={slice.pathD}
            fill={slice.color}
            stroke="hsl(var(--background))"
            strokeWidth={0.5}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex-1 space-y-1">
        {slices.slice(0, 5).map((slice, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: slice.color }}
            />
            <span className="truncate flex-1">{slice.label}</span>
            <span className="text-muted-foreground">{slice.percentage}%</span>
          </div>
        ))}
        {slices.length > 5 && (
          <span className="text-xs text-muted-foreground">+{slices.length - 5} more</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ChartCard({ config, className }: ChartCardProps) {
  const { type, title, data, colors } = config;

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return <SimpleBarChart data={data} colors={colors} />;
      case 'line':
      case 'area':
        return <SimpleLineChart data={data} colors={colors} />;
      case 'pie':
      case 'donut':
        return <SimplePieChart data={data} colors={colors} />;
      default:
        return <SimpleBarChart data={data} colors={colors} />;
    }
  };

  return (
    <Card className={cn(className)}>
      {title && (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(!title && 'pt-6')}>
        {renderChart()}
      </CardContent>
    </Card>
  );
}
