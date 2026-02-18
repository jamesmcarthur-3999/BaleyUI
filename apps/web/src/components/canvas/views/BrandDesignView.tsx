'use client';

import { Palette } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvas';
import { cn } from '@/lib/utils';

// ============================================================================
// COMPONENT
// ============================================================================

interface BrandDesignViewProps {
  designSessionId: string;
  className?: string;
}

/**
 * BrandDesignView wraps the existing design calibration flow inline
 * within the canvas panel. When the user locks their brand, the canvas
 * transitions to the live state.
 *
 * For V1, this renders a placeholder. The existing DesignCalibrationWizard
 * components will be embedded here in a follow-up.
 */
export function BrandDesignView({
  designSessionId,
  className,
}: BrandDesignViewProps) {
  const startLive = useCanvasStore((s) => s.startLive);
  const setDesignPackageId = useCanvasStore((s) => s.setDesignPackageId);

  const handleBrandLocked = (designPackageId: string) => {
    setDesignPackageId(designPackageId);
    startLive();
  };

  return (
    <div className={cn('h-full flex flex-col items-center justify-center px-6', className)}>
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Palette className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Brand Design</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Set up your brand colors, typography, and design tokens. These will be
          applied to every component Baley builds.
        </p>
        <p className="text-xs text-muted-foreground">
          Session: {designSessionId.slice(0, 8)}...
        </p>
        {/* TODO: Embed DesignCalibrationWizard components inline */}
        <button
          onClick={() => handleBrandLocked(designSessionId)}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Skip brand setup (use defaults)
        </button>
      </div>
    </div>
  );
}
