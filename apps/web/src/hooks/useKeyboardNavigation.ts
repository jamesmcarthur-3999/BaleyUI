/**
 * Keyboard Navigation Hook
 *
 * React hooks for accessible keyboard navigation patterns.
 */

import { useEffect, useRef, useState } from 'react';
import {
  createKeyboardNavigation,
  trapFocus,
  saveFocus,
  announce,
} from '@/lib/accessibility';

// ============================================================================
// ROVING TABINDEX HOOK
// ============================================================================

export interface UseRovingTabindexOptions {
  /** Orientation of the navigation */
  orientation?: 'horizontal' | 'vertical' | 'both';
  /** Whether to loop at boundaries */
  loop?: boolean;
  /** Callback when selection changes */
  onSelect?: (index: number) => void;
  /** Initial active index */
  initialIndex?: number;
}

export interface UseRovingTabindexResult {
  /** Current active index */
  activeIndex: number;
  /** Set active index programmatically */
  setActiveIndex: (index: number) => void;
  /** Get props for a list item */
  getItemProps: (index: number) => {
    tabIndex: number;
    ref: (el: HTMLElement | null) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onFocus: () => void;
  };
  /** Ref callback for container */
  containerRef: (el: HTMLElement | null) => void;
}

export function useRovingTabindex(
  itemCount: number,
  options: UseRovingTabindexOptions = {}
): UseRovingTabindexResult {
  const { orientation = 'vertical', loop = true, onSelect, initialIndex = 0 } = options;

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const itemsRef = useRef<Map<number, HTMLElement>>(new Map());
  const containerRef = useRef<HTMLElement | null>(null);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(itemsRef.current.entries())
      .sort(([a], [b]) => a - b)
      .map(([, el]) => el);

    if (items.length === 0) return;

    const handler = createKeyboardNavigation(items, {
      orientation,
      loop,
      onNavigate: (index) => {
        setActiveIndex(index);
        onSelect?.(index);
      },
      onActivate: (index) => {
        onSelect?.(index);
      },
    });

    handler(e.nativeEvent);
  };

  // Get props for individual items
  const getItemProps = (index: number) => ({
    tabIndex: index === activeIndex ? 0 : -1,
    ref: (el: HTMLElement | null) => {
      if (el) {
        itemsRef.current.set(index, el);
      } else {
        itemsRef.current.delete(index);
      }
    },
    onKeyDown: handleKeyDown,
    onFocus: () => setActiveIndex(index),
  });

  // Container ref callback
  const containerRefCallback = (el: HTMLElement | null) => {
    containerRef.current = el;
  };

  return {
    activeIndex,
    setActiveIndex,
    getItemProps,
    containerRef: containerRefCallback,
  };
}

// ============================================================================
// FOCUS TRAP HOOK
// ============================================================================

export interface UseFocusTrapOptions {
  /** Whether the trap is active */
  active?: boolean;
  /** Restore focus on deactivation */
  restoreFocus?: boolean;
  /** Initial focus element selector */
  initialFocus?: string;
}

export function useAccessibleFocusTrap(options: UseFocusTrapOptions = {}) {
  const { active = true, restoreFocus = true, initialFocus } = options;

  const containerRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const restoreFocusRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    // Save current focus
    if (restoreFocus) {
      restoreFocusRef.current = saveFocus();
    }

    // Set initial focus
    if (initialFocus) {
      const el = containerRef.current.querySelector<HTMLElement>(initialFocus);
      el?.focus();
    }

    // Setup trap
    cleanupRef.current = trapFocus(containerRef.current);

    return () => {
      cleanupRef.current?.();
      if (restoreFocus) {
        restoreFocusRef.current?.();
      }
    };
  }, [active, restoreFocus, initialFocus]);

  return containerRef;
}

// ============================================================================
// ARIA LIVE REGION HOOK
// ============================================================================

export interface UseAnnouncerOptions {
  /** Politeness level */
  politeness?: 'polite' | 'assertive';
}

export function useAnnouncer(options: UseAnnouncerOptions = {}) {
  const { politeness = 'polite' } = options;

  const announceMessage = (message: string) => {
    announce(message, politeness);
  };

  return announceMessage;
}

// ============================================================================
// KEYBOARD SHORTCUT HOOK
// ============================================================================

export interface KeyboardShortcut {
  key: string;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
  action: () => void;
  description?: string;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      for (const shortcut of shortcuts) {
        const { key, modifiers = {}, action } = shortcut;

        // Check if all modifiers match
        const ctrlMatch = !!modifiers.ctrl === e.ctrlKey;
        const altMatch = !!modifiers.alt === e.altKey;
        const shiftMatch = !!modifiers.shift === e.shiftKey;
        const metaMatch = !!modifiers.meta === e.metaKey;

        if (
          e.key.toLowerCase() === key.toLowerCase() &&
          ctrlMatch &&
          altMatch &&
          shiftMatch &&
          metaMatch
        ) {
          e.preventDefault();
          action();
          return;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}

// ============================================================================
// ESCAPE KEY HOOK
// ============================================================================

export function useEscapeKey(handler: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handler();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handler, enabled]);
}

// ============================================================================
// CLICK OUTSIDE HOOK
// ============================================================================

export function useClickOutside(
  handler: () => void,
  enabled: boolean = true
): React.RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [handler, enabled]);

  return ref;
}

// ============================================================================
// REDUCED MOTION HOOK
// ============================================================================

export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);

    function handleChange(e: MediaQueryListEvent) {
      setPrefersReduced(e.matches);
    }

    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  return prefersReduced;
}
