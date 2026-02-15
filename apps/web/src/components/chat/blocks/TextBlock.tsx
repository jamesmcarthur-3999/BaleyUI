'use client';

import { cn } from '@/lib/utils';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import type { TextSegment } from '@baleybots/chat';

interface TextBlockProps {
  segment: TextSegment;
  className?: string;
}

export function TextBlock({ segment, className }: TextBlockProps) {
  // JSON stripping is applied in useBaleyChat during segment finalization.
  const displayContent = segment.content;

  return (
    <div className={cn(
      'text-[0.9375rem] leading-[1.7] tracking-[-0.01em]',
      segment.isStreaming && 'relative',
      className,
    )}>
      {segment.isStreaming && (
        <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-primary/50 animate-pulse-soft" />
      )}
      <div className={cn(segment.isStreaming && 'pl-3')}>
        <StreamdownMarkdown
          text={displayContent}
          isStreaming={segment.isStreaming}
        />
      </div>
    </div>
  );
}
