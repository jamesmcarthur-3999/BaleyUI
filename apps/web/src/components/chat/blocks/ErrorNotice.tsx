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
      'flex items-start gap-2 px-3 py-2 rounded-lg text-xs',
      'bg-destructive/5 text-destructive',
      className,
    )}>
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{segment.message}</span>
    </div>
  );
}
