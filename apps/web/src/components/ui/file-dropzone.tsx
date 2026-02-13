'use client';

import { useRef } from 'react';
import { Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readFile, type FileReaderResult } from '@/hooks/useFileReader';
import { useToast } from '@/components/ui/use-toast';

export interface FileDropzonePreview {
  data: string;
  mimeType: string;
  name: string;
  /** Optional description shown below the file name (e.g. "32KB loaded"). */
  description?: string;
}

export interface FileDropzoneProps {
  /** Called with the read result when a file is selected or dropped. */
  onFile: (result: FileReaderResult) => void;
  /** Optional MIME type filter for the file input's `accept` attribute. */
  accept?: string;
  /** Max file size in MB (default: 10). */
  maxSizeMb?: number;
  /** Optional preview state — if provided, shows preview instead of empty dropzone. */
  preview?: FileDropzonePreview | null;
  /** Additional CSS classes for the dropzone container. */
  className?: string;
}

export function FileDropzone({
  onFile,
  accept,
  maxSizeMb = 10,
  preview,
  className,
}: FileDropzoneProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    try {
      const result = await readFile(file, maxSizeMb);
      onFile(result);
    } catch (err) {
      toast({
        title: 'File error',
        description: err instanceof Error ? err.message : 'Failed to read file',
        variant: 'destructive',
      });
    }
    // Reset input so re-uploading the same file triggers onChange
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors',
        className
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {preview && preview.mimeType.startsWith('image/') ? (
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${preview.mimeType};base64,${preview.data}`}
              alt="Upload preview"
              className="w-full h-full object-cover"
            />
          </div>
          <p className="text-sm font-medium">{preview.name}</p>
          <p className="text-xs text-muted-foreground">Click to change file</p>
        </div>
      ) : preview ? (
        <div className="flex flex-col items-center gap-3">
          <FileText className="h-10 w-10 text-primary" />
          <p className="text-sm font-medium">{preview.name}</p>
          <p className="text-xs text-muted-foreground">
            {preview.description ?? preview.mimeType} — Click to change file
          </p>
        </div>
      ) : (
        <>
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">Click or drag to upload</p>
          <p className="text-xs text-muted-foreground">
            Supports text files, images, PDFs, and more (max {maxSizeMb}MB)
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={handleChange}
      />
    </div>
  );
}
