'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { LatencyDashboard } from '@/components/analytics/LatencyDashboard';
import { LatencyPercentileChart } from '@/components/analytics/LatencyPercentileChart';
import { trpc } from '@/lib/trpc/client';
import { ROUTES } from '@/lib/routes';
import { Code, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePersistedDateRange } from '@/hooks';
import { formatDuration } from '@/lib/format';

export default function LatencyPage() {
  // Use persisted date range
  const { startDate, endDate, setRange } = usePersistedDateRange();

  // Fetch latency metrics
  const { data: latencyMetrics, isLoading } = trpc.analytics.getLatencyMetrics.useQuery({
    startDate,
    endDate,
  });

  // Prepare data for percentile chart
  const percentileData = latencyMetrics?.byBlock.slice(0, 5).map((block) => ({
    name: block.name,
    p50: block.p50,
    p95: block.p95,
    p99: block.p99,
  })) || [];

  // Separate AI and code blocks for comparison
  const aiBlocks = latencyMetrics?.byBlock.filter((b) => b.type === 'ai') || [];
  const codeBlocks = latencyMetrics?.byBlock.filter((b) => b.type === 'function') || [];

  const avgAiLatency = aiBlocks.length > 0
    ? aiBlocks.reduce((sum, b) => sum + b.avgMs, 0) / aiBlocks.length
    : 0;

  const avgCodeLatency = codeBlocks.length > 0
    ? codeBlocks.reduce((sum, b) => sum + b.avgMs, 0) / codeBlocks.length
    : 0;

  return (
    <div className="container py-10">
      <Breadcrumbs
        items={[
          { label: 'Analytics', href: ROUTES.analytics.overview },
          { label: 'Latency' },
        ]}
        className="mb-6"
      />

      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Latency Metrics</h1>
            <p className="text-muted-foreground">
              Performance analysis and response time percentiles
            </p>
          </div>
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={setRange} />
        </div>

        {/* Latency Dashboard */}
        {latencyMetrics && <LatencyDashboard data={latencyMetrics} isLoading={isLoading} />}

        {/* Top 5 Blocks Percentile Comparison */}
        {percentileData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Blocks Percentile Comparison</CardTitle>
              <CardDescription>
                Latency percentiles for the 5 most frequently executed blocks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LatencyPercentileChart data={percentileData} />
            </CardContent>
          </Card>
        )}

        {/* Code vs AI Comparison */}
        {aiBlocks.length > 0 && codeBlocks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Code vs AI Performance</CardTitle>
              <CardDescription>
                Average latency comparison between code and AI blocks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                {/* AI Blocks */}
                <div className="p-6 rounded-lg bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <h3 className="text-lg font-semibold">AI Blocks</h3>
                    <Badge variant="outline">{aiBlocks.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                      {formatDuration(avgAiLatency)}
                    </div>
                    <p className="text-sm text-muted-foreground">Average latency</p>
                  </div>
                </div>

                {/* Code Blocks */}
                <div className="p-6 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-4">
                    <Code className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <h3 className="text-lg font-semibold">Code Blocks</h3>
                    <Badge variant="outline">{codeBlocks.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {formatDuration(avgCodeLatency)}
                    </div>
                    <p className="text-sm text-muted-foreground">Average latency</p>
                  </div>
                </div>
              </div>

              {/* Speed Comparison */}
              {avgCodeLatency > 0 && avgAiLatency > 0 && (
                <div className="mt-6 p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-sm text-muted-foreground">
                    Code blocks are{' '}
                    <span className="font-bold text-green-600 dark:text-green-400">
                      {(avgAiLatency / avgCodeLatency).toFixed(1)}x faster
                    </span>{' '}
                    than AI blocks on average
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Performance Insights */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {latencyMetrics && latencyMetrics.p95 < 2000 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                  <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-green-600" />
                  <div>
                    <div className="font-medium text-green-900 dark:text-green-100">
                      Excellent Performance
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      95% of your requests complete in under 2 seconds. Great job optimizing
                      your blocks!
                    </p>
                  </div>
                </div>
              )}

              {latencyMetrics && latencyMetrics.p99 > 5000 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                  <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-yellow-600" />
                  <div>
                    <div className="font-medium text-yellow-900 dark:text-yellow-100">
                      Slow Tail Latency
                    </div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      1% of requests take over 5 seconds. Consider reviewing your slowest
                      blocks or implementing caching.
                    </p>
                  </div>
                </div>
              )}

              {codeBlocks.length === 0 && aiBlocks.length > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-600" />
                  <div>
                    <div className="font-medium text-blue-900 dark:text-blue-100">
                      Consider Hybrid Mode
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      You&apos;re only using AI blocks. Enable hybrid mode to automatically
                      generate code for repeated patterns and improve latency.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
