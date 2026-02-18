'use client';

import {
  Code2,
  Eye,
  Rocket,
  FolderTree,
  Terminal,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/stores/canvas';
import { CanvasViewRouter } from './CanvasViewRouter';
import { cn } from '@/lib/utils';

// ============================================================================
// TOOLBAR
// ============================================================================

function CanvasToolbar() {
  const view = useCanvasStore((s) => s.view);
  const files = useCanvasStore((s) => s.files);
  const compileErrors = useCanvasStore((s) => s.compileErrors);

  if (view.kind === 'welcome') return null;

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/30 bg-muted/20">
      {/* View indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-auto">
        {view.kind === 'plan' && (
          <>
            <Eye className="h-3.5 w-3.5" />
            <span>Plan</span>
          </>
        )}
        {view.kind === 'brand' && (
          <>
            <Palette className="h-3.5 w-3.5" />
            <span>Brand Design</span>
          </>
        )}
        {view.kind === 'live' && (
          <>
            <Code2 className="h-3.5 w-3.5" />
            <span>Live Preview</span>
            {view.containerStatus !== 'ready' && (
              <span className="ml-1 text-amber-500 capitalize">
                ({view.containerStatus})
              </span>
            )}
          </>
        )}
        {view.kind === 'deploy' && (
          <>
            <Rocket className="h-3.5 w-3.5" />
            <span>Deploy</span>
          </>
        )}
      </div>

      {/* File count (when in live mode) */}
      {view.kind === 'live' && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
            <FolderTree className="h-3 w-3" />
            {files.size} files
          </Button>

          {compileErrors.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-destructive"
            >
              <Terminal className="h-3 w-3" />
              {compileErrors.length} error{compileErrors.length !== 1 ? 's' : ''}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SHELL
// ============================================================================

interface CanvasShellProps {
  onSendMessage: (message: string) => void;
  className?: string;
}

export function CanvasShell({ onSendMessage, className }: CanvasShellProps) {
  return (
    <div className={cn('flex flex-col h-full bg-background/40', className)}>
      <CanvasToolbar />
      <div className="flex-1 min-h-0 overflow-hidden">
        <CanvasViewRouter onSendMessage={onSendMessage} />
      </div>
    </div>
  );
}
