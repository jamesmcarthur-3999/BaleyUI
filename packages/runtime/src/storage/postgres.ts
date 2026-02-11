/**
 * PostgreSQL storage — for users at scale with existing Postgres.
 *
 * Activated when RUNTIME_DB_URL starts with postgres:// or postgresql://
 */

import type { RuntimeStorage, ExecutionRecord, UsageRecord } from '../storage';

/**
 * PostgresStorage — uses postgres.js for direct Postgres access.
 *
 * Note: Requires `postgres` as an optional peer dependency.
 */
export class PostgresStorage implements RuntimeStorage {
  private sql: unknown;
  private initialized = false;

  constructor(private connectionString: string) {}

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const postgresModule = await import('postgres');
      const postgres = postgresModule.default;
      this.sql = postgres(this.connectionString);

      // Create tables if they don't exist
      const s = this.sql as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
      await s`
        CREATE TABLE IF NOT EXISTS runtime_executions (
          id TEXT PRIMARY KEY,
          baleybot_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          input JSONB,
          output JSONB,
          error TEXT,
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          duration_ms INTEGER
        )
      `;
      await s`
        CREATE TABLE IF NOT EXISTS runtime_memory (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL
        )
      `;
      await s`
        CREATE TABLE IF NOT EXISTS runtime_usage (
          id SERIAL PRIMARY KEY,
          baleybot_id TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          token_input INTEGER,
          token_output INTEGER,
          model TEXT,
          duration_ms INTEGER,
          timestamp TIMESTAMPTZ
        )
      `;

      this.initialized = true;
    } catch (err) {
      throw new Error(
        `Failed to initialize Postgres storage: ${err instanceof Error ? err.message : String(err)}. ` +
        'Install postgres: npm install postgres'
      );
    }
  }

  private get db() {
    return this.sql as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<Record<string, unknown>>>;
  }

  async createExecution(baleybotId: string, input: unknown): Promise<string> {
    await this.init();
    const id = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.db`
      INSERT INTO runtime_executions (id, baleybot_id, status, input, started_at)
      VALUES (${id}, ${baleybotId}, 'pending', ${JSON.stringify(input)}, NOW())
    `;
    return id;
  }

  async updateExecution(id: string, data: Partial<ExecutionRecord>): Promise<void> {
    await this.init();
    // Build dynamic update
    const updates: Record<string, unknown> = {};
    if (data.status !== undefined) updates.status = data.status;
    if (data.output !== undefined) updates.output = JSON.stringify(data.output);
    if (data.error !== undefined) updates.error = data.error;
    if (data.completedAt !== undefined) updates.completed_at = data.completedAt;
    if (data.durationMs !== undefined) updates.duration_ms = data.durationMs;

    if (Object.keys(updates).length === 0) return;

    // Use a simple approach - update each field
    if (data.status !== undefined) {
      await this.db`UPDATE runtime_executions SET status = ${data.status} WHERE id = ${id}`;
    }
    if (data.output !== undefined) {
      await this.db`UPDATE runtime_executions SET output = ${JSON.stringify(data.output)} WHERE id = ${id}`;
    }
    if (data.error !== undefined) {
      await this.db`UPDATE runtime_executions SET error = ${data.error} WHERE id = ${id}`;
    }
    if (data.completedAt !== undefined) {
      await this.db`UPDATE runtime_executions SET completed_at = ${data.completedAt.toISOString()} WHERE id = ${id}`;
    }
    if (data.durationMs !== undefined) {
      await this.db`UPDATE runtime_executions SET duration_ms = ${data.durationMs} WHERE id = ${id}`;
    }
  }

  async getMemory(key: string): Promise<unknown> {
    await this.init();
    const rows = await this.db`SELECT value FROM runtime_memory WHERE key = ${key}`;
    if (rows.length === 0) return null;
    return rows[0].value;
  }

  async setMemory(key: string, value: unknown): Promise<void> {
    await this.init();
    await this.db`
      INSERT INTO runtime_memory (key, value)
      VALUES (${key}, ${JSON.stringify(value)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }

  async recordUsage(usage: UsageRecord): Promise<void> {
    await this.init();
    await this.db`
      INSERT INTO runtime_usage (baleybot_id, execution_id, token_input, token_output, model, duration_ms, timestamp)
      VALUES (${usage.baleybotId}, ${usage.executionId}, ${usage.tokenInput}, ${usage.tokenOutput}, ${usage.model}, ${usage.durationMs}, ${usage.timestamp.toISOString()})
    `;
  }
}
