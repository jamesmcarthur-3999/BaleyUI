'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  Trash2,
  Eye,
  GitCompare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StreamState } from '@/lib/streaming/types/state';

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
  onCompare?: (recordA: ExecutionRecord, recordB: ExecutionRecord) => void;
  maxRecords?: number;
}

const STORAGE_KEY_PREFIX = 'baley_test_history_';

// Export the ref type
export interface TestHistoryRef {
  addExecution: (input: unknown, state: StreamState) => void;
}

export const TestHistory = forwardRef<TestHistoryRef, TestHistoryProps>(
  function TestHistory(
    { blockId, className, onReplay, onViewDetails, onCompare, maxRecords = 50 },
    ref
  ) {
    const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
    const [selectedForCompare, setSelectedForCompare] = useState<string | null>(null);

    // Load from localStorage on mount
    useEffect(() => {
      const storageKey = `${STORAGE_KEY_PREFIX}${blockId}`;
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setExecutions(parsed);
          }
        }
      } catch (err) {
        console.error('Failed to load test history:', err);
      }
    }, [blockId]);

    // Save to localStorage whenever executions change
    useEffect(() => {
      const storageKey = `${STORAGE_KEY_PREFIX}${blockId}`;
      try {
        localStorage.setItem(storageKey, JSON.stringify(executions));
      } catch (err) {
        console.error('Failed to save test history:', err);
      }
    }, [executions, blockId]);

    // Public method to add execution (called from parent)
    const addExecution = (input: unknown, state: StreamState) => {
      const newRecord: ExecutionRecord = {
        id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        blockId,
        input,
        state,
        timestamp: Date.now(),
        duration:
          state.metrics.startTime && state.metrics.endTime
            ? state.metrics.endTime - state.metrics.startTime
            : undefined,
      };

      setExecutions((prev) => {
        // Add new record at the beginning
        const updated = [newRecord, ...prev];
        // Limit to maxRecords
        return updated.slice(0, maxRecords);
      });
    };

    // Expose addExecution via ref
    useImperativeHandle(ref, () => ({
      addExecution,
    }));

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear all test history?')) {
      setExecutions([]);
      setSelectedForCompare(null);
    }
  };

  const handleReplay = (record: ExecutionRecord) => {
    onReplay?.(record.input);
  };

  const handleDelete = (id: string) => {
    setExecutions((prev) => prev.filter((exec) => exec.id !== id));
    if (selectedForCompare === id) {
      setSelectedForCompare(null);
    }
  };

  const handleSelectForCompare = (id: string) => {
    if (selectedForCompare === null) {
      setSelectedForCompare(id);
    } else if (selectedForCompare === id) {
      setSelectedForCompare(null);
    } else {
      // Two different records selected - trigger compare
      const recordA = executions.find((r) => r.id === selectedForCompare);
      const recordB = executions.find((r) => r.id === id);
      if (recordA && recordB && onCompare) {
        onCompare(recordA, recordB);
      }
      setSelectedForCompare(null);
    }
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

  const getOutputPreview = (state: StreamState): string => {
    if (state.text) {
      return state.text.substring(0, 150) + (state.text.length > 150 ? '...' : '');
    }
    if (state.structuredOutput) {
      const jsonStr = JSON.stringify(state.structuredOutput);
      return jsonStr.substring(0, 150) + (jsonStr.length > 150 ? '...' : '');
    }
    return 'No output';
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Test History</CardTitle>
            <CardDescription>
              Past test runs stored locally (max {maxRecords})
            </CardDescription>
          </div>
          {executions.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearHistory}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {executions.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-center">
            <div>
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground">No test history yet</p>
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
                const isSelectedForCompare = selectedForCompare === record.id;

                return (
                  <Card
                    key={record.id}
                    className={cn(
                      'relative transition-colors',
                      isSelectedForCompare && 'ring-2 ring-primary'
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Status and Time */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Icon className={cn('h-4 w-4 flex-shrink-0', config.color)} />
                            <Badge variant={config.variant} className="text-xs">
                              {config.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(record.timestamp)}
                            </span>
                            {record.duration && (
                              <span className="text-xs text-muted-foreground">
                                {(record.duration / 1000).toFixed(2)}s
                              </span>
                            )}
                          </div>

                          {/* Input Preview */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Input:</p>
                            <div className="text-xs font-mono bg-muted/50 p-2 rounded overflow-hidden text-ellipsis">
                              {getInputPreview(record.input)}
                            </div>
                          </div>

                          {/* Output Preview */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Output:</p>
                            <div className="text-xs bg-muted/50 p-2 rounded line-clamp-2">
                              {getOutputPreview(record.state)}
                            </div>
                          </div>

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
                          {onViewDetails && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onViewDetails(record)}
                              className="h-8 w-8 p-0"
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {onCompare && (
                            <Button
                              variant={isSelectedForCompare ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => handleSelectForCompare(record.id)}
                              className="h-8 w-8 p-0"
                              title={
                                isSelectedForCompare
                                  ? 'Cancel compare'
                                  : 'Select for comparison'
                              }
                            >
                              <GitCompare className="h-4 w-4" />
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

        {selectedForCompare && (
          <div className="mt-4 p-3 bg-primary/10 rounded-md">
            <p className="text-xs text-primary">
              Select another test to compare outputs
            </p>
          </div>
        )}
      </CardContent>
    </Card>
    );
  }
);
