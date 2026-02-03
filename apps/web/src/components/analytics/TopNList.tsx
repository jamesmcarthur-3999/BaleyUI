'use client';

import { cn } from '@/lib/utils';

interface TopNItem {
  label: string;
  value: number;
  percentage?: number;
}

interface TopNListProps {
  title: string;
  items: TopNItem[];
  maxItems?: number;
  showPercentage?: boolean;
  className?: string;
}

export function TopNList({
  title,
  items,
  maxItems = 5,
  showPercentage = true,
  className,
}: TopNListProps) {
  const displayItems = items.slice(0, maxItems);
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/50 bg-card/50 p-5',
        className
      )}
    >
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>

      {displayItems.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          No data available
        </div>
      ) : (
        <div className="space-y-3">
          {displayItems.map((item, index) => {
            const percentage = item.percentage ?? (item.value / maxValue) * 100;

            return (
              <div key={index} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate pr-2">{item.label}</span>
                  <span className="text-muted-foreground shrink-0">
                    {formatValue(item.value)}
                    {showPercentage && (
                      <span className="ml-1 text-xs">
                        ({percentage.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/80 transition-all duration-500"
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {items.length > maxItems && (
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Showing top {maxItems} of {items.length}
        </p>
      )}
    </div>
  );
}

function formatValue(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}
