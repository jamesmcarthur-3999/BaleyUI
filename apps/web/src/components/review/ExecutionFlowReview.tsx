'use client';

import dynamic from 'next/dynamic';
import { useReviewExecution } from './ReviewExecutionContext';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

const VisualEditor = dynamic(
  () =>
    import('@/components/visual-editor/VisualEditor').then((mod) => ({
      default: mod.VisualEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center bg-muted/20 rounded-lg">
        <span className="text-sm text-muted-foreground">Loading flow view...</span>
      </div>
    ),
  }
);

interface ExecutionFlowReviewProps {
  balCode: string;
  className?: string;
}

export function ExecutionFlowReview({ balCode, className }: ExecutionFlowReviewProps) {
  const { state } = useReviewExecution();

  return (
    <div className={cn('rounded-lg border bg-background overflow-hidden flex flex-col', className)}>
      <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Execution Flow</p>
        {state.graphEvents.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {state.graphEvents.length} events
          </span>
        )}
      </div>

      {state.graphEvents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-1">
            <LayoutGrid className="h-5 w-5 text-muted-foreground/30 mx-auto" />
            <p className="text-[11px] text-muted-foreground">
              Send a message to see your bot in action
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <VisualEditor
            balCode={balCode}
            onChange={() => {}}
            readOnly
            className="h-full"
            hideToolbar
            runtimeEvents={state.graphEvents}
          />
        </div>
      )}
    </div>
  );
}
