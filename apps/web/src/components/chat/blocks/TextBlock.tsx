'use client';

import { cn } from '@/lib/utils';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import type { TextSegment } from '@baleybots/chat';
import { stripLargeJsonBlocks } from '../utils/strip-json';

interface TextBlockProps {
  segment: TextSegment;
  className?: string;
}

export function TextBlock({ segment, className }: TextBlockProps) {
  // Strip raw JSON blocks from text (safety net for LLM echoing tool results)
  // Only apply to finalized text — incomplete JSON during streaming would cause false positives
  const displayContent = segment.isStreaming
    ? segment.content
    : stripLargeJsonBlocks(segment.content);

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
