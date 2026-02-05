/**
 * REST API v1: Run Block
 *
 * POST /api/v1/blocks/[id]/run - Execute a single block with input data
 *
 * This endpoint executes a standalone block (not part of a flow).
 * For AI blocks, it uses the BaleyBots execution engine.
 * For function blocks, it executes the JavaScript code in a sandbox.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  blocks,
  blockExecutions,
  executionEvents,
  connections,
  eq,
  and,
  notDeleted,
} from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';
import { createLogger } from '@/lib/logger';
import { apiErrors, createErrorResponse } from '@/lib/api/error-response';
import { Baleybot } from '@baleybots/core';
import { openai, anthropic, ollama } from '@baleybots/core/providers';
import type { ModelConfig, BaleybotStreamEvent } from '@baleybots/core';
import { decrypt } from '@/lib/encryption';

const log = createLogger('v1-blocks-run');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        apiKey: decryptedApiKey,
      });
    default:
      throw new Error(`Unsupported connection type: ${connectionType}`);
  }
}

// Try to load isolated-vm dynamically
let ivm: typeof import('isolated-vm') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ivm = require('isolated-vm');
} catch {
  // isolated-vm not available
}

const ISOLATE_MEMORY_LIMIT = 128;
const EXECUTION_TIMEOUT_MS = 5000;

/**
 * Execute a function block's JavaScript code in a sandboxed V8 isolate
 */
async function executeFunctionBlock(
  code: string,
  input: unknown
): Promise<unknown> {
  if (!ivm) {
    throw new Error(
      'Function block execution unavailable: isolated-vm is not installed'
    );
  }

  const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_LIMIT });

  try {
    const context = await isolate.createContext();
    const jail = context.global;

    await jail.set('global', jail.derefInto());
    await jail.set('__input__', new ivm.ExternalCopy(input).copyInto());

    const wrappedCode = `
      "use strict";
      const input = __input__;
      ${code}

      if (typeof module !== 'undefined' && module.exports && typeof module.exports === 'function') {
        module.exports(input);
      } else if (typeof processInput === 'function') {
        processInput(input);
      } else if (typeof execute === 'function') {
        execute(input);
      } else {
        input;
      }
    `;

    const script = await isolate.compileScript(wrappedCode);
    const result = await script.run(context, { timeout: EXECUTION_TIMEOUT_MS });
    return result;
  } finally {
    isolate.dispose();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let executionId: string | null = null;
  let eventIndex = 0;
  const requestId = request.headers.get('x-request-id') ?? undefined;

  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const validation = await validateApiKey(authHeader);

    // Check execute permission
    if (!hasPermission(validation, 'execute')) {
      return apiErrors.forbidden('Insufficient permissions. Required: execute or admin');
    }

    // Get block ID from params
    const { id: blockId } = await params;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const input = body.input ?? {};

    // Verify block exists and belongs to workspace
    const block = await db.query.blocks.findFirst({
      where: and(
        eq(blocks.id, blockId),
        eq(blocks.workspaceId, validation.workspaceId),
        notDeleted(blocks)
      ),
    });

    if (!block) {
      return apiErrors.notFound('Block');
    }

    // Create a new block execution record
    const [execution] = await db
      .insert(blockExecutions)
      .values({
        blockId,
        flowExecutionId: null, // Standalone block execution
        status: 'pending',
        input: input || null,
        model: block.model,
        startedAt: new Date(),
      })
      .returning();

    if (!execution) {
      return createErrorResponse(500, null, { message: 'Failed to create execution', requestId });
    }

    executionId = execution.id;

    // Update status to running
    await db
      .update(blockExecutions)
      .set({ status: 'running' })
      .where(eq(blockExecutions.id, executionId));

    // Helper to store execution events
    const storeEvent = async (eventType: string, eventData: unknown) => {
      await db.insert(executionEvents).values({
        executionId: executionId!,
        eventType,
        eventData: eventData as Record<string, unknown>,
        index: eventIndex++,
      });
    };

    let result: unknown;
    const startTime = Date.now();

    // Execute based on block type
    if (block.type === 'function' && block.code) {
      // Function block: execute JavaScript code
      await storeEvent('start', { blockType: 'function', blockId });

      result = await executeFunctionBlock(block.code, input);

      await storeEvent('complete', {
        output: result,
        durationMs: Date.now() - startTime,
      });
    } else if (block.type === 'ai') {
      // AI block: use BaleyBots
      const connectionId = block.connectionId;
      if (!connectionId) {
        throw new Error('No connection configured for AI block');
      }

      const connection = await db.query.connections.findFirst({
        where: eq(connections.id, connectionId),
      });

      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      const config = connection.config as { apiKey?: string; baseUrl?: string };
      const modelName = block.model || 'gpt-4o-mini';
      const modelConfig = getModelConfig(connection.type, modelName, config);

      const bot = Baleybot.create({
        name: block.name,
        goal:
          block.systemPrompt ||
          block.goal ||
          'Process the input and provide a helpful response.',
        model: modelConfig,
        maxToolIterations: block.maxToolIterations || 25,
      });

      const inputStr =
        typeof input === 'string' ? input : JSON.stringify(input, null, 2);

      await storeEvent('start', {
        blockType: 'ai',
        blockId,
        model: modelName,
      });

      result = await bot.process(inputStr, {
        onToken: async (_botName: string, event: BaleybotStreamEvent) => {
          // Store streaming events for SSE endpoint to pick up
          await storeEvent(event.type, event);
        },
      });

      await storeEvent('complete', {
        output: result,
        durationMs: Date.now() - startTime,
      });
    } else {
      throw new Error(`Unsupported block type: ${block.type}`);
    }

    const durationMs = Date.now() - startTime;

    // Update execution with success
    await db
      .update(blockExecutions)
      .set({
        status: 'complete',
        output: result as Record<string, unknown> | null,
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(blockExecutions.id, executionId));

    log.info('Block execution completed', {
      executionId,
      blockId,
      durationMs,
    });

    return NextResponse.json({
      workspaceId: validation.workspaceId,
      executionId,
      blockId,
      status: 'complete',
      output: result,
      durationMs,
    });
  } catch (error) {
    log.error('Failed to run block', { error, executionId });

    // Update execution as failed if we have an execution ID
    if (executionId) {
      await db
        .update(blockExecutions)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        })
        .where(eq(blockExecutions.id, executionId));
    }

    if (error instanceof Error && error.message.includes('API key')) {
      return apiErrors.unauthorized(error.message);
    }

    return apiErrors.internal(error, { requestId });
  }
}
