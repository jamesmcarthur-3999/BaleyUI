'use client';

import { useState } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StructuredFormReviewProps {
  className?: string;
}

export function StructuredFormReview({ className }: StructuredFormReviewProps) {
  const { execute, state } = useReviewExecution();
  const [jsonInput, setJsonInput] = useState('{\n  \n}');
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      const parsed = JSON.parse(jsonInput);
      setParseError(null);
      await execute(parsed);
    } catch {
      setParseError('Invalid JSON');
    }
  };

  return (
    <div className={cn('rounded-lg border bg-background p-4 space-y-3', className)}>
      <p className="text-sm font-medium">Structured Input</p>
      <p className="text-[11px] text-muted-foreground">
        Send structured JSON data to your bot
      </p>

      <textarea
        value={jsonInput}
        onChange={(e) => {
          setJsonInput(e.target.value);
          setParseError(null);
        }}
        className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
        rows={6}
        spellCheck={false}
      />

      {parseError && (
        <p className="text-xs text-red-500">{parseError}</p>
      )}

      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={state.isExecuting || !jsonInput.trim()}
        className="w-full"
      >
        {state.isExecuting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Submit
          </>
        )}
      </Button>
    </div>
  );
}
