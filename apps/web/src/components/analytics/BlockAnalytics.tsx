'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc/client';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { formatCost, formatDuration } from '@/lib/format';

interface BlockAnalyticsProps {
  blockId: string;
}

/**
 * Analytics component showing decision metrics for a specific block.
 * Displays accuracy, cost, latency, and failure pattern breakdown.
 */
export function BlockAnalytics({ blockId }: BlockAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // Calculate date range
  const dateRange = (() => {
    const now = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'all':
        return { startDate: undefined, endDate: undefined };
    }

    return { startDate, endDate: now };
  })();

  // Fetch stats
  const { data: stats, isLoading: isLoadingStats } = trpc.decisions.getStats.useQuery({
    blockId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Fetch decisions for category breakdown
  const { data: decisionsData, isLoading: isLoadingDecisions } = trpc.decisions.list.useQuery({
    blockId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit: 100,
  });

  const decisions = decisionsData?.items || [];

  // Calculate category breakdown
  const categoryBreakdown = (() => {
    const categories: Record<string, number> = {};
    let totalWithCategory = 0;

    decisions.forEach((decision) => {
      if (decision.feedbackCategory) {
        categories[decision.feedbackCategory] = (categories[decision.feedbackCategory] || 0) + 1;
        totalWithCategory++;
      }
    });

    return { categories, total: totalWithCategory };
  })();

  // Calculate time series data (simplified - group by day)
  const timeSeriesData = (() => {
    const series: Record<string, { total: number; correct: number; incorrect: number }> = {};

    decisions.forEach((decision) => {
      const date = new Date(decision.createdAt).toLocaleDateString();
      if (!series[date]) {
        series[date] = { total: 0, correct: 0, incorrect: 0 };
      }
      series[date].total++;
      if (decision.feedbackCorrect === true) {
        series[date].correct++;
      } else if (decision.feedbackCorrect === false) {
        series[date].incorrect++;
      }
    });

    return Object.entries(series)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .slice(-14); // Last 14 days
  })();

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'perfect':
        return 'bg-green-500';
      case 'partial':
        return 'bg-blue-500';
      case 'hallucination':
        return 'bg-red-500';
      case 'wrong_format':
        return 'bg-orange-500';
      case 'missing_info':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'perfect':
        return 'Perfect';
      case 'partial':
        return 'Partial';
      case 'hallucination':
        return 'Hallucination';
      case 'wrong_format':
        return 'Wrong Format';
      case 'missing_info':
        return 'Missing Info';
      default:
        return category;
    }
  };

  if (isLoadingStats || isLoadingDecisions) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">No analytics data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Analytics</h3>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={timeRange} onValueChange={(value: string) => setTimeRange(value as '7d' | '30d' | '90d' | 'all')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Decisions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Decisions</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalWithFeedback} with feedback
            </p>
          </CardContent>
        </Card>

        {/* Accuracy Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accuracy Rate</CardTitle>
            {stats.accuracyRate >= 80 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.accuracyRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalCorrect} correct / {stats.totalWithFeedback} reviewed
            </p>
          </CardContent>
        </Card>

        {/* Average Latency */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.avgLatency ? formatDuration(stats.avgLatency) : '-'}
            </div>
            <p className="text-xs text-muted-foreground">Per decision</p>
          </CardContent>
        </Card>

        {/* Total Cost */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCost(stats.totalCost)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? `~${formatCost(stats.totalCost / stats.total)} per decision` : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Failure Pattern Breakdown */}
      {categoryBreakdown.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback Category Breakdown</CardTitle>
            <CardDescription>
              Distribution of feedback categories ({categoryBreakdown.total} reviewed decisions)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(categoryBreakdown.categories)
              .sort(([, a], [, b]) => b - a)
              .map(([category, count]) => {
                const percentage = (count / categoryBreakdown.total) * 100;
                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${getCategoryColor(category)}`} />
                        <span className="text-sm font-medium">{getCategoryLabel(category)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{count}</span>
                        <Badge variant="secondary">{percentage.toFixed(1)}%</Badge>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getCategoryColor(category)} transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {/* Cost Breakdown by Model */}
      {stats.costByModel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost by Model</CardTitle>
            <CardDescription>Token usage and cost breakdown by model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.costByModel.map((model) => (
                <div key={model.model} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium font-mono">{model.model}</p>
                    <p className="text-xs text-muted-foreground">{model.count} decisions</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCost(model.totalCost)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCost(model.totalCost / model.count)} avg
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simple Time Series */}
      {timeSeriesData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision Trend (Last 14 Days)</CardTitle>
            <CardDescription>Daily decision count with feedback status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {timeSeriesData.map(([date, data]) => {
                const correctPercentage = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                const incorrectPercentage = data.total > 0 ? (data.incorrect / data.total) * 100 : 0;

                return (
                  <div key={date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{date}</span>
                      <span className="font-medium">{data.total} decisions</span>
                    </div>
                    <div className="h-6 bg-muted rounded-full overflow-hidden flex">
                      {data.correct > 0 && (
                        <div
                          className="bg-green-500 flex items-center justify-center"
                          style={{ width: `${correctPercentage}%` }}
                          title={`${data.correct} correct`}
                        >
                          {correctPercentage > 15 && (
                            <span className="text-[10px] text-white font-medium">{data.correct}</span>
                          )}
                        </div>
                      )}
                      {data.incorrect > 0 && (
                        <div
                          className="bg-red-500 flex items-center justify-center"
                          style={{ width: `${incorrectPercentage}%` }}
                          title={`${data.incorrect} incorrect`}
                        >
                          {incorrectPercentage > 15 && (
                            <span className="text-[10px] text-white font-medium">{data.incorrect}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Correct</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Incorrect</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-muted" />
                <span className="text-muted-foreground">No feedback</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {stats.total === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Decisions Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                This block hasn&apos;t made any decisions yet. Run the block to start collecting analytics.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
