'use client';

import { useState, useEffect } from 'react';

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface PersistedDateRange {
  startDate: Date;
  endDate: Date;
  setRange: (range: DateRange) => void;
  preset: string | null;
}

const STORAGE_KEY = 'baleyui-analytics-date-range';
const DEFAULT_DAYS = 30;

export function usePersistedDateRange(): PersistedDateRange {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    // Initialize with default 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - DEFAULT_DAYS);
    return { startDate: start, endDate: end };
  });

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setDateRange({
          startDate: new Date(parsed.startDate),
          endDate: new Date(parsed.endDate),
        });
      }
    } catch (error) {
      console.error('Failed to load date range from localStorage:', error);
    }
  }, []);

  // Calculate current preset based on date range
  const getCurrentPreset = (): string | null => {
    const now = new Date();
    const diffTime = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Check if endDate is close to now (within 1 day)
    const endDiff = Math.abs(now.getTime() - dateRange.endDate.getTime());
    const isEndToday = endDiff < 24 * 60 * 60 * 1000;

    if (!isEndToday) return null;

    // Check common presets
    if (Math.abs(diffDays - 7) <= 1) return '7d';
    if (Math.abs(diffDays - 30) <= 1) return '30d';
    if (Math.abs(diffDays - 90) <= 1) return '90d';

    return null;
  };

  const setRange = (range: DateRange) => {
    setDateRange(range);

    // Persist to localStorage
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          startDate: range.startDate.toISOString(),
          endDate: range.endDate.toISOString(),
        })
      );
    } catch (error) {
      console.error('Failed to save date range to localStorage:', error);
    }
  };

  return {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    setRange,
    preset: getCurrentPreset(),
  };
}
