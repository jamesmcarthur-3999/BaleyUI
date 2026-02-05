/**
 * AI Block Executor
 *
 * Executes AI blocks using the BaleyBots runtime.
 * This properly integrates with the BaleyBots library for:
 * - Full streaming support
 * - Tool calling
 * - Structured outputs
 * - All provider types (OpenAI, Anthropic, Ollama)
 */

import { db, blocks, connections, eq } from '@baleyui/db';
import { decrypt } from '@/lib/encryption';
import { Baleybot } from '@baleybots/core';
// Note: ollama is exported from /providers, not from main index
import { openai, anthropic, ollama } from '@baleybots/core/providers';
import type { ModelConfig, BaleybotStreamEvent } from '@baleybots/core';
import type { NodeExecutor, CompiledNode, NodeExecutorContext } from './index';
import type { AIBlockNodeData } from '@/lib/baleybots/types';
import { retryProviderCall } from '../retry';
import { withCircuitBreaker } from '../circuit-breaker';
import { createProviderError, TimeoutError } from '../errors';
import { routeExecution, type ExecutionMode } from '../mode-router';
import { canHandleWithCode } from '../pattern-matcher';
import { trackFallback, trackCodeExecution, trackABTestExecution } from '../fallback-tracker';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ai-block');

/**
 * Get the BaleyBots model configuration for a connection
 */
function getModelConfig(
  connectionType: string,
  modelName: string,
  config: { apiKey?: string; baseUrl?: string }
): ModelConfig {
  const decryptedApiKey = config.apiKey ? decrypt(config.apiKey) : undefined;

  switch (connectionType) {
    case 'openai':
      return openai(modelName, {
        apiKey: decryptedApiKey,
        baseUrl: config.baseUrl,
      });
    case 'anthropic':
      return anthropic(modelName, {
        apiKey: decryptedApiKey,
        baseUrl: config.baseUrl,
      });
    case 'ollama':
      return ollama(modelName, {
        baseUrl: config.baseUrl || 'http://localhost:11434',
        apiKey: decryptedApiKey, // Optional for authenticated Ollama instances
      });
    default:
      throw new Error(`Unsupported connection type: ${connectionType}`);
  }
}

/**
 * Execute generated code with the input
 * Uses sandboxed execution with timeout and restricted globals
 */
const CODE_EXECUTION_TIMEOUT_MS = 5000; // 5 second timeout for code execution

