'use client';

import { useState } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Send, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WebhookTesterProps {
  webhookPath: string;
  className?: string;
}

export function WebhookTester({ webhookPath, className }: WebhookTesterProps) {
  const { execute, state } = useReviewExecution();
  const [body, setBody] = useState('{\n  \n}');
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const fullUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${webhookPath}`;

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    try {
      const parsed = JSON.parse(body);
      setParseError(null);
      await execute(parsed);
    } catch {
      setParseError('Invalid JSON');
    }
  };

  return (
    <div className={cn('rounded-lg border bg-background p-4 space-y-3', className)}>
      <p className="text-sm font-medium">Webhook Tester</p>

      {/* URL display */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
        <code className="text-xs font-mono flex-1 truncate">{fullUrl}</code>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCopyUrl}>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* JSON body editor */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Request Body</label>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setParseError(null);
          }}
          className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          rows={5}
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
            Send Request
          </>
        )}
      </Button>
    </div>
  );
}
