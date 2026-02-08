/**
 * Internal Orchestration Loop Service
 *
 * Provides a deterministic macro-loop wrapper for multi-step internal BB workflows.
 * This layer complements Baleybots' native tool loop with app-level budgets and stop rules.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('internal-orchestration');

export type OrchestrationStopReason =
  | 'success'
  | 'no_progress'
  | 'budget_exceeded'
  | 'repeated_signature'
  | 'non_healable_blocker'
  | 'operator_abort'
  | 'error';

export interface OrchestrationPolicy {
  /** Hard cap on macro-loop cycles. */
  maxCycles: number;
  /** Wall-clock cap for the whole run. */
  maxDurationMs: number;
  /** Stop if a cycle signature repeats more than this value. */
  maxRepeatSignature?: number;
  /** Minimum improvement required to continue (0 disables this check). */
  minImprovementDelta?: number;
}

export interface OrchestrationCycle<TState, TResult> {
  index: number;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  signature?: string;
  improvement?: number;
  stateSnapshot: TState;
  result: TResult;
}

export interface OrchestrationRunResult<TState, TResult> {
  status: 'success' | 'stopped' | 'error';
  stopReason: OrchestrationStopReason;
  totalDurationMs: number;
  cycles: Array<OrchestrationCycle<TState, TResult>>;
  finalState: TState;
  error?: string;
}

export interface RunOrchestrationParams<TState, TResult> {
  kind: 'creator' | 'testing' | string;
  policy: OrchestrationPolicy;
  initialState: TState;
  runCycle: (args: {
    cycleIndex: number;
    state: TState;
    elapsedMs: number;
  }) => Promise<TResult>;
  applyCycle: (state: TState, result: TResult) => TState;
  isSuccess: (state: TState, result: TResult) => boolean;
  getCycleSignature?: (state: TState, result: TResult) => string | undefined;
  getImprovement?: (previous: TState, next: TState, result: TResult) => number;
  onCycleError?: (args: {
    cycleIndex: number;
    state: TState;
    error: unknown;
  }) => {
    nextState?: TState;
    continueLoop: boolean;
    stopReason?: OrchestrationStopReason;
  };
}

/**
 * Runs a bounded orchestration loop with deterministic stop conditions.
 */
export async function runInternalOrchestrationLoop<TState, TResult>(
  params: RunOrchestrationParams<TState, TResult>
): Promise<OrchestrationRunResult<TState, TResult>> {
  const startedAt = Date.now();
  const policy = params.policy;
  const maxRepeatSignature = policy.maxRepeatSignature ?? 2;
  const minImprovementDelta = policy.minImprovementDelta ?? 0;
  const signatureCounts = new Map<string, number>();
  const cycles: Array<OrchestrationCycle<TState, TResult>> = [];
  let state = params.initialState;

  for (let cycleIndex = 1; cycleIndex <= policy.maxCycles; cycleIndex++) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > policy.maxDurationMs) {
      return {
        status: 'stopped',
        stopReason: 'budget_exceeded',
        totalDurationMs: elapsedMs,
        cycles,
        finalState: state,
      };
    }

    const cycleStartedAt = new Date();
    try {
      const result = await params.runCycle({
        cycleIndex,
        state,
        elapsedMs,
      });

      const nextState = params.applyCycle(state, result);
      const signature = params.getCycleSignature?.(nextState, result);
      const improvement = params.getImprovement?.(state, nextState, result);
      const cycleCompletedAt = new Date();
      const cycleDurationMs = cycleCompletedAt.getTime() - cycleStartedAt.getTime();

      cycles.push({
        index: cycleIndex,
        startedAt: cycleStartedAt,
        completedAt: cycleCompletedAt,
        durationMs: cycleDurationMs,
        signature,
        improvement,
        stateSnapshot: nextState,
        result,
      });

      state = nextState;

      if (params.isSuccess(state, result)) {
        return {
          status: 'success',
          stopReason: 'success',
          totalDurationMs: Date.now() - startedAt,
          cycles,
          finalState: state,
        };
      }

      if (signature) {
        const count = (signatureCounts.get(signature) ?? 0) + 1;
        signatureCounts.set(signature, count);
        if (count > maxRepeatSignature) {
          return {
            status: 'stopped',
            stopReason: 'repeated_signature',
            totalDurationMs: Date.now() - startedAt,
            cycles,
            finalState: state,
          };
        }
      }

      if (
        minImprovementDelta > 0 &&
        cycleIndex > 1 &&
        typeof improvement === 'number' &&
        improvement < minImprovementDelta
      ) {
        return {
          status: 'stopped',
          stopReason: 'no_progress',
          totalDurationMs: Date.now() - startedAt,
          cycles,
          finalState: state,
        };
      }
    } catch (error) {
      if (!params.onCycleError) {
        return {
          status: 'error',
          stopReason: 'error',
          totalDurationMs: Date.now() - startedAt,
          cycles,
          finalState: state,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const handled = params.onCycleError({
        cycleIndex,
        state,
        error,
      });

      if (handled.nextState) {
        state = handled.nextState;
      }

      if (!handled.continueLoop) {
        return {
          status: 'stopped',
          stopReason: handled.stopReason ?? 'non_healable_blocker',
          totalDurationMs: Date.now() - startedAt,
          cycles,
          finalState: state,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      log.warn('Orchestration cycle error; continuing', {
        kind: params.kind,
        cycleIndex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: 'stopped',
    stopReason: 'budget_exceeded',
    totalDurationMs: Date.now() - startedAt,
    cycles,
    finalState: state,
  };
}

