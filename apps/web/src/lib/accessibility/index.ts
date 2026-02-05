/**
 * Accessibility Utilities
 *
 * ARIA helpers, keyboard navigation, and focus management for BaleyUI.
 */

// ============================================================================
// ARIA LIVE ANNOUNCEMENTS
// ============================================================================

let announcer: HTMLDivElement | null = null;

function getAnnouncer(): HTMLDivElement {
  if (announcer) return announcer;

  announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.style.cssText = `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `;
  document.body.appendChild(announcer);

  return announcer;
}

/**
 * Announce a message to screen readers.
 */
export function announce(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  const el = getAnnouncer();
  el.setAttribute('aria-live', priority);
  el.textContent = '';

  // Force DOM update
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

/**
 * Announce progress updates.
 */
export function announceProgress(current: number, total: number, label?: string): void {
  const percentage = Math.round((current / total) * 100);
  const message = label
    ? `${label}: ${percentage}% complete, ${current} of ${total}`
    : `${percentage}% complete, ${current} of ${total}`;
  announce(message);
}

/**
 * Announce loading state changes.
 */
export function announceLoading(isLoading: boolean, context?: string): void {
  const message = isLoading
    ? context ? `Loading ${context}...` : 'Loading...'
    : context ? `${context} loaded` : 'Content loaded';
  announce(message);
}

// ============================================================================
// FOCUS MANAGEMENT
// ============================================================================

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

/**
 * Get all focusable elements within a container.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
}

/**
 * Trap focus within a container (for modals, dialogs).
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusable = getFocusableElements(container);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  container.addEventListener('keydown', handleKeydown);

  // Focus first element
  first?.focus();

  return () => {
    container.removeEventListener('keydown', handleKeydown);
  };
}

/**
 * Save and restore focus (for modal open/close).
 */
export function saveFocus(): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  return () => {
    previouslyFocused?.focus();
  };
}

// ============================================================================
// KEYBOARD NAVIGATION
// ============================================================================

export type ArrowDirection = 'up' | 'down' | 'left' | 'right';

