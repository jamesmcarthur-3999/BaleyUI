/**
 * Application Constants
 *
 * Centralized configuration values for consistency across the app.
 * This file contains configurable delays, limits, and defaults.
 */

// ============================================================================
// RECONNECTION & RETRY CONSTANTS
// ============================================================================

/**
 * SSE/EventSource reconnection configuration
 */
export const RECONNECTION = {
  /** Initial delay before first reconnect attempt (ms) */
  INITIAL_DELAY_MS: 1000,

  /** Maximum delay between reconnect attempts (ms) */
  MAX_DELAY_MS: 30000,

  /** Backoff multiplier for exponential backoff */
  BACKOFF_MULTIPLIER: 2,

  /** Maximum number of reconnect attempts */
  MAX_ATTEMPTS: 5,

  /** Default reconnect delay for simple scenarios (ms) */
  DEFAULT_DELAY_MS: 2000,
} as const;

/**
 * Retry configuration for API calls
 */
export const RETRY = {
  /** Default max retry attempts */
  MAX_ATTEMPTS: 3,

  /** Initial delay before first retry (ms) */
  INITIAL_DELAY_MS: 1000,

  /** Maximum delay between retries (ms) */
  MAX_DELAY_MS: 30000,

  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
} as const;

// ============================================================================
// EXECUTION CONSTANTS
// ============================================================================

/**
 * BaleyBot spawn configuration
 */
export const SPAWN = {
  /** Maximum nesting level for spawned BaleyBots */
  MAX_DEPTH: 5,
} as const;

// ============================================================================
// UI CONSTANTS
// ============================================================================

/**
 * Auto-dismiss delays for notifications and states
 */
export const AUTO_DISMISS = {
  /** Delay for success/error state auto-dismiss (ms) */
  STATE_CHANGE_MS: 3000,

  /** Delay for toast notifications (ms) */
  TOAST_MS: 5000,
} as const;

/**
 * Animation delays for CSS animations
 */
export const ANIMATION = {
  /** Delay for staggered animations (s) */
  STAGGER_DELAY_S: 0.5,

  /** Default animation delay (s) */
  DEFAULT_DELAY_S: 0.15,
} as const;
