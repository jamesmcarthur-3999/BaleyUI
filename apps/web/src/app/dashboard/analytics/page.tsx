'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { SimpleTrendChart } from '@/components/charts/SimpleTrendChart';
import { trpc } from '@/lib/trpc/client';
import { DollarSign, Zap, Activity, Download, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { formatCost, formatDuration } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { usePersistedDateRange } from '@/hooks';

export default function AnalyticsPage() {
  // Use persisted date range
  const { startDate, endDate, setRange } = usePersistedDateRange();

  // Fetch cost summary
  const { data: costSummary, isLoading: isLoadingCost } = trpc.analytics.getCostSummary.useQuery({
    startDate,
    endDate,
  });

  // Fetch latency metrics
  const { data: latencyMetrics, isLoading: isLoadingLatency } =
    trpc.analytics.getLatencyMetrics.useQuery({
      startDate,
      endDate,
    });

  // Fetch cost trend
  const { data: costTrend, isLoading: isLoadingTrend } = trpc.analytics.getCostTrend.useQuery({
    startDate,
    endDate,
    granularity: 'day',
  });

  const totalExecutions = costSummary?.costByBlock.reduce((sum, b) => sum + b.executions, 0) || 0;
  const avgCostPerExecution =
    costSummary && totalExecutions > 0 ? costSummary.totalCost / totalExecutions : 0;

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">
              Monitor costs, performance, and usage across your AI blocks
            </p>
          </div>
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={setRange} />
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          {/* Total Cost */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingCost ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {formatCost(costSummary?.totalCost || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalExecutions.toLocaleString()} executions
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Average Latency */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingLatency ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {formatDuration(latencyMetrics?.avgMs || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    P95: {formatDuration(latencyMetrics?.p95 || 0)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Total Executions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingCost ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{totalExecutions.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">Total executions</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Avg Cost Per Execution */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cost per Execution</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingCost ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{formatCost(avgCostPerExecution)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Average</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cost Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Trend</CardTitle>
            <CardDescription>Daily cost over the selected date range</CardDescription>
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

        {/* Quick Links */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Cost Analysis */}
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <Link href={ROUTES.analytics.costs}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Cost Analysis
                </CardTitle>
                <CardDescription>
                  Detailed cost breakdown by block and model
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" className="w-full gap-2">
                  View Details
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* Latency Metrics */}
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <Link href={ROUTES.analytics.latency}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Latency Metrics
                </CardTitle>
                <CardDescription>
                  Performance analysis and percentiles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" className="w-full gap-2">
                  View Details
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* Export Training Data */}
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <Link href={ROUTES.analytics.export}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Export Data
                </CardTitle>
                <CardDescription>
                  Export decisions for training and fine-tuning
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" className="w-full gap-2">
                  Export
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* Top Blocks by Cost */}
        {costSummary && costSummary.costByBlock.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Blocks by Cost</CardTitle>
              <CardDescription>Highest spending blocks in the selected date range</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {costSummary.costByBlock.slice(0, 5).map((block, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{block.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {block.executions.toLocaleString()} executions
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCost(block.cost)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatCost(block.cost / block.executions)} avg
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
