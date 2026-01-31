# Streaming Components - Usage Examples

## Quick Start

The simplest way to use the streaming components is with the `ExecutionPanel`:

```tsx
import { ExecutionPanel } from '@/components/streaming';

export default function BlockPage({ params }: { params: { id: string } }) {
  return (
    <div className="container max-w-4xl py-8">
      <ExecutionPanel
        blockId={params.id}
        onComplete={(result) => {
          console.log('Execution complete:', result);
        }}
        onError={(error) => {
          console.error('Execution failed:', error);
        }}
      />
    </div>
  );
}
```

## Custom UI with Individual Components

For more control, you can build a custom interface using individual components:

```tsx
'use client';

import { useState } from 'react';
import { useBlockStream } from '@/hooks';
import {
  StreamingText,
  StreamingJSON,
  ToolCallCard,
  StreamMetrics,
  StreamStatus,
} from '@/components/streaming';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function CustomBlockExecutor({ blockId }: { blockId: string }) {
  const [input, setInput] = useState('');
  const { state, execute, cancel, reset, isExecuting } = useBlockStream(blockId);

  const handleExecute = async () => {
    try {
      const parsedInput = JSON.parse(input);
      await execute(parsedInput);
    } catch (err) {
      console.error('Invalid JSON:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{"prompt": "Hello!"}'
            rows={4}
            className="font-mono"
          />
          <div className="flex gap-2">
            <Button onClick={handleExecute} disabled={isExecuting}>
              Execute
            </Button>
            {isExecuting && (
              <Button onClick={cancel} variant="outline">
                Cancel
              </Button>
            )}
            {state.status === 'complete' && (
              <Button onClick={reset} variant="outline">
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      <StreamStatus
        status={state.status}
        error={state.error?.message}
        onRetry={reset}
      />

      {/* Text Output */}
      {state.text && (
        <Card>
          <CardHeader>
            <CardTitle>Response</CardTitle>
          </CardHeader>
          <CardContent>
            <StreamingText
              text={state.text}
              isStreaming={state.status === 'streaming'}
            />
          </CardContent>
        </Card>
      )}

      {/* Structured Output */}
      {state.structuredOutput && (
        <Card>
          <CardHeader>
            <CardTitle>Structured Output</CardTitle>
          </CardHeader>
          <CardContent>
            <StreamingJSON
              json={JSON.stringify(state.structuredOutput, null, 2)}
              isStreaming={!state.structuredOutputComplete}
            />
          </CardContent>
        </Card>
      )}

      {/* Tool Calls */}
      {state.toolCalls.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Tool Executions</h3>
          {state.toolCalls.map((toolCall) => (
            <ToolCallCard key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}

      {/* Metrics */}
      {state.metrics.totalTokens > 0 && (
        <StreamMetrics
          metrics={{
            ttft: state.metrics.ttft,
            tokensPerSec: state.metrics.tokensPerSecond,
            totalTokens: state.metrics.totalTokens,
          }}
        />
      )}
    </div>
  );
}
```

## Standalone Component Examples

### StreamingText

Perfect for displaying AI-generated text with a typing effect:

```tsx
import { StreamingText } from '@/components/streaming';

function ChatMessage({ message, isStreaming }: { message: string; isStreaming: boolean }) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <StreamingText
        text={message}
        isStreaming={isStreaming}
        showCursor={true}
      />
    </div>
  );
}
```

### StreamingJSON

Display structured data as it streams in:

```tsx
import { StreamingJSON } from '@/components/streaming';

function StructuredResponse({ data, isComplete }: { data: unknown; isComplete: boolean }) {
  return (
    <div className="rounded-lg border bg-slate-950 p-4">
      <StreamingJSON
        json={JSON.stringify(data, null, 2)}
        isStreaming={!isComplete}
      />
    </div>
  );
}
```

### ToolCallCard

Show individual tool executions:

```tsx
import { ToolCallCard } from '@/components/streaming';

function ToolExecution({ toolCall }: { toolCall: ToolCall }) {
  return <ToolCallCard toolCall={toolCall} />;
}
```

### StreamMetrics

Display performance metrics in a dashboard:

```tsx
import { StreamMetrics } from '@/components/streaming';

function PerformanceMetrics() {
  const { state } = useBlockStream(blockId);

  return (
    <StreamMetrics
      metrics={{
        ttft: state.metrics.ttft,
        tokensPerSec: state.metrics.tokensPerSecond,
        totalTokens: state.metrics.totalTokens,
      }}
    />
  );
}
```

### StreamStatus

Show connection status to users:

```tsx
import { StreamStatus } from '@/components/streaming';

function ConnectionIndicator() {
  const { state, retry } = useBlockStream(blockId);

  return (
    <StreamStatus
      status={state.status}
      error={state.error?.message}
      onRetry={retry}
    />
  );
}
```

## Advanced: Real-time Updates

Create a live dashboard that updates as execution progresses:

```tsx
'use client';

import { useBlockStream } from '@/hooks';
import { StreamMetrics, ToolCallCard } from '@/components/streaming';
import { Badge } from '@/components/ui/badge';

export function LiveExecutionDashboard({ blockId }: { blockId: string }) {
  const { state, isExecuting } = useBlockStream(blockId);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Status Badge */}
      <div className="col-span-2">
        <Badge variant={isExecuting ? 'connected' : 'outline'}>
          {state.status}
        </Badge>
      </div>

      {/* Metrics */}
      <div className="col-span-2">
        <StreamMetrics
          metrics={{
            ttft: state.metrics.ttft,
            tokensPerSec: state.metrics.tokensPerSecond,
            totalTokens: state.metrics.totalTokens,
          }}
        />
      </div>

      {/* Active Tool Calls */}
      <div className="col-span-2 space-y-3">
        <h3 className="text-sm font-semibold">
          Active Tools ({state.toolCalls.length})
        </h3>
        {state.toolCalls.map((toolCall) => (
          <ToolCallCard key={toolCall.id} toolCall={toolCall} />
        ))}
      </div>
    </div>
  );
}
```

## Integration with Forms

Use with React Hook Form for validated input:

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useBlockStream } from '@/hooks';
import { StreamingText } from '@/components/streaming';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const inputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  temperature: z.number().min(0).max(2),
});

export function ValidatedExecutionForm({ blockId }: { blockId: string }) {
  const { state, execute } = useBlockStream(blockId);
  const form = useForm({
    resolver: zodResolver(inputSchema),
    defaultValues: {
      prompt: '',
      temperature: 0.7,
    },
  });

  const onSubmit = async (data: z.infer<typeof inputSchema>) => {
    await execute(data);
  };

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prompt</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <Button type="submit">Execute</Button>
        </form>
      </Form>

      {state.text && (
        <StreamingText
          text={state.text}
          isStreaming={state.status === 'streaming'}
        />
      )}
    </div>
  );
}
```

## Testing

Example test for streaming components:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { StreamingText } from '@/components/streaming';

describe('StreamingText', () => {
  it('displays text with cursor when streaming', () => {
    render(<StreamingText text="Hello" isStreaming={true} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    // Cursor should be visible
  });

  it('hides cursor when not streaming', () => {
    render(<StreamingText text="Hello" isStreaming={false} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    // Cursor should not be visible
  });
});
```
