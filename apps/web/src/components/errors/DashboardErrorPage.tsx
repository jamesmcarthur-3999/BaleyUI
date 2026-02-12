'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { createLogger } from '@/lib/logger';
import type { LucideIcon } from 'lucide-react';

interface DashboardErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
  area?: string;
  title?: string;
  message?: string;
  icon?: LucideIcon;
}

export function DashboardErrorPage({
  error,
  reset,
  area = 'dashboard',
  title = 'Something went wrong',
  message,
  icon: AreaIcon,
}: DashboardErrorPageProps) {
  const logger = createLogger(`${area}-error`);

  useEffect(() => {
    logger.error(`${area} page error`, {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error, area, logger]);

  const displayMessage = message || error.message || 'An unexpected error occurred.';
  const hasCustomIcon = !!AreaIcon;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        {hasCustomIcon ? (
          <div className="flex justify-center mb-4">
            <div className="relative">
              <AreaIcon className="h-12 w-12 text-muted-foreground" />
              <AlertCircle className="h-5 w-5 text-destructive absolute -bottom-1 -right-1" />
            </div>
          </div>
        ) : (
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        )}
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-muted-foreground mb-4">{displayMessage}</p>
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
