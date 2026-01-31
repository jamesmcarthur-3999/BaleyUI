'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, X, RotateCcw } from 'lucide-react';
import { useBlockStream } from '@/hooks';
import { StreamingText } from './StreamingText';
import { StreamingJSON } from './StreamingJSON';
import { ToolCallCard } from './ToolCallCard';
import { StreamMetrics } from './StreamMetrics';
import { StreamStatus } from './StreamStatus';
import { cn } from '@/lib/utils';

interface ExecutionPanelProps {
  blockId: string;
  className?: string;
  defaultInput?: string;
  onComplete?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

export function ExecutionPanel({
  blockId,
  className,
  defaultInput = '',
  onComplete,
  onError,
}: ExecutionPanelProps) {
  const [input, setInput] = useState(defaultInput);
  const [inputMode, setInputMode] = useState<'text' | 'json'>('text');

  const { state, execute, cancel, reset, isExecuting } = useBlockStream(blockId, {
    onComplete,
    onError,
  });

  const handleExecute = async () => {
    try {
      let parsedInput: unknown = input;

      // If in JSON mode, try to parse
      if (inputMode === 'json') {
        parsedInput = JSON.parse(input);
      }

      await execute(parsedInput);
    } catch (err) {
      if (err instanceof SyntaxError) {
        onError?.(new Error('Invalid JSON input'));
      } else {
        onError?.(err instanceof Error ? err : new Error('Execution failed'));
      }
    }
  };

  const handleReset = () => {
    reset();
    setInput(defaultInput);
  };

  const canExecute = input.trim().length > 0 && !isExecuting;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
          <CardDescription>Provide input for the block execution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="input">Input Data</Label>
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'text' | 'json')}>
                <TabsList className="h-8">
                  <TabsTrigger value="text" className="text-xs">
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="json" className="text-xs">
                    JSON
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <Textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputMode === 'json' ? '{"key": "value"}' : 'Enter your input...'}
              rows={6}
              disabled={isExecuting}
              className={cn(inputMode === 'json' && 'font-mono text-sm')}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleExecute}
              disabled={!canExecute}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              Execute
            </Button>

            {isExecuting && (
              <Button onClick={cancel} variant="outline">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}

            {state.status === 'complete' && (
              <Button onClick={handleReset} variant="outline">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      {state.status !== 'idle' && (
        <StreamStatus
          status={state.status}
          error={state.error?.message}
          onRetry={handleReset}
        />
      )}

      {/* Output Section */}
      {(state.text || state.structuredOutput || state.reasoning) && (
        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
            <CardDescription>Streaming response from the block</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="text">
              <TabsList>
                {state.text && <TabsTrigger value="text">Text</TabsTrigger>}
                {state.structuredOutput !== null && <TabsTrigger value="structured">Structured</TabsTrigger>}
                {state.reasoning && <TabsTrigger value="reasoning">Reasoning</TabsTrigger>}
              </TabsList>

              {state.text && (
                <TabsContent value="text">
                  <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                    <StreamingText
                      text={state.text}
                      isStreaming={state.status === 'streaming'}
                    />
                  </ScrollArea>
                </TabsContent>
              )}

              {state.structuredOutput !== null && (
                <TabsContent value="structured">
                  <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                    <StreamingJSON
                      json={
                        typeof state.structuredOutput === 'string'
                          ? state.structuredOutput
                          : JSON.stringify(state.structuredOutput, null, 2)
                      }
                      isStreaming={state.status === 'streaming' && !state.structuredOutputComplete}
                    />
                  </ScrollArea>
                </TabsContent>
              )}

              {state.reasoning && (
                <TabsContent value="reasoning">
                  <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                    <StreamingText
                      text={state.reasoning}
                      isStreaming={state.status === 'streaming'}
                      className="text-muted-foreground italic"
                    />
                  </ScrollArea>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Tool Calls */}
      {state.toolCalls.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Tool Calls</h3>
          <div className="space-y-3">
            {state.toolCalls.map((toolCall) => (
              <ToolCallCard key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
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
