/**
 * BAL Executor
 *
 * Executes BAL (Baleybots Assembly Language) code using @baleybots/tools.
 * Provides streaming execution with progress events.
 */

import {
  compileBAL,
  webSearchTool,
  sequentialThinkTool,
  type BALConfig,
  type PipelineStructure,
} from '@baleybots/tools';
import type {
  BaleybotStreamEvent,
  ToolDefinition,
  ZodToolDefinition,
  ProviderConfig,
  ModelConfig,
  ProcessOptions,
} from '@baleybots/core';

// ============================================================================
// TYPES
// ============================================================================

export interface BALExecutionOptions {
  /** Model to use for execution (default: gpt-4o-mini) */
  model?: string | ModelConfig;

  /** API key for the model provider */
  apiKey?: string;

  /** Provider configuration (API keys, base URLs, etc.) */
  providerConfig?: ProviderConfig;

  /** Input to execute (used when BAL code does not specify run(...)) */
  input?: unknown;

  /** Enable web search tool */
  enableWebSearch?: boolean;

  /** Tavily API key for web search (required if enableWebSearch is true) */
  tavilyApiKey?: string;

  /** Enable sequential thinking tool */
  enableSequentialThinking?: boolean;

  /** Additional tools available to BAL entities */
  availableTools?: Record<string, ZodToolDefinition | ToolDefinition>;

  /** Tool approval callback (passed to baleybots core) */
  onToolCallApproval?: ProcessOptions['onToolCallApproval'];

  /** Maximum execution time in milliseconds (default: 60000) */
  timeout?: number;

