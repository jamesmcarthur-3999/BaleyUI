/**
 * Error Resolution Map
 *
 * Static mapping of known error patterns to resolution URLs.
 * Used by SSE error events to provide immediate inline feedback
 * so users can fix common issues without waiting for AI analysis.
 */

export interface ErrorResolution {
  message: string;
  actionUrl: string;
  actionLabel: string;
}

/**
 * Match an error message to a known resolution.
 * Returns null if no match is found.
 */
export function getErrorResolution(error: string): ErrorResolution | null {
  const e = error.toLowerCase();

  if (e.includes('no ai provider') || e.includes('missing credentials'))
    return {
      message: 'No AI provider connected.',
      actionUrl: '/dashboard/capabilities/connections',
      actionLabel: 'Set Up AI Provider',
    };

  if (
    e.includes('api key') &&
    (e.includes('invalid') || e.includes('expired'))
  )
    return {
      message: 'API key is invalid or expired.',
      actionUrl: '/dashboard/capabilities/connections',
      actionLabel: 'Update API Key',
    };

  if (e.includes('rate limit'))
    return {
      message: 'Rate limit exceeded. Try again shortly.',
      actionUrl: '/dashboard/analytics',
      actionLabel: 'View Usage',
    };

  if (e.includes('not configured') && e.includes('connection'))
    return {
      message: 'Required connection not configured.',
      actionUrl: '/dashboard/capabilities/connections',
      actionLabel: 'Configure Connections',
    };

  if (e.includes('timeout') || e.includes('timed out'))
    return {
      message: 'Execution timed out. Consider simplifying the task.',
      actionUrl: '/dashboard/analytics',
      actionLabel: 'View Performance',
    };

  return null;
}
