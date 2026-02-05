/**
 * API Key Validation for REST API v1
 *
 * Validates API keys from Authorization header and returns workspace context.
 */

import { db, apiKeys, eq, and, isNull, gt, or } from '@baleyui/db';
import { createHash } from 'crypto';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api/validate-api-key');

export interface ApiKeyValidationResult {
  workspaceId: string;
  keyId: string;
  permissions: string[];
}

/**
 * Validate an API key from the Authorization header
 *
 * Expected format: "Bearer bui_live_XXXXXXXXXXXX" or "Bearer bui_test_XXXXXXXXXXXX"
 *
 * @param authHeader - The Authorization header value
 * @returns The workspace ID and permissions if valid
 * @throws Error if the key is invalid, expired, or revoked
 */
export async function validateApiKey(
  authHeader: string | null
): Promise<ApiKeyValidationResult> {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  // Extract the key from "Bearer <key>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Invalid Authorization header format. Expected: Bearer <api_key>');
  }

  const apiKey = parts[1];
  if (!apiKey) {
    throw new Error('Missing API key');
  }

  // Validate key format (bui_live_* or bui_test_*)
  if (!apiKey.startsWith('bui_live_') && !apiKey.startsWith('bui_test_')) {
    throw new Error('Invalid API key format');
  }

  // Hash the API key to look it up in the database
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  // Look up the key in the database
  const key = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.keyHash, keyHash),
      isNull(apiKeys.revokedAt) // Key must not be revoked
    ),
  });

  if (!key) {
    throw new Error('Invalid API key');
  }

  // Check if key has expired
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    throw new Error('API key has expired');
  }

  // Update lastUsedAt timestamp (fire and forget - don't await)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .execute()
    .catch((err) => {
      // Log error but don't fail the request
      logger.error('Failed to update lastUsedAt for API key', err);
    });

  return {
    workspaceId: key.workspaceId,
    keyId: key.id,
    permissions: (key.permissions as string[]) || [],
  };
}

/**
 * Check if an API key has a specific permission
 */
export function hasPermission(
  validation: ApiKeyValidationResult,
  permission: string
): boolean {
  return (
    validation.permissions.includes('admin') ||
    validation.permissions.includes(permission)
  );
}
