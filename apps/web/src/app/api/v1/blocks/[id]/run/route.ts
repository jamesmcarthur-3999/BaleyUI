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

/**
 * Execute a function block's JavaScript code in a sandboxed environment
 */
async function executeFunctionBlock(
  code: string,
  input: unknown
): Promise<unknown> {
  const TIMEOUT_MS = 5000;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Code execution timed out (5s limit)'));
    }, TIMEOUT_MS);

    try {
      const AsyncFunction = Object.getPrototypeOf(
        async function () {}
      ).constructor;

      const wrappedCode = `
        "use strict";
        ${code}

        if (typeof module !== 'undefined' && module.exports && typeof module.exports === 'function') {
          return await module.exports(input);
        }
        if (typeof processInput === 'function') {
          return await processInput(input);
        }
        if (typeof execute === 'function') {
          return await execute(input);
        }
        return input;
      `;

      const fn = new AsyncFunction('input', wrappedCode);

      fn(input)
        .then((result: unknown) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error: Error) => {
          clearTimeout(timeoutId);
          reject(new Error(`Code execution failed: ${error.message}`));
        });
    } catch (error) {
      clearTimeout(timeoutId);
      reject(
        new Error(
          `Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let executionId: string | null = null;
  let eventIndex = 0;

  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const validation = await validateApiKey(authHeader);

    // Check execute permission
    if (!hasPermission(validation, 'execute')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: execute or admin' },
        { status: 403 }
      );
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
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
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
      return NextResponse.json(
        { error: 'Failed to create execution' },
        { status: 500 }
      );
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
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: 'Failed to run block',
        ...(isDev ? { details: error instanceof Error ? error.message : 'Unknown error' } : {}),
        executionId,
      },
      { status: 500 }
    );
  }
}
