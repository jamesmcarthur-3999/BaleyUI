'use client';

import { useRef, useEffect, useState } from 'react';

/**
 * Smart auto-scroll hook for streaming test execution.
 *
 * Tracks whether the user has scrolled away from the active area.
 * Auto-scrolls to the active element when test state changes.
 * Shows a "Jump to active" indicator when the user has scrolled away.
 */
export function useSmartAutoScroll(activeTestId: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledAway, setUserScrolledAway] = useState(false);
  const isAutoScrollingRef = useRef(false);

  // Detect user scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isAutoScrollingRef.current) return;

      // Check if scrolled near bottom (within 200px)
      const { scrollTop, scrollHeight, clientHeight } = container;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 200;
      setUserScrolledAway(!nearBottom);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to active test
  useEffect(() => {
    if (!activeTestId || userScrolledAway) return;

    const container = containerRef.current;
    if (!container) return;

    const activeElement = container.querySelector(`[data-test-id="${activeTestId}"]`);
    if (!activeElement) return;

    isAutoScrollingRef.current = true;
    activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Reset auto-scroll flag after animation
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 500);
  }, [activeTestId, userScrolledAway]);

  const jumpToActive = () => {
    if (!activeTestId) return;

    const container = containerRef.current;
    if (!container) return;

    const activeElement = container.querySelector(`[data-test-id="${activeTestId}"]`);
    if (!activeElement) return;

    setUserScrolledAway(false);
    isAutoScrollingRef.current = true;
    activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 500);
  };

  return {
    containerRef,
    userScrolledAway: userScrolledAway && activeTestId !== null,
    jumpToActive,
  };
}
