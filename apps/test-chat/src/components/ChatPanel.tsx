import { useEffect, useRef } from 'react'
import { Bot, User, Globe, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage, ToolExecution } from '@/lib/baleybot-client'

interface ChatPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function ToolExecutionCard({ tool }: { tool: ToolExecution }) {
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {tool.name === 'web_search' && <Globe className="h-4 w-4" />}
        {tool.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
        <span className="capitalize">{tool.name.replace(/_/g, ' ')}</span>
        {tool.status === 'completed' && (
          <span className="ml-auto text-xs text-green-600">Done</span>
        )}
      </div>
      {tool.arguments !== undefined && (
        <div className="mt-1 text-xs text-muted-foreground">
          {formatValue(tool.arguments)}
        </div>
      )}
      {tool.result !== undefined && (
        <div className="mt-2 max-h-32 overflow-auto rounded bg-background p-2 text-xs">
          <pre className="whitespace-pre-wrap">
            {formatValue(tool.result)}
          </pre>
        </div>
      )}
    </div>
  )
}

function MessageBubble({
  message,
  isStreaming,
  streamingContent,
}: {
  message: ChatMessage
  isStreaming?: boolean
  streamingContent?: string
}) {
  const isUser = message.role === 'user'
  const content = isStreaming ? streamingContent : message.content

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div
        className={cn(
          'flex max-w-[80%] flex-col gap-1 rounded-lg px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        )}
      >
        <div
          className={cn(
            'text-sm leading-relaxed whitespace-pre-wrap',
            isStreaming && !content && 'flex items-center gap-1'
          )}
        >
          {content || (
            <>
              <span className="typing-dot inline-block h-2 w-2 rounded-full bg-current" />
              <span className="typing-dot inline-block h-2 w-2 rounded-full bg-current" />
              <span className="typing-dot inline-block h-2 w-2 rounded-full bg-current" />
            </>
          )}
          {isStreaming && content && (
            <span className="streaming-cursor" />
          )}
        </div>
        {message.tools && message.tools.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.tools.map((tool, i) => (
              <ToolExecutionCard key={tool.id || i} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatPanel({
  messages,
  isStreaming,
  streamingContent,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-6"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">Chat Companion</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A helpful assistant powered by BaleyBots.
              <br />
              Ask anything - I can search the web too!
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <MessageBubble
              key={message.id || index}
              message={message}
              isStreaming={
                isStreaming &&
                index === messages.length - 1 &&
                message.role === 'assistant'
              }
              streamingContent={
                index === messages.length - 1 &&
                message.role === 'assistant'
                  ? streamingContent
                  : undefined
              }
            />
          ))
        )}
        {isStreaming &&
          (messages.length === 0 ||
            messages[messages.length - 1].role === 'user') && (
            <MessageBubble
              message={{
                id: 'streaming',
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
              }}
              isStreaming
              streamingContent={streamingContent}
            />
          )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
