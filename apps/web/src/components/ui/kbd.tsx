import * as React from 'react';
import { cn } from '@/lib/utils';

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /** The key or key combination to display */
  children: React.ReactNode;
}

/**
 * Keyboard shortcut display component.
 * Automatically converts modifier keys based on OS.
 */
function Kbd({ children, className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5',
        'text-[10px] font-mono font-medium text-muted-foreground',
        'shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

Kbd.displayName = 'Kbd';

/**
 * Hook to detect if user is on Mac.
 * Returns undefined during SSR/hydration to avoid flash.
 */
function useIsMac(): boolean | undefined {
  const [isMac, setIsMac] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'));
  }, []);

  return isMac;
}

/**
 * Renders a keyboard shortcut with proper modifier for the OS.
 * Pass shortcut like "mod+k" and it renders ⌘K on Mac, Ctrl+K on Windows.
 * Renders a fixed-width placeholder during SSR to prevent layout shift.
 */
function KeyboardShortcut({
  shortcut,
  className,
}: {
  shortcut: string;
  className?: string;
}) {
  const isMac = useIsMac();

  // During SSR/hydration, render an invisible placeholder to prevent flash
  if (isMac === undefined) {
    return <Kbd className={cn(className, 'invisible')}>{shortcut.replace(/mod\+/gi, '').toUpperCase()}</Kbd>;
  }

  const formatted = shortcut
    .replace(/mod/gi, isMac ? '⌘' : 'Ctrl')
    .replace(/alt/gi, isMac ? '⌥' : 'Alt')
    .replace(/shift/gi, isMac ? '⇧' : 'Shift')
    .replace(/ctrl/gi, isMac ? '⌃' : 'Ctrl')
    .replace(/\+/g, isMac ? '' : '+')
    .toUpperCase();

  return <Kbd className={className}>{formatted}</Kbd>;
}

KeyboardShortcut.displayName = 'KeyboardShortcut';

export { Kbd, KeyboardShortcut, useIsMac };
