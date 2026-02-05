/**
 * BAL Executor
 *
 * Executes BAL (Baleybots Assembly Language) code using @baleybots/tools.
 * Provides streaming execution with progress events.
 */

import {
  executeBAL,
  compileBAL,
  webSearchTool,
  sequentialThinkTool,
  type BALConfig,
  type PipelineStructure,
} from '@baleybots/tools';
import type { BaleybotStreamEvent, ToolDefinition, ZodToolDefinition } from '@baleybots/core';

// ============================================================================
// TYPES
// ============================================================================

export interface BALExecutionOptions {
  /** Model to use for execution (default: gpt-4o-mini) */
  model?: string;

  /** API key for the model provider (shorthand - prefer providerConfig) */
  apiKey?: string;

  /**
   * Full provider configuration including API key, base URL, headers.
   * Takes precedence over apiKey when both are provided.
   */
  providerConfig?: {
    apiKey?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
  };

  /**
   * Runtime input to pass to the BAL execution.
   * This overrides any `run("...")` statement in the BAL code.
   * Essential for executing BaleyBots where the input comes from the caller.
   */
  input?: string;

  /** Enable web search tool */
  enableWebSearch?: boolean;

  /** Tavily API key for web search (required if enableWebSearch is true) */
  tavilyApiKey?: string;

  /** Enable sequential thinking tool */
  enableSequentialThinking?: boolean;

  /** Maximum execution time in milliseconds (default: 60000) */
  timeout?: number;

  /** Callback for streaming events */
  onEvent?: (event: BALExecutionEvent) => void;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /**
   * Custom tools to make available during execution.
   * These are merged with built-in tools (web_search, sequential_think).
   * Each tool must have: name, description, inputSchema (JSON Schema), function.
   */
  availableTools?: Record<string, {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    function: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
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
  errorContext?: {
    phase: 'parsing' | 'compilation' | 'execution';
    entityName?: string;
    stepIndex?: number;
  };
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
  const tools: Record<string, ZodToolDefinition | ToolDefinition> = {};

  // Web search tool (requires Tavily API key)
  if (options.enableWebSearch && options.tavilyApiKey) {
    tools.web_search = webSearchTool({ apiKey: options.tavilyApiKey }) as ZodToolDefinition;
  }

  // Sequential thinking tool
  if (options.enableSequentialThinking) {
    tools.sequential_think = sequentialThinkTool as ZodToolDefinition;
  }

  // Merge custom tools from options
  // Custom tools have: name, description, inputSchema, function
  if (options.availableTools) {
    for (const [toolName, tool] of Object.entries(options.availableTools)) {
      // Convert to ToolDefinition format expected by @baleybots/tools
      tools[toolName] = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        function: tool.function,
      } as ToolDefinition;
    }
  }

  return tools;
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
    const config: BALConfig = {
      model: options.model || 'gpt-4o-mini',
      availableTools: getAvailableTools(options),
    };

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

  // Set up unified abort handling
  const abortController = new AbortController();
  let abortReason: 'timeout' | 'cancelled' | null = null;

