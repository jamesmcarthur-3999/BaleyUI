/**
 * OpenAPI 3.0 Specification for BaleyUI REST API v1
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BaleyUI API',
    version: '1.0.0',
    description: `
The BaleyUI API allows you to programmatically execute AI flows and blocks,
monitor execution status, and integrate AI capabilities into your applications.

## Authentication

All API requests require an API key passed in the Authorization header:

\`\`\`
Authorization: Bearer bui_live_xxxxxxxxxxxx
\`\`\`

API keys can be created in the BaleyUI dashboard under Settings > API Keys.

## Rate Limits

- 100 requests per minute per API key
- 1000 requests per hour per API key

## Errors

The API uses standard HTTP status codes:
- 400: Bad Request - Invalid parameters
- 401: Unauthorized - Invalid or missing API key
- 403: Forbidden - Insufficient permissions
- 404: Not Found - Resource doesn't exist
- 429: Too Many Requests - Rate limit exceeded
- 500: Internal Server Error
    `.trim(),
    contact: {
      name: 'BaleyUI Support',
      url: 'https://baleyui.com/support',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Current server',
    },
  ],
  security: [{ bearerAuth: [] }],
  tags: [
    {
      name: 'Flows',
      description: 'Manage and execute AI flows',
    },
    {
      name: 'Blocks',
      description: 'Manage and run individual AI blocks',
    },
    {
      name: 'Executions',
      description: 'Monitor and manage flow executions',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'API key in format: bui_live_xxxxx or bui_test_xxxxx',
      },
    },
    schemas: {
      Flow: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Unique flow identifier' },
          name: { type: 'string', description: 'Flow name' },
          description: { type: 'string', nullable: true, description: 'Flow description' },
          enabled: { type: 'boolean', description: 'Whether the flow is enabled' },
          version: { type: 'integer', description: 'Flow version number' },
          nodeCount: { type: 'integer', description: 'Number of nodes in the flow' },
          edgeCount: { type: 'integer', description: 'Number of connections between nodes' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'enabled', 'version'],
      },
      FlowDetail: {
        allOf: [
          { $ref: '#/components/schemas/Flow' },
          {
            type: 'object',
            properties: {
              nodes: {
                type: 'array',
                items: { $ref: '#/components/schemas/FlowNode' },
                description: 'Nodes in the flow',
              },
              edges: {
                type: 'array',
                items: { $ref: '#/components/schemas/FlowEdge' },
                description: 'Connections between nodes',
              },
              triggers: {
                type: 'array',
                items: { type: 'object' },
                description: 'Flow triggers (webhook, schedule, etc.)',
              },
            },
          },
        ],
      },
      FlowNode: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Node ID within the flow' },
          type: { type: 'string', enum: ['source', 'sink', 'aiBlock', 'functionBlock', 'router', 'parallel', 'loop'] },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
          data: { type: 'object', description: 'Node configuration data' },
        },
      },
      FlowEdge: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          source: { type: 'string', description: 'Source node ID' },
          target: { type: 'string', description: 'Target node ID' },
          sourceHandle: { type: 'string', nullable: true },
          targetHandle: { type: 'string', nullable: true },
        },
      },
      Block: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          type: { type: 'string', enum: ['ai', 'function', 'router', 'parallel'] },
          model: { type: 'string', nullable: true, description: 'AI model used (for AI blocks)' },
          executionCount: { type: 'integer', description: 'Total number of executions' },
          avgDuration: { type: 'number', nullable: true, description: 'Average execution duration in ms' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'type'],
      },
      Execution: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          flowId: { type: 'string', format: 'uuid', nullable: true },
          blockId: { type: 'string', format: 'uuid', nullable: true },
          status: {
            type: 'string',
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
          },
          input: { type: 'object', nullable: true, description: 'Input data for the execution' },
          output: { type: 'object', nullable: true, description: 'Output data from the execution' },
          error: { type: 'string', nullable: true, description: 'Error message if failed' },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          duration: { type: 'integer', nullable: true, description: 'Duration in milliseconds' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'status', 'createdAt'],
      },
      ExecutionEvent: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'execution_start',
              'execution_complete',
              'execution_error',
              'node_start',
              'node_complete',
              'node_error',
              'node_stream',
            ],
          },
          executionId: { type: 'string', format: 'uuid' },
          nodeId: { type: 'string', nullable: true },
          data: { type: 'object', nullable: true },
          timestamp: { type: 'string', format: 'date-time' },
          index: { type: 'integer', description: 'Event sequence number' },
        },
        required: ['type', 'executionId', 'timestamp', 'index'],
      },
      ExecuteRequest: {
        type: 'object',
        properties: {
          input: {
            type: 'object',
            description: 'Input data to pass to the flow or block',
            additionalProperties: true,
          },
        },
      },
      ExecuteResponse: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', format: 'uuid' },
          executionId: { type: 'string', format: 'uuid' },
          flowId: { type: 'string', format: 'uuid', nullable: true },
          blockId: { type: 'string', format: 'uuid', nullable: true },
          status: { type: 'string', enum: ['pending', 'running'] },
          message: { type: 'string' },
        },
        required: ['workspaceId', 'executionId', 'status', 'message'],
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' },
          details: { type: 'string', nullable: true, description: 'Additional error details' },
        },
        required: ['error'],
      },
      ListResponse: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', format: 'uuid' },
          items: { type: 'array', items: {} },
          count: { type: 'integer' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Invalid or missing API key',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Invalid API key' },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Insufficient permissions. Required: execute or admin' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Flow not found' },
          },
        },
      },
    },
  },
  paths: {
    '/flows': {
      get: {
        tags: ['Flows'],
        summary: 'List flows',
        description: 'Get all flows in the workspace',
        operationId: 'listFlows',
        responses: {
          '200': {
            description: 'List of flows',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workspaceId: { type: 'string', format: 'uuid' },
                    flows: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Flow' },
                    },
                    count: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/flows/{id}': {
      get: {
        tags: ['Flows'],
        summary: 'Get flow',
        description: 'Get a specific flow by ID with full details',
        operationId: 'getFlow',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Flow ID',
          },
        ],
        responses: {
          '200': {
            description: 'Flow details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlowDetail' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/flows/{id}/execute': {
      post: {
        tags: ['Flows'],
        summary: 'Execute flow',
        description: 'Start executing a flow with the provided input. Returns immediately with an execution ID that can be used to monitor progress.',
        operationId: 'executeFlow',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Flow ID',
          },
        ],
        requestBody: {
          description: 'Execution input',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ExecuteRequest' },
              example: { input: { message: 'Hello, world!' } },
            },
          },
        },
        responses: {
          '200': {
            description: 'Execution started',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ExecuteResponse' },
              },
            },
          },
          '400': {
            description: 'Flow is disabled',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/executions/{id}': {
      get: {
        tags: ['Executions'],
        summary: 'Get execution',
        description: 'Get the current status and result of an execution',
        operationId: 'getExecution',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Execution ID',
          },
        ],
        responses: {
          '200': {
            description: 'Execution status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Execution' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/executions/{id}/stream': {
      get: {
        tags: ['Executions'],
        summary: 'Stream execution events',
        description: 'Subscribe to real-time execution events using Server-Sent Events (SSE). Events include node starts, completions, streaming content, and final results.',
        operationId: 'streamExecution',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Execution ID',
          },
          {
            name: 'fromIndex',
            in: 'query',
            schema: { type: 'integer', default: 0 },
            description: 'Start streaming from this event index (for reconnection)',
          },
        ],
        responses: {
          '200': {
            description: 'SSE event stream',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  description: 'Server-Sent Events stream. Each event is JSON-formatted ExecutionEvent.',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/blocks': {
      get: {
        tags: ['Blocks'],
        summary: 'List blocks',
        description: 'Get all blocks in the workspace',
        operationId: 'listBlocks',
        responses: {
          '200': {
            description: 'List of blocks',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workspaceId: { type: 'string', format: 'uuid' },
                    blocks: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Block' },
                    },
                    count: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/blocks/{id}/run': {
      post: {
        tags: ['Blocks'],
        summary: 'Run block',
        description: 'Execute a single block with the provided input. Useful for testing blocks or running standalone AI operations.',
        operationId: 'runBlock',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Block ID',
          },
        ],
        requestBody: {
          description: 'Block input',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ExecuteRequest' },
              example: { input: { text: 'Summarize this content...' } },
            },
          },
        },
        responses: {
          '200': {
            description: 'Block execution started',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ExecuteResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
} as const;

export type OpenAPISpec = typeof openApiSpec;
