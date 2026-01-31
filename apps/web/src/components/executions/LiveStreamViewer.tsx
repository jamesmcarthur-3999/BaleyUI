'use client';

/**
 * LiveStreamViewer Component
 *
 * Real-time display of streaming AI output with auto-scroll.
 * Shows a cursor while streaming is active.
 */

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface LiveStreamViewerProps {
  /** The streaming content to display */
  content: string;
  /** Node ID or label for the header */
  nodeLabel?: string;
  /** Whether streaming is currently active */
  isStreaming?: boolean;
  /** Maximum height of the viewer */
  maxHeight?: string;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function LiveStreamViewer({
  content,
  nodeLabel,
  isStreaming = true,
  maxHeight = '300px',
  className,
}: LiveStreamViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [content, isStreaming]);

  if (!content && !isStreaming) {
    return null;
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="py-2 px-4 border-b bg-muted/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <CardTitle className="text-sm font-medium">
              {nodeLabel || 'Live Output'}
            </CardTitle>
          </div>
          {isStreaming && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Streaming
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea ref={scrollRef} style={{ maxHeight }} className="w-full">
          <pre
            ref={contentRef}
            className={cn(
              'p-4 text-sm font-mono whitespace-pre-wrap break-words',
              'selection:bg-purple-500/30'
            )}
          >
            {content || (
              <span className="text-muted-foreground italic">Waiting for output...</span>
            )}
            {isStreaming && content && (
              <span className="animate-pulse text-purple-500">▌</span>
            )}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Compact Variant
// ============================================================================

export interface LiveStreamViewerCompactProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export function LiveStreamViewerCompact({
  content,
  isStreaming = true,
  className,
}: LiveStreamViewerCompactProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        'rounded-md border bg-muted/50 p-3 overflow-auto max-h-48',
        className
      )}
    >
      <pre className="text-sm font-mono whitespace-pre-wrap break-words">
        {content}
        {isStreaming && <span className="animate-pulse text-purple-500">▌</span>}
      </pre>
    </div>
  );
}
