'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlidePanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Called when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Panel title */
  title: string;
  /** Optional description below title */
  description?: string;
  /** Panel content */
  children: React.ReactNode;
  /** Footer content (typically action buttons) */
  footer?: React.ReactNode;
  /** Panel width: 'narrow' (420px), 'default' (560px), 'wide' (720px) */
  width?: 'narrow' | 'default' | 'wide';
  /** Additional class for the panel */
  className?: string;
}

const widthClasses = {
  narrow: 'max-w-[420px]',
  default: 'max-w-[560px]',
  wide: 'max-w-[720px]',
};

function SlidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'default',
  className,
}: SlidePanelProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />

        {/* Panel */}
        <DialogPrimitive.Content
          className={cn(
            'fixed right-0 top-0 z-50 h-full w-full',
            widthClasses[width],
            'flex flex-col bg-background shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-200',
            className
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-lg font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className={cn(
                'rounded-sm opacity-70 ring-offset-background transition-opacity',
                'hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:pointer-events-none'
              )}
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// Convenience components for common footer patterns
function SlidePanelFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-end gap-2', className)}>
      {children}
    </div>
  );
}

// Close button that auto-connects to panel
const SlidePanelClose = DialogPrimitive.Close;

export { SlidePanel, SlidePanelFooter, SlidePanelClose, type SlidePanelProps };
