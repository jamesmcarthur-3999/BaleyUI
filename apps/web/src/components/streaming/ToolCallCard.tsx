'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingDots } from '@/components/ui/loading-dots';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StreamingJSON } from './StreamingJSON';
import type { ToolCallStatus } from '@/lib/streaming/types/state';

export interface ToolCall {
  id: string;
  toolName: string;
  arguments: string;
  parsedArguments?: unknown;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
}

const statusConfig: Record<
  ToolCallStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'connected' | 'error';
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  streaming_args: {
    label: 'Streaming',
    variant: 'secondary',
    icon: Loader2,
  },
  args_complete: {
    label: 'Ready',
    variant: 'outline',
    icon: Play,
  },
  executing: {
    label: 'Executing',
    variant: 'connected',
    icon: Loader2,
  },
  complete: {
    label: 'Complete',
    variant: 'connected',
    icon: CheckCircle2,
  },
  error: {
    label: 'Error',
    variant: 'error',
    icon: XCircle,
  },
};

export function ToolCallCard({ toolCall, className }: ToolCallCardProps) {
  const [isArgsExpanded, setIsArgsExpanded] = useState(false);
  const [isResultExpanded, setIsResultExpanded] = useState(true);

  const config = statusConfig[toolCall.status];
  const Icon = config.icon;
  const isLoading = toolCall.status === 'streaming_args' || toolCall.status === 'executing';

  const duration =
    toolCall.startTime && toolCall.endTime
      ? toolCall.endTime - toolCall.startTime
      : undefined;

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon
              className={cn(
                'h-4 w-4 flex-shrink-0',
                isLoading && 'animate-spin',
                toolCall.status === 'complete' && 'text-green-600',
                toolCall.status === 'error' && 'text-red-600'
              )}
            />
            <CardTitle className="text-sm font-mono truncate">{toolCall.toolName}</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {duration !== undefined && (
              <span className="text-xs text-muted-foreground">{duration}ms</span>
            )}
            <Badge variant={config.variant} className="text-xs">
              {config.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {/* Arguments Section */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setIsArgsExpanded(!isArgsExpanded)}
          >
            {isArgsExpanded ? (
              <ChevronDown className="h-3 w-3 mr-1" />
            ) : (
              <ChevronRight className="h-3 w-3 mr-1" />
            )}
            Arguments
            {toolCall.status === 'streaming_args' && (
              <LoadingDots size="sm" className="ml-2" />
            )}
          </Button>

          {isArgsExpanded && (
            <div className="mt-2 p-3 bg-muted/50 rounded-md overflow-auto max-h-60">
              <StreamingJSON
                json={toolCall.arguments}
                isStreaming={toolCall.status === 'streaming_args'}
              />
            </div>
          )}
        </div>

        {/* Result Section */}
        {(toolCall.result || toolCall.error) && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setIsResultExpanded(!isResultExpanded)}
            >
              {isResultExpanded ? (
                <ChevronDown className="h-3 w-3 mr-1" />
              ) : (
                <ChevronRight className="h-3 w-3 mr-1" />
              )}
              {toolCall.error ? 'Error' : 'Result'}
            </Button>

            {isResultExpanded && (
              <div className="mt-2 p-3 bg-muted/50 rounded-md overflow-auto max-h-60">
                {toolCall.error ? (
                  <div className="text-red-600 text-xs font-mono whitespace-pre-wrap">
                    {toolCall.error}
                  </div>
                ) : (
                  <StreamingJSON
                    json={JSON.stringify(toolCall.result, null, 2)}
                    isStreaming={false}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading state for execution */}
        {toolCall.status === 'executing' && !toolCall.result && !toolCall.error && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoadingDots size="sm" />
            <span>Executing tool...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
