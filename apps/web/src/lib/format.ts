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
