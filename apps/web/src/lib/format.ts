/**
 * Formatting utilities for displaying costs, tokens, and durations.
 *
 * These utilities provide consistent formatting across the application.
 */

/**
 * Format cost in dollars with appropriate precision
 * - < $0.01: Show "<$0.01"
 * - < $1: Show "$0.XX" (2 decimal places)
 * - < $100: Show "$XX.XX" (2 decimal places)
 * - >= $100: Show "$XXX" (no decimals)
 */
export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined) {
    return '-';
  }

  // Handle string inputs (from database)
  const numericCost = typeof cost === 'string' ? parseFloat(cost) : cost;

  if (isNaN(numericCost)) {
    return '-';
  }

  if (numericCost < 0.01) {
    return '<$0.01';
  }

  if (numericCost < 100) {
    return `$${numericCost.toFixed(2)}`;
  }

  return `$${Math.round(numericCost)}`;
}

/**
 * Format token count with K/M suffixes
 * - < 1,000: Show exact number
 * - < 1,000,000: Show "X.XK"
 * - >= 1,000,000: Show "X.XM"
 */
export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) {
    return '-';
  }

  if (tokens < 1000) {
    return tokens.toString();
  }

  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }

  return `${(tokens / 1000000).toFixed(1)}M`;
}

/**
 * Format duration in ms to human readable
 * - < 1s: Show "XXXms"
 * - < 1min: Show "X.Xs"
 * - >= 1min: Show "Xm XXs"
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return '-';
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a date as a relative time string
 * - null/undefined: "-"
 * - < 1 min: "Just now"
 * - < 1 hour: "Xm ago"
 * - < 24 hours: "Xh ago"
 * - < 7 days: "Xd ago"
 * - >= 7 days: toLocaleDateString
 */
export function formatTimeAgo(
  date: Date | string | number | null | undefined
): string {
  if (date === null || date === undefined) {
    return '-';
  }

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    return '-';
  }

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