export interface KeyboardNavigationOptions {
  /** Orientation of the navigation */
  orientation?: 'horizontal' | 'vertical' | 'both';
  /** Whether to loop at boundaries */
  loop?: boolean;
  /** Callback when selection changes */
  onNavigate?: (index: number, direction: ArrowDirection) => void;
  /** Callback when item is activated (Enter/Space) */
  onActivate?: (index: number) => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

/**
 * Handle arrow key navigation for lists.
 */
export function createKeyboardNavigation(
  items: HTMLElement[],
  options: KeyboardNavigationOptions = {}
): (e: KeyboardEvent) => void {
  const {
    orientation = 'vertical',
    loop = true,
    onNavigate,
    onActivate,
    onEscape,
  } = options;

  let currentIndex = 0;

  // Find initially focused item
  const focusedIndex = items.findIndex(
    (item) => item === document.activeElement || item.contains(document.activeElement)
  );
  if (focusedIndex >= 0) {
    currentIndex = focusedIndex;
  }

  return (e: KeyboardEvent) => {
    const isHorizontal = orientation === 'horizontal' || orientation === 'both';
    const isVertical = orientation === 'vertical' || orientation === 'both';

    let direction: ArrowDirection | null = null;
    let delta = 0;

    switch (e.key) {
      case 'ArrowUp':
        if (isVertical) {
          direction = 'up';
          delta = -1;
        }
        break;
      case 'ArrowDown':
        if (isVertical) {
          direction = 'down';
          delta = 1;
        }
        break;
      case 'ArrowLeft':
        if (isHorizontal) {
          direction = 'left';
          delta = -1;
        }
        break;
      case 'ArrowRight':
        if (isHorizontal) {
          direction = 'right';
          delta = 1;
        }
        break;
      case 'Home':
        delta = -currentIndex;
        break;
      case 'End':
        delta = items.length - 1 - currentIndex;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onActivate?.(currentIndex);
        return;
      case 'Escape':
        onEscape?.();
        return;
      default:
        return;
    }

    if (delta === 0) return;

    e.preventDefault();

    let newIndex = currentIndex + delta;

    if (loop) {
      if (newIndex < 0) newIndex = items.length - 1;
      if (newIndex >= items.length) newIndex = 0;
    } else {
      newIndex = Math.max(0, Math.min(items.length - 1, newIndex));
    }

    if (newIndex !== currentIndex) {
      currentIndex = newIndex;
      items[currentIndex]?.focus();
      if (direction) {
        onNavigate?.(currentIndex, direction);
      }
    }
  };
}

/**
 * Setup roving tabindex for a list.
 */
export function setupRovingTabindex(
  items: HTMLElement[],
  activeIndex: number = 0
): void {
  items.forEach((item, index) => {
    item.setAttribute('tabindex', index === activeIndex ? '0' : '-1');
  });
}

// ============================================================================
// ARIA PATTERNS
// ============================================================================

/**
 * ARIA IDs for connecting labels, descriptions, errors.
 */
export function createAriaIds(prefix: string) {
  return {
    id: prefix,
    labelId: `${prefix}-label`,
    descriptionId: `${prefix}-description`,
    errorId: `${prefix}-error`,
    listboxId: `${prefix}-listbox`,
    optionId: (index: number) => `${prefix}-option-${index}`,
  };
}

/**
 * Props for an accessible dialog.
 */
export interface DialogAriaProps {
  role: 'dialog' | 'alertdialog';
  'aria-modal': boolean;
  'aria-labelledby': string;
  'aria-describedby'?: string;
}

export function getDialogAriaProps(
  titleId: string,
  descriptionId?: string,
  isAlert: boolean = false
): DialogAriaProps {
  return {
    role: isAlert ? 'alertdialog' : 'dialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
    ...(descriptionId && { 'aria-describedby': descriptionId }),
  };
}

/**
 * Props for accessible listbox.
 */
export interface ListboxAriaProps {
  role: 'listbox';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-activedescendant'?: string;
  'aria-multiselectable'?: boolean;
}

export function getListboxAriaProps(options: {
  label?: string;
  labelledby?: string;
  activeOptionId?: string;
  multiselectable?: boolean;
}): ListboxAriaProps {
  return {
    role: 'listbox',
    ...(options.label && { 'aria-label': options.label }),
    ...(options.labelledby && { 'aria-labelledby': options.labelledby }),
    ...(options.activeOptionId && { 'aria-activedescendant': options.activeOptionId }),
    ...(options.multiselectable && { 'aria-multiselectable': true }),
  };
}

/**
 * Props for listbox option.
 */
export interface OptionAriaProps {
  role: 'option';
  id: string;
  'aria-selected': boolean;
  'aria-disabled'?: boolean;
}

export function getOptionAriaProps(
  id: string,
  selected: boolean,
  disabled: boolean = false
): OptionAriaProps {
  return {
    role: 'option',
    id,
    'aria-selected': selected,
    ...(disabled && { 'aria-disabled': true }),
  };
}

/**
 * Props for accessible tabs.
 */
export function getTabsAriaProps(id: string, selectedIndex: number, _count: number) {
  return {
    tablist: {
      role: 'tablist' as const,
      'aria-orientation': 'horizontal' as const,
    },
    tab: (index: number) => ({
      role: 'tab' as const,
      id: `${id}-tab-${index}`,
      'aria-controls': `${id}-panel-${index}`,
      'aria-selected': index === selectedIndex,
      tabIndex: index === selectedIndex ? 0 : -1,
    }),
    panel: (index: number) => ({
      role: 'tabpanel' as const,
      id: `${id}-panel-${index}`,
      'aria-labelledby': `${id}-tab-${index}`,
      tabIndex: 0,
      hidden: index !== selectedIndex,
    }),
  };
}

// ============================================================================
// REDUCED MOTION
// ============================================================================

/**
 * Check if user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation duration based on user preference.
 */
export function getAnimationDuration(normalDuration: number): number {
  return prefersReducedMotion() ? 0 : normalDuration;
}

// ============================================================================
// COLOR CONTRAST
// ============================================================================

/**
 * Calculate relative luminance of a color.
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
}

/**
 * Calculate contrast ratio between two colors.
 */
export function getContrastRatio(
  color1: [number, number, number],
  color2: [number, number, number]
): number {
  const l1 = getLuminance(...color1);
  const l2 = getLuminance(...color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast meets WCAG AA standard.
 */
export function meetsContrastAA(
  color1: [number, number, number],
  color2: [number, number, number],
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(color1, color2);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Check if contrast meets WCAG AAA standard.
 */
export function meetsContrastAAA(
  color1: [number, number, number],
  color2: [number, number, number],
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(color1, color2);
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}
