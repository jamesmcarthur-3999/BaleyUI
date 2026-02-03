'use client';

/**
 * NodeExecutionCard Component
 *
 * Displays the execution status of a single node in the flow timeline.
 * Expandable to show input, output, and streaming content.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Code2,
  GitBranch,
  Workflow,
  RotateCw,
  Play,
  Flag,
  Wrench,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NodeState, ToolCallState } from '@/hooks/useExecutionTimeline';
import type { FlowNodeType } from '@/lib/baleybots/types';

// ============================================================================
// Types
// ============================================================================

export interface NodeExecutionCardProps {
  /** Node ID */
  nodeId: string;
  /** Node type from flow definition */
  nodeType: FlowNodeType;
  /** Node label/name */
  label: string;
  /** Current execution state */
  state?: NodeState;
  /** Whether this node is currently active (running) */
  isActive?: boolean;
  /** Whether to start expanded */
  defaultExpanded?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function getNodeTypeIcon(type: FlowNodeType) {
  switch (type) {
    case 'ai-block':
      return <Sparkles className="h-4 w-4" />;
    case 'function-block':
      return <Code2 className="h-4 w-4" />;
    case 'router':
      return <GitBranch className="h-4 w-4" />;
    case 'parallel':
      return <Workflow className="h-4 w-4" />;
    case 'loop':
      return <RotateCw className="h-4 w-4" />;
    case 'source':
      return <Play className="h-4 w-4" />;
    case 'sink':
      return <Flag className="h-4 w-4" />;
    default:
      return <Code2 className="h-4 w-4" />;
  }
}

