'use client';

import { useState, useRef, type RefObject, type DragEvent } from 'react';
import type { ChatAttachment } from '@/components/chat';

// ============================================================================
// Types
// ============================================================================

export interface UseFileUploadOptions {
  /** Upload endpoint URL (default: '/api/uploads') */
  uploadUrl?: string;
  /** Max file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Max files per upload (default: 5) */
  maxFiles?: number;
  /** Allowed MIME types (default: images + pdf) */
  allowedTypes?: Set<string>;
  /** Extra FormData fields to append (e.g. { sessionId: '...' }) */
  extraFormData?: Record<string, string>;
  /** Custom response parser — transforms API JSON to ChatAttachment[].
   *  If omitted, expects `{ uploads: [...] }` shape from /api/uploads. */
  parseResponse?: (json: unknown, files: File[]) => ChatAttachment[];
  /** Error handler (default: console.error). Use to show toasts or custom UI. */
  onError?: (message: string) => void;
}

export interface UseFileUploadReturn {
  pendingAttachments: ChatAttachment[];
  uploading: boolean;
  isDragging: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileUpload: (files: FileList | File[]) => Promise<void>;
  removePendingAttachment: (url: string) => void;
  clearPendingAttachments: () => ChatAttachment[];
  dragHandlers: {
    onDragOver: (e: DragEvent) => void;
    onDragEnter: (e: DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent) => void;
  };
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILES = 5;

// ============================================================================
// Hook
// ============================================================================

export function useFileUpload(options?: UseFileUploadOptions): UseFileUploadReturn {
  const {
    uploadUrl = '/api/uploads',
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxFiles = DEFAULT_MAX_FILES,
    allowedTypes = DEFAULT_ALLOWED_TYPES,
    extraFormData,
    parseResponse,
    onError = (msg: string) => console.error('[useFileUpload]', msg),
  } = options ?? {};

  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    if (uploadingRef.current) return; // Prevent concurrent uploads

    // Client-side validation
    for (const file of fileArray) {
      if (!allowedTypes.has(file.type)) {
        onError(`"${file.name}" is not a supported file type. Use images or PDFs.`);
        return;
      }
      if (file.size > maxFileSize) {
        onError(`"${file.name}" is too large. Maximum ${maxFileSize / 1024 / 1024}MB per file.`);
        return;
      }
    }

    if (pendingAttachments.length + fileArray.length > maxFiles) {
      onError(`Maximum ${maxFiles} files allowed.`);
      return;
    }

    uploadingRef.current = true;
    setUploading(true);
    try {
      const formData = new FormData();
      if (extraFormData) {
        for (const [key, value] of Object.entries(extraFormData)) {
          formData.append(key, value);
        }
      }
      for (const file of fileArray) {
        formData.append('files', file);
      }

      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(err.message ?? 'Upload failed');
      }

      const json = await res.json();

      let newAttachments: ChatAttachment[];
      if (parseResponse) {
        newAttachments = parseResponse(json, fileArray);
      } else {
        const { uploads } = json as {
          uploads: Array<{
            fileName: string;
            mimeType: string;
            fileSize: number;
            url: string;
            downloadUrl: string;
          }>;
        };

        // Create local preview URLs for images (match by name, not index)
        newAttachments = uploads.map((u) => {
          const matchingFile = fileArray.find(f => f.name === u.fileName);
          return {
            ...u,
            localPreviewUrl: matchingFile?.type.startsWith('image/')
              ? URL.createObjectURL(matchingFile)
              : undefined,
          };
        });
      }

      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const removePendingAttachment = (url: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find((a) => a.url === url);
      if (removed?.localPreviewUrl) {
        URL.revokeObjectURL(removed.localPreviewUrl);
      }
      return prev.filter((a) => a.url !== url);
    });
  };

  const clearPendingAttachments = (): ChatAttachment[] => {
    let captured: ChatAttachment[] = [];
    setPendingAttachments((prev) => {
      captured = [...prev];
      return [];
    });
    return captured;
  };

  const dragHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragEnter: (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragging(true);
    },
    onDragLeave: () => {
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files) {
        handleFileUpload(e.dataTransfer.files);
      }
    },
  };

  return {
    pendingAttachments,
    uploading,
    isDragging,
    fileInputRef,
    handleFileUpload,
    removePendingAttachment,
    clearPendingAttachments,
    dragHandlers,
  };
}
