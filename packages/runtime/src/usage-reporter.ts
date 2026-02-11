/**
 * Usage Reporter — phones home for billing when an API key is present.
 *
 * For cloud customers: automatically reports usage back to BaleyUI's billing API.
 * For self-hosted users: usage stays local. No configuration needed.
 */

export interface UsageReport {
  baleybotId: string;
  executionId: string;
  tokenInput: number;
  tokenOutput: number;
  model: string;
  durationMs: number;
}

interface UsageReporterOptions {
  /** BaleyUI API key for cloud reporting. If absent, usage stays local only. */
  apiKey?: string;
  /** API base URL. Defaults to production. */
  baseUrl?: string;
}

export class UsageReporter {
  private apiKey: string | null;
  private baseUrl: string;
  private queue: UsageReport[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: UsageReporterOptions = {}) {
    this.apiKey = options.apiKey || process.env.BALEYUI_API_KEY || null;
    this.baseUrl = options.baseUrl || process.env.BALEYUI_API_URL || 'https://baley-ui-web.vercel.app';

    // Flush every 30 seconds if there's an API key
    if (this.apiKey) {
      this.flushTimer = setInterval(() => this.flush(), 30_000);
    }
  }

  /** Whether cloud reporting is enabled. */
  get isCloudEnabled(): boolean {
    return this.apiKey !== null;
  }

  /** Queue a usage report. Flushed periodically or on shutdown. */
  report(usage: UsageReport): void {
    if (!this.apiKey) return; // No API key = local only
    this.queue.push(usage);

    // Auto-flush when batch gets large
    if (this.queue.length >= 50) {
      this.flush();
    }
  }

  /** Flush queued reports to the cloud API. */
  async flush(): Promise<void> {
    if (!this.apiKey || this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);

    try {
      const response = await fetch(`${this.baseUrl}/api/usage/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ reports: batch }),
      });

      if (!response.ok) {
        // Re-queue failed reports for next flush
        this.queue.unshift(...batch);
        console.warn(`[baleyui-runtime] Usage report failed (${response.status}), will retry`);
      }
    } catch {
      // Re-queue on network error
      this.queue.unshift(...batch);
      console.warn('[baleyui-runtime] Usage report failed (network error), will retry');
    }
  }

  /** Clean up. Call on process exit. */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
