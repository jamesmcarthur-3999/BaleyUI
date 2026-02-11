'use client';

import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { cn } from '@/lib/utils';

interface StreamdownMarkdownProps {
  text: string;
  isStreaming?: boolean;
  className?: string;
}

export function StreamdownMarkdown({ text, isStreaming = false, className }: StreamdownMarkdownProps) {
  return (
    <div className={cn(
      'prose prose-sm dark:prose-invert max-w-none',
      '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
      className,
    )}>
      <Streamdown
        plugins={{ code }}
        mode={isStreaming ? 'streaming' : 'static'}
        isAnimating={isStreaming}
        caret={isStreaming ? 'block' : undefined}
      >
        {text}
      </Streamdown>
    </div>
  );
}
