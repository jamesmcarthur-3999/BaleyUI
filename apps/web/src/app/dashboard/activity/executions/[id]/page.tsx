'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROUTES } from '@/lib/routes';
import { formatDuration } from '@/lib/format';
import {
  ArrowLeft,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Timer,
} from 'lucide-react';

function getSegmentBadgeVariant(type: string): 'secondary' | 'outline' | 'connected' | 'error' | 'default' {
  if (type === 'text_delta') return 'secondary';
  if (type.startsWith('tool_')) return 'outline';
  if (type === 'done') return 'connected';
  if (type === 'error') return 'error';
  return 'default';
}

export default function ExecutionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: execution, isLoading } = trpc.baleybots.getExecution.useQuery({
    id,
  });

  const formatTime = (date: Date) => {
    return date.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="container py-10">
        {/* Header skeleton */}
        <div className="flex items-start gap-4 mb-8">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        {/* Content skeleton */}
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl mt-6" />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="container py-10">
        <h1 className="text-2xl font-bold mb-4">Run not found</h1>
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
        return <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />;
      case 'failed':
        return <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />;
      case 'running':
        return <Play className="h-6 w-6 text-blue-600 dark:text-blue-400 animate-pulse" />;
      case 'cancelled':
        return <XCircle className="h-6 w-6 text-muted-foreground" />;
      default:
        return <Clock className="h-6 w-6 text-muted-foreground" />;
    }
  };

  const hasSegments = Array.isArray(execution.segments) && execution.segments.length > 0;

  return (
    <div className="container py-10">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Go back">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <StatusIcon />
            <h1 className="text-2xl font-bold">Run Details</h1>
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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="io">Input / Output</TabsTrigger>
          {hasSegments && (
            <TabsTrigger value="segments">Segments</TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
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

            {/* Error (shown in overview for visibility) */}
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
          </div>
        </TabsContent>

        {/* Input / Output Tab */}
        <TabsContent value="io" className="mt-6 space-y-6">
          <Card>
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

          {execution.output != null && (
            <Card>
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

          {typeof execution.error === 'string' && execution.error && (
            <Card className="border-destructive">
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
        </TabsContent>

        {/* Segments Tab */}
        {hasSegments && (
          <TabsContent value="segments" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Run Segments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {execution.segments!.map((segment, index) => {
                    const seg = segment as Record<string, unknown>;
                    const typeStr = String(seg.type || 'unknown');
                    const contentStr = seg.content
                      ? String(seg.content).slice(0, 200)
                      : JSON.stringify(seg).slice(0, 200);
                    const fullLength = seg.content
                      ? String(seg.content).length
                      : JSON.stringify(seg).length;
                    return (
                      <div
                        key={`${typeStr}-${index}`}
                        className="text-xs font-mono p-2 bg-muted rounded flex items-start gap-2"
                      >
                        <Badge variant={getSegmentBadgeVariant(typeStr)} className="text-[10px] shrink-0">
                          {typeStr}
                        </Badge>
                        <span className="break-all">
                          {contentStr}
                          {fullLength > 200 ? '...' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
