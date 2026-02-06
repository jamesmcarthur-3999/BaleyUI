/**
 * AI Credentials Service
 *
 * Retrieves AI provider credentials from workspace connections.
 * This replaces hardcoded environment variable API keys with
 * workspace-configured connections.
 */

import type { ProviderConfig } from '@baleybots/core';
import { db, connections, and, eq, inArray, notDeleted } from '@baleyui/db';
import type { AIConnectionConfig } from '@/lib/connections/providers';
import { decrypt } from '@/lib/encryption';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-credentials-service');

// ============================================================================
// TYPES
// ============================================================================

export type AIProviderType = 'openai' | 'anthropic' | 'ollama';

export interface AICredentials {
  /** The provider type (openai, anthropic, ollama) */
  provider: AIProviderType;
  /** The decrypted API key */
  apiKey: string;
  /** Optional base URL override */
  baseUrl?: string;
  /** The recommended model for this provider */
  model: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Safely decrypt a value, returning undefined if decryption fails
 */
export function decryptMaybe(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

/**
 * Get the default model for a provider
 */
function getDefaultModel(provider: AIProviderType): string {
  switch (provider) {
    case 'openai':
      return 'openai:gpt-4o-mini';
    case 'anthropic':
      return 'anthropic:claude-sonnet-4-20250514';
    case 'ollama':
      return 'ollama:llama3.2';
    default:
      return 'openai:gpt-4o-mini';
  }
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

/**
 * Get AI credentials from workspace connections.
 *
 * This function looks up the workspace's configured AI provider connections
 * and returns the credentials for execution.
 *
 * Priority:
 * 1. Preferred provider if specified and has a connected connection
 * 2. Default connection for any AI provider
 * 3. Any available AI provider connection
 *
 * @param workspaceId - The workspace ID to look up connections for
 * @param preferredProvider - Optional preferred provider type
 * @returns AI credentials or null if no valid connection found
 */
export async function getWorkspaceAICredentials(
  workspaceId: string,
  preferredProvider?: AIProviderType | null
): Promise<AICredentials | null> {
  try {
    // Query all AI provider connections for this workspace
    const allConnections = await db.query.connections.findMany({
      where: and(
        eq(connections.workspaceId, workspaceId),
        inArray(connections.type, ['openai', 'anthropic', 'ollama']),
        notDeleted(connections)
      ),
    });

    if (allConnections.length === 0) {
      log.debug('No AI connections found for workspace, checking env vars', { workspaceId });

      // Fall back to environment variables when no workspace connections exist
      if (process.env.ANTHROPIC_API_KEY) {
        return {
          provider: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: getDefaultModel('anthropic'),
        };
      }
      if (process.env.OPENAI_API_KEY) {
        return {
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
          model: getDefaultModel('openai'),
        };
      }

      return null;
    }

    // Filter by preferred provider if specified
    const candidates = preferredProvider
      ? allConnections.filter((conn) => conn.type === preferredProvider)
      : allConnections;

    // Prefer connected connections
    const connected = candidates.filter((conn) => conn.status === 'connected');

    // Select best connection: default first, then any connected, then any available
    const selected =
      connected.find((conn) => conn.isDefault) ??
      connected[0] ??
      candidates.find((conn) => conn.isDefault) ??
      candidates[0];

    if (!selected) {
      log.debug('No suitable AI connection found', { workspaceId, preferredProvider });
      return null;
    }

    // Extract and decrypt credentials
    const config = selected.config as AIConnectionConfig;
    const apiKey = decryptMaybe(config.apiKey);

    if (!apiKey) {
      log.warn('Connection found but no API key configured', {
        workspaceId,
        connectionId: selected.id,
        provider: selected.type,
      });
      return null;
    }

    const provider = selected.type as AIProviderType;

    return {
      provider,
      apiKey,
      baseUrl: config.baseUrl,
      model: getDefaultModel(provider),
    };
  } catch (error) {
    log.error('Failed to get workspace AI credentials', {
      workspaceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Check if a workspace has any AI provider configured.
 *
 * @param workspaceId - The workspace ID to check
 * @returns true if the workspace has at least one AI connection
 */
export async function hasAIConnection(workspaceId: string): Promise<boolean> {
  const connection = await db.query.connections.findFirst({
    where: and(
      eq(connections.workspaceId, workspaceId),
      inArray(connections.type, ['openai', 'anthropic', 'ollama']),
      notDeleted(connections)
    ),
    columns: { id: true },
  });

  return connection !== undefined;
}

// ============================================================================
// PROVIDER CONFIG (used by executor for @baleybots/core SDK)
// ============================================================================

/**
 * Build a ProviderConfig from a database connection record.
 */
export function buildProviderConfig(
  connection: { type: string; config: unknown }
): ProviderConfig | undefined {
  const config = connection.config as AIConnectionConfig;
  const apiKey = typeof config.apiKey === 'string' ? decryptMaybe(config.apiKey) : undefined;
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : undefined;

  if (!apiKey && !baseUrl) {
    return undefined;
  }

  const providerConfig: ProviderConfig = {
    apiKey,
    baseUrl,
  };

  if (connection.type === 'openai' && config.organization) {
    providerConfig.headers = {
      'OpenAI-Organization': config.organization,
    };
  }

  return providerConfig;
}

/**
 * Resolve a ProviderConfig for BAL execution.
 *
 * Priority:
 * 1. Workspace database connections (preferred provider first, then default, then any)
 * 2. Environment variable for preferred provider
 * 3. Any available environment variable (with fallback warning)
 */
export async function resolveProviderConfig(
  workspaceId: string,
  preferredProvider: AIProviderType | null
): Promise<ProviderConfig | undefined> {
  log.debug('Resolving provider config', {
    workspaceId,
    preferredProvider,
    hasAnthropicEnvKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenAIEnvKey: !!process.env.OPENAI_API_KEY,
  });

  const allConnections = await db.query.connections.findMany({
    where: and(
      eq(connections.workspaceId, workspaceId),
      inArray(connections.type, ['openai', 'anthropic', 'ollama']),
      notDeleted(connections)
    ),
  });

  log.debug('Found database connections', {
    count: allConnections.length,
    types: allConnections.map((c) => c.type),
  });

  // First try to find a database connection
  if (allConnections.length > 0) {
    const candidates = preferredProvider
      ? allConnections.filter((conn) => conn.type === preferredProvider)
      : allConnections;

    const connected = candidates.filter((conn) => conn.status === 'connected');

    const selected =
      connected.find((conn) => conn.isDefault) ??
      connected[0] ??
      candidates.find((conn) => conn.isDefault) ??
      candidates[0];

    if (selected) {
      log.debug('Using database connection', { type: selected.type, id: selected.id });
      return buildProviderConfig(selected);
    }
  }

  // Fallback to environment variables (essential for internal baleybots and dev)
  // First try the preferred provider's key
  if (preferredProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    log.debug('Using ANTHROPIC_API_KEY from environment');
    return { apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (preferredProvider === 'openai' && process.env.OPENAI_API_KEY) {
    log.debug('Using OPENAI_API_KEY from environment');
    return { apiKey: process.env.OPENAI_API_KEY };
  }

  // If preferred provider's key isn't available, fall back to any available key
  // This is critical for internal baleybots that specify a model but the key isn't configured
  if (process.env.ANTHROPIC_API_KEY) {
    if (preferredProvider && preferredProvider !== 'anthropic') {
      log.warn(`Preferred provider ${preferredProvider} key not found, falling back to Anthropic`);
    }
    log.debug('Using ANTHROPIC_API_KEY from environment (fallback)');
    return { apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    if (preferredProvider && preferredProvider !== 'openai') {
      log.warn(`Preferred provider ${preferredProvider} key not found, falling back to OpenAI`);
    }
    log.debug('Using OPENAI_API_KEY from environment (fallback)');
    return { apiKey: process.env.OPENAI_API_KEY };
  }

  log.warn('No provider config found - no API keys available', { workspaceId, preferredProvider });
  return undefined;
}
