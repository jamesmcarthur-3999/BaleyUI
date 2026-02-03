type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  context?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const context = entry.context ? ` [${entry.context}]` : '';
  return `${prefix}${context} ${entry.message}`;
}

export const logger = {
  debug(message: string, data?: Record<string, unknown>, context?: string) {
    if (!shouldLog('debug')) return;
    const entry: LogEntry = {
      level: 'debug',
      message,
      data,
      timestamp: new Date().toISOString(),
      context,
    };
    console.debug(formatLog(entry), data || '');
  },

  info(message: string, data?: Record<string, unknown>, context?: string) {
    if (!shouldLog('info')) return;
    const entry: LogEntry = {
      level: 'info',
      message,
      data,
      timestamp: new Date().toISOString(),
      context,
    };
    console.info(formatLog(entry), data || '');
  },

  warn(message: string, data?: Record<string, unknown>, context?: string) {
    if (!shouldLog('warn')) return;
    const entry: LogEntry = {
      level: 'warn',
      message,
      data,
      timestamp: new Date().toISOString(),
      context,
    };
    console.warn(formatLog(entry), data || '');
  },

  error(message: string, error?: Error, data?: Record<string, unknown>, context?: string) {
    if (!shouldLog('error')) return;
    const entry: LogEntry = {
      level: 'error',
      message,
      data: {
        ...data,
        errorMessage: error?.message,
        errorStack: error?.stack,
      },
      timestamp: new Date().toISOString(),
      context,
    };
    console.error(formatLog(entry), error || '');
  },
};

export const createLogger = (context: string) => ({
  debug: (msg: string, data?: Record<string, unknown>) => logger.debug(msg, data, context),
  info: (msg: string, data?: Record<string, unknown>) => logger.info(msg, data, context),
  warn: (msg: string, data?: Record<string, unknown>) => logger.warn(msg, data, context),
  error: (msg: string, err?: Error, data?: Record<string, unknown>) => logger.error(msg, err, data, context),
});
