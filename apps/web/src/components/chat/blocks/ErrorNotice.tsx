'use client';

import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';
import type { ErrorSegment } from '@baleybots/chat';

interface ErrorNoticeProps {
  segment: ErrorSegment;
  className?: string;
}

export function ErrorNotice({ segment, className }: ErrorNoticeProps) {
  return (
    <div className={cn(
      'flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs',
      'bg-destructive/[0.05] border border-destructive/10 text-destructive',
      className,
    )}>
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div>
        <span className="font-medium">{segment.message}</span>
        {segment.details != null && (
          <p className="mt-1 text-[11px] opacity-70">{String(segment.details)}</p>
        )}
      </div>
    </div>
  );
}
