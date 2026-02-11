'use client';

import { useState } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JsonFormInputProps {
  samplePayload?: Record<string, unknown>;
  className?: string;
}

export function JsonFormInput({ samplePayload, className }: JsonFormInputProps) {
  const { execute, state } = useReviewExecution();
  const [body, setBody] = useState(
    samplePayload ? JSON.stringify(samplePayload, null, 2) : '{\n  \n}'
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSend = async () => {
    try {
      const parsed = JSON.parse(body);
      setParseError(null);
      await execute(parsed);
    } catch {
      setParseError('Invalid JSON — please fix syntax errors before sending.');
    }
  };

  return (
    <div className={cn('rounded-lg border bg-background p-4 flex flex-col gap-3', className)}>
      <p className="text-sm font-medium">Structured Input</p>

      <div className="flex-1 min-h-0">
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setParseError(null);
          }}
          className="w-full h-full min-h-[200px] rounded-lg border bg-background px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          spellCheck={false}
          placeholder="Enter JSON input..."
        />
        {parseError && (
          <p className="text-xs text-red-500 mt-1">{parseError}</p>
        )}
      </div>

      <Button
        size="sm"
        onClick={handleSend}
        disabled={state.isExecuting}
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
            Send Input
          </>
        )}
      </Button>
    </div>
  );
}
