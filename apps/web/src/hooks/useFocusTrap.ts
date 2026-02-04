import { useEffect, useRef, useCallback } from 'react';

/**
 * Focusable element selector for focus trap.
 * Matches interactive elements that can receive keyboard focus.
 */
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Hook to trap focus within a container element.
 *
 * This implements a focus trap pattern for accessibility (WCAG 2.4.3).
 * When a modal or dialog is open, focus should be constrained to the dialog
 * content, cycling between focusable elements when Tab/Shift+Tab is pressed.
 *
 * Note: If using Radix UI Dialog (@radix-ui/react-dialog), focus trapping
 * is built-in and you don't need this hook. Use this for custom modal
 * implementations or other focus-trapping scenarios.
 *
 * @param isOpen - Whether the trap is active (typically the modal open state)
 * @returns containerRef to attach to the container element, and handleKeyDown for Tab handling
 *
 * @example
 * ```tsx
 * function CustomModal({ isOpen, onClose, children }) {
 *   const { containerRef, handleKeyDown } = useFocusTrap(isOpen);
 *
 *   if (!isOpen) return null;
 *
 *   return (
 *     <div
 *       ref={containerRef}
 *       onKeyDown={handleKeyDown}
 *       role="dialog"
 *       aria-modal="true"
 *     >
 *       {children}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFocusTrap(isOpen: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store the element that was focused before the trap activated
      previousActiveElement.current = document.activeElement;

      // Focus first focusable element after a brief delay to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        const focusableElements = containerRef.current?.querySelectorAll(
          FOCUSABLE_SELECTOR
        );
        const firstElement = focusableElements?.[0] as HTMLElement | undefined;
        firstElement?.focus();
      }, 0);

      return () => clearTimeout(timeoutId);
    } else {
      // Return focus to the previously focused element when trap deactivates
      const previousElement = previousActiveElement.current as HTMLElement | null;
      previousElement?.focus();
    }
  }, [isOpen]);

  /**
   * Handle Tab key navigation to keep focus within the container.
   * Cycles focus from last element to first (and vice versa with Shift+Tab).
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    const focusableElements = containerRef.current?.querySelectorAll(
      FOCUSABLE_SELECTOR
    );

    if (!focusableElements?.length) return;

    const first = focusableElements[0] as HTMLElement;
    const last = focusableElements[focusableElements.length - 1] as HTMLElement;

    // Shift+Tab on first element -> go to last
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
    // Tab on last element -> go to first
    else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  return { containerRef, handleKeyDown };
}
