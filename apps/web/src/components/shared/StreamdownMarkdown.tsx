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
      'prose-p:leading-relaxed prose-p:my-2',
      'prose-headings:font-semibold prose-headings:tracking-tight',
      'prose-code:text-[0.8125em] prose-code:font-medium prose-code:bg-foreground/[0.04] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none',
      'prose-pre:bg-foreground/[0.03] prose-pre:border prose-pre:border-foreground/[0.06] prose-pre:rounded-xl',
      'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
      'prose-li:my-0.5',
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
