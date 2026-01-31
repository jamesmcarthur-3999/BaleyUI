/**
 * Express.js Middleware Integration Template
 *
 * This template shows how to integrate BaleyUI with Express.js
 * as a middleware for AI-powered endpoints.
 *
 * Prerequisites:
 * - npm install express @baleyui/sdk
 */

import express, { Request, Response, NextFunction } from 'express';
import { BaleyUI, BaleyUIError } from '@baleyui/sdk';

// Initialize BaleyUI client
const baleyui = new BaleyUI({
  apiKey: process.env.BALEYUI_API_KEY!,
});

// ============================================================================
// Types
// ============================================================================

interface BaleyUIRequest extends Request {
  baleyui?: {
    client: BaleyUI;
    executeFlow: (flowId: string, input: Record<string, unknown>) => Promise<unknown>;
    runBlock: (blockId: string, input: Record<string, unknown>) => Promise<unknown>;
  };
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * BaleyUI middleware that attaches the client to the request object.
 */
export function baleyuiMiddleware() {
  return (req: BaleyUIRequest, _res: Response, next: NextFunction) => {
    req.baleyui = {
      client: baleyui,

      async executeFlow(flowId: string, input: Record<string, unknown>) {
        const execution = await baleyui.flows.execute(flowId, { input });
        const result = await execution.waitForCompletion();

        if (result.status === 'failed') {
          throw new Error(result.error?.message || 'Flow execution failed');
        }

        return result.output;
      },

      async runBlock(blockId: string, input: Record<string, unknown>) {
        const execution = await baleyui.blocks.run(blockId, { input });
        const result = await execution.waitForCompletion();

        if (result.status === 'failed') {
          throw new Error(result.error?.message || 'Block execution failed');
        }

        return result.output;
      },
    };

    next();
  };
}

/**
 * Error handler for BaleyUI errors.
 */
export function baleyuiErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof BaleyUIError) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }

  next(err);
}

// ============================================================================
// Example Routes
// ============================================================================

const app = express();
app.use(express.json());
app.use(baleyuiMiddleware());

// Chat endpoint
app.post('/api/chat', async (req: BaleyUIRequest, res: Response) => {
  try {
    const { message, conversationId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const CHAT_FLOW_ID = process.env.BALEYUI_CHAT_FLOW_ID!;

    const output = await req.baleyui!.executeFlow(CHAT_FLOW_ID, {
      message,
      conversationId,
      userId: req.headers['x-user-id'] || 'anonymous',
    });

    res.json({ response: output });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Streaming chat endpoint
app.post('/api/chat/stream', async (req: BaleyUIRequest, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const CHAT_FLOW_ID = process.env.BALEYUI_CHAT_FLOW_ID!;

    const execution = await baleyui.flows.execute(CHAT_FLOW_ID, {
      input: { message },
    });

    // Stream events
    for await (const event of execution.stream()) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    res.end();
  }
});

// Document processing endpoint
app.post('/api/process-document', async (req: BaleyUIRequest, res: Response) => {
  try {
    const { document, action } = req.body;

    const DOCUMENT_FLOW_ID = process.env.BALEYUI_DOCUMENT_FLOW_ID!;

    const output = await req.baleyui!.executeFlow(DOCUMENT_FLOW_ID, {
      document,
      action, // summarize, extract, analyze, etc.
    });

    res.json({ result: output });
  } catch (error) {
    console.error('Document processing error:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

// Webhook endpoint for external triggers
app.post('/api/webhook/trigger', async (req: BaleyUIRequest, res: Response) => {
  try {
    const { flowId, input, async: isAsync } = req.body;

    if (!flowId) {
      return res.status(400).json({ error: 'flowId is required' });
    }

    const execution = await baleyui.flows.execute(flowId, { input: input || {} });

    if (isAsync) {
      // Return immediately with execution ID
      res.json({ executionId: execution.id });
    } else {
      // Wait for completion
      const result = await execution.waitForCompletion();
      res.json({ executionId: execution.id, result });
    }
  } catch (error) {
    console.error('Webhook trigger error:', error);
    res.status(500).json({ error: 'Failed to trigger flow' });
  }
});

// Add error handler
app.use(baleyuiErrorHandler);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/**
 * Environment Variables:
 * - BALEYUI_API_KEY: Your BaleyUI API key
 * - BALEYUI_CHAT_FLOW_ID: Flow ID for chat functionality
 * - BALEYUI_DOCUMENT_FLOW_ID: Flow ID for document processing
 * - PORT: Server port (default: 3000)
 */
