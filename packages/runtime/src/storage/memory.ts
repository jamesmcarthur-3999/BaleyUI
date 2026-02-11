/**
 * In-memory storage — for ephemeral/test runs and one-off executions.
 * Data is lost when the process exits.
 */

import type { RuntimeStorage, ExecutionRecord, UsageRecord } from '../storage';

export class MemoryStorage implements RuntimeStorage {
  private executions = new Map<string, ExecutionRecord>();
  private memory = new Map<string, unknown>();
  private usage: UsageRecord[] = [];
  private nextId = 1;

  async createExecution(baleybotId: string, input: unknown): Promise<string> {
    const id = `exec_${this.nextId++}`;
    this.executions.set(id, {
      id,
      baleybotId,
      status: 'pending',
      input,
      startedAt: new Date(),
    });
    return id;
  }

  async updateExecution(id: string, data: Partial<ExecutionRecord>): Promise<void> {
    const existing = this.executions.get(id);
    if (!existing) return;
    this.executions.set(id, { ...existing, ...data });
  }

  async getMemory(key: string): Promise<unknown> {
    return this.memory.get(key) ?? null;
  }

  async setMemory(key: string, value: unknown): Promise<void> {
    this.memory.set(key, value);
  }

  async recordUsage(usage: UsageRecord): Promise<void> {
    this.usage.push(usage);
  }

  /** Test helper: get all recorded usage. */
  getRecordedUsage(): UsageRecord[] {
    return [...this.usage];
  }
}
