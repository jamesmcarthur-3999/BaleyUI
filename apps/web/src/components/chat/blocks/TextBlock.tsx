'use client';

import { cn } from '@/lib/utils';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import type { TextSegment } from '@baleybots/chat';

interface TextBlockProps {
  segment: TextSegment;
  className?: string;
}

export function TextBlock({ segment, className }: TextBlockProps) {
  return (
    <div className={cn(
      'text-[0.9375rem] leading-[1.7] tracking-[-0.01em]',
      segment.isStreaming && 'relative',
      className,
    )}>
      {segment.isStreaming && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-primary/40 animate-pulse-soft" />
      )}
      <div className={cn(segment.isStreaming && 'pl-3')}>
        <StreamdownMarkdown
          text={segment.content}
          isStreaming={segment.isStreaming}
        />
      </div>
    </div>
  );
}
