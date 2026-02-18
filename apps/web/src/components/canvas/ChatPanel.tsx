'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatThread, CREATOR_CONFIG } from '@/components/chat';
import type { ChatMessage, ChatAttachment } from '@/components/chat';
import { useFileUpload } from '@/hooks/useFileUpload';
import { AttachmentThumbnails } from '@/components/chat';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatQuickAction {
  id: string;
  label: string;
  prompt: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
  onStop: () => void;
  quickActions?: ChatQuickAction[];
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChatPanel({
  messages,
  isStreaming,
  onSend,
  onStop,
  quickActions = [],
  className,
}: ChatPanelProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    pendingAttachments,
    uploading,
    isDragging,
    fileInputRef,
    handleFileUpload,
    removePendingAttachment,
    clearPendingAttachments,
    dragHandlers,
  } = useFileUpload();

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    const attachments = pendingAttachments.length > 0
      ? pendingAttachments
      : undefined;
    onSend(trimmed, attachments);
    setValue('');
    clearPendingAttachments();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (prompt: string) => {
    onSend(prompt);
  };

  const hasContent = value.trim().length > 0 || pendingAttachments.length > 0;
  const showEmptyState = messages.length === 0;

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      onDragOver={dragHandlers.onDragOver}
      onDragLeave={dragHandlers.onDragLeave}
      onDrop={dragHandlers.onDrop}
    >
      {/* Chat header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs">B</span>
        </div>
        <span className="text-sm font-medium">Baley</span>
        {isStreaming && (
          <span className="ml-auto text-xs text-muted-foreground animate-pulse">
            Thinking...
          </span>
        )}
      </div>

      {/* Message thread */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {showEmptyState ? (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <h3 className="text-lg font-semibold mb-2">What do you want to build?</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Describe your app and I&apos;ll plan, design, and build it live.
            </p>
            {quickActions.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {quickActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action.prompt)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ChatThread
            messages={messages}
            config={CREATOR_CONFIG}
            isTyping={isStreaming}
            className="h-full"
          />
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border/30 p-3">
        {/* Attachment previews */}
        {pendingAttachments.length > 0 && (
          <div className="mb-2">
            <AttachmentThumbnails
              attachments={pendingAttachments}
              onRemove={removePendingAttachment}
            />
          </div>
        )}

        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg flex items-center justify-center">
            <span className="text-sm text-primary">Drop files here</span>
          </div>
        )}

        <div
          className={cn(
            'relative flex items-end gap-2 rounded-xl border bg-background/80 px-3 py-2 transition-all',
            isFocused && 'ring-1 ring-primary/30 border-primary/40',
            isDragging && 'border-primary/50',
          )}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFileUpload(e.target.files);
            }}
          />

          {/* File upload button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Describe what you want to build..."
            disabled={uploading}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-h-[28px] max-h-[120px]"
          />

          {isStreaming ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
              onClick={onStop}
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 shrink-0 transition-colors',
                hasContent
                  ? 'text-primary hover:text-primary'
                  : 'text-muted-foreground',
              )}
              disabled={!hasContent || uploading}
              onClick={handleSend}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
