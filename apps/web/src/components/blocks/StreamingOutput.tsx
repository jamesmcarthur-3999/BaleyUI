'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, FileJson, FileText, Brain, Wrench } from 'lucide-react';
import { StreamingText } from '@/components/streaming/StreamingText';
import { StreamingJSON } from '@/components/streaming/StreamingJSON';
import { ToolCallCard } from '@/components/streaming/ToolCallCard';
import { StreamMetrics } from '@/components/streaming/StreamMetrics';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { StreamState } from '@/lib/streaming/types/state';

interface StreamingOutputProps {
  state: StreamState;
  className?: string;
  maxHeight?: string;
  showMetrics?: boolean;
  showDebug?: boolean;
}

export function StreamingOutput({
  state,
  className,
  maxHeight = '500px',
  showMetrics = true,
  showDebug = false,
}: StreamingOutputProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('text');

  const hasText = state.text && state.text.trim().length > 0;
  const hasStructured = state.structuredOutput !== null && state.structuredOutput !== undefined;
  const hasReasoning = state.reasoning && state.reasoning.trim().length > 0;
  const hasToolCalls = state.toolCalls.length > 0;
  const isStreaming = state.status === 'streaming' || state.status === 'connecting';

  // Automatically select first available tab
  const defaultTab = hasText ? 'text' : hasStructured ? 'structured' : hasReasoning ? 'reasoning' : 'tools';

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getCopyContent = () => {
    if (activeTab === 'text') return state.text;
    if (activeTab === 'structured') {
      return typeof state.structuredOutput === 'string'
        ? state.structuredOutput
        : JSON.stringify(state.structuredOutput, null, 2);
    }
    if (activeTab === 'reasoning') return state.reasoning;
    if (activeTab === 'tools') {
      return JSON.stringify(state.toolCalls, null, 2);
    }
    return '';
  };

  // Show empty state if nothing to display
  if (!hasText && !hasStructured && !hasReasoning && !hasToolCalls) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>Real-time streaming output from block execution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-center">
            <div>
              <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {isStreaming ? 'Waiting for response...' : 'No output yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isStreaming ? 'Stream is connecting...' : 'Execute the block to see results'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Output</CardTitle>
            <CardDescription>Real-time streaming output from block execution</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isStreaming && (
              <Badge variant="secondary" className="text-xs">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse mr-2" />
                Streaming
              </Badge>
            )}
            {state.status === 'complete' && (
              <Badge variant="connected" className="text-xs">
                Complete
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(getCopyContent())}
              className="h-8 w-8 p-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab || defaultTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            {hasText && (
              <TabsTrigger value="text" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Text</span>
              </TabsTrigger>
            )}
            {hasStructured && (
              <TabsTrigger value="structured" className="flex items-center gap-2">
                <FileJson className="h-4 w-4" />
                <span className="hidden sm:inline">Structured</span>
              </TabsTrigger>
            )}
            {hasReasoning && (
              <TabsTrigger value="reasoning" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <span className="hidden sm:inline">Reasoning</span>
              </TabsTrigger>
            )}
            {hasToolCalls && (
              <TabsTrigger value="tools" className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                <span className="hidden sm:inline">Tools</span>
                <Badge variant="secondary" className="ml-1 text-xs">
                  {state.toolCalls.length}
                </Badge>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Text Output Tab */}
          {hasText && (
            <TabsContent value="text" className="mt-4">
              <ScrollArea
                className="w-full rounded-md border bg-muted/30"
                style={{ height: maxHeight }}
              >
                <div className="p-4">
                  <StreamingText
                    text={state.text}
                    isStreaming={isStreaming}
                    showCursor={isStreaming}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* Structured Output Tab */}
          {hasStructured && (
            <TabsContent value="structured" className="mt-4">
              <ScrollArea
                className="w-full rounded-md border bg-muted/30"
                style={{ height: maxHeight }}
              >
                <div className="p-4">
                  <StreamingJSON
                    json={
                      typeof state.structuredOutput === 'string'
                        ? state.structuredOutput
                        : JSON.stringify(state.structuredOutput, null, 2)
                    }
                    isStreaming={isStreaming && !state.structuredOutputComplete}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* Reasoning Tab */}
          {hasReasoning && (
            <TabsContent value="reasoning" className="mt-4">
              <ScrollArea
                className="w-full rounded-md border bg-muted/30"
                style={{ height: maxHeight }}
              >
                <div className="p-4">
                  <StreamingText
                    text={state.reasoning}
                    isStreaming={isStreaming}
                    showCursor={isStreaming}
                    className="text-muted-foreground italic"
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* Tool Calls Tab */}
          {hasToolCalls && (
            <TabsContent value="tools" className="mt-4">
              <ScrollArea
                className="w-full rounded-md"
                style={{ height: maxHeight }}
              >
                <div className="space-y-3">
                  {state.toolCalls.map((toolCall) => (
                    <ToolCallCard key={toolCall.id} toolCall={toolCall} />
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>

        {/* Metrics Section */}
        {showMetrics && state.metrics.totalTokens > 0 && (
          <div className="mt-4 pt-4 border-t">
            <StreamMetrics
              metrics={{
                ttft: state.metrics.ttft,
                tokensPerSec: state.metrics.tokensPerSecond,
                totalTokens: state.metrics.totalTokens,
              }}
            />
          </div>
        )}

        {/* Debug Section */}
        {showDebug && (
          <div className="mt-4 pt-4 border-t">
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Debug Information
              </summary>
              <ScrollArea className="mt-2 h-[200px] w-full rounded-md border p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(state, null, 2)}
                </pre>
              </ScrollArea>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
