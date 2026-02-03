/**
 * Sanitize error messages before sending to client.
 * Removes internal details while preserving actionable information.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Remove stack traces
    const sanitized = message.split('\n')[0] ?? message;

    // Remove file paths
    const noPath = sanitized.replace(/\/[^\s]+\.(ts|js|tsx|jsx)/g, '[internal]');

    // Remove API keys patterns
    const noKeys = noPath.replace(/sk-[a-zA-Z0-9]+/g, '[redacted]');

    // Limit length
    return noKeys.slice(0, 200);
  }

  return 'An unexpected error occurred';
}

/**
 * Check if an error is safe to expose to clients
 */
export function isUserFacingError(error: unknown): boolean {
  if (error instanceof Error) {
    // Known safe error patterns
    const safePatterns = [
      /timeout/i,
      /cancelled/i,
      /not found/i,
      /invalid input/i,
      /rate limit/i,
    ];
    return safePatterns.some(p => p.test(error.message));
  }
  return false;
}
