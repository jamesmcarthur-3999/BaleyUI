'use client';

import { useRef, useState } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Upload, File, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadReviewProps {
  acceptedMimeTypes?: string[];
  maxFileSizeMb?: number;
  className?: string;
}

export function FileUploadReview({
  acceptedMimeTypes,
  maxFileSizeMb = 10,
  className,
}: FileUploadReviewProps) {
  const { execute, state } = useReviewExecution();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acceptString = acceptedMimeTypes?.join(',') || '*/*';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxFileSizeMb * 1024 * 1024) {
      setError(`File too large (max ${maxFileSizeMb}MB)`);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
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
    <div className={cn('rounded-lg border bg-background p-4 space-y-3', className)}>
      <p className="text-sm font-medium">File Upload</p>

      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        onClick={() => inputRef.current?.click()}
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
          </div>
        ) : (
          <div className="space-y-1">
            <Upload className="h-6 w-6 text-muted-foreground/50 mx-auto" />
            <p className="text-xs text-muted-foreground">
              Click to select a file
            </p>
            {acceptedMimeTypes && (
              <p className="text-[10px] text-muted-foreground">
                Accepts: {acceptedMimeTypes.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

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
