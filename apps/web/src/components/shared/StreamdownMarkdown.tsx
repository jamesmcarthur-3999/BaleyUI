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
      'prose prose-sm dark:prose-invert max-w-none overflow-hidden break-words',
      'prose-p:leading-[1.75] prose-p:my-2.5',
      'prose-headings:font-semibold prose-headings:tracking-tight',
      'prose-code:text-[0.8125em] prose-code:font-medium prose-code:bg-foreground/[0.04] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none',
      'prose-pre:bg-foreground/[0.03] prose-pre:border prose-pre:border-foreground/[0.06] prose-pre:rounded-xl prose-pre:overflow-x-auto prose-pre:my-3',
      'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
      'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5',
      'prose-blockquote:border-l-primary/30 prose-blockquote:text-muted-foreground',
      '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
      className,
    )}>
      <Streamdown
        plugins={{ code }}
        mode={isStreaming ? 'streaming' : 'static'}
        isAnimating={isStreaming}
        animated={isStreaming ? { animation: 'fadeIn', duration: 150, sep: 'word' } : false}
        caret={isStreaming ? 'block' : undefined}
        components={{
          // Render paragraphs as divs to avoid nested <p> tag errors
          // Apply paragraph styling via className to preserve prose formatting
          p: ({ children, className: pClassName }) => (
            <div className={pClassName}>{children}</div>
          ),
        }}
      >
        {text}
      </Streamdown>
    </div>
  );
}
