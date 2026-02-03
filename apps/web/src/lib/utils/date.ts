/**
 * Safely parse a date from various formats.
 * Returns current date if parsing fails.
 */
export function safeParseDate(value: unknown): Date {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? new Date() : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  return new Date();
}

/**
 * Format a date for display, with fallback
 */
export function formatDateSafe(value: unknown, fallback = 'Unknown date'): string {
  try {
    const date = safeParseDate(value);
    return date.toLocaleString();
  } catch {
    return fallback;
  }
}
