'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, StopCircle, Paperclip, Loader2, Upload } from 'lucide-react';
import { ChatThread, COMPANION_CONFIG, AttachmentThumbnails } from '@/components/chat';
import type { ChatMessage, ChatAttachment } from '@/components/chat';
import { useFileUpload } from '@/hooks/useFileUpload';

interface ChatModeProps {
  messages?: ChatMessage[];
  isLoading?: boolean;
  onSendMessage?: (message: string, attachments?: ChatAttachment[]) => void;
  onStopGeneration?: () => void;
  onRetry?: (messageId: string) => void;
  className?: string;
  placeholder?: string;
}

export function ChatMode({
  messages = [],
  isLoading = false,
  onSendMessage,
  onStopGeneration,
  onRetry,
  className,
  placeholder = 'Type a message...',
}: ChatModeProps) {
  const [input, setInput] = useState('');
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
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if ((!input.trim() && pendingAttachments.length === 0) || isLoading) return;
    const attachments = clearPendingAttachments();
    onSendMessage?.(input.trim(), attachments.length > 0 ? attachments : undefined);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Filter out empty assistant placeholders (show typing indicator instead)
  const visibleMessages = messages.filter(
    (m) => m.role !== 'assistant' || m.content || (m.segments && m.segments.length > 0) || m.status === 'streaming'
  );
  const lastVisible = visibleMessages[visibleMessages.length - 1];
  const isWaitingForResponse = isLoading && lastVisible?.role !== 'assistant';

  return (
    <div
      className={cn('flex flex-col h-full min-h-0 relative', className)}
      {...dragHandlers}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary/40 rounded-xl">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-8 w-8" />
            <span className="text-sm font-medium">Drop files to upload</span>
          </div>
        </div>
      )}

      {/* Messages via unified ChatThread */}
      <ChatThread
        messages={visibleMessages}
        config={COMPANION_CONFIG}
        isTyping={isWaitingForResponse}
        onRetry={onRetry}
        emptyState={<CompanionEmptyState />}
      />

      {/* Input — shrink-0 keeps it pinned at the bottom */}
      <div className="shrink-0 p-3 pt-2 space-y-2">
        {/* Pending attachment thumbnails */}
        {pendingAttachments.length > 0 && (
          <AttachmentThumbnails
            attachments={pendingAttachments}
            onRemove={removePendingAttachment}
            compact
          />
        )}

        <div className="relative flex items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                handleFileUpload(e.target.files);
              }
              e.target.value = '';
            }}
          />

          {/* Paperclip button */}
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || isLoading}
            title="Attach files"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>

          <div className="flex-1 glass-input rounded-2xl">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              className={cn(
                'min-h-[44px] max-h-[120px] resize-none',
                'border-0 bg-transparent shadow-none focus-visible:ring-0'
              )}
              rows={1}
            />
          </div>

          {isLoading ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-9 w-9 rounded-xl"
              onClick={onStopGeneration}
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-xl bg-transparent text-muted-foreground hover:text-primary hover:bg-primary/10"
              onClick={handleSend}
              disabled={!input.trim() && pendingAttachments.length === 0}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CompanionEmptyState() {
  return (
    <div className="text-center py-4">
      <div className="h-10 w-10 rounded-full bg-primary/10 mx-auto mb-3 flex items-center justify-center">
        <div className="h-3 w-3 rounded-full bg-primary/40 animate-pulse-soft" />
      </div>
      <h4 className="font-medium">Start a conversation</h4>
      <p className="text-sm text-muted-foreground mt-1">
        Ask me anything about your agents and workflows
      </p>
    </div>
  );
}
