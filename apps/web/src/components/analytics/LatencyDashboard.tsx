'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Activity, TrendingDown, Code } from 'lucide-react';
import { formatDuration } from '@/lib/format';

interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  avgMs: number;
  byBlock: Array<{
    blockId: string;
    name: string;
    type: string;
    p50: number;
    p95: number;
    p99: number;
    avgMs: number;
    executions: number;
  }>;
}

interface LatencyDashboardProps {
  data: LatencyMetrics;
  isLoading?: boolean;
}

function getLatencyColor(ms: number): string {
  if (ms < 500) return 'text-green-600 dark:text-green-400';
  if (ms < 2000) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

export function LatencyDashboard({ data, isLoading }: LatencyDashboardProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
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

  return (
    <div className="space-y-6">
      {/* Percentile Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* P50 (Median) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">P50 (Median)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getLatencyColor(data.p50)}`}>
              {formatDuration(data.p50)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              50% of requests
            </p>
          </CardContent>
        </Card>

        {/* P95 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">P95</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getLatencyColor(data.p95)}`}>
              {formatDuration(data.p95)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              95% of requests
            </p>
          </CardContent>
        </Card>

        {/* P99 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">P99</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getLatencyColor(data.p99)}`}>
              {formatDuration(data.p99)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              99% of requests
            </p>
          </CardContent>
        </Card>

        {/* Average */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getLatencyColor(data.avgMs)}`}>
              {formatDuration(data.avgMs)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Mean latency
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Latency by Block Table */}
      {data.byBlock.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Latency by Block</CardTitle>
            <CardDescription>Performance metrics for each block</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Block</th>
                    <th className="text-left py-2 px-3 font-medium">Type</th>
                    <th className="text-right py-2 px-3 font-medium">Executions</th>
                    <th className="text-right py-2 px-3 font-medium">P50</th>
                    <th className="text-right py-2 px-3 font-medium">P95</th>
                    <th className="text-right py-2 px-3 font-medium">P99</th>
                    <th className="text-right py-2 px-3 font-medium">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byBlock.map((block, index) => (
                    <tr key={index} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-3">
                        <div className="font-medium">{block.name}</div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-xs">
                          {block.type}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        {block.executions.toLocaleString()}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono ${getLatencyColor(block.p50)}`}>
                        {formatDuration(block.p50)}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono ${getLatencyColor(block.p95)}`}>
                        {formatDuration(block.p95)}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono ${getLatencyColor(block.p99)}`}>
                        {formatDuration(block.p99)}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono ${getLatencyColor(block.avgMs)}`}>
                        {formatDuration(block.avgMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {data.byBlock.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No latency data available</p>
              <p className="text-xs mt-1">Execute some blocks to see performance metrics</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
