'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Loader2, Bot, User, Rocket, Pause, Play, Shield, Copy, Check } from 'lucide-react';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import { IntegrationKitCard } from './IntegrationKitCard';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';
import { cn } from '@/lib/utils';
import type { TriggerConfig } from '@/lib/baleybot/types';

// ============================================================================
// TYPES
// ============================================================================

interface IntegrationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

type IntegrationStreamEvent =
  | { type: 'integration_stream_started'; timestamp: number }
  | { type: 'integration_heartbeat'; timestamp: number }
  | { type: 'integration_text_delta'; content: string; timestamp: number }
  | { type: 'integration_agent_event'; toolName: string; result: unknown; timestamp: number }
  | { type: 'integration_trigger_saved'; triggerConfig: TriggerConfig; timestamp: number }
  | { type: 'integration_webhook_enabled'; webhookUrl: string; webhookSecret: string; timestamp: number }
  | { type: 'integration_complete'; output: string; timestamp: number }
  | { type: 'integration_error'; message: string; timestamp: number };

interface IntegrationConversationProps {
  baleybotId: string;
  baleybotName: string;
  lifecycleStage?: string;
  onTriggerSaved?: (config: TriggerConfig) => void;
  onGoLive?: () => void;
  onGenerateLaunchKit?: () => void;
  onPauseOrResume?: () => void;
  isLaunchBusy?: boolean;
  className?: string;
}

// ============================================================================
// CODE BLOCK PARSER
// ============================================================================

interface CodeBlock {
  language: string;
  code: string;
  title?: string;
}

function extractCodeBlocks(content: string): { segments: Array<{ type: 'text'; content: string } | { type: 'code'; block: CodeBlock }>} {
  const segments: Array<{ type: 'text'; content: string } | { type: 'code'; block: CodeBlock }> = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: 'text', content: text });
    }

    const language = match[1] || 'text';
    const code = match[2]!.trim();

    segments.push({
      type: 'code',
      block: { language, code, title: guessCodeTitle(language, code) },
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) segments.push({ type: 'text', content: text });
  }

  // If no code blocks found, return the whole thing as text
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: 'text', content });
  }

  return { segments };
}

function guessCodeTitle(language: string, code: string): string {
  if (code.includes('curl')) return 'API Request';
  if (code.includes('fetch(') || code.includes('axios')) return 'API Integration';
  if (code.includes('webhook') || code.includes('x-webhook-secret')) return 'Webhook Setup';
  if (code.includes('cron') || code.includes('schedule')) return 'Schedule Configuration';
  if (language === 'bash' || language === 'sh') return 'Terminal Command';
  if (language === 'json') return 'Configuration';
  if (language === 'html') return 'Embed Code';
  return 'Code Snippet';
}

function guessIntegrationType(language: string, code: string): 'embed' | 'api' | 'webhook' | 'schedule' | 'db_trigger' | 'chain' {
  if (code.includes('iframe') || code.includes('<script')) return 'embed';
  if (code.includes('webhook') || code.includes('x-webhook-secret')) return 'webhook';
  if (code.includes('cron') || code.includes('schedule')) return 'schedule';
  if (code.includes('db_event') || code.includes('database')) return 'db_trigger';
  if (code.includes('spawn_baleybot') || code.includes('chain')) return 'chain';
  return 'api';
}

// ============================================================================
// WEBHOOK SECRET CARD
// ============================================================================

