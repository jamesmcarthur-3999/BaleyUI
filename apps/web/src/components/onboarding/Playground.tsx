'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RefreshCw,
  Settings,
  Code,
  MessageCircle,
  Sparkles,
  Loader2,
  Check,
  ChevronRight,
  Copy,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface PlaygroundConfig {
  name: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

interface PlaygroundMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface PlaygroundProps {
  initialConfig?: Partial<PlaygroundConfig>;
  onSaveAgent?: (config: PlaygroundConfig) => void;
  className?: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const defaultConfig: PlaygroundConfig = {
  name: 'My First Agent',
  systemPrompt: 'You are a helpful assistant. Answer questions clearly and concisely.',
  temperature: 0.7,
  maxTokens: 1024,
};

// ============================================================================
// CONFIG PANEL
// ============================================================================

function ConfigPanel({
  config,
  onChange,
}: {
  config: PlaygroundConfig;
  onChange: (config: PlaygroundConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Agent Name</label>
        <Input
          value={config.name}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          placeholder="Enter agent name"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">System Prompt</label>
        <Textarea
          value={config.systemPrompt}
          onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
          placeholder="Describe your agent's behavior..."
          className="min-h-[150px]"
        />
        <p className="text-xs text-muted-foreground">
          This tells the AI how to behave. Start with &quot;You are...&quot;
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Temperature ({config.temperature.toFixed(1)})
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={config.temperature}
            onChange={(e) =>
              onChange({ ...config, temperature: parseFloat(e.target.value) })
            }
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Higher = more creative, Lower = more focused
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Max Tokens</label>
          <Input
            type="number"
            min="100"
            max="4096"
            value={config.maxTokens}
            onChange={(e) =>
              onChange({ ...config, maxTokens: parseInt(e.target.value) || 1024 })
            }
          />
          <p className="text-xs text-muted-foreground">
            Maximum response length
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CHAT PANEL
// ============================================================================

function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
}: {
  messages: PlaygroundMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h4 className="font-medium">Test your agent</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Send a message to see how your agent responds
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' && 'flex-row-reverse'
                )}
              >
                <div
                  className={cn(
                    'rounded-lg px-4 py-2 max-w-[80%]',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : message.role === 'system'
                        ? 'bg-muted text-muted-foreground text-sm italic'
                        : 'bg-muted'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-3">
              <div className="rounded-lg bg-muted px-4 py-2">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message to test your agent..."
            className="min-h-[44px] max-h-[120px] resize-none"
            rows={1}
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={!input.trim() || isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CODE PREVIEW
// ============================================================================

function CodePreview({ config }: { config: PlaygroundConfig }) {
  const [copied, setCopied] = useState(false);

  const code = `{
  "name": "${config.name}",
  "type": "ai",
  "systemPrompt": "${config.systemPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}",
  "config": {
    "temperature": ${config.temperature},
    "maxTokens": ${config.maxTokens}
  },
  "tools": []
}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
      <pre className="p-4 rounded-lg bg-muted overflow-auto text-sm">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Playground({
  initialConfig,
  onSaveAgent,
  className,
}: PlaygroundProps) {
  const [config, setConfig] = useState<PlaygroundConfig>({
    ...defaultConfig,
    ...initialConfig,
  });
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');

  // Simulate agent response (in production, this would call the AI)
  const handleSendMessage = async (content: string) => {
    const userMessage: PlaygroundMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    const responses: [string, ...string[]] = [
      `I understand you're asking about "${content}". Based on my configuration, I'll provide a helpful response.`,
      `That's an interesting question! Let me think about "${content.slice(0, 30)}..." and provide a thoughtful answer.`,
      `Thanks for your message. As your ${config.name}, I'm happy to help with this request.`,
    ];

    const randomIndex = Math.floor(Math.random() * responses.length);
    const responseContent = responses[randomIndex] ?? responses[0];

    const assistantMessage: PlaygroundMessage = {
      id: `msg-${Date.now()}-response`,
      role: 'assistant',
      content: responseContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);
  };

  const handleReset = () => {
    setMessages([]);
    setConfig({ ...defaultConfig, ...initialConfig });
  };

  const handleSave = () => {
    onSaveAgent?.(config);
  };

  return (
    <div className={cn('border rounded-lg overflow-hidden bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Agent Playground</h3>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          {onSaveAgent && (
            <Button size="sm" onClick={handleSave}>
              <Check className="h-4 w-4 mr-1" />
              Save Agent
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid md:grid-cols-2 min-h-[500px]">
        {/* Left Panel - Configuration */}
        <div className="border-r">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="px-4 py-2 border-b">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="chat" className="gap-1.5">
                  <MessageCircle className="h-4 w-4" />
                  Test Chat
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-1.5">
                  <Settings className="h-4 w-4" />
                  Configure
                </TabsTrigger>
                <TabsTrigger value="code" className="gap-1.5">
                  <Code className="h-4 w-4" />
                  Code
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="chat" className="mt-0 h-[450px]">
              <ChatPanel
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
              />
            </TabsContent>

            <TabsContent value="config" className="mt-0 p-4">
              <ConfigPanel config={config} onChange={setConfig} />
            </TabsContent>

            <TabsContent value="code" className="mt-0 p-4">
              <CodePreview config={config} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Preview/Tips */}
        <div className="p-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Tips for Your Agent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  Start with &quot;You are...&quot; to establish identity
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  Be specific about the agent&apos;s role and expertise
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  Include guidelines for tone and style
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  Add constraints if needed (what NOT to do)
                </li>
              </ul>

              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Current Settings</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{config.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Temperature:</span>
                    <span className="font-medium">{config.temperature}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Tokens:</span>
                    <span className="font-medium">{config.maxTokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prompt Length:</span>
                    <span className="font-medium">{config.systemPrompt.length} chars</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {messages.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Session Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messages:</span>
                    <span className="font-medium">{messages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User:</span>
                    <span className="font-medium">
                      {messages.filter((m) => m.role === 'user').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assistant:</span>
                    <span className="font-medium">
                      {messages.filter((m) => m.role === 'assistant').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
