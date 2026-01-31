'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';
import { CostDashboard } from '@/components/analytics/CostDashboard';
import { CostBreakdownChart } from '@/components/analytics/CostBreakdownChart';
import { SimpleTrendChart } from '@/components/charts/SimpleTrendChart';
import { trpc } from '@/lib/trpc/client';
import { formatCost } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { TrendingUp } from 'lucide-react';
import { usePersistedDateRange } from '@/hooks';

export default function CostsPage() {
  // Use persisted date range
  const { startDate, endDate, setRange } = usePersistedDateRange();

  // Fetch cost summary
  const { data: costSummary, isLoading: isLoadingCost } = trpc.analytics.getCostSummary.useQuery({
    startDate,
    endDate,
  });

  // Calculate date range metrics
  const daysInRange = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const granularity = daysInRange <= 7 ? 'day' : daysInRange <= 30 ? 'day' : 'week';

  // Fetch cost trend
  const { data: costTrend, isLoading: isLoadingTrend } = trpc.analytics.getCostTrend.useQuery({
    startDate,
    endDate,
    granularity,
  });

  // Calculate projected monthly cost
  const dailyAvgCost = costSummary ? costSummary.totalCost / daysInRange : 0;
  const projectedMonthlyCost = dailyAvgCost * 30;

  // Prepare breakdown data for chart
  const blockBreakdownData = costSummary?.costByBlock.map((block) => ({
    label: block.name,
    cost: block.cost,
    percentage: (block.cost / (costSummary.totalCost || 1)) * 100,
  })) || [];

  const modelBreakdownData = costSummary?.costByModel.map((model) => ({
    label: model.model,
    cost: model.cost,
    percentage: (model.cost / (costSummary.totalCost || 1)) * 100,
  })) || [];

  return (
    <div className="container py-10">
      <Breadcrumbs
        items={[
          { label: 'Analytics', href: ROUTES.analytics.overview },
          { label: 'Costs' },
        ]}
        className="mb-6"
      />

      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cost Analysis</h1>
            <p className="text-muted-foreground">
              Detailed breakdown of AI model costs and spending trends
            </p>
          </div>
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={setRange} />
        </div>

        {/* Cost Dashboard */}
        {costSummary && <CostDashboard data={costSummary} isLoading={isLoadingCost} />}

        {/* Cost Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Trend</CardTitle>
            <CardDescription>
              Spending over time in the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTrend ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <SimpleTrendChart
                data={
                  costTrend?.data.map((item) => ({
                    date: item.date,
                    value: item.cost,
                  })) || []
                }
                height={250}
                valueFormatter={(value) => formatCost(value)}
              />
            )}
          </CardContent>
        </Card>

        {/* Breakdown Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Cost by Block */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Block</CardTitle>
              <CardDescription>
                Which blocks are consuming the most budget
              </CardDescription>
            </CardHeader>
            <CardContent>
              {blockBreakdownData.length > 0 ? (
                <CostBreakdownChart
                  data={blockBreakdownData.slice(0, 10)}
                  colorScheme="blocks"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cost by Model */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Model</CardTitle>
              <CardDescription>
                Which AI models are being used most
              </CardDescription>
            </CardHeader>
            <CardContent>
              {modelBreakdownData.length > 0 ? (
                <CostBreakdownChart
                  data={modelBreakdownData}
                  colorScheme="models"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Projected Monthly Cost */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Projected Monthly Cost
            </CardTitle>
            <CardDescription>
              Based on current usage rate from the selected {daysInRange}-day period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center p-6 rounded-lg bg-muted/50">
                <div className="text-4xl font-bold">{formatCost(projectedMonthlyCost)}</div>
                <p className="text-sm text-muted-foreground mt-2">
                  Estimated monthly spend
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-lg bg-muted/30">
                  <div className="text-muted-foreground">Current Period Spend</div>
                  <div className="text-2xl font-semibold mt-1">
                    {formatCost(costSummary?.totalCost || 0)}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-muted/30">
                  <div className="text-muted-foreground">Daily Average</div>
                  <div className="text-2xl font-semibold mt-1">
                    {formatCost(dailyAvgCost)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
