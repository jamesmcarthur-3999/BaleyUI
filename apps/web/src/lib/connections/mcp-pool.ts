/**
 * MCP Connection Pool
 *
 * Workspace-scoped pool that manages MCPClient lifecycle.
 * For Vercel serverless: each invocation gets a fresh pool (request-scoped).
 * For self-hosted: pool persists across requests in memory.
 */

import type { MCPClient } from '@baleybots/mcp';
import { createLogger } from '@/lib/logger';

const log = createLogger('mcp-pool');

/** Default idle timeout: 5 minutes */
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface PoolEntry {
  client: MCPClient;
  connectionId: string;
  lastUsedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * MCP connection pool for a workspace.
 * Manages client lifecycle with idle timeout cleanup.
 */
class MCPConnectionPool {
  private entries = new Map<string, PoolEntry>();
  private idleTimeoutMs: number;

  constructor(idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) {
    this.idleTimeoutMs = idleTimeoutMs;
  }

  /**
   * Add a connected client to the pool.
   */
  add(connectionId: string, client: MCPClient): void {
    // Remove existing entry if any
    this.remove(connectionId);

    const timer = setTimeout(() => {
      log.info('Idle timeout reached, removing MCP client', { connectionId });
      this.remove(connectionId);
    }, this.idleTimeoutMs);

    this.entries.set(connectionId, {
      client,
      connectionId,
      lastUsedAt: Date.now(),
      timer,
    });
  }

  /**
   * Get a client from the pool. Resets idle timeout.
   */
  get(connectionId: string): MCPClient | undefined {
    const entry = this.entries.get(connectionId);
    if (!entry) return undefined;

    // Reset idle timeout
    clearTimeout(entry.timer);
    entry.lastUsedAt = Date.now();
    entry.timer = setTimeout(() => {
      this.remove(connectionId);
    }, this.idleTimeoutMs);

    return entry.client;
  }

  /**
   * Check if a connection is pooled.
   */
  has(connectionId: string): boolean {
    return this.entries.has(connectionId);
  }

  /**
   * Remove a client from the pool and disconnect it.
   */
  remove(connectionId: string): void {
    const entry = this.entries.get(connectionId);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.entries.delete(connectionId);

    entry.client.disconnect().catch((err) => {
      log.warn('Failed to disconnect MCP client during pool cleanup', {
        connectionId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  /**
   * Disconnect all pooled clients.
   */
  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.entries.keys());
    for (const id of ids) {
      this.remove(id);
    }
  }

  /**
   * Get the number of active connections.
   */
  get size(): number {
    return this.entries.size;
  }
}

/**
 * Global pool store keyed by workspace ID.
 * In serverless environments, this is request-scoped and ephemeral.
 */
const pools = new Map<string, MCPConnectionPool>();

/**
 * Get or create a pool for a workspace.
 */
export function getWorkspacePool(workspaceId: string): MCPConnectionPool {
  let pool = pools.get(workspaceId);
  if (!pool) {
    pool = new MCPConnectionPool();
    pools.set(workspaceId, pool);
  }
  return pool;
}

/**
 * Clean up a workspace's pool entirely.
 */
export async function cleanupWorkspacePool(workspaceId: string): Promise<void> {
  const pool = pools.get(workspaceId);
  if (pool) {
    await pool.disconnectAll();
    pools.delete(workspaceId);
  }
}

export { MCPConnectionPool };
