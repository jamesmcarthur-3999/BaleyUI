'use client';

import { cn } from '@/lib/utils';
import { Bot, User, Copy, Check, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { SegmentRenderer } from './blocks/SegmentRenderer';
import { textToSegments } from './utils/derive-segments';
import type { ChatMessage, ChatConfig } from './types';

interface ChatBubbleProps {
  message: ChatMessage;
  config: ChatConfig;
  onRetry?: () => void;
  className?: string;
}

export function ChatBubble({ message, config, onRetry, className }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isError = message.status === 'error';

  // Use segments if available, otherwise convert plain text
  const segments = message.segments ?? textToSegments(message.content);

  const handleCopy = () => {
    // Extract text from segments for copying
    const textContent = segments
      .filter(s => s.type === 'text')
      .map(s => (s as { content: string }).content)
      .join('\n');
    navigator.clipboard.writeText(textContent || message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      'group/bubble flex gap-3 px-4 py-3',
      isUser && 'flex-row-reverse',
      className,
    )}>
      {/* Avatar */}
      {config.showAvatars && (
        <div className={cn(
          'flex-none w-7 h-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary/10' : 'bg-foreground/[0.05]',
        )}>
          {isUser
            ? <User className="h-3.5 w-3.5 text-primary" />
            : <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </div>
      )}

      {/* Content */}
      <div className={cn(
        'flex-1 min-w-0',
        isUser && 'text-right',
      )}>
        {/* User messages: plain text bubble */}
        {isUser ? (
          <div className="inline-block max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm">
            {message.content}
          </div>
        ) : (
          /* Assistant messages: segment-based rendering */
          <div className="max-w-full">
            <SegmentRenderer segments={segments} config={config} />
          </div>
        )}

        {/* Footer row: timestamp, copy, retry */}
        <div className={cn(
          'flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/40',
          'opacity-0 group-hover/bubble:opacity-100 transition-opacity',
          isUser && 'justify-end',
        )}>
          {config.showTimestamps && (
            <span>{formatTime(message.timestamp)}</span>
          )}
          {message.meta?.tokens && (
            <span className="tabular-nums">{message.meta.tokens} tokens</span>
          )}
          {!isUser && config.showCopy && (
            <button onClick={handleCopy} className="hover:text-foreground transition-colors p-0.5">
              {copied
                ? <Check className="h-3 w-3 text-emerald-500" />
                : <Copy className="h-3 w-3" />
              }
            </button>
          )}
          {isError && onRetry && (
            <button onClick={onRetry} className="hover:text-foreground transition-colors p-0.5 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
