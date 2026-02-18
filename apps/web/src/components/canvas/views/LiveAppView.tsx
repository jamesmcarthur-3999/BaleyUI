'use client';

import { useEffect } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/stores/canvas';
import { cn } from '@/lib/utils';

// ============================================================================
// STATUS OVERLAYS
// ============================================================================

function BootingOverlay({ status }: { status: string }) {
  const stages = ['booting', 'installing', 'building', 'ready'];
  const currentIdx = stages.indexOf(status);

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <h3 className="text-sm font-medium mb-3">
        {status === 'booting' && 'Starting development environment...'}
        {status === 'installing' && 'Installing dependencies...'}
        {status === 'building' && 'Building your app...'}
      </h3>
      {/* Progress dots */}
      <div className="flex items-center gap-2">
        {stages.slice(0, -1).map((stage, i) => (
          <div key={stage} className="flex items-center gap-2">
            <div
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                i < currentIdx
                  ? 'bg-primary'
                  : i === currentIdx
                    ? 'bg-primary animate-pulse'
                    : 'bg-muted-foreground/30',
              )}
            />
            {i < stages.length - 2 && (
              <div
                className={cn(
                  'h-px w-6 transition-colors',
                  i < currentIdx ? 'bg-primary' : 'bg-muted-foreground/20',
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorOverlay({ message }: { message?: string }) {
  const startLive = useCanvasStore((s) => s.startLive);

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <AlertTriangle className="h-8 w-8 text-destructive mb-4" />
      <h3 className="text-sm font-medium mb-2">Something went wrong</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs text-center">
        {message || 'The development server encountered an error.'}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => startLive()}
        className="gap-2"
      >
        <RefreshCw className="h-3 w-3" />
        Restart
      </Button>
    </div>
  );
}

// ============================================================================
// ERROR PANEL
// ============================================================================

function CompileErrorPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const compileErrors = useCanvasStore((s) => s.compileErrors);

  if (compileErrors.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-t border-destructive/20 text-xs text-destructive hover:bg-destructive/15 transition-colors"
      >
        <Terminal className="h-3 w-3" />
        <span>
          {compileErrors.length} compile error{compileErrors.length !== 1 ? 's' : ''}
        </span>
        {isOpen ? (
          <ChevronDown className="h-3 w-3 ml-auto" />
        ) : (
          <ChevronUp className="h-3 w-3 ml-auto" />
        )}
      </button>
      {isOpen && (
        <div className="max-h-48 overflow-y-auto bg-zinc-950 text-zinc-100 p-3 text-xs font-mono">
          {compileErrors.map((error, i) => (
            <pre key={i} className="whitespace-pre-wrap mb-2 last:mb-0">
              {error}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface LiveAppViewProps {
  className?: string;
}

export function LiveAppView({ className }: LiveAppViewProps) {
  const view = useCanvasStore((s) => s.view);
  const iframeUrl = useCanvasStore((s) => s.iframeUrl);

  // Only render when in live mode
  if (view.kind !== 'live') return null;

  const { containerStatus, errorMessage } = view;
  const isReady = containerStatus === 'ready' && iframeUrl;

  return (
    <div className={cn('relative h-full', className)}>
      {/* Status overlays */}
      {containerStatus !== 'ready' && containerStatus !== 'error' && (
        <BootingOverlay status={containerStatus} />
      )}
      {containerStatus === 'error' && (
        <ErrorOverlay message={errorMessage} />
      )}

      {/* Iframe */}
      {isReady && (
        <div className="h-full flex flex-col">
          {/* Mini toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/10">
            <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground font-mono truncate">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {iframeUrl}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => window.open(iframeUrl, '_blank')}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                // Refresh the iframe
                const iframe = document.getElementById('canvas-iframe') as HTMLIFrameElement;
                if (iframe) iframe.src = iframeUrl;
              }}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Iframe content */}
          <iframe
            id="canvas-iframe"
            src={iframeUrl}
            className="flex-1 w-full border-none bg-white"
            sandbox="allow-scripts allow-forms allow-popups"
            title="Live App Preview"
          />
        </div>
      )}

      {/* Compile error panel */}
      <CompileErrorPanel />
    </div>
  );
}
