'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { StreamingText } from '@/components/streaming/StreamingText';
import { StreamingJSON } from '@/components/streaming/StreamingJSON';
import { cn } from '@/lib/utils';

interface TestOutputProps {
  output: string | object | null;
  isStreaming?: boolean;
  format?: 'text' | 'json' | 'auto';
  className?: string;
  title?: string;
  description?: string;
  showCopy?: boolean;
  maxHeight?: string;
}

export function TestOutput({
  output,
  isStreaming = false,
  format = 'auto',
  className,
  title = 'Output',
  description = 'Response from the block',
  showCopy = true,
  maxHeight = '400px',
}: TestOutputProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Determine the actual format
  const actualFormat =
    format === 'auto'
      ? typeof output === 'object'
        ? 'json'
        : 'text'
      : format;

  // Get output as string
  const outputString =
    typeof output === 'string'
      ? output
      : output !== null
      ? JSON.stringify(output, null, 2)
      : '';

  const handleCopy = async () => {
    if (!outputString) return;

    try {
      await navigator.clipboard.writeText(outputString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const isEmpty = !output || outputString.trim() === '';

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 hover:bg-transparent"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              {description && (
                <CardDescription className="text-xs mt-0.5">
                  {description}
                </CardDescription>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isStreaming && (
              <Badge variant="secondary" className="text-xs">
                Streaming...
              </Badge>
            )}
            {showCopy && !isEmpty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-8 w-8 p-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          {isEmpty ? (
            <div className="flex items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {isStreaming ? 'Waiting for response...' : 'No output yet'}
              </p>
            </div>
          ) : (
            <ScrollArea
              className="w-full rounded-md border"
              style={{ height: maxHeight }}
            >
              <div className="p-4">
                {actualFormat === 'json' ? (
                  <StreamingJSON json={outputString} isStreaming={isStreaming} />
                ) : (
                  <StreamingText
                    text={outputString}
                    isStreaming={isStreaming}
                    showCursor={isStreaming}
                  />
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface TestOutputWithTabsProps {
  textOutput?: string;
  structuredOutput?: object | string | null;
  reasoning?: string;
  isStreaming?: boolean;
  className?: string;
  maxHeight?: string;
}

export function TestOutputWithTabs({
  textOutput,
  structuredOutput,
  reasoning,
  isStreaming = false,
  className,
  maxHeight = '400px',
}: TestOutputWithTabsProps) {
  const hasText = textOutput && textOutput.trim().length > 0;
  const hasStructured = structuredOutput !== null && structuredOutput !== undefined;
  const hasReasoning = reasoning && reasoning.trim().length > 0;

  if (!hasText && !hasStructured && !hasReasoning) {
    return (
      <Card className={className}>
        <CardContent className="py-12">
          <div className="flex items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              {isStreaming ? 'Waiting for response...' : 'No output yet'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const defaultTab = hasText ? 'text' : hasStructured ? 'structured' : 'reasoning';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Output</CardTitle>
        <CardDescription>Response from the block</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            {hasText && <TabsTrigger value="text">Text</TabsTrigger>}
            {hasStructured && <TabsTrigger value="structured">Structured</TabsTrigger>}
            {hasReasoning && <TabsTrigger value="reasoning">Reasoning</TabsTrigger>}
          </TabsList>

          {hasText && (
            <TabsContent value="text">
              <ScrollArea className="w-full rounded-md border" style={{ height: maxHeight }}>
                <div className="p-4">
                  <StreamingText
                    text={textOutput}
                    isStreaming={isStreaming}
                    showCursor={isStreaming}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {hasStructured && (
            <TabsContent value="structured">
              <ScrollArea className="w-full rounded-md border" style={{ height: maxHeight }}>
                <div className="p-4">
                  <StreamingJSON
                    json={
                      typeof structuredOutput === 'string'
                        ? structuredOutput
                        : JSON.stringify(structuredOutput, null, 2)
                    }
                    isStreaming={isStreaming}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {hasReasoning && (
            <TabsContent value="reasoning">
              <ScrollArea className="w-full rounded-md border" style={{ height: maxHeight }}>
                <div className="p-4">
                  <StreamingText
                    text={reasoning}
                    isStreaming={isStreaming}
                    showCursor={isStreaming}
                    className="text-muted-foreground italic"
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
