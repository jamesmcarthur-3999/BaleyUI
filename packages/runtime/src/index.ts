/**
 * @baleyui/runtime — Run BaleyBots anywhere.
 *
 * One button to export, one command to run.
 *
 * @example
 * ```typescript
 * import { BaleybotRuntime } from '@baleyui/runtime';
 *
 * const runtime = new BaleybotRuntime();
 * await runtime.load('./my-bot.baleybot.json');
 * const result = await runtime.execute('Hello, help me with X');
 * console.log(result.output);
 * ```
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBundle, type BaleybotBundle } from './bundle';
import { autoDetectStorage, type RuntimeStorage } from './storage';
import { UsageReporter, type UsageReport } from './usage-reporter';

export interface RuntimeOptions {
  /** AI provider API key. Falls back to ANTHROPIC_API_KEY or OPENAI_API_KEY env vars. */
  apiKey?: string;
  /** Custom storage backend. Auto-detects if not provided. */
  storage?: RuntimeStorage;
  /** BaleyUI API key for cloud usage reporting. Falls back to BALEYUI_API_KEY env var. */
  cloudApiKey?: string;
}

export interface ExecutionResult {
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string;
  duration: number;
  executionId: string;
}

export interface BaleybotStreamEvent {
  type: string;
  [key: string]: unknown;
}

export class BaleybotRuntime {
  private bundle: BaleybotBundle | null = null;
  private storage: RuntimeStorage | null = null;
  private usageReporter: UsageReporter;
  private apiKey: string | null;
  private customStorage: RuntimeStorage | undefined;

  constructor(options: RuntimeOptions = {}) {
    this.apiKey =
      options.apiKey ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      null;

    this.customStorage = options.storage;
    this.usageReporter = new UsageReporter({ apiKey: options.cloudApiKey });
  }

  /**
   * Load a BaleyBot bundle from a file path.
   */
  async load(bundlePath: string): Promise<void> {
    const absPath = resolve(bundlePath);
    const raw = await readFile(absPath, 'utf-8');
    const data = JSON.parse(raw);

    if (!validateBundle(data)) {
      throw new Error(
        `Invalid .baleybot.json bundle at ${absPath}. ` +
        'Expected version 1 with name, description, icon, balCode, entityNames, requiredTools, requiredProviders.'
      );
    }

    this.bundle = data;
  }

  /**
   * Load a BaleyBot bundle from a parsed object.
   */
  loadBundle(bundle: BaleybotBundle): void {
    if (!validateBundle(bundle)) {
      throw new Error('Invalid BaleyBot bundle object');
    }
    this.bundle = bundle;
  }

  /**
   * Execute the loaded BaleyBot with the given input. Returns the final result.
   */
  async execute(input: string): Promise<ExecutionResult> {
    if (!this.bundle) {
      throw new Error('No bundle loaded. Call load() or loadBundle() first.');
    }

    if (!this.apiKey) {
      throw new Error(
        'No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or pass apiKey in RuntimeOptions.'
      );
    }

    const storage = await this.getStorage();
    const executionId = await storage.createExecution(this.bundle.name, input);

    await storage.updateExecution(executionId, { status: 'running' });
    const startTime = Date.now();

    try {
      // Use the SDK's BAL executor
      const { executeBALCode } = await import('@baleyui/sdk');

      const result = await executeBALCode(this.bundle.balCode, {
        input,
        apiKey: this.apiKey,
      });

      const duration = Date.now() - startTime;

      const succeeded = result.status === 'success';

      await storage.updateExecution(executionId, {
        status: succeeded ? 'completed' : 'failed',
        output: result.result,
        error: result.error,
        completedAt: new Date(),
        durationMs: duration,
      });

      // Report usage
      const usageReport: UsageReport = {
        baleybotId: this.bundle.name,
        executionId,
        tokenInput: 0, // SDK doesn't expose token counts in sync mode currently
        tokenOutput: 0,
        model: this.detectModel(),
        durationMs: duration,
      };
      await storage.recordUsage({
        ...usageReport,
        timestamp: new Date(),
      });
      this.usageReporter.report(usageReport);

      return {
        status: succeeded ? 'completed' as const : 'failed' as const,
        output: result.result,
        error: result.error,
        duration,
        executionId,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      await storage.updateExecution(executionId, {
        status: 'failed',
        error: errorMsg,
        completedAt: new Date(),
        durationMs: duration,
      });

      return {
        status: 'failed',
        error: errorMsg,
        duration,
        executionId,
      };
    }
  }

  /**
   * Stream execution events as an async iterable.
   */
  async *stream(input: string): AsyncIterable<BaleybotStreamEvent> {
    if (!this.bundle) {
      throw new Error('No bundle loaded. Call load() or loadBundle() first.');
    }

    if (!this.apiKey) {
      throw new Error(
        'No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or pass apiKey in RuntimeOptions.'
      );
    }

    const { streamBALExecution } = await import('@baleyui/sdk');

    const eventStream = streamBALExecution(this.bundle.balCode, {
      input,
      apiKey: this.apiKey,
    });

    for await (const event of eventStream) {
      yield event as BaleybotStreamEvent;
    }
  }

  /**
   * Get the loaded bundle info.
   */
  getBundleInfo(): BaleybotBundle | null {
    return this.bundle;
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    await this.usageReporter.shutdown();
  }

  private async getStorage(): Promise<RuntimeStorage> {
    if (!this.storage) {
      this.storage = this.customStorage ?? await autoDetectStorage();
    }
    return this.storage;
  }

  private detectModel(): string {
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic|claude-sonnet-4-20250514';
    if (process.env.OPENAI_API_KEY) return 'openai|gpt-4o';
    return 'unknown';
  }
}

// Re-exports
export type { BaleybotBundle, BaleybotTestCase } from './bundle';
export { validateBundle } from './bundle';
export type { RuntimeStorage, ExecutionRecord, UsageRecord } from './storage';
export type { UsageReport } from './usage-reporter';
export { MemoryStorage } from './storage/memory';