function getNodeTypeColor(type: FlowNodeType): string {
  switch (type) {
    case 'ai-block':
      return 'text-purple-500';
    case 'function-block':
      return 'text-blue-500';
    case 'router':
      return 'text-yellow-500';
    case 'parallel':
      return 'text-teal-500';
    case 'loop':
      return 'text-primary';
    case 'source':
      return 'text-green-500';
    case 'sink':
      return 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
}

function getStatusIcon(status: NodeState['status'] | undefined) {
  if (!status || status === 'pending') {
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'skipped':
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ============================================================================
// Tool Call Display
// ============================================================================

function ToolCallDisplay({ toolCall, showDetails = true }: { toolCall: ToolCallState; showDetails?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = toolCall.status === 'streaming' || toolCall.status === 'executing';
  const isError = toolCall.status === 'error';
  const isComplete = toolCall.status === 'completed';

  return (
    <div className={cn(
      "border rounded-md p-3 text-xs transition-all",
      isRunning && "border-blue-500/50 bg-blue-500/5",
      isError && "border-red-500/50 bg-red-500/5",
      isComplete && "border-green-500/30"
    )}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => showDetails && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          ) : isError ? (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Wrench className="h-3.5 w-3.5 text-green-500" />
          )}
          <span className="font-semibold font-mono">{toolCall.toolName}</span>
          <Badge
            variant={
              isComplete
                ? 'default'
                : isError
                ? 'destructive'
                : 'secondary'
            }
            className="text-[10px] px-1.5 py-0"
          >
            {toolCall.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="text-[10px] text-blue-500">
              running...
            </span>
          )}
          {showDetails && (
            isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          )}
        </div>
      </div>
      {isExpanded && showDetails && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {toolCall.arguments !== undefined && (
            <div>
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium">Arguments</span>
              </div>
              <pre className="bg-muted p-2 rounded text-[11px] overflow-auto max-h-32 font-mono">
                {formatJson(toolCall.arguments)}
              </pre>
            </div>
          )}
          {toolCall.result !== undefined && (
            <div>
              <div className="flex items-center gap-1 text-green-600 mb-1">
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-medium">Result</span>
              </div>
              <pre className="bg-green-500/10 p-2 rounded text-[11px] overflow-auto max-h-32 font-mono">
                {formatJson(toolCall.result)}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <div className="flex items-center gap-1 text-red-500 mb-1">
                <AlertCircle className="h-3 w-3" />
                <span className="font-medium">Error</span>
              </div>
              <pre className="bg-red-500/10 p-2 rounded text-[11px] text-red-600 font-mono">{toolCall.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline tool call summary for the card header
 */
function ToolCallSummary({ toolCalls }: { toolCalls: ToolCallState[] }) {
  const running = toolCalls.filter(tc => tc.status === 'streaming' || tc.status === 'executing').length;
  const completed = toolCalls.filter(tc => tc.status === 'completed').length;
  const errors = toolCalls.filter(tc => tc.status === 'error').length;

  if (toolCalls.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Wrench className="h-3 w-3 text-muted-foreground" />
      {running > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {running}
        </Badge>
      )}
      {completed > 0 && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-500/30">
          {completed}
        </Badge>
      )}
      {errors > 0 && (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {errors}
        </Badge>
      )}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function NodeExecutionCard({
  nodeId,
  nodeType,
  label,
  state,
  isActive = false,
  defaultExpanded = false,
}: NodeExecutionCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const hasContent =
    state?.input !== undefined ||
    state?.output !== undefined ||
    state?.error !== undefined ||
    state?.streamContent ||
    (state?.toolCalls && state.toolCalls.length > 0);

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        isActive && 'ring-2 ring-blue-500 shadow-lg',
        state?.status === 'failed' && 'border-red-500/50',
        state?.status === 'completed' && 'border-green-500/30'
      )}
    >
      <CardHeader
        className={cn('py-3 cursor-pointer', hasContent && 'hover:bg-accent/50')}
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Expand/collapse button */}
            {hasContent ? (
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={isExpanded ? 'Collapse details' : 'Expand details'}>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            ) : (
              <div className="w-6" />
            )}

            {/* Status icon */}
            {getStatusIcon(state?.status)}

            {/* Node type icon */}
            <span className={cn(getNodeTypeColor(nodeType))}>
              {getNodeTypeIcon(nodeType)}
            </span>

            {/* Label */}
            <CardTitle className="text-sm font-medium">{label}</CardTitle>

            {/* Type badge */}
            <Badge variant="outline" className="text-xs">
              {nodeType}
            </Badge>
          </div>

          {/* Tool calls summary + Duration */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {state?.toolCalls && state.toolCalls.length > 0 && (
              <ToolCallSummary toolCalls={state.toolCalls} />
            )}
            {state?.durationMs !== undefined && (
              <span>{formatDuration(state.durationMs)}</span>
            )}
            {isActive && (
              <Badge variant="secondary" className="animate-pulse">
                Running
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Expanded content */}
      {isExpanded && hasContent && (
        <CardContent className="pt-0 pb-4 space-y-4">
          {/* Streaming content (if AI block and running) */}
          {state?.streamContent && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Output (streaming)
              </h4>
              <ScrollArea className="h-32 rounded-md border">
                <pre className="p-2 text-sm whitespace-pre-wrap">
                  {state.streamContent}
                  {isActive && <span className="animate-pulse">▌</span>}
                </pre>
              </ScrollArea>
            </div>
          )}

          {/* Tool calls */}
          {state?.toolCalls && state.toolCalls.length > 0 && (
            <div className="border rounded-lg p-3 bg-muted/30">
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Tool Calls
                <Badge variant="outline" className="text-xs">
                  {state.toolCalls.length}
                </Badge>
              </h4>
              <div className="space-y-2 relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />
                {state.toolCalls.map((tc, index) => (
                  <div key={tc.id} className="relative pl-5">
                    {/* Timeline dot */}
                    <div className={cn(
                      "absolute left-0 top-3 w-3.5 h-3.5 rounded-full border-2 bg-background",
                      tc.status === 'completed' && "border-green-500",
                      tc.status === 'error' && "border-red-500",
                      (tc.status === 'streaming' || tc.status === 'executing') && "border-blue-500"
                    )} />
                    <ToolCallDisplay toolCall={tc} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          {state?.input !== undefined && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Input</h4>
              <ScrollArea className="h-24 rounded-md border bg-muted">
                <pre className="p-2 text-xs">{formatJson(state.input)}</pre>
              </ScrollArea>
            </div>
          )}

          {/* Output */}
          {state?.output !== undefined && !state?.streamContent && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Output</h4>
              <ScrollArea className="h-24 rounded-md border bg-muted">
                <pre className="p-2 text-xs">{formatJson(state.output)}</pre>
              </ScrollArea>
            </div>
          )}

          {/* Error */}
          {state?.error && (
            <div>
              <h4 className="text-xs font-medium text-red-500 mb-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Error
              </h4>
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-2">
                <pre className="text-xs text-red-500">{state.error}</pre>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