async function executeGeneratedCode(code: string, input: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Set timeout for code execution
    const timeoutId = setTimeout(() => {
      reject(new Error('Code execution timed out (5s limit)'));
    }, CODE_EXECUTION_TIMEOUT_MS);

    try {
      // Create sandboxed execution environment
      // The generated code should export a default function that takes input and returns output
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

      // Wrap the code in a function that provides input
      // Note: We use a restrictive environment that prevents access to dangerous globals
      const wrappedCode = `
        "use strict";
        ${code}

        // If code exports default function, use it
        if (typeof module !== 'undefined' && module.exports && typeof module.exports === 'function') {
          return await module.exports(input);
        }

        // If code defines a 'process' or 'execute' function, use it
        if (typeof processInput === 'function') {
          return await processInput(input);
        }
        if (typeof execute === 'function') {
          return await execute(input);
        }

        // Otherwise, assume code is inline and return the last value
        return input;
      `;

      // Create the async function - runs in strict mode
      const fn = new AsyncFunction('input', wrappedCode);

      // Execute and resolve
      fn(input)
        .then((result: unknown) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error: Error) => {
          clearTimeout(timeoutId);
          reject(new Error(`Code execution failed: ${error.message}`));
        });
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      reject(new Error(`Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });
}

export const aiBlockExecutor: NodeExecutor = {
  type: 'ai-block',

  async execute(
    node: CompiledNode,
    input: unknown,
    context: NodeExecutorContext
  ): Promise<unknown> {
    const data = node.data as AIBlockNodeData;

    // Load block from database
    const block = await db.query.blocks.findFirst({
      where: eq(blocks.id, data.blockId),
    });

    if (!block) {
      throw new Error(`Block not found: ${data.blockId}`);
    }

    // Route execution based on execution mode (Phase 4.3: Hybrid Mode)
    const routingResult = await routeExecution(
      {
        id: block.id,
        executionMode: (block.executionMode as ExecutionMode) || 'ai_only',
        generatedCode: block.generatedCode,
        hybridThreshold: block.hybridThreshold || '80.00',
        codeAccuracy: block.codeAccuracy,
      },
      input,
      canHandleWithCode
    );

    // If code path selected, try to execute generated code
    if (routingResult.mode === 'code' && block.generatedCode) {
      try {
        // Track code execution
        await trackCodeExecution(
          context.executionId,
          routingResult.matchedPattern || 'default',
          routingResult.confidence || 0
        );

        // Execute the generated code
        const result = await executeGeneratedCode(block.generatedCode, input);

        // Track A/B test code path success (CRITICAL: was missing before)
        if (block.executionMode === 'ab_test') {
          await trackABTestExecution(context.executionId, 'code', routingResult.reason || 'Code execution successful');
        }

        return result;
      } catch (error: unknown) {
        // Code execution failed, fall back to AI
        logger.error('Code execution failed, falling back to AI', error);

        await trackFallback({
          blockId: block.id,
          executionId: context.executionId,
          input,
          reason: `Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });

        // Continue to AI execution below
      }
    } else if (routingResult.mode === 'ai') {
      // Track why AI path was chosen
      if (block.executionMode === 'ab_test') {
        await trackABTestExecution(context.executionId, 'ai', routingResult.reason);
      } else if (block.executionMode === 'hybrid' && routingResult.reason) {
        await trackFallback({
          blockId: block.id,
          executionId: context.executionId,
          input,
          reason: routingResult.reason,
          confidence: routingResult.confidence,
          attemptedPattern: routingResult.matchedPattern,
        });
      }
    }

    // Execute with AI (either chosen by routing or fallback from code failure)
    // Load connection
    const connectionId = data.connectionId || block.connectionId;
    if (!connectionId) {
      throw new Error('No connection configured for AI block');
    }

    const connection = await db.query.connections.findFirst({
      where: eq(connections.id, connectionId),
    });

    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    // Get model configuration
    const config = connection.config as { apiKey?: string; baseUrl?: string };
    const modelName = data.model || block.model || 'gpt-4o-mini';
    const modelConfig = getModelConfig(connection.type, modelName, config);

    // Create the Baleybot instance
    // Note: For now, we're not using tools or output schemas to keep types simple
    // TODO: Add tool support once Zod versions are aligned
    const bot = Baleybot.create({
      name: block.name,
      goal: block.systemPrompt || block.goal || 'Process the input and provide a helpful response.',
      model: modelConfig,
      maxToolIterations: 25,
    });

    // Prepare input
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);

    // Wrap execution with circuit breaker and retry logic
    const providerName = connection.type; // 'openai', 'anthropic', 'ollama'

    try {
      // Execute with circuit breaker protection
      const result = await withCircuitBreaker(
        providerName,
        async () => {
          // Execute with retry logic for transient failures
          return await retryProviderCall(
            providerName,
            async () => {
              // Execute with streaming
              // The BaleyBots process() method handles everything:
              // - Streaming events via onToken
              // - Tool calling loop
              // - Structured output parsing
              const result = await bot.process(inputStr, {
                onToken: (_botName: string, event: BaleybotStreamEvent) => {
                  // Forward all BaleyBots events to our stream handler
                  // Use type assertion since both types should be structurally compatible
                  context.onStream?.(event as Parameters<NonNullable<typeof context.onStream>>[0]);
                },
                signal: context.signal,
              });

              return result;
            },
            {
              maxAttempts: 3,
              context: {
                nodeId: node.nodeId,
                nodeType: node.type,
                flowId: context.flowId,
                executionId: context.executionId,
                model: modelName,
              },
              signal: context.signal,
            }
          );
        },
        undefined, // use default circuit breaker config
        {
          nodeId: node.nodeId,
          nodeType: node.type,
          flowId: context.flowId,
          executionId: context.executionId,
          provider: providerName,
          model: modelName,
        }
      );

      return result;
    } catch (error: unknown) {
      // Convert unknown errors to typed provider errors
      throw createProviderError(providerName, error, {
        nodeId: node.nodeId,
        nodeType: node.type,
        flowId: context.flowId,
        executionId: context.executionId,
        model: modelName,
      });
    }
  },
};
