/**
 * BaleyUI SDK Client
 */

import type {
  BaleyUIOptions,
  FlowDetail,
  Execution,
  ExecutionEvent,
  ExecuteOptions,
  ExecuteResult,
  ExecutionHandle,
  ListFlowsResult,
  ListBlocksResult,
} from './types';

import {
  BaleyUIError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ConnectionError,
  TimeoutError,
} from './errors';

const DEFAULT_BASE_URL = 'https://app.baleyui.com';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_WAIT_TIMEOUT = 300000; // 5 minutes

/**
 * BaleyUI SDK Client
 *
 * @example
 * ```typescript
 * import { BaleyUI } from '@baleyui/sdk';
 *
 * const client = new BaleyUI({
 *   apiKey: process.env.BALEYUI_API_KEY!,
 * });
 *
 * // List all flows
 * const { flows } = await client.flows.list();
 *
 * // Execute a flow
 * const execution = await client.flows.execute('flow-id', {
 *   input: { message: 'Hello!' },
 * });
 *
 * // Wait for completion
 * const result = await execution.waitForCompletion();
 * console.log(result.output);
 * ```
 */
export class BaleyUI {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  /** @internal Reserved for future retry logic implementation */
  readonly maxRetries: number;

  /**
   * Flows API
   */
  public readonly flows: FlowsAPI;

  /**
   * Blocks API
   */
  public readonly blocks: BlocksAPI;

  /**
   * Executions API
   */
  public readonly executions: ExecutionsAPI;

  constructor(options: BaleyUIOptions) {
    if (!options.apiKey) {
      throw new AuthenticationError('API key is required');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;

    this.flows = new FlowsAPI(this);
    this.blocks = new BlocksAPI(this);
    this.executions = new ExecutionsAPI(this);
  }

  /**
   * Make an authenticated request to the API.
   * @internal
   */
  async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': '@baleyui/sdk',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof BaleyUIError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new TimeoutError(this.timeout);
        }
        throw new ConnectionError(error.message);
      }

      throw new BaleyUIError('Unknown error occurred');
    }
  }

  /**
   * Handle error responses from the API.
   * @internal
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: { error?: string; details?: string } = {};

    try {
      errorData = await response.json();
    } catch {
      // Ignore JSON parsing errors
    }

    const message = errorData.error || response.statusText;

    switch (response.status) {
      case 401:
        throw new AuthenticationError(message);
      case 403:
        throw new PermissionError(message);
      case 404:
        throw new NotFoundError('Resource', 'unknown');
      case 400:
        throw new ValidationError(message, errorData.details);
      case 429: {
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
      }
      default:
        throw new BaleyUIError(message, response.status, 'api_error', errorData.details);
    }
  }

  /**
   * Create an execution handle for monitoring and streaming.
   * @internal
   */
  createExecutionHandle(executionId: string): ExecutionHandle {
    return {
      id: executionId,
      getStatus: () => this.executions.get(executionId),
      waitForCompletion: (timeout?: number) =>
        this.executions.waitForCompletion(executionId, timeout),
      stream: () => this.executions.stream(executionId),
    };
  }
}

/**
 * Flows API
 */
class FlowsAPI {
  constructor(private readonly client: BaleyUI) {}

  /**
   * List all flows in the workspace.
   */
  async list(): Promise<ListFlowsResult> {
    return this.client.request<ListFlowsResult>('/flows');
  }

  /**
   * Get a specific flow by ID.
   */
  async get(id: string): Promise<FlowDetail> {
    const result = await this.client.request<{ flow: FlowDetail }>(`/flows/${id}`);
    return result.flow;
  }

  /**
   * Execute a flow.
   *
   * @param id Flow ID
   * @param options Execution options
   * @returns An execution handle for monitoring progress
   *
   * @example
   * ```typescript
   * const execution = await client.flows.execute('flow-id', {
   *   input: { message: 'Hello!' },
   * });
   *
   * // Option 1: Wait for completion
   * const result = await execution.waitForCompletion();
   *
   * // Option 2: Stream events
   * for await (const event of execution.stream()) {
   *   console.log(event.type, event.data);
   * }
   * ```
   */
  async execute(id: string, options: ExecuteOptions = {}): Promise<ExecutionHandle> {
    const result = await this.client.request<ExecuteResult>(`/flows/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input: options.input || {} }),
    });

    const handle = this.client.createExecutionHandle(result.executionId);

    if (options.wait) {
      await handle.waitForCompletion(options.waitTimeout);
    }

    return handle;
  }
}

/**
 * Blocks API
 */
class BlocksAPI {
  constructor(private readonly client: BaleyUI) {}

  /**
   * List all blocks in the workspace.
   */
  async list(): Promise<ListBlocksResult> {
    return this.client.request<ListBlocksResult>('/blocks');
  }

  /**
   * Run a single block.
   *
   * @param id Block ID
   * @param options Execution options
   * @returns An execution handle for monitoring progress
   */
  async run(id: string, options: ExecuteOptions = {}): Promise<ExecutionHandle> {
    const result = await this.client.request<ExecuteResult>(`/blocks/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ input: options.input || {} }),
    });

    const handle = this.client.createExecutionHandle(result.executionId);

    if (options.wait) {
      await handle.waitForCompletion(options.waitTimeout);
    }

    return handle;
  }
}

/**
 * Executions API
 */
class ExecutionsAPI {
  constructor(private readonly client: BaleyUI) {}

  /**
   * Get the status of an execution.
   */
  async get(id: string): Promise<Execution> {
    const result = await this.client.request<{ execution: Execution }>(`/executions/${id}`);
    return result.execution;
  }

  /**
   * Wait for an execution to complete.
   *
   * @param id Execution ID
   * @param timeout Timeout in milliseconds (default: 5 minutes)
   */
  async waitForCompletion(id: string, timeout = DEFAULT_WAIT_TIMEOUT): Promise<Execution> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeout) {
      const execution = await this.get(id);

      if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
        return execution;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new TimeoutError(timeout);
  }

  /**
   * Stream execution events in real-time.
   *
   * @param id Execution ID
   * @param fromIndex Start streaming from this event index (for reconnection)
   */
  async *stream(id: string, fromIndex = 0): AsyncGenerator<ExecutionEvent, void, unknown> {
    const url = `${(this.client as unknown as { baseUrl: string }).baseUrl}/api/v1/executions/${id}/stream?fromIndex=${fromIndex}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${(this.client as unknown as { apiKey: string }).apiKey}`,
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok) {
      throw new BaleyUIError(`Failed to stream execution: ${response.statusText}`, response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new BaleyUIError('Failed to get response reader');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const event = JSON.parse(data) as ExecutionEvent;
              yield event;

              // Stop if execution is complete
              if (['execution_complete', 'execution_error'].includes(event.type)) {
                return;
              }
            } catch {
              // Ignore JSON parsing errors for malformed events
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
