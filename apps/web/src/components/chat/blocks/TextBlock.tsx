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
    <div className={cn('text-sm', className)}>
      <StreamdownMarkdown
        text={segment.content}
        isStreaming={segment.isStreaming}
      />
    </div>
  );
}
