'use client';

import { useState } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UrlInputProps {
  placeholder?: string;
  className?: string;
}

export function UrlInput({ placeholder, className }: UrlInputProps) {
  const { execute, state } = useReviewExecution();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Please enter a URL');
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setError('Invalid URL format');
      return;
    }
    setError(null);
    await execute(trimmed);
  };

  return (
    <div className={cn('rounded-lg border bg-background p-4 flex flex-col gap-3', className)}>
      <p className="text-sm font-medium">URL Input</p>

      <div className="flex gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !state.isExecuting) handleSend(); }}
              placeholder={placeholder || 'https://example.com'}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              spellCheck={false}
            />
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        <Button
          size="sm"
          onClick={handleSend}
          disabled={state.isExecuting || !url.trim()}
          className="shrink-0"
        >
          {state.isExecuting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Fetch'
          )}
        </Button>
      </div>
    </div>
  );
}
