# @baleyui/sdk

Official JavaScript/TypeScript SDK for BaleyUI. Execute AI flows and blocks programmatically.

## Installation

```bash
npm install @baleyui/sdk
# or
pnpm add @baleyui/sdk
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 4.7.0 (optional, for type definitions)

## Quick Start

### BAL Code Execution

Execute BAL (Baleybots Assembly Language) code directly:

```typescript
import { executeBALCode, compileBALCode } from '@baleyui/sdk';

// Compile BAL code (validation only, no execution)
const compiled = compileBALCode(`
  @entity Researcher
  instructions: "Research the given topic"
  tools: [web_search]

  @run Researcher("What is TypeScript?")
`);

if (compiled.errors) {
  console.error('Compilation errors:', compiled.errors);
} else {
  console.log('Entities:', compiled.entities);
  console.log('Structure:', compiled.structure);
}

// Execute BAL code
const result = await executeBALCode(`
  @entity Researcher
  instructions: "Research the given topic"
  tools: [web_search]

  @run Researcher("What is TypeScript?")
`, {
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60 seconds
  enableWebSearch: true,
  tavilyApiKey: process.env.TAVILY_API_KEY,
});

if (result.status === 'success') {
  console.log('Result:', result.result);
} else if (result.status === 'error') {
  console.error('Error:', result.error);
}
```

### Streaming Execution

For real-time progress updates:

```typescript
import { streamBALExecution } from '@baleyui/sdk';

const generator = streamBALExecution(balCode, {
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
});

for await (const event of generator) {
  switch (event.type) {
    case 'parsing':
      console.log('Parsing BAL code...');
      break;
    case 'compiled':
      console.log('Entities:', event.entities);
      break;
    case 'started':
      console.log('Execution started with input:', event.input);
      break;
    case 'progress':
      console.log(`[${event.botName}] ${event.message}`);
      break;
    case 'completed':
      console.log('Result:', event.result);
      break;
    case 'error':
      console.error('Error:', event.error);
      break;
  }
}
```

### Cancellation

Cancel a running execution:

```typescript
const controller = new AbortController();

// Start execution with abort signal
const resultPromise = executeBALCode(balCode, {
  signal: controller.signal,
  // ... other options
});

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

const result = await resultPromise;
if (result.status === 'cancelled') {
  console.log('Execution was cancelled');
}
```

## API Reference

### `executeBALCode(code, options)`

Execute BAL code and return the result.

**Parameters:**
- `code: string` - The BAL code to execute
- `options: BALExecutionOptions` - Execution options

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `'gpt-4o-mini'` | Model to use for execution |
| `apiKey` | string | - | API key for the model provider |
| `timeout` | number | `60000` | Maximum execution time in ms |
| `enableWebSearch` | boolean | `false` | Enable web search tool |
| `tavilyApiKey` | string | - | Tavily API key (required if enableWebSearch) |
| `enableSequentialThinking` | boolean | `false` | Enable sequential thinking tool |
| `signal` | AbortSignal | - | Abort signal for cancellation |
| `onEvent` | function | - | Callback for streaming events |

**Returns:** `Promise<BALExecutionResult>`

### `compileBALCode(code, options)`

Compile BAL code without executing it. Useful for validation.

**Parameters:**
- `code: string` - The BAL code to compile
- `options: BALExecutionOptions` - Compilation options

**Returns:** `BALCompileResult`

### `streamBALExecution(code, options)`

Execute BAL code with streaming events.

**Returns:** `AsyncGenerator<BALExecutionEvent, BALExecutionResult>`

## Types

### BALExecutionResult

```typescript
interface BALExecutionResult {
  status: 'success' | 'error' | 'cancelled' | 'timeout';
  result?: unknown;
  error?: string;
  entities?: string[];
  structure?: PipelineStructure | null;
  duration?: number;
}
```

### BALExecutionEvent

```typescript
type BALExecutionEvent =
  | { type: 'parsing'; message: string }
  | { type: 'compiled'; entities: string[]; structure: PipelineStructure | null }
  | { type: 'started'; input: unknown }
  | { type: 'token'; botName: string; event: BaleybotStreamEvent }
  | { type: 'progress'; botName: string; message: string }
  | { type: 'completed'; result: unknown }
  | { type: 'error'; error: string }
  | { type: 'cancelled' };
```

## License

MIT
