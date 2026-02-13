'use client';

import { CheckCircle2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FixAttemptState } from '@/lib/baleybot/testing/test-stream-types';

interface IterationBannerProps {
  fixAttempts: FixAttemptState[];
  className?: string;
}

export function IterationBanner({ fixAttempts, className }: IterationBannerProps) {
  if (fixAttempts.length === 0) return null;

  const latest = fixAttempts[fixAttempts.length - 1]!;
  const isRerunning = latest.status === 'rerunning';
  const allPassed = latest.status === 'complete' && latest.remainingFailures === 0;

  if (!isRerunning && !allPassed) return null;

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-300',
      allPassed
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
      className,
    )}>
      {allPassed ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5" />
          All tests pass after auto-fix
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Iteration {latest.attempt + 1} — Re-running tests after auto-fix
        </>
      )}
    </div>
  );
}
