/**
 * Environment Variable Validation
 *
 * Validates critical environment variables at import time.
 * Import this module early in your application to catch missing config.
 */

import { z } from 'zod';

// ============================================================================
// SCHEMA
// ============================================================================

/**
 * Schema for required environment variables.
 * Using zod for validation ensures type safety and clear error messages.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Authentication (Clerk)
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),

  // Cron security
  CRON_SECRET: z.string().optional(),

  // AI providers (at least one should be configured)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Optional services
  TAVILY_API_KEY: z.string().optional(),

  // Runtime
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Parse and validate environment variables.
 * Throws detailed error if validation fails.
 */
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const errorMessages = Object.entries(formatted)
      .filter(([key]) => key !== '_errors')
      .map(([key, value]) => {
        const errors = (value as { _errors?: string[] })._errors || [];
        return `  ${key}: ${errors.join(', ')}`;
      })
      .join('\n');

    console.error('[ENV] Environment validation failed:\n' + errorMessages);

    // In development, warn but don't crash
    if (process.env.NODE_ENV === 'development') {
      console.warn('[ENV] Running in development mode with incomplete configuration');
      // Return partial data with safe defaults for development
      return {
        DATABASE_URL: process.env.DATABASE_URL || '',
        NODE_ENV: 'development' as const,
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        CRON_SECRET: process.env.CRON_SECRET,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      } satisfies z.infer<typeof envSchema>;
    }

    throw new Error('Missing required environment variables:\n' + errorMessages);
  }

  return result.data;
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Validated environment variables.
 * Import this instead of accessing process.env directly.
 */
export const env = validateEnv();

/**
 * Check if a specific environment variable is configured.
 * Useful for conditional feature enablement.
 */
export function hasEnv(key: keyof z.infer<typeof envSchema>): boolean {
  return !!env[key];
}

/**
 * Get an environment variable with a fallback.
 * Type-safe way to access optional env vars.
 */
export function getEnv<K extends keyof z.infer<typeof envSchema>>(
  key: K,
  fallback?: z.infer<typeof envSchema>[K]
): z.infer<typeof envSchema>[K] | undefined {
  return env[key] ?? fallback;
}

/**
 * Require an environment variable at runtime.
 * Throws if not configured.
 */
export function requireEnv<K extends keyof z.infer<typeof envSchema>>(
  key: K,
  context?: string
): NonNullable<z.infer<typeof envSchema>[K]> {
  const value = env[key];
  if (!value) {
    const message = context
      ? `${key} is required for ${context}`
      : `${key} environment variable is required`;
    throw new Error(message);
  }
  return value as NonNullable<z.infer<typeof envSchema>[K]>;
}
