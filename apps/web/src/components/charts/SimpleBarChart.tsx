'use client';

import { cn } from '@/lib/utils';

export interface BarChartData {
  label: string;
  value: number;
  color?: string;
}

interface SimpleBarChartProps {
  data: BarChartData[];
  maxValue?: number;
  height?: number;
  showValues?: boolean;
  valueFormatter?: (value: number) => string;
  className?: string;
}

export function SimpleBarChart({
  data,
  maxValue,
  height = 200,
  showValues = true,
  valueFormatter = (value) => value.toLocaleString(),
  className,
}: SimpleBarChartProps) {
  const max = maxValue || Math.max(...data.map((d) => d.value), 1);
  const barHeight = 32;
  const gap = 8;

  return (
    <div className={cn('w-full', className)}>
      <div className="space-y-2">
        {data.map((item, index) => {
          const percentage = (item.value / max) * 100;
          const barColor = item.color || 'hsl(var(--primary))';

          return (
            <div key={index} className="flex items-center gap-3">
              {/* Label */}
              <div className="w-32 flex-shrink-0 text-sm font-medium truncate">
                {item.label}
              </div>

              {/* Bar */}
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-8 bg-muted rounded-md overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 ease-out flex items-center justify-end px-2"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: barColor,
                      minWidth: percentage > 0 ? '2%' : '0%',
                    }}
                  >
                    {showValues && percentage > 15 && (
                      <span className="text-xs font-semibold text-white">
                        {valueFormatter(item.value)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Value (outside bar if narrow) */}
                {showValues && percentage <= 15 && (
                  <span className="text-xs font-semibold text-muted-foreground w-16 text-right">
                    {valueFormatter(item.value)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.length === 0 && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          No data available
        </div>
      )}
    </div>
  );
}
