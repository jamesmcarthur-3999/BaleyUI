'use client';

import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FixAttemptState } from '@/lib/baleybot/testing/test-stream-types';

interface AutoFixActivityProps {
  fixAttempts: FixAttemptState[];
  onStopAutoFix?: () => void;
  className?: string;
}

export function AutoFixActivity({ fixAttempts, onStopAutoFix, className }: AutoFixActivityProps) {
  if (fixAttempts.length === 0) return null;

  const currentAttempt = fixAttempts[fixAttempts.length - 1]!;
  const isActive = currentAttempt.status !== 'complete';

  return (
    <div className={cn('space-y-2', className)}>
      {fixAttempts.map(attempt => (
        <FixAttemptCard key={attempt.attempt} attempt={attempt} onStop={onStopAutoFix} />
      ))}
      {isActive && onStopAutoFix && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          onClick={onStopAutoFix}
        >
          Stop auto-fix
        </Button>
      )}
    </div>
  );
}

function FixAttemptCard({ attempt, onStop: _onStop }: { attempt: FixAttemptState; onStop?: () => void }) {
  const isComplete = attempt.status === 'complete';
  const hasImproved = isComplete && (attempt.improvedCount ?? 0) > 0;
  const allFixed = isComplete && attempt.remainingFailures === 0;

  const borderColor = isComplete
    ? allFixed
      ? 'border-emerald-500/50'
      : hasImproved
        ? 'border-amber-500/50'
        : 'border-muted-foreground/20'
    : 'border-blue-500/50';

  const bgColor = isComplete
    ? allFixed
      ? 'bg-emerald-50/30 dark:bg-emerald-950/10'
      : hasImproved
        ? 'bg-amber-50/20 dark:bg-amber-950/10'
        : 'bg-muted/10'
    : 'bg-blue-50/20 dark:bg-blue-950/10';

  return (
    <div className={cn(
      'border rounded-lg p-3 space-y-2 transition-all duration-300 animate-card-appear',
      borderColor,
      bgColor,
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 text-xs">
        {isComplete ? (
          allFixed ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : hasImproved ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
          )
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
        )}
        <span className="font-medium">
          {isComplete
            ? allFixed
              ? 'All tests pass after auto-fix'
              : hasImproved
                ? `${attempt.improvedCount} test${attempt.improvedCount !== 1 ? 's' : ''} fixed, ${attempt.remainingFailures} remaining`
                : 'No improvement from fix attempt'
            : attempt.status === 'analyzing'
              ? 'Analyzing failure patterns...'
              : attempt.status === 'generating'
                ? `Generating BAL fix (attempt ${attempt.attempt})...`
                : attempt.status === 'applied'
                  ? 'Fix applied — preparing to re-run...'
                  : 'Re-running failed tests...'}
        </span>
      </div>

      {/* Collaboration chain indicator */}
      {!isComplete && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>
            {attempt.status === 'analyzing' || attempt.status === 'generating'
              ? 'test_results_analyzer → bal_generator'
              : 'executeBaleybot → test_validator'}
          </span>
        </div>
      )}

      {/* Fix summary */}
      {attempt.summary && (
        <p className="text-xs text-muted-foreground">{attempt.summary}</p>
      )}

      {/* Failure patterns */}
      {!isComplete && attempt.failurePatterns.length > 0 && (
        <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-4 list-disc">
          {attempt.failurePatterns.slice(0, 3).map((pattern, i) => (
            <li key={i}>{pattern}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
