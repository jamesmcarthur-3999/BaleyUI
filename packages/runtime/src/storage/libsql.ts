/**
 * libSQL/SQLite storage — default storage backend.
 *
 * Covers the full spectrum with zero config:
 * - `file:~/.baleyui/runtime.db` — pure local, no internet
 * - `libsql://my-db.turso.io` — managed cloud with sync
 */

import type { RuntimeStorage, ExecutionRecord, UsageRecord } from '../storage';

/**
 * LibSQLStorage — uses libSQL for local or Turso-backed storage.
 *
 * Note: Requires `@libsql/client` as an optional peer dependency.
 * The package is dynamically imported to avoid bundling it when not needed.
 */
export class LibSQLStorage implements RuntimeStorage {
  private client: unknown; // @libsql/client Client
  private initialized = false;

  constructor(private url: string) {}

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import — @libsql/client is an optional peer dep
      const { createClient } = await import('@libsql/client');
      this.client = createClient({ url: this.url });

      // Create tables if they don't exist
      const c = this.client as { execute: (sql: string) => Promise<unknown> };
      await c.execute(`
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY,
          baleybot_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          input TEXT,
          output TEXT,
          error TEXT,
          started_at TEXT,
          completed_at TEXT,
          duration_ms INTEGER
        )
      `);
      await c.execute(`
        CREATE TABLE IF NOT EXISTS memory (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      await c.execute(`
        CREATE TABLE IF NOT EXISTS usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          baleybot_id TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          token_input INTEGER,
          token_output INTEGER,
          model TEXT,
          duration_ms INTEGER,
          timestamp TEXT
        )
      `);

      this.initialized = true;
    } catch (err) {
      throw new Error(
        `Failed to initialize libSQL storage at ${this.url}: ${err instanceof Error ? err.message : String(err)}. ` +
        'Install @libsql/client: npm install @libsql/client'
      );
    }
  }

  private get db() {
    return this.client as {
      execute: (args: { sql: string; args: unknown[] }) => Promise<{ rows: Array<Record<string, unknown>> }>;
    };
  }

  async createExecution(baleybotId: string, input: unknown): Promise<string> {
    await this.init();
    const id = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.db.execute({
      sql: 'INSERT INTO executions (id, baleybot_id, status, input, started_at) VALUES (?, ?, ?, ?, ?)',
      args: [id, baleybotId, 'pending', JSON.stringify(input), new Date().toISOString()],
    });
    return id;
  }

  async updateExecution(id: string, data: Partial<ExecutionRecord>): Promise<void> {
    await this.init();
    const sets: string[] = [];
    const args: unknown[] = [];

    if (data.status !== undefined) { sets.push('status = ?'); args.push(data.status); }
    if (data.output !== undefined) { sets.push('output = ?'); args.push(JSON.stringify(data.output)); }
    if (data.error !== undefined) { sets.push('error = ?'); args.push(data.error); }
    if (data.completedAt !== undefined) { sets.push('completed_at = ?'); args.push(data.completedAt.toISOString()); }
    if (data.durationMs !== undefined) { sets.push('duration_ms = ?'); args.push(data.durationMs); }

    if (sets.length === 0) return;

    args.push(id);
    await this.db.execute({
      sql: `UPDATE executions SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }

  async getMemory(key: string): Promise<unknown> {
    await this.init();
    const result = await this.db.execute({
      sql: 'SELECT value FROM memory WHERE key = ?',
      args: [key],
    });
    if (result.rows.length === 0) return null;
    try {
      return JSON.parse(result.rows[0].value as string);
    } catch {
      return result.rows[0].value;
    }
  }

  async setMemory(key: string, value: unknown): Promise<void> {
    await this.init();
    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO memory (key, value) VALUES (?, ?)',
      args: [key, JSON.stringify(value)],
    });
  }

  async recordUsage(usage: UsageRecord): Promise<void> {
    await this.init();
    await this.db.execute({
      sql: 'INSERT INTO usage (baleybot_id, execution_id, token_input, token_output, model, duration_ms, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [
        usage.baleybotId,
        usage.executionId,
        usage.tokenInput,
        usage.tokenOutput,
        usage.model,
        usage.durationMs,
        usage.timestamp.toISOString(),
      ],
    });
  }
}
