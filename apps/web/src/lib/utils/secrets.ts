import { createHash } from 'crypto';

/**
 * Mask a secret for safe logging.
 * Shows first 4 and last 4 characters, masks middle.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '****';
  }
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

/**
 * Create a one-way hash of a secret for logging correlation.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

/**
 * Redact secrets from an object before logging.
 */
export function redactSecrets<T extends object>(obj: T, secretKeys: string[]): T {
  const redacted = { ...obj } as Record<string, unknown>;

  for (const key of secretKeys) {
    if (key in redacted && typeof redacted[key] === 'string') {
      redacted[key] = maskSecret(redacted[key] as string);
    }
  }

  return redacted as T;
}
