'use client';

import { useState } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WebhookSimulatorProps {
  samplePayload?: Record<string, unknown>;
  className?: string;
}

export function WebhookSimulator({ samplePayload, className }: WebhookSimulatorProps) {
  const { execute, state } = useReviewExecution();
  const [method, setMethod] = useState<'POST' | 'PUT' | 'PATCH'>('POST');
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState(
    samplePayload ? JSON.stringify(samplePayload, null, 2) : '{\n  \n}'
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSend = async () => {
    try {
      const parsedBody = JSON.parse(body);
      let parsedHeaders: Record<string, string> = {};
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        setParseError('Headers JSON is invalid — using defaults');
      }
      await execute({
        __webhookSimulation: true,
        method,
        headers: parsedHeaders,
        body: parsedBody,
      });
    } catch {
      setParseError('Invalid JSON body');
    }
  };

  return (
    <div className={cn('rounded-lg border bg-background p-4 flex flex-col gap-3', className)}>
      <p className="text-sm font-medium">Webhook Simulator</p>

      {/* Method selector */}
      <div className="flex gap-1.5">
        {(['POST', 'PUT', 'PATCH'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={cn(
              'px-2.5 py-1 rounded text-xs font-mono transition-colors',
              method === m
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Headers */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Headers</label>
        <textarea
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          rows={3}
          spellCheck={false}
        />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        <label className="text-xs text-muted-foreground mb-1 block">Body</label>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setParseError(null);
          }}
          className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          rows={6}
          spellCheck={false}
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
            Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Send Webhook
          </>
        )}
      </Button>
    </div>
  );
}
