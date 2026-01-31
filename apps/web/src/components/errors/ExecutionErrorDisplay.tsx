'use client';

import * as React from 'react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ChevronDown, ChevronUp, XCircle, Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ExecutionError } from '@/lib/execution/errors';

export interface ExecutionErrorDisplayProps {
  error: ExecutionError | Error;
  /**
   * Show detailed error information including stack trace
   */
  showDetails?: boolean;
  /**
   * Custom className
   */
  className?: string;
  /**
   * Callback when details are toggled
   */
  onToggleDetails?: (expanded: boolean) => void;
}

/**
 * Display execution errors with formatted details and context
 */
export function ExecutionErrorDisplay({
  error,
  showDetails: initialShowDetails = false,
  className,
  onToggleDetails,
}: ExecutionErrorDisplayProps) {
  const [showDetails, setShowDetails] = React.useState(initialShowDetails);

  const isExecutionError = 'code' in error && 'context' in error;
  const executionError = isExecutionError ? (error as ExecutionError) : null;

  const handleToggleDetails = () => {
    const newValue = !showDetails;
    setShowDetails(newValue);
    onToggleDetails?.(newValue);
  };

  const getErrorIcon = () => {
    if (!executionError) return XCircle;

    switch (executionError.code) {
      case 'TIMEOUT':
      case 'EXECUTION_TIMEOUT':
        return Clock;
      case 'PROVIDER_RATE_LIMIT':
      case 'RESOURCE_EXHAUSTED':
        return Zap;
      default:
        return AlertCircle;
    }
  };

  const Icon = getErrorIcon();

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <Alert variant="destructive" className={cn('', className)}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>Execution Error</span>
        {executionError && (
          <Badge variant="destructive" className="ml-2">
            {executionError.code}
          </Badge>
        )}
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-3 mt-2">
          {/* Error Message */}
          <div className="text-sm">
            {executionError?.getUserMessage() || error.message}
          </div>

          {/* Context Information */}
          {executionError && Object.keys(executionError.context).length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {executionError.context.nodeId && (
                <div>
                  <span className="text-muted-foreground">Node:</span>{' '}
                  <span className="font-mono">{executionError.context.nodeId}</span>
                </div>
              )}
              {executionError.context.nodeType && (
                <div>
                  <span className="text-muted-foreground">Type:</span>{' '}
                  <span>{executionError.context.nodeType}</span>
                </div>
              )}
              {executionError.context.provider && (
                <div>
                  <span className="text-muted-foreground">Provider:</span>{' '}
                  <span>{executionError.context.provider}</span>
                </div>
              )}
              {executionError.context.model && (
                <div>
                  <span className="text-muted-foreground">Model:</span>{' '}
                  <span className="font-mono text-xs">{executionError.context.model}</span>
                </div>
              )}
              {executionError.context.attempt && executionError.context.maxAttempts && (
                <div>
                  <span className="text-muted-foreground">Attempt:</span>{' '}
                  <span>
                    {executionError.context.attempt} of {executionError.context.maxAttempts}
                  </span>
                </div>
              )}
              {executionError.timestamp && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Time:</span>{' '}
                  <span>{formatTimestamp(executionError.timestamp)}</span>
                </div>
              )}
            </div>
          )}

          {/* Toggle Details Button */}
          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleDetails}
              className="h-auto p-0 text-xs hover:bg-transparent"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Hide Details
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show Details
                </>
              )}
            </Button>
          </div>

          {/* Detailed Information */}
          {showDetails && (
            <Card className="bg-muted/50 border-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Error Details</CardTitle>
                <CardDescription className="text-xs">
                  Technical information for debugging
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {/* Full Error Message */}
                <div>
                  <div className="text-muted-foreground mb-1">Message:</div>
                  <div className="font-mono bg-background p-2 rounded text-xs break-words">
                    {error.message}
                  </div>
                </div>

                {/* Error Code */}
                {executionError && (
                  <div>
                    <div className="text-muted-foreground mb-1">Code:</div>
                    <div className="font-mono bg-background p-2 rounded text-xs">
                      {executionError.code}
                    </div>
                  </div>
                )}

                {/* Full Context */}
                {executionError && Object.keys(executionError.context).length > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-1">Context:</div>
                    <pre className="font-mono bg-background p-2 rounded text-xs overflow-x-auto">
                      {JSON.stringify(executionError.context, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Stack Trace */}
                {error.stack && (
                  <div>
                    <div className="text-muted-foreground mb-1">Stack Trace:</div>
                    <pre className="font-mono bg-background p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                      {error.stack}
                    </pre>
                  </div>
                )}

                {/* Retryable Status */}
                {executionError && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Badge variant={executionError.isRetryable ? 'default' : 'secondary'}>
                        {executionError.isRetryable ? 'Retryable' : 'Not Retryable'}
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
