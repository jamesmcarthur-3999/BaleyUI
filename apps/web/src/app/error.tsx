'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 text-center">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. Please try again or return to the dashboard.
        </p>
        <div className="flex gap-4 justify-center">
          <Button onClick={reset} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button asChild>
            <a href="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              Dashboard
            </a>
          </Button>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <pre className="mt-8 p-4 bg-muted rounded text-left text-xs overflow-auto max-h-48">
            {error.message}
          </pre>
        )}
      </div>
    </div>
  );
}
