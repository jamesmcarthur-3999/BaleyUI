/**
 * Cron Expression Utilities
 *
 * Simple cron expression parser for calculating next run times.
 * Supports standard 5-field cron expressions:
 * minute hour day-of-month month day-of-week
 *
 * Examples:
 * - "* * * * *" - every minute
 * - "0 9 * * *" - daily at 9am
 * - "0 0 * * 0" - weekly on Sunday at midnight
 * - "0 0 1 * *" - monthly on the 1st at midnight
 */

interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

/**
 * Parse a cron field into an array of valid values
 */
function parseCronField(
  field: string,
  min: number,
  max: number
): number[] {
  const values: Set<number> = new Set();

  // Split by comma for multiple values
  const parts = field.split(',');

  for (const part of parts) {
    // Handle wildcard
    if (part === '*') {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
      continue;
    }

    // Handle step values (*/n or n-m/s)
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr ?? '1', 10);

      let start = min;
      let end = max;

      if (range && range !== '*') {
        if (range.includes('-')) {
          const [startStr, endStr] = range.split('-');
          start = parseInt(startStr ?? String(min), 10);
          end = parseInt(endStr ?? String(max), 10);
        } else {
          start = parseInt(range, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
      continue;
    }

    // Handle range (n-m)
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr ?? String(min), 10);
      const end = parseInt(endStr ?? String(max), 10);

      for (let i = start; i <= end; i++) {
        values.add(i);
      }
      continue;
    }

    // Handle single value
    const value = parseInt(part, 10);
    if (!isNaN(value) && value >= min && value <= max) {
      values.add(value);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

/**
 * Parse a cron expression into its component fields
 */
function parseCronFields(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/);

  if (parts.length !== 5) {
    return null;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return null;
  }

  return {
    minute: parseCronField(minute, 0, 59),
    hour: parseCronField(hour, 0, 23),
    dayOfMonth: parseCronField(dayOfMonth, 1, 31),
    month: parseCronField(month, 1, 12),
    dayOfWeek: parseCronField(dayOfWeek, 0, 6), // 0 = Sunday
  };
}

/**
 * Check if a date matches the cron fields
 */
function matchesCronFields(date: Date, fields: CronFields): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // JS months are 0-indexed
  const dayOfWeek = date.getDay();

  return (
    fields.minute.includes(minute) &&
    fields.hour.includes(hour) &&
    fields.dayOfMonth.includes(dayOfMonth) &&
    fields.month.includes(month) &&
    fields.dayOfWeek.includes(dayOfWeek)
  );
}

/**
 * Parse a cron expression and return the next run time
 *
 * @param expression - Cron expression (e.g., "0 9 * * *")
 * @param from - Starting point for calculation (default: now)
 * @returns Next run time or null if invalid expression
 */
export function parseCronExpression(
  expression: string,
  from: Date = new Date()
): Date | null {
  const fields = parseCronFields(expression);

  if (!fields) {
    return null;
  }

  // Start from the next minute
  const nextRun = new Date(from);
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);
  nextRun.setMinutes(nextRun.getMinutes() + 1);

  // Search for the next matching time (limit to prevent infinite loop)
  const maxIterations = 525600; // 1 year worth of minutes
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCronFields(nextRun, fields)) {
      return nextRun;
    }
    nextRun.setMinutes(nextRun.getMinutes() + 1);
  }

  // No match found within a year
  return null;
}

/**
 * Validate a cron expression
 *
 * @param expression - Cron expression to validate
 * @returns true if valid, false otherwise
 */
export function isValidCronExpression(expression: string): boolean {
  const fields = parseCronFields(expression);
  return fields !== null;
}

/**
 * Get a human-readable description of a cron expression
 *
 * @param expression - Cron expression
 * @returns Human-readable description
 */
export function describeCronExpression(expression: string): string {
  const parts = expression.trim().split(/\s+/);

  if (parts.length !== 5) {
    return 'Invalid cron expression';
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Common patterns
  if (expression === '* * * * *') {
    return 'Every minute';
  }

  if (minute === '0' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${hour}:00`;
  }

  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayIndex = parseInt(dayOfWeek ?? '0', 10);
    return `Weekly on ${days[dayIndex] ?? 'day ' + dayIndex} at midnight`;
  }

  if (minute === '0' && hour === '0' && dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return `Monthly on day ${dayOfMonth} at midnight`;
  }

  return `Cron: ${expression}`;
}
