'use client';

import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunButtonProps {
  label?: string;
  className?: string;
}

export function RunButton({ label = 'Run Bot', className }: RunButtonProps) {
  const { execute, state } = useReviewExecution();

  const handleRun = async () => {
    await execute('');
  };

  return (
    <div className={cn('rounded-lg border bg-background p-4 flex flex-col items-center justify-center gap-3', className)}>
      <p className="text-sm text-muted-foreground text-center">
        This bot runs automatically — click to trigger a test execution.
      </p>
      <Button
        size="lg"
        onClick={handleRun}
        disabled={state.isExecuting}
        className="min-w-[200px]"
      >
        {state.isExecuting ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Running...
          </>
        ) : (
          <>
            <Play className="h-5 w-5 mr-2" />
            {label}
          </>
        )}
      </Button>
    </div>
  );
}
