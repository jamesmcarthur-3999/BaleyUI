'use client';

import { FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatAttachment } from './types';

interface AttachmentThumbnailsProps {
  attachments: ChatAttachment[];
  /** Omit for read-only display (e.g. in sent messages) */
  onRemove?: (url: string) => void;
  /** Smaller sizing for compact layouts (e.g. companion panel) */
  compact?: boolean;
}

export function AttachmentThumbnails({
  attachments,
  onRemove,
  compact,
}: AttachmentThumbnailsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((att) => (
        <div
          key={att.url}
          className={cn(
            'group flex items-center gap-1.5 rounded-lg border border-border bg-muted/50',
            compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
          )}
        >
          {att.mimeType.startsWith('image/') && (att.localPreviewUrl || att.url) ? (
            <img
              src={att.localPreviewUrl || att.url}
              alt={att.fileName}
              className={cn(
                'rounded object-cover',
                compact ? 'h-5 w-5' : 'h-6 w-6'
              )}
            />
          ) : (
            <FileText className={cn(
              'shrink-0 text-muted-foreground',
              compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
            )} />
          )}
          <span className={cn(
            'max-w-[80px] truncate text-muted-foreground',
            compact ? 'text-[9px]' : 'text-[10px]'
          )}>
            {att.fileName}
          </span>
          {onRemove && (
            <button
              onClick={() => onRemove(att.url)}
              aria-label={`Remove ${att.fileName}`}
              className="rounded-full p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
            >
              <X className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
