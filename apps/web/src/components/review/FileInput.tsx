'use client';

import { useRef, useState } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Upload, File, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileInputProps {
  accept?: string[];
  maxSizeMb?: number;
  className?: string;
}

export function FileInput({
  accept,
  maxSizeMb = 10,
  className,
}: FileInputProps) {
  const { execute, state } = useReviewExecution();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptString = accept?.join(',') || '*/*';

  const processFile = (file: File) => {
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File too large (max ${maxSizeMb}MB)`);
      return;
    }
    if (accept && accept.length > 0 && !accept.some(a => file.type.match(a.replace('*', '.*')))) {
      setError(`File type not accepted. Expected: ${accept.join(', ')}`);
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      await execute({
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        sizeBytes: selectedFile.size,
        content: base64,
      });
      setSelectedFile(null);
    };
    reader.readAsDataURL(selectedFile);
  };

  return (
    <div className={cn('rounded-lg border bg-background p-4 flex flex-col gap-3', className)}>
      <p className="text-sm font-medium">File Input</p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a file here or click to browse"
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'hover:border-primary/50 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none'
        )}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptString}
          onChange={handleFileSelect}
          className="hidden"
        />
        {selectedFile ? (
          <div className="flex items-center justify-center gap-2">
            <File className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{selectedFile.name}</span>
            <span className="text-xs text-muted-foreground">
              ({(selectedFile.size / 1024).toFixed(1)} KB)
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
              className="ml-1 p-0.5 rounded-full hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <Upload className="h-6 w-6 text-muted-foreground/50 mx-auto" />
            <p className="text-xs text-muted-foreground">
              Drop a file here or click to browse
            </p>
            {accept && accept.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Accepts: {accept.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <Button
        size="sm"
        onClick={handleUpload}
        disabled={!selectedFile || state.isExecuting}
        className="w-full"
      >
        {state.isExecuting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Upload & Process
          </>
        )}
      </Button>
    </div>
  );
}
