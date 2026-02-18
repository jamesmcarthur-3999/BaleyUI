'use client';

import {
  Globe,
  Download,
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/stores/canvas';
import { cn } from '@/lib/utils';

// ============================================================================
// COMPONENT
// ============================================================================

interface DeployViewProps {
  className?: string;
}

export function DeployView({ className }: DeployViewProps) {
  const goBackToLive = useCanvasStore((s) => s.goBackToLive);
  const sessionId = useCanvasStore((s) => s.sessionId);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const handleExportZip = async () => {
    if (!sessionId) return;
    setIsExporting(true);
    try {
      const response = await fetch(`/api/canvas/export?sessionId=${sessionId}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.zip';
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={cn('h-full flex flex-col items-center justify-center px-6', className)}>
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight">Ship It</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your app is ready. Choose how to deploy.
          </p>
        </div>

        {/* Deploy options */}
        <div className="space-y-3">
          {/* Export as ZIP */}
          <button
            onClick={handleExportZip}
            disabled={isExporting || !sessionId}
            className="w-full flex items-start gap-4 rounded-xl border border-border/50 bg-card/50 p-5 text-left transition-all hover:border-primary/30 hover:bg-card/80 disabled:opacity-50"
          >
            <div className="h-10 w-10 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
              {isExporting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : exportDone ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <Download className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium">
                {exportDone ? 'Downloaded!' : 'Export as ZIP'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Download the complete Next.js project. Run it locally or deploy
                to Vercel, Netlify, or any Node.js host.
              </p>
            </div>
          </button>

          {/* Host on BaleyUI (future) */}
          <div className="w-full flex items-start gap-4 rounded-xl border border-border/30 bg-card/30 p-5 text-left opacity-60">
            <div className="h-10 w-10 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
              <Globe className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-medium">
                Host on BaleyUI
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                  Coming soon
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get a shareable link instantly. Your app runs directly in the
                browser with no server needed.
              </p>
            </div>
          </div>
        </div>

        {/* Back button */}
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBackToLive}
            className="gap-2 text-muted-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to editor
          </Button>
        </div>
      </div>
    </div>
  );
}
