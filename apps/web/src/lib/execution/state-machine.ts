/**
 * Execution State Machine
 *
 * Manages execution state transitions with database persistence.
 */

import { db, flowExecutions, eq } from '@baleyui/db';
import type { FlowExecutionStatus, ExecutionMetrics } from './types';

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<FlowExecutionStatus, FlowExecutionStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

/**
 * Terminal states that cannot transition further
 */
const TERMINAL_STATES: FlowExecutionStatus[] = ['completed', 'failed', 'cancelled'];

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: FlowExecutionStatus,
    public readonly to: FlowExecutionStatus,
    public readonly executionId: string
  ) {
    super(`Invalid state transition: ${from} -> ${to} for execution ${executionId}`);
    this.name = 'InvalidTransitionError';
  }
}

interface TransitionData {
  output?: unknown;
  error?: string;
  metrics?: ExecutionMetrics;
}

export class ExecutionStateMachine {
  private currentStatus: FlowExecutionStatus = 'pending';
  private metrics: ExecutionMetrics = {
    totalDurationMs: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    nodeCount: 0,
    completedNodes: 0,
    failedNodes: 0,
  };
  private startedAt: Date | null = null;

  constructor(private readonly executionId: string) {}

  /**
   * Get the current status
   */
  get status(): FlowExecutionStatus {
    return this.currentStatus;
  }

  /**
   * Check if the execution is in a terminal state
   */
  get isTerminal(): boolean {
    return TERMINAL_STATES.includes(this.currentStatus);
  }

  /**
   * Check if a transition is valid
   */
  canTransition(to: FlowExecutionStatus): boolean {
    return VALID_TRANSITIONS[this.currentStatus].includes(to);
  }

  /**
   * Transition to a new state
   */
  async transition(
    to: FlowExecutionStatus,
    data?: TransitionData
  ): Promise<void> {
    if (!this.canTransition(to)) {
      throw new InvalidTransitionError(this.currentStatus, to, this.executionId);
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: to,
    };

    // Handle state-specific updates
    if (to === 'running' && !this.startedAt) {
      this.startedAt = now;
      updateData.startedAt = now;
    }

    if (TERMINAL_STATES.includes(to)) {
      updateData.completedAt = now;

      if (this.startedAt) {
        this.metrics.totalDurationMs = now.getTime() - this.startedAt.getTime();
      }

      if (data?.metrics) {
        this.metrics = { ...this.metrics, ...data.metrics };
      }
    }

    if (data?.output !== undefined) {
      updateData.output = data.output;
    }

    if (data?.error !== undefined) {
      updateData.error = { message: data.error };
    }

    // Persist to database
    await db
      .update(flowExecutions)
      .set(updateData)
      .where(eq(flowExecutions.id, this.executionId));

    this.currentStatus = to;
  }

  /**
   * Update metrics without changing state
   */
  updateMetrics(updates: Partial<ExecutionMetrics>): void {
    this.metrics = { ...this.metrics, ...updates };
  }

  /**
   * Increment completed nodes counter
   */
  incrementCompletedNodes(): void {
    this.metrics.completedNodes++;
  }

  /**
   * Increment failed nodes counter
   */
  incrementFailedNodes(): void {
    this.metrics.failedNodes++;
  }

  /**
   * Add token usage
   */
  addTokenUsage(input: number, output: number): void {
    this.metrics.totalTokensInput += input;
    this.metrics.totalTokensOutput += output;
  }

  /**
   * Set total node count
   */
  setNodeCount(count: number): void {
    this.metrics.nodeCount = count;
  }

  /**
   * Get current metrics
   */
  getMetrics(): ExecutionMetrics {
    return { ...this.metrics };
  }

  /**
   * Initialize from database state (for recovery)
   */
  static async fromDatabase(executionId: string): Promise<ExecutionStateMachine | null> {
    const execution = await db.query.flowExecutions.findFirst({
      where: eq(flowExecutions.id, executionId),
    });

    if (!execution) {
      return null;
    }

    const machine = new ExecutionStateMachine(executionId);
    machine.currentStatus = execution.status as FlowExecutionStatus;
    machine.startedAt = execution.startedAt;

    return machine;
  }
}
