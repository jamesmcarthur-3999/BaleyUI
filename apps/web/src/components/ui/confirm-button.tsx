'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';
import { X } from 'lucide-react';

interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Label shown in default state */
  label: string;
  /** Label shown in confirming state */
  confirmLabel?: string;
  /** Called when user confirms (second click) */
  onConfirm: () => void | Promise<void>;
  /** Keyboard shortcut hint shown on hover */
  shortcut?: string;
  /** Time in ms before reverting to default state */
  timeout?: number;
  /** Icon to show in default state */
  icon?: React.ReactNode;
}

type ConfirmState = 'default' | 'confirming' | 'loading';

const ConfirmButton = React.forwardRef<HTMLButtonElement, ConfirmButtonProps>(
  (
    {
      label,
      confirmLabel = 'Confirm',
      onConfirm,
      shortcut,
      timeout = 3000,
      icon,
      variant = 'ghost',
      size = 'sm',
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const [state, setState] = useState<ConfirmState>('default');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Reset to default after timeout
    useEffect(() => {
      if (state === 'confirming') {
        timeoutRef.current = setTimeout(() => {
          setState('default');
        }, timeout);
      }
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, [state, timeout]);

    const handleClick = async () => {
      if (state === 'default') {
        setState('confirming');
      } else if (state === 'confirming') {
        setState('loading');
        try {
          await onConfirm();
        } finally {
          setState('default');
        }
      }
    };

    const handleCancel = (e: React.MouseEvent) => {
      e.stopPropagation();
      setState('default');
    };

    // Handle click outside to cancel
    const buttonRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (state !== 'confirming') return;

      const handleClickOutside = (e: MouseEvent) => {
        if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
          setState('default');
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [state]);

    if (state === 'confirming') {
      return (
        <div ref={buttonRef} className="inline-flex items-center gap-1" role="group" aria-label="Confirm action">
          <Button
            variant="ghost"
            size={size}
            onClick={handleCancel}
            className={cn('text-muted-foreground', className)}
            aria-label="Cancel"
          >
            {label}?
            <X className="h-3 w-3 ml-1" />
          </Button>
          <Button
            ref={ref}
            variant="destructive"
            size={size}
            onClick={handleClick}
            className={className}
            {...props}
          >
            {confirmLabel}
          </Button>
        </div>
      );
    }

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={disabled || state === 'loading'}
        className={cn(
          'group relative',
          variant === 'ghost' && 'text-muted-foreground hover:text-destructive',
          className
        )}
        title={shortcut ? `${label} (${shortcut})` : label}
        aria-keyshortcuts={shortcut}
        {...props}
      >
        {state === 'loading' ? (
          <span aria-live="polite" role="status">
            <span className="sr-only">Loading</span>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </span>
        ) : (
          icon
        )}
        <span>{label}</span>
        {shortcut && (
          <kbd className="hidden group-hover:inline-flex ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
            {shortcut}
          </kbd>
        )}
      </Button>
    );
  }
);

ConfirmButton.displayName = 'ConfirmButton';

export { ConfirmButton, type ConfirmButtonProps };
