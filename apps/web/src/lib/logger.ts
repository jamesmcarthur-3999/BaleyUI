/**
 * Lightweight Logger Utility
 *
 * Provides structured logging with log levels for both server and client.
 * Supports namespacing for easy filtering and debugging.
 *
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const logger = createLogger('my-service');
 *   logger.info('Operation completed', { userId: '123' });
 *   logger.error('Operation failed', error);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  namespace: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}

// Log level priorities for filtering
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default minimum log level based on environment
const getMinLogLevel = (): LogLevel => {
  if (typeof process !== 'undefined' && process.env.LOG_LEVEL) {
    const level = process.env.LOG_LEVEL.toLowerCase();
    if (level in LOG_LEVELS) {
      return level as LogLevel;
    }
  }
  // In production, default to 'warn'; in development, show all
  const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  return isProd ? 'warn' : 'debug';
};

// Format error objects for logging
function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause ? { cause: formatError(error.cause) } : {}),
    };
  }
  return { value: error };
}

// Core logging function
function log(level: LogLevel, namespace: string, message: string, data?: unknown): void {
  const minLevel = getMinLogLevel();
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) {
    return;
  }

  const entry: LogEntry = {
    level,
    namespace,
    message,
    timestamp: new Date().toISOString(),
  };

  if (data !== undefined) {
    entry.data = level === 'error' && data instanceof Error ? formatError(data) : data;
  }

  // In production, output JSON for structured logging
  const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

  if (isProd) {
    // Structured JSON output for log aggregation
    const output = JSON.stringify(entry);
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  } else {
    // Human-readable output for development
    const prefix = `[${entry.timestamp.split('T')[1]?.slice(0, 8)}] [${level.toUpperCase()}] [${namespace}]`;
    const args = data !== undefined ? [prefix, message, data] : [prefix, message];
    switch (level) {
      case 'error':
        console.error(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'debug':
        console.debug(...args);
        break;
      default:
        console.log(...args);
    }
  }
}

/**
 * Create a namespaced logger
 *
 * @param namespace - Identifier for the logger (e.g., 'executor', 'api/flows')
 * @returns Logger instance with debug, info, warn, error methods
 *
 * @example
 * const logger = createLogger('baleybot-executor');
 * logger.info('Execution started', { executionId: '123' });
 * logger.error('Execution failed', error);
 */
export function createLogger(namespace: string): Logger {
  return {
    debug: (message: string, data?: unknown) => log('debug', namespace, message, data),
    info: (message: string, data?: unknown) => log('info', namespace, message, data),
    warn: (message: string, data?: unknown) => log('warn', namespace, message, data),
    error: (message: string, error?: unknown) => log('error', namespace, message, error),
  };
}

// Pre-created loggers for common namespaces
export const logger = {
  execution: createLogger('execution'),
  api: createLogger('api'),
  trpc: createLogger('trpc'),
  baleybot: createLogger('baleybot'),
  streaming: createLogger('streaming'),
  tools: createLogger('tools'),
  services: createLogger('services'),
};

export type { Logger, LogLevel, LogEntry };
