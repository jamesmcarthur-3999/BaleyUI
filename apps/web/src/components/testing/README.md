# Testing Components

React components for testing AI blocks in BaleyUI. These components provide different interfaces for testing and debugging block executions.

## Components

### LiveChat.tsx
Multi-turn chat interface for conversational testing of AI blocks.

**Features:**
- Real-time streaming responses
- Message history with user/assistant messages
- Tool call visibility during execution
- Clear history functionality
- Auto-scroll to latest messages
- Enter to send, Shift+Enter for new line

**Usage:**
```tsx
import { LiveChat } from '@/components/testing';

<LiveChat
  blockId="block-123"
  onError={(error) => console.error(error)}
/>
```

**Props:**
- `blockId` (required): The ID of the block to test
- `className?`: Additional CSS classes
- `onError?`: Error callback handler

---

### SingleTest.tsx
Single input/output test interface for one-shot testing.

**Features:**
- JSON or text input modes
- Real-time streaming output
- Tool call display
- Performance metrics
- Debug view with raw state
- Execute/Cancel/Reset controls

**Usage:**
```tsx
import { SingleTest } from '@/components/testing';

<SingleTest
  blockId="block-123"
  defaultInput='{"prompt": "Hello!"}'
  onComplete={(result) => console.log(result)}
  onError={(error) => console.error(error)}
/>
```

**Props:**
- `blockId` (required): The ID of the block to test
- `className?`: Additional CSS classes
- `defaultInput?`: Default input value
- `onComplete?`: Callback when execution completes
- `onError?`: Error callback handler

---

### TestInput.tsx
Reusable JSON/text input editor with validation.

**Features:**
- JSON validation with error display
- Format/prettify button for JSON
- Real-time validation feedback
- Text or JSON mode support

**Usage:**
```tsx
import { TestInput } from '@/components/testing';

<TestInput
  value={inputValue}
  onChange={setInputValue}
  mode="json"
  placeholder='{"key": "value"}'
/>
```

**Props:**
- `value` (required): Current input value
- `onChange` (required): Change handler
- `placeholder?`: Placeholder text
- `disabled?`: Whether input is disabled
- `className?`: Additional CSS classes
- `label?`: Input label text
- `mode?`: 'text' | 'json' (default: 'json')
- `rows?`: Number of textarea rows

---

### TestOutput.tsx
Output display component with multiple viewing modes.

**Features:**
- Text and JSON output support
- Copy to clipboard functionality
- Collapsible/expandable
- Streaming indicator
- Customizable height

**Components:**
- `TestOutput`: Single output display
- `TestOutputWithTabs`: Multi-tab output (text/structured/reasoning)

**Usage:**
```tsx
import { TestOutput, TestOutputWithTabs } from '@/components/testing';

// Single output
<TestOutput
  output={result}
  isStreaming={isStreaming}
  format="json"
/>

// Multi-tab output
<TestOutputWithTabs
  textOutput={state.text}
  structuredOutput={state.structuredOutput}
  reasoning={state.reasoning}
  isStreaming={isStreaming}
/>
```

**Props (TestOutput):**
- `output` (required): Output data (string or object)
- `isStreaming?`: Whether currently streaming
- `format?`: 'text' | 'json' | 'auto' (default: 'auto')
- `className?`: Additional CSS classes
- `title?`: Card title
- `description?`: Card description
- `showCopy?`: Show copy button (default: true)
- `maxHeight?`: Maximum height (default: '400px')

---

### TestHistory.tsx
List of past test executions with replay functionality.

**Features:**
- Execution history with status badges
- Input/output previews
- Performance metrics display
- Replay past tests
- Delete individual executions
- Clear all history
- Relative timestamps

**Usage:**
```tsx
import { TestHistory } from '@/components/testing';

<TestHistory
  blockId="block-123"
  onReplay={(input) => setTestInput(input)}
  onViewDetails={(record) => console.log(record)}
/>
```

**Props:**
- `blockId` (required): The ID of the block
- `className?`: Additional CSS classes
- `onReplay?`: Callback when replaying a test
- `onViewDetails?`: Callback when viewing execution details

---

## Test Page

### `/blocks/[id]/test/page.tsx`
Full-featured test page for a specific block with three tabs:

1. **Live Chat** - Multi-turn conversation testing
2. **Single Test** - One-shot execution testing
3. **History** - View and replay past executions

**Features:**
- Tab-based interface switching
- Block information display
- Error handling with toast notifications
- Back navigation to block editor
- Responsive layout

**Route:**
```
/blocks/{blockId}/test
```

---

## Integration with Hooks

All components use the `useBlockStream` hook from `@/hooks` for:
- Starting block executions
- Streaming real-time results
- Managing execution state
- Cancellation support
- Error handling

**Example:**
```tsx
import { useBlockStream } from '@/hooks';

const { state, execute, cancel, reset, isExecuting } = useBlockStream(blockId, {
  onComplete: (state) => console.log('Done!'),
  onError: (error) => console.error(error),
});
```

---

## Styling

All components use:
- shadcn/ui components for consistent UI
- Tailwind CSS for styling
- cn() utility for class merging
- Responsive design patterns

---

## Dependencies

- `@/components/ui/*` - UI primitives (Button, Card, Tabs, etc.)
- `@/components/streaming/*` - Streaming display components
- `@/hooks` - useBlockStream hook
- `@/lib/streaming/types` - Type definitions
- `lucide-react` - Icons

---

## Future Enhancements

Potential improvements:
- [ ] Persist execution history to local storage or database
- [ ] Export test results to JSON/CSV
- [ ] Compare multiple test runs
- [ ] Saved test scenarios
- [ ] Bulk testing with multiple inputs
- [ ] Test result sharing via URL
- [ ] Performance benchmarking tools
