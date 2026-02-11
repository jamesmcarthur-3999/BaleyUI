'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SimpleTrendChart } from '@/components/charts/SimpleTrendChart';
import { BillingTab } from '@/components/billing';
import { trpc } from '@/lib/trpc/client';
import { DollarSign, Zap, Activity } from 'lucide-react';
import { formatCost, formatDuration } from '@/lib/format';
import { usePersistedDateRange } from '@/hooks';

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('usage');
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

  const totalExecutions = costSummary?.costByBot.reduce((sum, b) => sum + b.executions, 0) || 0;
  const avgCostPerExecution =
    costSummary && totalExecutions > 0 ? costSummary.totalCost / totalExecutions : 0;

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">
              Monitor costs, performance, and usage across your BaleyBots
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
            </TabsList>
            {activeTab === 'usage' && (
              <DateRangePicker startDate={startDate} endDate={endDate} onChange={setRange} />
            )}
          </div>

          <TabsContent value="usage" className="space-y-6 mt-6">
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

            {/* Top BaleyBots by Cost */}
            {costSummary && costSummary.costByBot.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Top BaleyBots by Cost</CardTitle>
                  <CardDescription>Highest spending BaleyBots in the selected date range</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {costSummary.costByBot.slice(0, 5).map((bot, index) => (
                      <div
                        key={bot.baleybotId}
                        className="flex items-center justify-between border-b pb-3 last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                            {bot.icon || (index + 1)}
                          </div>
                          <div>
                            <div className="font-medium">{bot.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {bot.executions.toLocaleString()} executions
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatCost(bot.cost)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCost(bot.cost / bot.executions)} avg
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="billing" className="mt-6">
            <BillingTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
