# @baleyui/react

Embeddable React components for BaleyUI.

## Installation

```bash
npm install @baleyui/react
# or
yarn add @baleyui/react
# or
pnpm add @baleyui/react
```

## Components

### FlowRunner

Drop-in component for executing BaleyUI flows.

```tsx
import { FlowRunner } from '@baleyui/react';

function App() {
  return (
    <FlowRunner
      apiKey="bui_live_xxxx"
      flowId="flow-123"
      onComplete={(result) => console.log('Done:', result)}
      onError={(error) => console.error('Error:', error)}
    />
  );
}
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiKey` | `string` | Required | Your BaleyUI API key |
| `flowId` | `string` | Required | Flow ID to execute |
| `baseUrl` | `string` | `https://app.baleyui.com` | API base URL |
| `defaultInput` | `object` | `{}` | Initial input values |
| `showInput` | `boolean` | `true` | Show input form |
| `showProgress` | `boolean` | `true` | Show execution progress |
| `showOutput` | `boolean` | `true` | Show execution output |
| `submitText` | `string` | `"Run Flow"` | Submit button text |
| `theme` | `ThemeConfig` | - | Theme configuration |
| `onStart` | `(executionId) => void` | - | Called when execution starts |
| `onEvent` | `(event) => void` | - | Called for each streaming event |
| `onComplete` | `(execution) => void` | - | Called when execution completes |
| `onError` | `(error) => void` | - | Called on error |

### ChatWidget

Embeddable chat interface for AI blocks.

```tsx
import { ChatWidget } from '@baleyui/react';

function App() {
  return (
    <ChatWidget
      apiKey="bui_live_xxxx"
      blockId="block-456"
      title="AI Assistant"
      placeholder="Ask me anything..."
      maxHeight={600}
    />
  );
}
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiKey` | `string` | Required | Your BaleyUI API key |
| `blockId` | `string` | Required | Block ID for the AI block |
| `baseUrl` | `string` | `https://app.baleyui.com` | API base URL |
| `title` | `string` | `"Chat"` | Chat header title |
| `placeholder` | `string` | `"Type a message..."` | Input placeholder |
| `initialMessages` | `ChatMessage[]` | `[]` | Initial messages |
| `maxHeight` | `string \| number` | `500` | Maximum widget height |
| `showTimestamps` | `boolean` | `false` | Show message timestamps |
| `theme` | `ThemeConfig` | - | Theme configuration |
| `onMessageSent` | `(message) => void` | - | Called when user sends message |
| `onResponse` | `(response) => void` | - | Called when AI responds |
| `onError` | `(error) => void` | - | Called on error |

## Hooks

### useFlowRunner

Low-level hook for flow execution.

```tsx
import { useFlowRunner } from '@baleyui/react';

function MyComponent() {
  const { status, events, result, error, execute, reset } = useFlowRunner({
    apiKey: 'bui_live_xxxx',
    flowId: 'flow-123',
  });

  return (
    <button onClick={() => execute({ message: 'Hello' })}>
      {status === 'running' ? 'Running...' : 'Execute'}
    </button>
  );
}
```

### useChatWidget

Low-level hook for chat functionality.

```tsx
import { useChatWidget } from '@baleyui/react';

function MyChat() {
  const { messages, isLoading, sendMessage, clearMessages } = useChatWidget({
    apiKey: 'bui_live_xxxx',
    blockId: 'block-456',
  });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}
      <button onClick={() => sendMessage('Hello!')}>Send</button>
    </div>
  );
}
```

## Theming

Both components accept a `theme` prop for customization:

```tsx
<FlowRunner
  apiKey="..."
  flowId="..."
  theme={{
    mode: 'dark',
    primaryColor: '#8b5cf6',
    borderRadius: 'lg',
    fontFamily: 'Inter, sans-serif',
  }}
/>
```

### ThemeConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mode` | `'light' \| 'dark' \| 'system'` | `'light'` | Color mode |
| `primaryColor` | `string` | `'#6366f1'` | Primary accent color |
| `borderRadius` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Border radius |
| `fontFamily` | `string` | System font | Font family |

## License

MIT
