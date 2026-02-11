'use client';

import { Activity, CheckCircle, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalyticsData {
  total: number;
  successes: number;
  failures: number;
  successRate: number;
  avgDurationMs: number;
  totalTokens: number;
  dailyTrend: Array<{ date: string; count: number }>;
}

interface BotAnalyticsCardsProps {
  data: AnalyticsData;
  className?: string;
}

function Sparkline({ data, label, className }: { data: number[]; label?: string; className?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const width = 80;
  const height = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  });
  return (
    <svg
      width={width}
      height={height}
      className={cn('text-primary', className)}
      role="img"
      aria-label={label ?? 'Trend chart'}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  sparkData,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  sparkData?: number[];
}) {
  return (
    <div className="rounded-xl border bg-background p-3.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {sparkData && <Sparkline data={sparkData} label={`${label} trend`} />}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function BotAnalyticsCards({ data, className }: BotAnalyticsCardsProps) {
  const sparkData = data.dailyTrend.map(d => d.count);

  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', className)}>
      <StatCard
        icon={Activity}
        label="Executions"
        value={data.total.toLocaleString()}
        sub="Last 30 days"
        sparkData={sparkData}
      />
      <StatCard
        icon={CheckCircle}
        label="Success Rate"
        value={data.total > 0 ? `${Math.round(data.successRate * 100)}%` : '--'}
        sub={`${data.successes} ok / ${data.failures} failed`}
      />
      <StatCard
        icon={Clock}
        label="Avg Duration"
        value={data.total > 0 ? formatDuration(data.avgDurationMs) : '--'}
        sub="Per execution"
      />
      <StatCard
        icon={Zap}
        label="Total Tokens"
        value={data.totalTokens.toLocaleString()}
        sub="Last 30 days"
      />
    </div>
  );
}
