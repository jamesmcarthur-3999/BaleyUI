'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface KeyboardShortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: KeyboardShortcut[];
}

/**
 * Detect if user is on macOS
 */
function useIsMac() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'));
  }, []);

  return isMac;
}

/**
 * Format a key for display based on platform
 */
function formatKey(key: string, isMac: boolean): string {
  const keyMap: Record<string, { mac: string; other: string }> = {
    mod: { mac: '⌘', other: 'Ctrl' },
    shift: { mac: '⇧', other: 'Shift' },
    alt: { mac: '⌥', other: 'Alt' },
    enter: { mac: '↵', other: 'Enter' },
    esc: { mac: 'Esc', other: 'Esc' },
  };

  const mapping = keyMap[key.toLowerCase()];
  if (mapping) {
    return isMac ? mapping.mac : mapping.other;
  }

  // Capitalize single letters
  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key;
}

/**
 * Keyboard shortcut display component
 */
function ShortcutKeys({ keys, isMac }: { keys: string[]; isMac: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <span key={index}>
          <kbd
            className={cn(
              'px-2 py-1 text-xs font-mono rounded',
              'bg-muted border border-border',
              'text-foreground'
            )}
          >
            {formatKey(key, isMac)}
          </kbd>
          {index < keys.length - 1 && <span className="text-muted-foreground mx-0.5">+</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * Define all keyboard shortcuts
 */
const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show this help dialog' },
      { keys: ['mod', '/'], description: 'Show this help dialog' },
      { keys: ['esc'], description: 'Close dialog / Cancel action' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: ['mod', 'z'], description: 'Undo last change' },
      { keys: ['mod', 'shift', 'z'], description: 'Redo last change' },
      { keys: ['mod', 'y'], description: 'Redo last change (alternative)' },
      { keys: ['mod', 's'], description: 'Save BaleyBot' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: ['enter'], description: 'Send message' },
      { keys: ['shift', 'enter'], description: 'New line in message' },
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog showing available keyboard shortcuts.
 *
 * Can be triggered with ? or Cmd/Ctrl+/
 */
export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const isMac = useIsMac();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <ShortcutKeys keys={shortcut.keys} isMac={isMac} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Press <kbd className="px-1.5 py-0.5 text-xs font-mono rounded bg-muted border border-border">?</kbd> anytime to show this dialog
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to handle keyboard shortcut dialog triggers
 */
export function useKeyboardShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // ? key (without modifier) - only when not in input
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setIsOpen(true);
        return;
      }

      // Cmd/Ctrl + / (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    setIsOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}

export default KeyboardShortcutsDialog;
