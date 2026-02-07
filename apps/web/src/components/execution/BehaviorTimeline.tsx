/**
 * Behavior Timeline View
 *
 * Shows what happened during execution as a vertical timeline.
 * Displays tool calls, AI reasoning, timing, and artifacts.
 * Essential for debugging and understanding agent behavior.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
  Brain,
  FileOutput,
  Loader2,
  ChevronDown,
  ChevronRight,
  Coins,
  Timer,
  RotateCcw,
  GitFork,
  ShieldCheck,
  Cog,
} from 'lucide-react';
import type {
  BlockExecution,
  ToolExecution,
  FlowExecution,
} from '@baleyui/db';

// ============================================================================
// TYPES
// ============================================================================

interface TimelineEvent {
  id: string;
  type: 'start' | 'tool_call' | 'reasoning' | 'artifact' | 'error' | 'complete' | 'retry' | 'route_selected' | 'gate_evaluation' | 'processor_output';
  timestamp: Date;
  durationMs?: number;
  data: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    reasoning?: string;
    artifactName?: string;
    artifactUrl?: string;
    error?: string;
    status?: string;
    attempt?: number;
    maxRetries?: number;
    route?: string;
    classifierOutput?: string;
    condition?: string;
    conditionResult?: boolean;
    processorName?: string;
    processorOutput?: unknown;
  };
}

interface BlockExecutionWithTools extends BlockExecution {
  toolExecutions?: ToolExecution[];
}

interface BehaviorTimelineProps {
  execution: FlowExecution | null;
  blockExecutions: BlockExecutionWithTools[];
  onReplay?: () => void;
  isLoading?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(date: Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function buildTimelineEvents(
  blockExecutions: BlockExecutionWithTools[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Sort by creation time
  const sorted = [...blockExecutions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const exec of sorted) {
    // Start event
    if (exec.startedAt) {
      events.push({
        id: `${exec.id}-start`,
        type: 'start',
        timestamp: new Date(exec.startedAt),
        data: { status: exec.status },
      });
    }

    // Tool executions
    if (exec.toolExecutions) {
      for (const tool of exec.toolExecutions) {
        events.push({
          id: tool.id,
          type: 'tool_call',
          timestamp: new Date(tool.createdAt),
          durationMs: tool.durationMs || undefined,
          data: {
            toolName: tool.toolName,
            toolArgs: tool.arguments as Record<string, unknown>,
            toolResult: tool.result,
            error: tool.error || undefined,
          },
        });
      }
    }

    // Reasoning (if available)
    if (exec.reasoning) {
      events.push({
        id: `${exec.id}-reasoning`,
        type: 'reasoning',
        timestamp: new Date(exec.createdAt),
        data: { reasoning: exec.reasoning },
      });
    }

    // Error event
    if (exec.error) {
      events.push({
        id: `${exec.id}-error`,
        type: 'error',
        timestamp: exec.completedAt
          ? new Date(exec.completedAt)
          : new Date(exec.createdAt),
        data: { error: exec.error },
      });
    }

    // Completion event
    if (exec.completedAt) {
      const startTime = exec.startedAt
        ? new Date(exec.startedAt).getTime()
        : new Date(exec.createdAt).getTime();
      const endTime = new Date(exec.completedAt).getTime();

      events.push({
        id: `${exec.id}-complete`,
        type: 'complete',
        timestamp: new Date(exec.completedAt),
        durationMs: endTime - startTime,
        data: { status: exec.status },
      });
    }
  }

  // Sort all events by timestamp
  return events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TimelineEventItem({
  event,
  isLast,
}: {
  event: TimelineEvent;
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getIcon = () => {
    switch (event.type) {
      case 'start':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'tool_call':
        return <Wrench className="h-4 w-4 text-amber-500" />;
      case 'reasoning':
        return <Brain className="h-4 w-4 text-purple-500" />;
      case 'artifact':
        return <FileOutput className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'retry':
        return <RotateCcw className="h-4 w-4 text-orange-500" />;
      case 'route_selected':
        return <GitFork className="h-4 w-4 text-purple-500" />;
      case 'gate_evaluation':
        return <ShieldCheck className="h-4 w-4 text-yellow-500" />;
      case 'processor_output':
        return <Cog className="h-4 w-4 text-cyan-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTitle = () => {
    switch (event.type) {
      case 'start':
        return 'Started';
      case 'tool_call':
        return event.data.toolName || 'Tool Call';
      case 'reasoning':
        return 'Analyzing...';
      case 'artifact':
        return event.data.artifactName || 'Artifact Generated';
      case 'error':
        return 'Error';
      case 'complete':
        return 'Complete';
      case 'retry':
        return `Retry ${event.data.attempt ?? ''}/${event.data.maxRetries ?? '?'}`;
      case 'route_selected':
        return `Route: ${event.data.route || 'unknown'}`;
      case 'gate_evaluation':
        return `Gate: ${event.data.conditionResult ? 'Passed' : 'Blocked'}`;
      case 'processor_output':
        return event.data.processorName || 'Processor';
      default:
        return 'Event';
    }
  };

  const getSubtitle = (): string | null => {
    switch (event.type) {
      case 'tool_call':
        if (event.data.error) {
          return `Error: ${event.data.error}`;
        }
        if (event.data.toolResult) {
          const result = event.data.toolResult;
          if (typeof result === 'string') return result.slice(0, 100);
          return JSON.stringify(result).slice(0, 100);
        }
        return null;
      case 'reasoning':
        return event.data.reasoning?.slice(0, 100) || null;
      case 'error':
        return event.data.error || null;
      case 'retry':
        return event.data.error ? `Failed: ${event.data.error}` : 'Retrying...';
      case 'route_selected':
        return event.data.classifierOutput || null;
      case 'gate_evaluation':
        return event.data.condition || null;
      case 'processor_output': {
        if (event.data.processorOutput === undefined) return null;
        const output = event.data.processorOutput;
        if (typeof output === 'string') return output.slice(0, 100);
        return JSON.stringify(output).slice(0, 100);
      }
      default:
        return null;
    }
  };

  const subtitle = getSubtitle();

  const hasDetails =
    event.type === 'tool_call' &&
    (event.data.toolArgs !== undefined || event.data.toolResult !== undefined);

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-background">
          {getIcon()}
        </div>
        {!isLast && (
          <div className="h-full w-px bg-border flex-1 min-h-[24px]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{getTitle()}</span>
          {event.durationMs && (
            <Badge variant="outline" className="text-xs">
              {formatDuration(event.durationMs)}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>

        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {subtitle}
          </p>
        )}

        {/* Expandable details for tool calls */}
        {hasDetails && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 mr-1" />
              ) : (
                <ChevronRight className="h-3 w-3 mr-1" />
              )}
              {isExpanded ? 'Hide Details' : 'Show Details'}
            </Button>

            {isExpanded && (
              <div className="mt-2 space-y-2">
                {event.data.toolArgs && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Arguments:
                    </p>
                    <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                      {String(JSON.stringify(event.data.toolArgs, null, 2))}
                    </pre>
                  </div>
                )}
                {event.data.toolResult !== undefined && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Result:
                    </p>
                    <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">
                      {typeof event.data.toolResult === 'string'
                        ? event.data.toolResult
                        : String(JSON.stringify(event.data.toolResult, null, 2))}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BehaviorTimeline({
  execution,
  blockExecutions,
  onReplay,
  isLoading = false,
}: BehaviorTimelineProps) {
  const timelineEvents = buildTimelineEvents(blockExecutions);

  // Calculate totals
  const totalDuration = blockExecutions.reduce((sum, exec) => {
    if (exec.startedAt && exec.completedAt) {
      return (
        sum +
        (new Date(exec.completedAt).getTime() -
          new Date(exec.startedAt).getTime())
      );
    }
    return sum;
  }, 0);

  const totalTokensIn = blockExecutions.reduce(
    (sum, exec) => sum + (exec.tokensInput || 0),
    0
  );

  const totalTokensOut = blockExecutions.reduce(
    (sum, exec) => sum + (exec.tokensOutput || 0),
    0
  );

  // Estimate cost (rough estimate based on Claude pricing)
  const estimatedCost = (totalTokensIn * 0.003 + totalTokensOut * 0.015) / 1000;

  const lastExecutedAt = execution?.startedAt
    ? new Date(execution.startedAt)
    : blockExecutions[0]?.createdAt
      ? new Date(blockExecutions[0].createdAt)
      : null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (timelineEvents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Timer className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg">No Execution History</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Run this agent to see its behavior timeline
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Behavior Timeline
              </CardTitle>
              <CardDescription>
                {lastExecutedAt
                  ? `Last run: ${getRelativeTime(lastExecutedAt)}`
                  : 'Execution history'}
              </CardDescription>
            </div>
            {onReplay && (
              <Button variant="outline" onClick={onReplay}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Replay
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="pt-6">
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-0">
              {timelineEvents.map((event, i) => (
                <TimelineEventItem
                  key={event.id}
                  event={event}
                  isLast={i === timelineEvents.length - 1}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Stats Footer */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span>
                  Duration: <strong>{formatDuration(totalDuration)}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <span>
                  Tokens:{' '}
                  <strong>
                    {totalTokensIn.toLocaleString()} in /{' '}
                    {totalTokensOut.toLocaleString()} out
                  </strong>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-muted-foreground" />
              <span>
                Est. Cost: <strong>${estimatedCost.toFixed(4)}</strong>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
