/**
 * API Key Management Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import { db, apiKeys, eq, and, isNull } from '@baleyui/db';
import crypto from 'crypto';

export function buildApiKeyTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  tools.set('list_api_keys', {
    name: 'list_api_keys',
    description:
      'List all API keys in the workspace with masked values and usage stats.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async function() {
      const keys = await db.query.apiKeys.findMany({
        where: and(
          eq(apiKeys.workspaceId, ctx.workspaceId),
          isNull(apiKeys.revokedAt)
        ),
        columns: {
          id: true,
          name: true,
          keyPrefix: true,
          keySuffix: true,
          permissions: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      return {
        keys: keys.map((k) => ({
          id: k.id,
          name: k.name,
          maskedKey: `${k.keyPrefix}...${k.keySuffix}`,
          permissions: k.permissions,
          lastUsed: k.lastUsedAt?.toISOString() ?? null,
          expiresAt: k.expiresAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        })),
        total: keys.length,
      };
    },
  });

  tools.set('create_api_key', {
    name: 'create_api_key',
    description:
      'Create a new API key. Returns the full key value ONCE — it cannot be retrieved later. Permissions can be: read, execute, admin.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Display name for the key',
        },
        permissions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of permissions: read, execute, admin',
        },
        expiresAt: {
          type: 'string',
          description: 'Optional ISO date for key expiration',
        },
      },
      required: ['name', 'permissions'],
    },
    async function(args) {
      const name = args.name as string;
      const permissions = args.permissions as string[];
      const expiresAt = args.expiresAt
        ? new Date(args.expiresAt as string)
        : undefined;

      // Generate key
      const rawKey = `bui_live_${crypto.randomBytes(16).toString('hex')}`;
      const keyHash = crypto
        .createHash('sha256')
        .update(rawKey)
        .digest('hex');
      const keyPrefix = rawKey.substring(0, 12);
      const keySuffix = rawKey.substring(rawKey.length - 4);

      const [created] = await db
        .insert(apiKeys)
        .values({
          workspaceId: ctx.workspaceId,
          name,
          keyHash,
          keyPrefix,
          keySuffix,
          permissions,
          expiresAt,
          createdBy: ctx.userId,
        })
        .returning();

      return {
        success: true,
        key: {
          id: created!.id,
          name: created!.name,
          fullKey: rawKey,
          maskedKey: `${keyPrefix}...${keySuffix}`,
        },
        message: `API key "${name}" created. IMPORTANT: Save this key now — it won't be shown again: ${rawKey}`,
      };
    },
  });

  tools.set('revoke_api_key', {
    name: 'revoke_api_key',
    description:
      'Revoke an API key. This is destructive — Baley should confirm with the user first.',
    inputSchema: {
      type: 'object',
      properties: {
        keyId: {
          type: 'string',
          description: 'The UUID of the API key to revoke',
        },
      },
      required: ['keyId'],
    },
    needsApproval: true,
    async function(args) {
      const keyId = args.keyId as string;

      const key = await db.query.apiKeys.findFirst({
        where: and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.workspaceId, ctx.workspaceId),
          isNull(apiKeys.revokedAt)
        ),
      });

      if (!key) {
        return { success: false, error: 'API key not found or already revoked' };
      }

      await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, keyId));

      return {
        success: true,
        message: `API key "${key.name}" has been revoked. It will no longer work for authentication.`,
      };
    },
  });

  return tools;
}
