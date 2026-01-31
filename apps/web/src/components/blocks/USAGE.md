# Block Testing Interface Components

Enhanced testing interface for BaleyUI blocks with streaming output, input builder, and test history.

## Components

### BlockTestPanel

The main component that integrates all testing functionality with a split-view interface.

```tsx
import { BlockTestPanel } from '@/components/blocks';

function MyTestPage() {
  return (
    <BlockTestPanel
      blockId="block_123"
      schema={{
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt to send' },
          temperature: { type: 'number', default: 0.7 },
        },
        required: ['prompt'],
      }}
      onComplete={(state) => console.log('Complete:', state)}
      onError={(error) => console.error('Error:', error)}
    />
  );
}
```

**Features:**
- Split view: Input on left, output on right
- Run/Cancel/Reset controls
- History toggle button
- Automatic test history saving
- Streaming output with real-time updates

---

### StreamingOutput

Real-time streaming output display with tabs for different content types.

```tsx
import { StreamingOutput } from '@/components/blocks';
import { useBlockStream } from '@/hooks';

function MyComponent({ blockId }) {
  const { state } = useBlockStream(blockId);

  return (
    <StreamingOutput
      state={state}
      showMetrics={true}
      showDebug={false}
      maxHeight="600px"
    />
  );
}
```

**Features:**
- Real-time text streaming with cursor
- Tool call visualization with expandable sections
- Structured JSON output preview
- Reasoning/thinking output display
- Performance metrics (TTFT, tokens/sec)
- Copy to clipboard functionality
- Auto-switching tabs based on content

---

### InputBuilder

JSON schema-aware input form generator with validation.

```tsx
import { InputBuilder } from '@/components/blocks';

function MyComponent() {
  const [input, setInput] = useState('{}');

  return (
    <InputBuilder
      value={input}
      onChange={setInput}
      schema={{
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              temperature: { type: 'number' },
              maxTokens: { type: 'integer' },
            },
          },
          tags: { type: 'array', items: { type: 'string' } },
          enabled: { type: 'boolean' },
        },
      }}
      disabled={false}
    />
  );
}
```

**Features:**
- Form mode: Auto-generated forms from JSON schema
- JSON mode: Direct JSON editing with validation
- Support for string, number, boolean, object, array types
- Sample data generation
- Format JSON button
- Real-time validation with error messages
- Enum support for dropdowns

**Supported Schema Properties:**
- `type`: string, number, integer, boolean, array, object
- `properties`: Object properties definition
- `items`: Array items schema
- `required`: Required field names
- `description`: Field help text
- `default`: Default values
- `enum`: Dropdown options

---

### TestHistory

Persistent test history with localStorage, replay, and comparison features.

```tsx
import { TestHistory, type TestHistoryRef } from '@/components/blocks';
import { useRef } from 'react';

function MyComponent({ blockId }) {
  const historyRef = useRef<TestHistoryRef>(null);

  // Add execution to history programmatically
  const handleComplete = (input: unknown, state: StreamState) => {
    historyRef.current?.addExecution(input, state);
  };

  return (
    <TestHistory
      blockId={blockId}
      onReplay={(input) => console.log('Replay:', input)}
      onViewDetails={(record) => console.log('View:', record)}
      onCompare={(a, b) => console.log('Compare:', a, b)}
      maxRecords={50}
      ref={historyRef}
    />
  );
}
```

**Features:**
- Persistent localStorage storage per block
- Automatic save/load
- Test replay functionality
- View detailed results
- Compare two test runs (select mode)
- Delete individual tests
- Clear all history
- Shows status, timestamps, metrics
- Input/output previews
- Duration tracking
- Max records limit

**Storage:**
- Stored in localStorage with key: `baley_test_history_{blockId}`
- Automatically limits to `maxRecords` (default: 50)
- Survives page refreshes

---

## Integration Example

Example of using BlockTestPanel in a test page:

```tsx
'use client';

import { BlockTestPanel } from '@/components/blocks';
import { useParams } from 'next/navigation';

export default function BlockTestPage() {
  const params = useParams();
  const blockId = params.id as string;

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-8">Test Block</h1>

      <BlockTestPanel
        blockId={blockId}
        defaultInput='{\n  "prompt": "Hello, world!"\n}'
        schema={{
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The prompt to send to the AI',
            },
            temperature: {
              type: 'number',
              description: 'Controls randomness (0-1)',
              default: 0.7,
            },
          },
          required: ['prompt'],
        }}
        onComplete={(state) => {
          console.log('Execution complete:', state.text);
        }}
        onError={(error) => {
          console.error('Execution error:', error.message);
        }}
      />
    </div>
  );
}
```

## Patterns Used

### Streaming
- Uses `useBlockStream` hook for execution and streaming
- Automatically processes SSE events
- Updates UI in real-time

### State Management
- Uses React hooks for local state
- useReducer for complex stream state
- useRef for imperative handles
- forwardRef for exposing methods

### Styling
- shadcn/ui components
- Tailwind CSS classes
- Lucide React icons
- Responsive grid layouts

### TypeScript
- Full type safety
- Exported interfaces
- JSON Schema types
- Ref types for imperative APIs

## Component Dependencies

```
BlockTestPanel
├── InputBuilder
├── StreamingOutput
│   ├── StreamingText
│   ├── StreamingJSON
│   ├── ToolCallCard
│   └── StreamMetrics
├── TestHistory
└── useBlockStream
```

## Notes

- All components use 'use client' directive (client-side only)
- LocalStorage is used for test history persistence
- Streaming uses SSE (Server-Sent Events)
- Real-time updates with React state
- Responsive design (mobile/tablet/desktop)
- Accessible UI with proper labels and ARIA attributes
