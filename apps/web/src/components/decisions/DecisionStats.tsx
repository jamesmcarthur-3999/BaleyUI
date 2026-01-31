'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle2, Clock, DollarSign, Zap } from 'lucide-react';
import { formatCost, formatDuration } from '@/lib/format';

interface DecisionStatsProps {
  stats: {
    total: number;
    totalWithFeedback: number;
    totalCorrect: number;
    accuracyRate: number;
    avgLatency: number;
    totalCost: number;
    costByModel: Array<{
      model: string;
      count: number;
      totalCost: number;
    }>;
  };
  isLoading?: boolean;
}

export function DecisionStats({ stats, isLoading }: DecisionStatsProps) {
  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
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
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* Total Decisions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Decisions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalWithFeedback} with feedback
            </p>
          </CardContent>
        </Card>

        {/* Accuracy Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accuracy Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(stats.accuracyRate)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalCorrect} correct of {stats.totalWithFeedback}
            </p>
          </CardContent>
        </Card>

        {/* Average Latency */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(stats.avgLatency)}</div>
            <p className="text-xs text-muted-foreground mt-1">Per decision</p>
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
            <p className="text-xs text-muted-foreground mt-1">All decisions</p>
          </CardContent>
        </Card>

        {/* Avg Cost Per Decision */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCost(stats.total > 0 ? stats.totalCost / stats.total : 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per decision</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown by Model */}
      {stats.costByModel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost Breakdown by Model</CardTitle>
            <CardDescription>Total cost and decision count per model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.costByModel.map((item) => (
                <div
                  key={item.model}
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-sm">{item.model}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.count.toLocaleString()} decisions
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold">{formatCost(item.totalCost)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCost(item.totalCost / item.count)} avg
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
