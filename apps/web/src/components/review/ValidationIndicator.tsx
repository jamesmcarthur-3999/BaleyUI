'use client';

import type { ValidationStatus } from '@/lib/baleybot/creator-validation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ValidationIndicatorProps {
  status: ValidationStatus;
  className?: string;
}

const statusConfig: Record<ValidationStatus, {
  dotClass: string;
  label: string;
}> = {
  idle: {
    dotClass: 'bg-muted-foreground/30',
    label: 'Not yet validated',
  },
  validating: {
    dotClass: 'bg-amber-500 animate-pulse-validation',
    label: 'Validating...',
  },
  passed: {
    dotClass: 'bg-emerald-500',
    label: 'All checks passed',
  },
  failed: {
    dotClass: 'bg-red-500',
    label: 'Validation failed',
  },
  error: {
    dotClass: 'bg-red-500/60',
    label: 'Validation error',
  },
};

export function ValidationIndicator({ status, className }: ValidationIndicatorProps) {
  const config = statusConfig[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center justify-center shrink-0',
              className,
            )}
            aria-label={config.label}
          >
            <span
              className={cn(
                'w-2.5 h-2.5 rounded-full transition-colors duration-300',
                config.dotClass,
              )}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