  // Handle timeout
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      if (!abortReason) {
        abortReason = 'timeout';
        abortController.abort();
        onEvent?.({ type: 'error', error: `Execution timed out after ${timeout}ms` });
      }
    }, timeout);
  }

  // Handle user cancellation
  if (signal) {
    const handleAbort = () => {
      if (!abortReason) {
        abortReason = 'cancelled';
        abortController.abort();
        onEvent?.({ type: 'cancelled' });
      }
    };

    if (signal.aborted) {
      handleAbort();
    } else {
      signal.addEventListener('abort', handleAbort, { once: true });
    }
  }

  // Cleanup function
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };

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
        errorContext: { phase: 'compilation' },
        duration: Date.now() - startTime,
      };
    }

    // Emit compiled event
    onEvent?.({
      type: 'compiled',
      entities: compiled.entities,
      structure: compiled.structure,
    });

    // Note: Even if compiled.structure is null, executeBAL now handles
    // single-entity BAL by auto-executing that entity. We no longer return
    // early here - let executeBAL handle the execution logic.

    // Check for cancellation
    if (abortController.signal.aborted) {
      cleanup();
      return {
        status: abortReason === 'timeout' ? 'timeout' : 'cancelled',
        error: abortReason === 'timeout' ? `Execution timed out after ${timeout}ms` : undefined,
        entities: compiled.entities,
        structure: compiled.structure,
        duration: Date.now() - startTime,
      };
    }

    // Build config with provider configuration and input
    // Prefer providerConfig over apiKey when both are provided
    const resolvedProviderConfig = options.providerConfig
      ?? (options.apiKey ? { apiKey: options.apiKey } : undefined);

    const config: BALConfig = {
      model: options.model || 'gpt-4o-mini',
      providerConfig: resolvedProviderConfig,
      availableTools: getAvailableTools(options),
      input: options.input, // Forward runtime input to executeBAL
    };

    // Emit started event (show runtime input if provided, else runInput from BAL code)
    onEvent?.({ type: 'started', input: options.input || compiled.runInput });

    // Execute
    const result = await executeBAL(code, config);

    // Cleanup
    cleanup();

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
    // Cleanup
    cleanup();

    // Check if this was an abort (use abortReason to determine the correct status)
    if (abortController.signal.aborted && abortReason) {
      if (abortReason === 'timeout') {
        return {
          status: 'timeout',
          error: `Execution timed out after ${timeout}ms`,
          errorContext: { phase: 'execution' },
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
      errorContext: { phase: 'execution' },
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

  // Set up timeout
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
    }, timeout);
  }

  try {
    yield { type: 'parsing', message: 'Parsing BAL code...' };

    // Compile first
    const compiled = compileBALCode(code, options);

    if (compiled.errors && compiled.errors.length > 0) {
      const error = compiled.errors.join('; ');
      yield { type: 'error', error };
      return {
        status: 'error',
        error,
        errorContext: { phase: 'compilation' },
        duration: Date.now() - startTime,
      };
    }

    yield {
      type: 'compiled',
      entities: compiled.entities,
      structure: compiled.structure,
    };

    // Note: Even if compiled.structure is null, executeBAL now handles
    // single-entity BAL by auto-executing that entity. We no longer return
    // early here - let executeBAL handle the execution logic.

    // Check cancellation/timeout
    if (signal?.aborted || timedOut) {
      yield { type: timedOut ? 'error' : 'cancelled', ...(timedOut ? { error: 'Timeout' } : {}) } as BALExecutionEvent;
      return {
        status: timedOut ? 'timeout' : 'cancelled',
        duration: Date.now() - startTime,
      };
    }

    // Emit started event (show runtime input if provided, else runInput from BAL code)
    yield { type: 'started', input: options.input || compiled.runInput };

    // Execute with forwarded input
    // Prefer providerConfig over apiKey when both are provided
    const resolvedProviderConfig = options.providerConfig
      ?? (options.apiKey ? { apiKey: options.apiKey } : undefined);

    const config: BALConfig = {
      model: options.model || 'gpt-4o-mini',
      providerConfig: resolvedProviderConfig,
      availableTools: getAvailableTools(options),
      input: options.input, // Forward runtime input to executeBAL
    };

    const result = await executeBAL(code, config);

    if (timeoutId) clearTimeout(timeoutId);

    yield { type: 'completed', result: result.result };

    return {
      status: 'success',
      result: result.result,
      entities: compiled.entities,
      structure: compiled.structure,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    if (timedOut) {
      yield { type: 'error', error: 'Execution timed out' };
      return {
        status: 'timeout',
        error: 'Execution timed out',
        errorContext: { phase: 'execution' },
        duration: Date.now() - startTime,
      };
    }

    if (signal?.aborted) {
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
      errorContext: { phase: 'execution' },
      duration: Date.now() - startTime,
    };
  }
}
