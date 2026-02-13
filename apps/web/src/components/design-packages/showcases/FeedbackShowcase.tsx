'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';

export function FeedbackShowcase() {
  const [progress, setProgress] = useState(45);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 5));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Alerts</h3>
        <div className="space-y-3">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Information</AlertTitle>
            <AlertDescription>This is an informational alert message.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Something went wrong. Please try again.</AlertDescription>
          </Alert>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Progress</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Processing...</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Loading States</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading content...</span>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Status Indicators</h3>
        <div className="flex flex-wrap gap-4">
          {[
            { icon: CheckCircle, label: 'Success', cssVar: '--color-success' },
            { icon: AlertTriangle, label: 'Warning', cssVar: '--color-warning' },
            { icon: AlertCircle, label: 'Error', cssVar: '--color-error' },
            { icon: Info, label: 'Info', cssVar: '--color-info' },
          ].map(({ icon: Icon, label, cssVar }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full"
                style={{ backgroundColor: `hsl(var(${cssVar}) / 0.15)` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: `hsl(var(${cssVar}))` }} />
              </div>
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
