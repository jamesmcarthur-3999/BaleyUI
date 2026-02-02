'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ROUTES } from '@/lib/routes';
import {
  ArrowLeft,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Timer,
} from 'lucide-react';

export default function ExecutionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // Fetch execution data
  const { data: execution, isLoading } = trpc.baleybots.getExecution.useQuery({
    id,
  });

  const formatTime = (date: Date) => {
    return date.toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  if (isLoading) {
    return (
      <div className="container py-10">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="container py-10">
        <h1 className="text-2xl font-bold mb-4">Execution not found</h1>
        <Button onClick={() => router.push(ROUTES.activity.list)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Activity
        </Button>
      </div>
    );
  }

  // Extract typed values for display (handles unknown types from Drizzle JSON fields)
  const displayStatus = String(execution.status);
  const displayTokenCount: number | null =
    typeof execution.tokenCount === 'number' ? execution.tokenCount : null;
  const displayDurationMs: number | null =
    typeof execution.durationMs === 'number' ? execution.durationMs : null;
  const displayTriggeredBy: string | null =
    typeof execution.triggeredBy === 'string' ? execution.triggeredBy : null;
  const displayStartedAt: Date | null =
    execution.startedAt instanceof Date
      ? execution.startedAt
      : execution.startedAt
        ? new Date(execution.startedAt as string | number)
        : null;
  const displayCompletedAt: Date | null =
    execution.completedAt instanceof Date
      ? execution.completedAt
      : execution.completedAt
        ? new Date(execution.completedAt as string | number)
        : null;

  const StatusIcon = () => {
    switch (execution.status) {
      case 'completed':
        return <CheckCircle2 className="h-6 w-6 text-green-500" />;
      case 'failed':
        return <XCircle className="h-6 w-6 text-red-500" />;
      case 'running':
        return <Play className="h-6 w-6 text-blue-500 animate-pulse" />;
      case 'cancelled':
        return <XCircle className="h-6 w-6 text-muted-foreground" />;
      default:
        return <Clock className="h-6 w-6 text-muted-foreground" />;
    }
  };

  return (
    <div className="container py-10">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <StatusIcon />
            <h1 className="text-2xl font-bold">Execution Details</h1>
            <StatusBadge
              status={
                execution.status as
                  | 'pending'
                  | 'running'
                  | 'completed'
                  | 'failed'
                  | 'cancelled'
              }
            />
          </div>
          {execution.baleybot && (
            <Link
              href={ROUTES.baleybots.detail(execution.baleybot.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="mr-2">{execution.baleybot.icon || '🤖'}</span>
              {execution.baleybot.name}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Timing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Timing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span>
                {displayStartedAt ? formatTime(displayStartedAt) : 'Not started'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed</span>
              <span>
                {displayCompletedAt
                  ? formatTime(displayCompletedAt)
                  : displayStatus === 'running'
                    ? 'In progress...'
                    : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span>
                {displayDurationMs !== null
                  ? formatDuration(displayDurationMs)
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Triggered By</span>
              <span className="capitalize">
                {displayTriggeredBy ?? 'Unknown'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token Count</span>
              <span>{displayTokenCount ?? 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="capitalize">{displayStatus}</span>
            </div>
          </CardContent>
        </Card>

        {/* Input */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Input</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
              {execution.input
                ? typeof execution.input === 'string'
                  ? execution.input
                  : JSON.stringify(execution.input, null, 2)
                : 'No input provided'}
            </pre>
          </CardContent>
        </Card>

        {/* Output */}
        {execution.output != null && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Output</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {typeof execution.output === 'string'
                  ? execution.output
                  : JSON.stringify(execution.output, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {typeof execution.error === 'string' && execution.error && (
          <Card className="md:col-span-2 border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm bg-destructive/10 text-destructive p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {execution.error}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Segments (streaming events) */}
        {Array.isArray(execution.segments) && execution.segments.length > 0 ? (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Execution Segments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {execution.segments.map((segment, index) => {
                  const seg = segment as Record<string, unknown>;
                  const typeStr = String(seg.type || 'unknown');
                  const contentStr = seg.content
                    ? String(seg.content).slice(0, 100)
                    : JSON.stringify(seg).slice(0, 100);
                  const fullLength = seg.content
                    ? String(seg.content).length
                    : JSON.stringify(seg).length;
                  return (
                    <div
                      key={index}
                      className="text-xs font-mono p-2 bg-muted rounded"
                    >
                      <span className="text-muted-foreground">
                        [{typeStr}]
                      </span>{' '}
                      <span>
                        {contentStr}
                        {fullLength > 100 ? '...' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
