# @baleyui/sdk

Official JavaScript/TypeScript SDK for BaleyUI - Execute AI flows and blocks programmatically.

## Installation

```bash
npm install @baleyui/sdk
# or
yarn add @baleyui/sdk
# or
pnpm add @baleyui/sdk
```

## Quick Start

```typescript
import { BaleyUI } from '@baleyui/sdk';

const client = new BaleyUI({
  apiKey: process.env.BALEYUI_API_KEY!,
});

// Execute a flow
const execution = await client.flows.execute('flow-id', {
  input: { message: 'Hello, world!' },
});

// Wait for completion
const result = await execution.waitForCompletion();
console.log(result.output);
```

## Usage

### Initialize the Client

```typescript
import { BaleyUI } from '@baleyui/sdk';

const client = new BaleyUI({
  apiKey: 'bui_live_xxxxxxxxxxxx',
  // Optional settings
  baseUrl: 'https://app.baleyui.com', // Default
  timeout: 30000, // 30 seconds
  maxRetries: 3,
});
```

### List Flows

```typescript
const { flows } = await client.flows.list();
console.log(`Found ${flows.length} flows`);
```

### Execute a Flow

```typescript
// Start execution (returns immediately)
const execution = await client.flows.execute('flow-id', {
  input: { query: 'What is AI?' },
});

console.log(`Execution started: ${execution.id}`);

// Check status
const status = await execution.getStatus();
console.log(`Status: ${status.status}`);

// Wait for completion
const result = await execution.waitForCompletion();
console.log(`Output: ${JSON.stringify(result.output)}`);
```

### Stream Execution Events

```typescript
const execution = await client.flows.execute('flow-id', {
  input: { message: 'Hello!' },
});

// Stream events in real-time
for await (const event of execution.stream()) {
  switch (event.type) {
    case 'node_start':
      console.log(`Node ${event.nodeId} started`);
      break;
    case 'node_stream':
      // Streaming content from AI
      process.stdout.write(event.data?.content || '');
      break;
    case 'node_complete':
      console.log(`Node ${event.nodeId} completed`);
      break;
    case 'execution_complete':
      console.log('Execution complete!');
      break;
    case 'execution_error':
      console.error('Execution failed:', event.data?.error);
      break;
  }
}
```

### Run a Single Block

```typescript
const execution = await client.blocks.run('block-id', {
  input: { text: 'Summarize this article...' },
});

const result = await execution.waitForCompletion();
console.log(result.output);
```

### Error Handling

```typescript
import {
  BaleyUI,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from '@baleyui/sdk';

try {
  const result = await client.flows.execute('flow-id');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof NotFoundError) {
    console.error('Flow not found');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s`);
  } else {
    throw error;
  }
}
```

## API Reference

### `BaleyUI`

Main client class.

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | *required* | Your BaleyUI API key |
| `baseUrl` | `string` | `https://app.baleyui.com` | API base URL |
| `timeout` | `number` | `30000` | Request timeout (ms) |
| `maxRetries` | `number` | `3` | Max retry attempts |

### `client.flows`

#### `list()` → `Promise<ListFlowsResult>`

List all flows in the workspace.

#### `get(id)` → `Promise<FlowDetail>`

Get a specific flow with full details.

#### `execute(id, options?)` → `Promise<ExecutionHandle>`

Execute a flow.

### `client.blocks`

#### `list()` → `Promise<ListBlocksResult>`

List all blocks in the workspace.

#### `run(id, options?)` → `Promise<ExecutionHandle>`

Run a single block.

### `client.executions`

#### `get(id)` → `Promise<Execution>`

Get execution status and result.

#### `waitForCompletion(id, timeout?)` → `Promise<Execution>`

Wait for an execution to complete.

#### `stream(id)` → `AsyncGenerator<ExecutionEvent>`

Stream execution events.

### `ExecutionHandle`

Returned from `execute()` and `run()`.

| Method | Description |
|--------|-------------|
| `id` | The execution ID |
| `getStatus()` | Get current status |
| `waitForCompletion(timeout?)` | Wait for completion |
| `stream()` | Stream events |

## Types

See [src/types.ts](./src/types.ts) for complete type definitions.

## License

MIT
