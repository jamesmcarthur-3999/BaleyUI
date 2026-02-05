'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, X, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useBlockStream } from '@/hooks';
import { TestInput } from './TestInput';
import { TestOutputWithTabs } from './TestOutput';
import { ToolCallCard } from '@/components/streaming/ToolCallCard';
import { StreamMetrics } from '@/components/streaming/StreamMetrics';
import { StreamStatus } from '@/components/streaming/StreamStatus';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface SingleTestProps {
  blockId: string;
  className?: string;
  defaultInput?: string;
  onComplete?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

export function SingleTest({
  blockId,
  className,
  defaultInput = '{\n  "prompt": "Hello, world!"\n}',
  onComplete,
  onError,
}: SingleTestProps) {
  const [input, setInput] = useState(defaultInput);
  const [showRawEvents, setShowRawEvents] = useState(false);
  const [inputMode, setInputMode] = useState<'text' | 'json'>('json');

  const { state, execute, cancel, reset, isExecuting } = useBlockStream(blockId, {
    onComplete: (completedState) => {
      onComplete?.(completedState);
    },
    onError: (err) => {
      onError?.(err);
    },
  });

  const handleExecute = async () => {
    try {
      let parsedInput: unknown = input;

      // If in JSON mode, try to parse
      if (inputMode === 'json' && input.trim()) {
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
  };

  const canExecute = input.trim().length > 0 && !isExecuting;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
          <CardDescription>Provide test input for single execution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'text' | 'json')}>
            <TabsList>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="text">
              <TestInput
                value={input}
                onChange={setInput}
                placeholder="Enter your input..."
                disabled={isExecuting}
                mode="text"
                rows={8}
              />
            </TabsContent>

            <TabsContent value="json">
              <TestInput
                value={input}
                onChange={setInput}
                placeholder='{\n  "prompt": "Your prompt here"\n}'
                disabled={isExecuting}
                mode="json"
                rows={8}
              />
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button onClick={handleExecute} disabled={!canExecute} className="flex-1">
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
        <TestOutputWithTabs
          textOutput={state.text}
          structuredOutput={state.structuredOutput as object | string | null}
          reasoning={state.reasoning}
          isStreaming={state.status === 'streaming'}
        />
      )}

      {/* Tool Calls */}
      {state.toolCalls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tool Calls</CardTitle>
            <CardDescription className="text-xs">
              Tools executed during the block run
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {state.toolCalls.map((toolCall) => (
                <ToolCallCard key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          </CardContent>
        </Card>
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

      {/* Raw Events Debug View */}
      {state.status !== 'idle' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Debug</CardTitle>
                <CardDescription className="text-xs">
                  Raw streaming events and state
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRawEvents(!showRawEvents)}
              >
                {showRawEvents ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Show
                  </>
                )}
              </Button>
            </div>
          </CardHeader>

          {showRawEvents && (
            <CardContent>
              <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(state, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
