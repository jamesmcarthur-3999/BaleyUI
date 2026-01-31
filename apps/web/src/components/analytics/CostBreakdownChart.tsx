'use client';

import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { formatCost } from '@/lib/format';

interface CostBreakdownItem {
  label: string;
  cost: number;
  percentage: number;
}

interface CostBreakdownChartProps {
  data: CostBreakdownItem[];
  title?: string;
  colorScheme?: 'primary' | 'blocks' | 'models';
}

const COLOR_SCHEMES = {
  primary: 'hsl(var(--primary))',
  blocks: [
    'hsl(220, 70%, 50%)',
    'hsl(280, 70%, 50%)',
    'hsl(340, 70%, 50%)',
    'hsl(40, 70%, 50%)',
    'hsl(160, 70%, 50%)',
  ],
  models: [
    'hsl(200, 80%, 50%)',
    'hsl(260, 80%, 50%)',
    'hsl(320, 80%, 50%)',
    'hsl(20, 80%, 50%)',
    'hsl(140, 80%, 50%)',
  ],
};

export function CostBreakdownChart({
  data,
  title,
  colorScheme = 'primary',
}: CostBreakdownChartProps) {
  const getColor = (index: number): string => {
    if (colorScheme === 'primary') {
      return COLOR_SCHEMES.primary;
    }
    const colors = COLOR_SCHEMES[colorScheme];
    return colors[index % colors.length]!;
  };

  const chartData = data.map((item, index) => ({
    label: item.label,
    value: item.cost,
    color: getColor(index),
  }));

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-lg font-semibold">{title}</h3>
      )}

      <SimpleBarChart
        data={chartData}
        valueFormatter={(value) => formatCost(value)}
        showValues={true}
      />

      {/* Percentage breakdown */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {data.map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
          >
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: getColor(index) }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.label}</div>
              <div className="text-xs text-muted-foreground">
                {item.percentage.toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
