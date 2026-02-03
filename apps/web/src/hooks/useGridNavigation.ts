import { useCallback, useRef } from 'react';

export function useGridNavigation(itemCount: number, columns: number) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = Math.min(currentIndex + 1, itemCount - 1);
        break;
      case 'ArrowLeft':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + columns, itemCount - 1);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - columns, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = itemCount - 1;
        break;
      default:
        return; // Don't prevent default for other keys
    }

    e.preventDefault();

    const items = containerRef.current?.querySelectorAll('[role="gridcell"]');
    (items?.[nextIndex] as HTMLElement)?.focus();
  }, [itemCount, columns]);

  return { containerRef, handleKeyDown };
}
