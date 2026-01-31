'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Play, X, RotateCcw, History as HistoryIcon } from 'lucide-react';
import { useBlockStream } from '@/hooks';
import { InputBuilder, type JSONSchema } from './InputBuilder';
import { StreamingOutput } from './StreamingOutput';
import { TestHistory, type TestHistoryRef } from './TestHistory';
import { StreamStatus } from '@/components/streaming/StreamStatus';
import { cn } from '@/lib/utils';
import type { StreamState } from '@/lib/streaming/types/state';

interface BlockTestPanelProps {
  blockId: string;
  className?: string;
  defaultInput?: string;
  schema?: JSONSchema;
  onComplete?: (result: StreamState) => void;
  onError?: (error: Error) => void;
}

export function BlockTestPanel({
  blockId,
  className,
  defaultInput = '{\n  "prompt": "Hello, world!"\n}',
  schema,
  onComplete,
  onError,
}: BlockTestPanelProps) {
  const [input, setInput] = useState(defaultInput);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<TestHistoryRef>(null);

  const { state, execute, cancel, reset, isExecuting } = useBlockStream(blockId, {
    onComplete: (completedState) => {
      // Add to history
      try {
        const parsedInput = JSON.parse(input);
        // Save to history via localStorage in TestHistory component
        if (historyRef.current) {
          historyRef.current.addExecution(parsedInput, completedState);
        }
      } catch {
        // Input wasn't valid JSON, skip history
      }

      onComplete?.(completedState);
    },
    onError: (err) => {
      onError?.(err);
    },
  });

  const handleExecute = async () => {
    try {
      let parsedInput: unknown = input;

      // Try to parse as JSON
      if (input.trim()) {
        try {
          parsedInput = JSON.parse(input);
        } catch {
          // If not valid JSON, use as string
          parsedInput = input;
        }
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

  const handleReplay = (replayInput: unknown) => {
    setInput(JSON.stringify(replayInput, null, 2));
    setShowHistory(false);
  };

  const canExecute = input.trim().length > 0 && !isExecuting;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Action Bar */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExecute}
            disabled={!canExecute}
            size="lg"
            className="flex-1"
          >
            <Play className="h-4 w-4 mr-2" />
            Run Test
          </Button>

          {isExecuting && (
            <Button onClick={cancel} variant="outline" size="lg">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}

          {(state.status === 'complete' || state.status === 'error') && (
            <Button onClick={handleReset} variant="outline" size="lg">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}

          <Separator orientation="vertical" className="h-10" />

          <Button
            onClick={() => setShowHistory(!showHistory)}
            variant={showHistory ? 'default' : 'outline'}
            size="lg"
          >
            <HistoryIcon className="h-4 w-4 mr-2" />
            History
          </Button>
        </div>
      </Card>

      {/* Status */}
      {state.status !== 'idle' && state.status !== 'connecting' && (
        <StreamStatus
          status={state.status}
          error={state.error?.message}
          onRetry={handleReset}
        />
      )}

      {/* Main Content - Split View or History */}
      {showHistory ? (
        <TestHistory
          blockId={blockId}
          onReplay={handleReplay}
          ref={historyRef}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Panel - Input */}
          <div className="space-y-4">
            <InputBuilder
              value={input}
              onChange={setInput}
              schema={schema}
              disabled={isExecuting}
            />
          </div>

          {/* Right Panel - Output */}
          <div className="space-y-4">
            {state.status === 'idle' ? (
              <Card className="p-12">
                <div className="flex items-center justify-center text-center">
                  <div>
                    <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <Play className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Ready to Test</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Configure your input on the left and click &quot;Run Test&quot; to see
                      streaming results here.
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              <StreamingOutput
                state={state}
                showMetrics={true}
                showDebug={false}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
