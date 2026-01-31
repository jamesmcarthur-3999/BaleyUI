'use client';

/**
 * ExecutionActions Component
 *
 * Action buttons for execution control (cancel, retry, etc.)
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, XCircle, RotateCw, Play, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowExecutionStatus } from '@/lib/execution/types';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionActionsProps {
  /** Current execution status */
  status: FlowExecutionStatus;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Callback when cancel is clicked */
  onCancel?: () => Promise<void>;
  /** Callback when retry is clicked */
  onRetry?: () => Promise<void>;
  /** Callback when re-run is clicked */
  onRerun?: () => Promise<void>;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ExecutionActions({
  status,
  disabled = false,
  onCancel,
  onRetry,
  onRerun,
  className,
}: ExecutionActionsProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);

  const isRunning = status === 'running' || status === 'pending';
  const canCancel = isRunning && onCancel;
  const canRetry = status === 'failed' && onRetry;
  const canRerun = ['completed', 'failed', 'cancelled'].includes(status) && onRerun;

  const handleCancel = async () => {
    if (!onCancel) return;
    setIsCancelling(true);
    try {
      await onCancel();
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetry = async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRerun = async () => {
    if (!onRerun) return;
    setIsRerunning(true);
    try {
      await onRerun();
    } finally {
      setIsRerunning(false);
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Cancel button */}
      {canCancel && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || isCancelling}
              className="gap-1"
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Cancel
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Execution?</AlertDialogTitle>
              <AlertDialogDescription>
                This will stop the current execution. Any completed nodes will retain their results,
                but any in-progress work will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Running</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground">
                Cancel Execution
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Retry button (for failed executions) */}
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isRetrying}
          onClick={handleRetry}
          className="gap-1"
        >
          {isRetrying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4" />
          )}
          Retry
        </Button>
      )}

      {/* Re-run button (for completed executions) */}
      {canRerun && (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isRerunning}
          onClick={handleRerun}
          className="gap-1"
        >
          {isRerunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run Again
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Copy Output Button
// ============================================================================

export interface CopyOutputButtonProps {
  /** The output to copy */
  output: unknown;
  /** Custom className */
  className?: string;
}

export function CopyOutputButton({ output, className }: CopyOutputButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={cn('gap-1', className)}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          Copy Output
        </>
      )}
    </Button>
  );
}