function WebhookSecretCard({ webhookUrl, webhookSecret }: { webhookUrl: string; webhookSecret: string }) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden my-3">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b bg-amber-500/10">
        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Webhook Enabled</span>
      </div>
      <div className="p-3.5 space-y-3">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-1">Webhook URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted/50 rounded px-2 py-1 truncate">{webhookUrl}</code>
            <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => copyToClipboard(webhookUrl, setCopiedUrl)}>
              {copiedUrl ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-1">
            Secret <span className="text-amber-600 dark:text-amber-400">(shown once)</span>
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted/50 rounded px-2 py-1 font-mono">{webhookSecret}</code>
            <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => copyToClipboard(webhookSecret, setCopiedSecret)}>
              {copiedSecret ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Include the secret as <code className="text-[10px]">x-webhook-secret</code> header in your requests.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function IntegrationConversation({
  baleybotId,
  baleybotName,
  lifecycleStage,
  onTriggerSaved,
  onGoLive,
  onGenerateLaunchKit,
  onPauseOrResume,
  isLaunchBusy,
  className,
}: IntegrationConversationProps) {
  const [messages, setMessages] = useState<IntegrationMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [webhookCards, setWebhookCards] = useState<Array<{ url: string; secret: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const greetingSentRef = useRef(false);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Send initial greeting on mount (ref prevents duplicate on re-mount)
  useEffect(() => {
    if (!greetingSentRef.current) {
      greetingSentRef.current = true;
      handleSend(`I'd like to integrate my BaleyBot "${baleybotName}". What are my options?`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (text?: string) => {
    const content = text ?? inputValue.trim();
    if (!content || isStreaming) return;

    setInputValue('');
    const userMessage: IntegrationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setStreamingContent('');

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = '';

    try {
      await streamPostSSE<IntegrationStreamEvent>({
        url: `/api/baleybots/${baleybotId}/integrate-stream`,
        body: {
          message: content,
          conversationHistory: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        },
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'integration_text_delta') {
            accumulated += event.content;
            setStreamingContent(accumulated);
          }
          if (event.type === 'integration_trigger_saved') {
            // Notify parent to update trigger config state
            const config = (event as IntegrationStreamEvent & { type: 'integration_trigger_saved' }).triggerConfig;
            onTriggerSaved?.(config);
          }
          if (event.type === 'integration_webhook_enabled') {
            const evt = event as IntegrationStreamEvent & { type: 'integration_webhook_enabled' };
            setWebhookCards(prev => [...prev, { url: evt.webhookUrl, secret: evt.webhookSecret }]);
          }
          if (event.type === 'integration_complete') {
            // If we got no deltas, use the complete output
            if (!accumulated && event.output) {
              accumulated = event.output;
              setStreamingContent(accumulated);
            }
          }
          if (event.type === 'integration_error') {
            accumulated += `\n\n**Error:** ${event.message}`;
            setStreamingContent(accumulated);
          }
        },
        onDone: () => {
          if (accumulated) {
            setMessages(prev => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: accumulated,
                timestamp: Date.now(),
              },
            ]);
          }
          setStreamingContent('');
          setIsStreaming(false);
        },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMsg}. Please try again.`,
          timestamp: Date.now(),
        },
      ]);
      setStreamingContent('');
      setIsStreaming(false);
    }
  };

  const renderAssistantContent = (content: string) => {
    const { segments } = extractCodeBlocks(content);

    return (
      <div className="space-y-2">
        {segments.map((segment, i) => {
          if (segment.type === 'text') {
            return <StreamdownMarkdown key={i} text={segment.content} />;
          }
          return (
            <IntegrationKitCard
              key={i}
              type={guessIntegrationType(segment.block.language, segment.block.code)}
              title={segment.block.title ?? 'Code'}
              code={segment.block.code}
              language={segment.block.language}
            />
          );
        })}
      </div>
    );
  };

  const showGoLiveAction = onGoLive && lifecycleStage !== 'live' && lifecycleStage !== 'paused' && messages.length >= 2;
  const showPauseResumeAction = onPauseOrResume && (lifecycleStage === 'live' || lifecycleStage === 'paused');

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b">
        <p className="text-sm font-medium">Integration Guide</p>
        <p className="text-[11px] text-muted-foreground">
          AI-guided setup for deploying {baleybotName}
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex items-start gap-2',
              msg.role === 'user' && 'flex-row-reverse'
            )}
          >
            <div
              className={cn(
                'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}
            >
              {msg.role === 'user' ? (
                <User className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </div>
            <div
              className={cn(
                'rounded-xl px-3.5 py-2.5 max-w-[85%] text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50'
              )}
            >
              {msg.role === 'assistant' ? (
                renderAssistantContent(msg.content)
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Webhook secret cards (shown inline after the AI mentions webhooks) */}
        {webhookCards.map((card, i) => (
          <WebhookSecretCard key={i} webhookUrl={card.url} webhookSecret={card.secret} />
        ))}

        {/* Streaming indicator */}
        {isStreaming && streamingContent && (
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-xl px-3.5 py-2.5 max-w-[85%] text-sm bg-muted/50">
              {renderAssistantContent(streamingContent)}
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      {/* Lifecycle action bar (Gap 1: Go Live / Pause / Resume) */}
      {(showGoLiveAction || showPauseResumeAction) && (
        <div className="shrink-0 px-4 py-3 border-t bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            {showGoLiveAction && (
              <>
                <p className="text-xs text-muted-foreground">
                  Ready to go live? This will activate your bot for production use.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {onGenerateLaunchKit && lifecycleStage !== 'launch_prepared' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onGenerateLaunchKit}
                      disabled={isLaunchBusy}
                      className="h-8 text-xs gap-1.5"
                    >
                      {isLaunchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                      Prepare Launch
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={onGoLive}
                    disabled={isLaunchBusy}
                    className="h-8 text-xs gap-1.5"
                  >
                    {isLaunchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                    Go Live
                  </Button>
                </div>
              </>
            )}
            {showPauseResumeAction && (
              <>
                <p className="text-xs text-muted-foreground">
                  {lifecycleStage === 'live' ? 'Your bot is live.' : 'Your bot is paused.'}
                </p>
                <Button
                  size="sm"
                  variant={lifecycleStage === 'live' ? 'outline' : 'default'}
                  onClick={onPauseOrResume}
                  disabled={isLaunchBusy}
                  className="h-8 text-xs gap-1.5"
                >
                  {lifecycleStage === 'live' ? (
                    <><Pause className="h-3.5 w-3.5" /> Pause</>
                  ) : (
                    <><Play className="h-3.5 w-3.5" /> Resume</>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Tell me where you want to deploy this bot..."
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            disabled={isStreaming}
          />
          <Button
            size="sm"
            onClick={() => handleSend()}
            disabled={isStreaming || !inputValue.trim()}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
