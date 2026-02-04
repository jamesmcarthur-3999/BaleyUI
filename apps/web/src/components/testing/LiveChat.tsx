'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Trash2, Loader2 } from 'lucide-react';
import { useBlockStream } from '@/hooks';
import { StreamingText } from '@/components/streaming/StreamingText';
import { ToolCallCard } from '@/components/streaming/ToolCallCard';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    id: string;
    toolName: string;
    arguments: string;
    parsedArguments?: unknown;
    status: 'streaming_args' | 'args_complete' | 'executing' | 'complete' | 'error';
    result?: unknown;
    error?: string;
  }>;
  timestamp: number;
}

interface LiveChatProps {
  blockId: string;
  className?: string;
  onError?: (error: Error) => void;
}

export function LiveChat({ blockId, className, onError }: LiveChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { state, execute, reset, isExecuting } = useBlockStream(blockId, {
    onComplete: (completedState) => {
      // Add assistant message to history
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: completedState.text || '',
        toolCalls: completedState.toolCalls.map((tc) => ({
          id: tc.id,
          toolName: tc.toolName,
          arguments: tc.arguments,
          parsedArguments: tc.parsedArguments,
          status: tc.status,
          result: tc.result,
          error: tc.error,
        })),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: (err) => {
      onError?.(err);
    },
  });

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, state.text]);

  const handleSend = async () => {
    if (!input.trim() || isExecuting) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    // Build conversation history for the block
    const conversationHistory = [...messages, userMessage].map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    try {
      await execute({
        prompt: input.trim(),
        history: conversationHistory,
      });
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error('Failed to send message'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    reset();
  };

  const canSend = input.trim().length > 0 && !isExecuting;

  return (
    <Card className={cn('flex flex-col h-[700px]', className)}>
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Live Chat</CardTitle>
            <CardDescription>
              Multi-turn conversation with the AI block
            </CardDescription>
          </div>
          {messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearHistory}
              disabled={isExecuting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear History
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 space-y-4">
        {/* Messages Area */}
        <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.length === 0 && !isExecuting && (
              <div className="flex items-center justify-center h-full py-12 text-center">
                <div>
                  <p className="text-muted-foreground">
                    Start a conversation by typing a message below
                  </p>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex flex-col gap-2',
                  message.role === 'user' ? 'items-end' : 'items-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-4 py-3 text-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {message.content}
                  </div>
                </div>

                {/* Tool Calls */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="w-full max-w-[80%] space-y-2">
                    {message.toolCalls.map((toolCall) => (
                      <ToolCallCard
                        key={toolCall.id}
                        toolCall={toolCall}
                        className="text-xs"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Current streaming response */}
            {isExecuting && state.text && (
              <div className="flex flex-col gap-2 items-start">
                <div className="max-w-[80%] rounded-lg px-4 py-3 text-sm bg-muted">
                  <StreamingText
                    text={state.text}
                    isStreaming={state.status === 'streaming'}
                    showCursor={true}
                  />
                </div>

                {/* Current streaming tool calls */}
                {state.toolCalls.length > 0 && (
                  <div className="w-full max-w-[80%] space-y-2">
                    {state.toolCalls.map((toolCall) => (
                      <ToolCallCard
                        key={toolCall.id}
                        toolCall={toolCall}
                        className="text-xs"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="flex-shrink-0 space-y-2 border-t pt-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for new line)"
              rows={3}
              disabled={isExecuting}
              className="resize-none"
            />
            <Button
              onClick={handleSend}
              disabled={!canSend}
              size="icon"
              className="flex-shrink-0"
              aria-label={isExecuting ? 'Sending message' : 'Send message'}
            >
              {isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
