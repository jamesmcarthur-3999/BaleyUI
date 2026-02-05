'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Bot } from 'lucide-react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('baleybots-error');

export default function BaleyBotsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error with context for debugging
    logger.error('BaleyBots page error', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <Bot className="h-12 w-12 text-muted-foreground" />
            <AlertCircle className="h-5 w-5 text-destructive absolute -bottom-1 -right-1" />
          </div>
        </div>
        <h2 className="text-xl font-semibold mb-2">BaleyBots Error</h2>
        <p className="text-muted-foreground mb-4">
          {error.message || 'Failed to load BaleyBots.'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground mb-4 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try again
        </Button>
      </div>
    </div>
  );
}
