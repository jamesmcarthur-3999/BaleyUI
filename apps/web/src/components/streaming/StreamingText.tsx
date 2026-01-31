'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  className?: string;
  showCursor?: boolean;
}

export function StreamingText({
  text,
  isStreaming,
  className,
  showCursor = true,
}: StreamingTextProps) {
  const [displayText, setDisplayText] = useState('');
  const previousTextRef = useRef('');

  useEffect(() => {
    // If text hasn't changed, don't update
    if (text === previousTextRef.current) return;

    // If not streaming, show full text immediately
    if (!isStreaming) {
      setDisplayText(text);
      previousTextRef.current = text;
      return;
    }

    // If streaming, only append new characters
    const previousLength = previousTextRef.current.length;
    if (text.startsWith(previousTextRef.current)) {
      setDisplayText(text);
    } else {
      // Text was reset, start over
      setDisplayText(text);
    }

    previousTextRef.current = text;
  }, [text, isStreaming]);

  return (
    <div className={cn('relative whitespace-pre-wrap break-words', className)}>
      {displayText}
      {isStreaming && showCursor && (
        <span className="inline-block ml-0.5 w-0.5 h-4 bg-primary animate-pulse" />
      )}
    </div>
  );
}