  /** Callback for streaming events */
  onEvent?: (event: BALExecutionEvent) => void;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export type BALExecutionEvent =
  | { type: 'parsing'; message: string }
  | { type: 'compiled'; entities: string[]; structure: PipelineStructure | null }
  | { type: 'started'; input: unknown }
  | { type: 'token'; botName: string; event: BaleybotStreamEvent }
  | { type: 'progress'; botName: string; message: string }
  | { type: 'completed'; result: unknown }
  | { type: 'error'; error: string }
  | { type: 'cancelled' };

export interface BALExecutionResult {
  status: 'success' | 'error' | 'cancelled' | 'timeout';
  result?: unknown;
  error?: string;
  entities?: string[];
  structure?: PipelineStructure | null;
  duration?: number;
}

export interface BALCompileResult {
  entities: string[];
  structure: PipelineStructure | null;
  runInput: string | null;
  errors?: string[];
}

// ============================================================================
// BUILT-IN TOOLS
// ============================================================================

function getAvailableTools(options: BALExecutionOptions): Record<string, ZodToolDefinition | ToolDefinition> {
  const tools: Record<string, ZodToolDefinition | ToolDefinition> = {
    ...(options.availableTools ?? {}),
  };

  // Web search tool (requires Tavily API key)
  if (options.enableWebSearch && options.tavilyApiKey) {
    tools.web_search = webSearchTool({ apiKey: options.tavilyApiKey }) as ZodToolDefinition;
  }

  // Sequential thinking tool
  if (options.enableSequentialThinking) {
    tools.sequential_think = sequentialThinkTool as ZodToolDefinition;
  }

  return tools;
}

function resolveProviderConfig(options: BALExecutionOptions): ProviderConfig | undefined {
  if (options.providerConfig) return options.providerConfig;
  if (options.apiKey) return { apiKey: options.apiKey };
  return undefined;
}

function buildBalConfig(options: BALExecutionOptions): BALConfig {
  return {
    model: options.model ?? 'gpt-4o-mini',
    providerConfig: resolveProviderConfig(options),
    availableTools: getAvailableTools(options),
  };
}

// ============================================================================
// COMPILE
// ============================================================================

/**
 * Compile BAL code without executing it.
 * Useful for validation and getting pipeline structure.
 */
export function compileBALCode(code: string, options: BALExecutionOptions = {}): BALCompileResult {
  try {
    const config = buildBalConfig(options);
    const { entityNames, pipelineStructure, runInput } = compileBAL(code, config);

    return {
      entities: entityNames,
      structure: pipelineStructure,
      runInput,
    };
  } catch (error) {
    return {
      entities: [],
      structure: null,
      runInput: null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// ============================================================================
// EXECUTE
// ============================================================================

/**
 * Execute BAL code with streaming events.
 */
export async function executeBALCode(
  code: string,
  options: BALExecutionOptions = {}
): Promise<BALExecutionResult> {
  const startTime = Date.now();
  const { onEvent, signal, timeout = 60000 } = options;

  // If a streaming callback is provided, stream events and return the final result
  if (onEvent) {
    const iterator = streamBALExecution(code, options);
    while (true) {
      const { value, done } = await iterator.next();
      if (done) {
        return value ?? {
          status: 'error',
          error: 'BAL execution ended without a result',
          duration: Date.now() - startTime,
        };
      }
      onEvent(value);
    }
  }

  // Set up timeout
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutController = new AbortController();

  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      timeoutController.abort();
      onEvent?.({ type: 'error', error: `Execution timed out after ${timeout}ms` });
    }, timeout);
  }

  // Combine abort signals
  const combinedAbort = signal
    ? new AbortController()
    : timeoutController;

  if (signal) {
    signal.addEventListener('abort', () => {
      combinedAbort.abort();
      onEvent?.({ type: 'cancelled' });
    });
    timeoutController.signal.addEventListener('abort', () => {
      combinedAbort.abort();
    });
  }

  try {
    // Emit parsing event
    onEvent?.({ type: 'parsing', message: 'Parsing BAL code...' });

    // Compile first to get structure
    const compiled = compileBALCode(code, options);

    if (compiled.errors && compiled.errors.length > 0) {
      const error = compiled.errors.join('; ');
      onEvent?.({ type: 'error', error });
      return {
        status: 'error',
        error,
        duration: Date.now() - startTime,
      };
    }

    // Emit compiled event
    onEvent?.({
      type: 'compiled',
      entities: compiled.entities,
      structure: compiled.structure,
    });

    // Check if there's nothing to execute
    if (!compiled.structure) {
      return {
        status: 'success',
        result: { message: 'No pipeline to execute', entities: compiled.entities },
        entities: compiled.entities,
        structure: compiled.structure,
        duration: Date.now() - startTime,
      };
    }

    // Check for cancellation
    if (combinedAbort.signal.aborted) {
      return {
        status: 'cancelled',
        entities: compiled.entities,
        structure: compiled.structure,
        duration: Date.now() - startTime,
      };
    }

    // Build config with API key
    const config = buildBalConfig(options);

    // Emit started event
    onEvent?.({ type: 'started', input: compiled.runInput });

    const { executable, runInput } = compileBAL(code, config);
    if (!executable) {
      return {
        status: 'success',
        result: { message: 'No pipeline to execute', entities: compiled.entities },
        entities: compiled.entities,
        structure: compiled.structure,
        duration: Date.now() - startTime,
      };
    }
    const effectiveInput =
      options.input ?? runInput ?? 'Execute your task based on your goal.';
    const output = await executable.process(effectiveInput, {
      signal: combinedAbort.signal,
      onToolCallApproval: options.onToolCallApproval,
    });
    const result = { status: 'executed', result: output };

    // Clear timeout
    if (timeoutId) clearTimeout(timeoutId);

    // Emit completed event
    onEvent?.({ type: 'completed', result: result.result });

    return {
      status: 'success',
      result: result.result,
      entities: compiled.entities,
      structure: compiled.structure,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    // Clear timeout
    if (timeoutId) clearTimeout(timeoutId);

    // Check if this was a cancellation
    if (combinedAbort.signal.aborted) {
      if (timeoutController.signal.aborted) {
        return {
          status: 'timeout',
          error: `Execution timed out after ${timeout}ms`,
          duration: Date.now() - startTime,
        };
      }
      return {
        status: 'cancelled',
        duration: Date.now() - startTime,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    onEvent?.({ type: 'error', error: errorMessage });

    return {
      status: 'error',
      error: errorMessage,
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// STREAMING EXECUTION
// ============================================================================

/**
 * Execute BAL code and yield streaming events.
 * Use this for real-time progress updates.
 */
export async function* streamBALExecution(
  code: string,
  options: BALExecutionOptions = {}
): AsyncGenerator<BALExecutionEvent, BALExecutionResult, undefined> {
  const startTime = Date.now();
  const { signal, timeout = 60000 } = options;

  // Set up timeout + combined abort signal
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutController = new AbortController();

  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeout);
  }

  const combinedAbort = signal
    ? new AbortController()
    : timeoutController;

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        combinedAbort.abort();
      },
      { once: true }
    );
    timeoutController.signal.addEventListener('abort', () => {
      combinedAbort.abort();
    });
  }

  try {
    yield { type: 'parsing', message: 'Parsing BAL code...' };

    // Compile first
    const config = buildBalConfig(options);
    const { entities, structure, runInput, errors } = compileBALCode(code, options);

    if (errors && errors.length > 0) {
      const error = errors.join('; ');
      yield { type: 'error', error };
      return {
        status: 'error',
        error,
        duration: Date.now() - startTime,
      };
    }

    yield {
      type: 'compiled',
      entities,
      structure,
    };

    if (!structure) {
      yield { type: 'completed', result: { message: 'No pipeline to execute' } };
      return {
        status: 'success',
        result: { message: 'No pipeline to execute', entities },
        entities,
        structure,
        duration: Date.now() - startTime,
      };
    }

    // Check cancellation/timeout
    if (combinedAbort.signal.aborted || timedOut) {
      yield {
        type: timedOut ? 'error' : 'cancelled',
        ...(timedOut ? { error: 'Timeout' } : {}),
      } as BALExecutionEvent;
      return {
        status: timedOut ? 'timeout' : 'cancelled',
        duration: Date.now() - startTime,
      };
    }

    yield { type: 'started', input: runInput };

    // Compile to executable for streaming
    const { executable } = compileBAL(code, config);
    if (!executable) {
      yield { type: 'completed', result: { message: 'No pipeline to execute' } };
      return {
        status: 'success',
        result: { message: 'No pipeline to execute', entities },
        entities,
        structure,
        duration: Date.now() - startTime,
      };
    }

    // Event queue for async streaming
    const eventQueue: BALExecutionEvent[] = [];
    let processingComplete = false;
    let finalResult: unknown = null;
    let processingError: Error | null = null;

    let eventResolver: (() => void) | null = null;
    let eventPromise: Promise<void> = new Promise<void>((resolve) => {
      eventResolver = resolve;
    });

    const notifyEvent = () => {
      if (eventResolver) {
        eventResolver();
        eventPromise = new Promise<void>((resolve) => {
          eventResolver = resolve;
        });
      }
    };

    const subscription = executable.subscribeToAll?.({
      onStreamEvent: (_botId, botName, event) => {
        eventQueue.push({ type: 'token', botName, event });
        notifyEvent();
      },
      onProgressUpdate: (_botId, botName, event) => {
        eventQueue.push({ type: 'token', botName, event });
        notifyEvent();
      },
      onError: (_botId, botName, event) => {
        eventQueue.push({ type: 'token', botName, event });
        notifyEvent();
      },
    });

    const effectiveInput =
      options.input ?? runInput ?? 'Execute your task based on your goal.';

    const processPromise = executable
      .process(effectiveInput, {
        signal: combinedAbort.signal,
        onToolCallApproval: options.onToolCallApproval,
      })
      .then((result) => {
        finalResult = result;
        processingComplete = true;
        notifyEvent();
      })
      .catch((error) => {
        processingError = error instanceof Error ? error : new Error(String(error));
        processingComplete = true;
        notifyEvent();
      });

    while (!processingComplete || eventQueue.length > 0) {
      if (combinedAbort.signal.aborted) {
        processingComplete = true;
        break;
      }

      while (eventQueue.length > 0) {
        const next = eventQueue.shift()!;
        yield next;
      }

      if (processingComplete || eventQueue.length > 0) {
        continue;
      }

      await eventPromise;
    }

    subscription?.unsubscribe();
    await processPromise;

    if (timeoutId) clearTimeout(timeoutId);

    if (processingError) {
      throw processingError;
    }

    if (combinedAbort.signal.aborted) {
      yield { type: timedOut ? 'error' : 'cancelled', ...(timedOut ? { error: 'Timeout' } : {}) } as BALExecutionEvent;
      return {
        status: timedOut ? 'timeout' : 'cancelled',
        duration: Date.now() - startTime,
      };
    }

    yield { type: 'completed', result: finalResult };

    return {
      status: 'success',
      result: finalResult,
      entities,
      structure,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    if (timedOut) {
      yield { type: 'error', error: 'Execution timed out' };
      return {
        status: 'timeout',
        error: 'Execution timed out',
        duration: Date.now() - startTime,
      };
    }

    if (combinedAbort.signal.aborted) {
      yield { type: 'cancelled' };
      return {
        status: 'cancelled',
        duration: Date.now() - startTime,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    yield { type: 'error', error: errorMessage };

    return {
      status: 'error',
      error: errorMessage,
      duration: Date.now() - startTime,
    };
  }
}
