/**
 * RuntimeStorage — storage interface for BaleyBot execution tracking.
 *
 * Auto-detect logic (user never sees this):
 * - If RUNTIME_DB_URL is set → use that
 * - If not → create ~/.baleyui/runtime.db (local SQLite via libSQL)
 * - For tests/one-off runs → in-memory
 */

export interface ExecutionRecord {
  id: string;
  baleybotId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface UsageRecord {
  baleybotId: string;
  executionId: string;
  tokenInput: number;
  tokenOutput: number;
  model: string;
  durationMs: number;
  timestamp: Date;
}

export interface RuntimeStorage {
  /** Create a new execution record. Returns the execution ID. */
  createExecution(baleybotId: string, input: unknown): Promise<string>;

  /** Update an existing execution record. */
  updateExecution(id: string, data: Partial<ExecutionRecord>): Promise<void>;

  /** Get a value from the BaleyBot's memory store. */
  getMemory(key: string): Promise<unknown>;

  /** Set a value in the BaleyBot's memory store. */
  setMemory(key: string, value: unknown): Promise<void>;

  /** Record usage data for billing. */
  recordUsage(usage: UsageRecord): Promise<void>;
}

/**
 * Auto-detect the best storage backend.
 */
export async function autoDetectStorage(): Promise<RuntimeStorage> {
  const dbUrl = process.env.RUNTIME_DB_URL;

  if (dbUrl) {
    if (dbUrl.startsWith('libsql://') || dbUrl.startsWith('file:')) {
      const { LibSQLStorage } = await import('./storage/libsql');
      return new LibSQLStorage(dbUrl);
    }
    if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
      const { PostgresStorage } = await import('./storage/postgres');
      return new PostgresStorage(dbUrl);
    }
  }

  // Default: in-memory for simplicity until libSQL dep is added
  const { MemoryStorage } = await import('./storage/memory');
  return new MemoryStorage();
}
