'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { DollarSign, TrendingUp, Blocks } from 'lucide-react';
import { formatCost } from '@/lib/format';

interface CostSummary {
  totalCost: number;
  costByBlock: Array<{
    blockId: string;
    name: string;
    cost: number;
    executions: number;
  }>;
  costByModel: Array<{
    model: string;
    cost: number;
    tokenCount: number;
    executions: number;
  }>;
}

interface CostDashboardProps {
  data: CostSummary;
  isLoading?: boolean;
}

export function CostDashboard({ data, isLoading }: CostDashboardProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalExecutions = data.costByBlock.reduce((sum, item) => sum + item.executions, 0);
  const avgCostPerExecution = totalExecutions > 0 ? data.totalCost / totalExecutions : 0;

  const topBlock = data.costByBlock[0];
  const topModel = data.costByModel[0];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total Cost */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCost(data.totalCost)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalExecutions.toLocaleString()} executions
            </p>
          </CardContent>
        </Card>

        {/* Average Cost */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg per Execution</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCost(avgCostPerExecution)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all blocks
            </p>
          </CardContent>
        </Card>

        {/* Top Spender */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Highest Cost Block</CardTitle>
            <Blocks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {topBlock ? formatCost(topBlock.cost) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {topBlock ? topBlock.name : 'No data'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost by Block Chart */}
      {data.costByBlock.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost by Block</CardTitle>
            <CardDescription>Total cost per block in descending order</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={data.costByBlock.slice(0, 10).map((item) => ({
                label: item.name,
                value: item.cost,
                color: 'hsl(var(--primary))',
              }))}
              valueFormatter={(value) => formatCost(value)}
              showValues={true}
            />
          </CardContent>
        </Card>
      )}

      {/* Cost by Model Table */}
      {data.costByModel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost by Model</CardTitle>
            <CardDescription>Breakdown of costs per AI model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.costByModel.map((item, index) => {
                const percentage = (item.cost / data.totalCost) * 100;
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div className="flex flex-col gap-1 flex-1">
                      <span className="font-mono text-sm font-medium">{item.model}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{item.executions.toLocaleString()} executions</span>
                        <span>•</span>
                        <span>{item.tokenCount.toLocaleString()} tokens</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-semibold text-sm">{formatCost(item.cost)}</span>
                      <span className="text-xs text-muted-foreground">
                        {percentage.toFixed(1)}% of total
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {data.costByBlock.length === 0 && data.costByModel.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No cost data available</p>
              <p className="text-xs mt-1">Execute some AI blocks to see cost analytics</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
