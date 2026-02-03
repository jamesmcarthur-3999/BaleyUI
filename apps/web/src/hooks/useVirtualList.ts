/**
 * Virtual List Hook
 *
 * Provides efficient rendering for large lists by only rendering visible items.
 * Uses intersection observer for dynamic visibility tracking.
 */

import { useState, useEffect, useRef, RefObject } from 'react';

export interface VirtualListOptions {
  /** Total number of items */
  itemCount: number;
  /** Height of each item in pixels */
  itemHeight: number;
  /** Number of items to render above/below visible area */
  overscan?: number;
  /** Container height (optional, auto-detected if not provided) */
  containerHeight?: number;
}

export interface VirtualItem {
  index: number;
  start: number;
  end: number;
  size: number;
}

export interface VirtualListResult {
  /** Reference to attach to the scroll container */
  containerRef: RefObject<HTMLDivElement>;
  /** Total height needed for all items */
  totalHeight: number;
  /** Items currently visible (including overscan) */
  virtualItems: VirtualItem[];
  /** Scroll to a specific index */
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
}

export function useVirtualList({
  itemCount,
  itemHeight,
  overscan = 3,
  containerHeight: providedHeight,
}: VirtualListOptions): VirtualListResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(providedHeight || 400);

  // Update container height on resize
  useEffect(() => {
    if (providedHeight) {
      setContainerHeight(providedHeight);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [providedHeight]);

  // Track scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Calculate visible range
  const totalHeight = itemCount * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  );

  // Generate virtual items
  const virtualItems: VirtualItem[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    virtualItems.push({
      index: i,
      start: i * itemHeight,
      end: (i + 1) * itemHeight,
      size: itemHeight,
    });
  }

  // Scroll to index function
  const scrollToIndex = (index: number, align: 'start' | 'center' | 'end' = 'start') => {
    const container = containerRef.current;
    if (!container) return;

    let scrollPosition: number;

    switch (align) {
      case 'start':
        scrollPosition = index * itemHeight;
        break;
      case 'center':
        scrollPosition = index * itemHeight - containerHeight / 2 + itemHeight / 2;
        break;
      case 'end':
        scrollPosition = (index + 1) * itemHeight - containerHeight;
        break;
    }

    container.scrollTo({
      top: Math.max(0, Math.min(scrollPosition, totalHeight - containerHeight)),
      behavior: 'smooth',
    });
  };

  return {
    containerRef: containerRef as RefObject<HTMLDivElement>,
    totalHeight,
    virtualItems,
    scrollToIndex,
  };
}

/**
 * Variable Height Virtual List
 *
 * For lists where items have different heights.
 */
export interface VariableVirtualListOptions {
  itemCount: number;
  estimatedItemHeight: number;
  getItemHeight?: (index: number) => number;
  overscan?: number;
}

export function useVariableVirtualList({
  itemCount,
  estimatedItemHeight,
  getItemHeight,
  overscan = 3,
}: VariableVirtualListOptions): VirtualListResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());

  // Get height for an item (measured or estimated)
  const getHeight = (index: number): number => {
    if (getItemHeight) return getItemHeight(index);
    return measuredHeights.get(index) ?? estimatedItemHeight;
  };

  // Calculate positions
  const itemPositions: number[] = [];
  let totalHeight = 0;

  for (let i = 0; i < itemCount; i++) {
    itemPositions.push(totalHeight);
    totalHeight += getHeight(i);
  }

  // Update container height on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Track scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Binary search to find start index
  const findStartIndex = (offset: number): number => {
    let low = 0;
    let high = itemCount - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const pos = itemPositions[mid] ?? 0;
      if (pos < offset) {
        low = mid + 1;
      } else if (pos > offset) {
        high = mid - 1;
      } else {
        return mid;
      }
    }

    return Math.max(0, low - 1);
  };

  // Calculate visible range
  const startIndex = Math.max(0, findStartIndex(scrollTop) - overscan);
  let endIndex = startIndex;

  while (endIndex < itemCount - 1 && (itemPositions[endIndex] ?? 0) < scrollTop + containerHeight) {
    endIndex++;
  }
  endIndex = Math.min(itemCount - 1, endIndex + overscan);

  // Generate virtual items
  const virtualItems: VirtualItem[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const start = itemPositions[i] ?? 0;
    const size = getHeight(i);
    virtualItems.push({
      index: i,
      start,
      end: start + size,
      size,
    });
  }

  // Scroll to index function
  const scrollToIndex = (index: number, align: 'start' | 'center' | 'end' = 'start') => {
    const container = containerRef.current;
    if (!container) return;

    const itemStart = itemPositions[index] ?? 0;
    const itemSize = getHeight(index);

    let scrollPosition: number;

    switch (align) {
      case 'start':
        scrollPosition = itemStart;
        break;
      case 'center':
        scrollPosition = itemStart - containerHeight / 2 + itemSize / 2;
        break;
      case 'end':
        scrollPosition = itemStart + itemSize - containerHeight;
        break;
    }

    container.scrollTo({
      top: Math.max(0, Math.min(scrollPosition, totalHeight - containerHeight)),
      behavior: 'smooth',
    });
  };

  return {
    containerRef: containerRef as RefObject<HTMLDivElement>,
    totalHeight,
    virtualItems,
    scrollToIndex,
  };
}
