'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Play,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StreamState } from '@/lib/streaming/types';

interface ExecutionRecord {
  id: string;
  blockId: string;
  input: unknown;
  state: StreamState;
  timestamp: number;
  duration?: number;
}

interface TestHistoryProps {
  blockId: string;
  className?: string;
  onReplay?: (input: unknown) => void;
  onViewDetails?: (record: ExecutionRecord) => void;
}

export function TestHistory({
  blockId: _blockId,
  className,
  onReplay,
  onViewDetails,
}: TestHistoryProps) {
  // In a real implementation, this would come from local storage or API
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);

  const handleClearHistory = () => {
    setExecutions([]);
  };

  const handleReplay = (record: ExecutionRecord) => {
    onReplay?.(record.input);
  };

  const handleDelete = (id: string) => {
    setExecutions((prev) => prev.filter((exec) => exec.id !== id));
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'complete':
        return {
          icon: CheckCircle2,
          label: 'Complete',
          variant: 'connected' as const,
          color: 'text-green-600',
        };
      case 'error':
        return {
          icon: XCircle,
          label: 'Error',
          variant: 'error' as const,
          color: 'text-red-600',
        };
      case 'cancelled':
        return {
          icon: AlertCircle,
          label: 'Cancelled',
          variant: 'outline' as const,
          color: 'text-orange-600',
        };
      default:
        return {
          icon: Clock,
          label: 'Running',
          variant: 'secondary' as const,
          color: 'text-blue-600',
        };
    }
  };

  const getInputPreview = (input: unknown): string => {
    if (typeof input === 'string') {
      return input.substring(0, 100) + (input.length > 100 ? '...' : '');
    }

    const jsonStr = JSON.stringify(input);
    return jsonStr.substring(0, 100) + (jsonStr.length > 100 ? '...' : '');
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Execution History</CardTitle>
            <CardDescription>
              Past test runs for this block
            </CardDescription>
          </div>
          {executions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearHistory}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear History
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {executions.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-center">
            <div>
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground">
                No execution history yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Run some tests to see them appear here
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {executions.map((record) => {
                const config = getStatusConfig(record.state.status);
                const Icon = config.icon;

                return (
                  <Card key={record.id} className="relative">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Status and Time */}
                          <div className="flex items-center gap-2">
                            <Icon className={cn('h-4 w-4 flex-shrink-0', config.color)} />
                            <Badge variant={config.variant} className="text-xs">
                              {config.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(record.timestamp)}
                            </span>
                            {record.duration && (
                              <span className="text-xs text-muted-foreground">
                                {record.duration}ms
                              </span>
                            )}
                          </div>

                          {/* Input Preview */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Input:
                            </p>
                            <div className="text-xs font-mono bg-muted p-2 rounded overflow-hidden text-ellipsis">
                              {getInputPreview(record.input)}
                            </div>
                          </div>

                          {/* Output Preview */}
                          {record.state.text && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Output:
                              </p>
                              <div className="text-xs bg-muted p-2 rounded line-clamp-2">
                                {record.state.text.substring(0, 150)}
                                {record.state.text.length > 150 ? '...' : ''}
                              </div>
                            </div>
                          )}

                          {/* Metrics */}
                          {record.state.metrics.totalTokens > 0 && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {record.state.metrics.ttft && (
                                <span>TTFT: {record.state.metrics.ttft}ms</span>
                              )}
                              <span>Tokens: {record.state.metrics.totalTokens}</span>
                              {record.state.toolCalls.length > 0 && (
                                <span>Tools: {record.state.toolCalls.length}</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          {onViewDetails && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onViewDetails(record)}
                              className="h-8 w-8 p-0"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          )}
                          {onReplay && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReplay(record)}
                              className="h-8 w-8 p-0"
                              title="Replay this test"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(record.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            title="Delete from history"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
