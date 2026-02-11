/**
 * Billing types — plan definitions and quota limits.
 *
 * Design principle: No billing logic leaks into the rest of the app.
 * The executor doesn't know about plans. Only the billing service
 * and analytics router import these types.
 */

export interface PlanLimits {
  /** Max BB executions per calendar month. null = unlimited. */
  maxExecutionsPerMonth: number | null;
  /** Max tokens (input + output) per calendar month. null = unlimited. */
  maxTokensPerMonth: number | null;
  /** Max number of BaleyBots the workspace can create. null = unlimited. */
  maxBaleybots: number | null;
  /** Max concurrent executions at any time. */
  maxConcurrentExecutions: number;
  /** Feature flags gated by plan. */
  features: {
    websocket: boolean;
    localRuntime: boolean;
    webhookTriggers: boolean;
    scheduledTasks: boolean;
    analytics: boolean;
  };
}

export interface BillingSummary {
  planId: string;
  planName: string;
  limits: PlanLimits;
  usage: {
    executionsThisMonth: number;
    tokensThisMonth: number;
    baleybotCount: number;
  };
  subscription: {
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null;
}

export class QuotaExceededError extends Error {
  constructor(public reason: string) {
    super(`Quota exceeded: ${reason}`);
    this.name = 'QuotaExceededError';
  }
}
