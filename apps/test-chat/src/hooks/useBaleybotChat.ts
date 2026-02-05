import { useState, useRef } from 'react'
import {
  executeBaleybot,
  findBaleybotByName,
  type ChatMessage,
  type ToolExecution,
} from '@/lib/baleybot-client'

interface UseBaleybotChatOptions {
  baleybotId?: string
  baleybotName?: string
  onMessageComplete?: (messages: ChatMessage[]) => void
}

interface UseBaleybotChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  currentTools: ToolExecution[]
  error: string | null
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
}

export function useBaleybotChat(
  options: UseBaleybotChatOptions = {}
): UseBaleybotChatReturn {
  const { baleybotId, baleybotName, onMessageComplete } = options

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [currentTools, setCurrentTools] = useState<ToolExecution[]>([])
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const toolArgsRef = useRef<Map<string, string>>(new Map())

  const sendMessage = async (content: string) => {
    if (isStreaming) return

    setError(null)
    setIsStreaming(true)
    setStreamingContent('')
    setCurrentTools([])
    toolArgsRef.current.clear()

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])

    // Find the BaleyBot ID if only name was provided
    let resolvedId = baleybotId
    if (!resolvedId && baleybotName) {
      const bot = await findBaleybotByName(baleybotName)
      if (bot) {
        resolvedId = bot.id
      }
    }

    if (!resolvedId) {
      setError('No BaleyBot configured')
      setIsStreaming(false)
      return
    }

    // Create abort controller
    abortControllerRef.current = new AbortController()

    let finalContent = ''
    let executionId: string | undefined

    try {
      await executeBaleybot(
        resolvedId,
        content,
        {
          onExecutionStarted: (id) => {
            executionId = id
          },

          onTextDelta: (delta) => {
            finalContent += delta
            setStreamingContent(finalContent)
          },

          onToolStart: (id, toolName) => {
            setCurrentTools((prev) => [
              ...prev,
              {
                id,
                name: toolName,
                status: 'pending',
              },
            ])
            toolArgsRef.current.set(id, '')
          },

          onToolArgsDelta: (id, delta) => {
            const current = toolArgsRef.current.get(id) || ''
            toolArgsRef.current.set(id, current + delta)
          },

          onToolComplete: (id, _toolName, args) => {
            setCurrentTools((prev) =>
              prev.map((t) =>
                t.id === id ? { ...t, arguments: args, status: 'running' } : t
              )
            )
          },

          onToolExecStart: (id, _toolName, args) => {
            setCurrentTools((prev) =>
              prev.map((t) =>
                t.id === id ? { ...t, arguments: args, status: 'running' } : t
              )
            )
          },

          onToolExecOutput: (id, _toolName, result, error) => {
            setCurrentTools((prev) =>
              prev.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      result,
                      error,
                      status: error ? 'error' : 'completed',
                    }
                  : t
              )
            )
          },

          onNestedEvent: (nestedEvent, childBotName) => {
            // Handle nested events from spawned bots
            if (nestedEvent.type === 'text_delta') {
              // Prefix with child bot name if available
              const prefix = childBotName ? `[${childBotName}] ` : ''
              finalContent += prefix + nestedEvent.content
              setStreamingContent(finalContent)
            }
          },

          onDone: (_reason, _durationMs) => {
            // Streaming complete
          },

          onError: (errorMsg) => {
            setError(errorMsg)
          },
        },
        abortControllerRef.current.signal
      )

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: executionId || crypto.randomUUID(),
        role: 'assistant',
        content: finalContent,
        timestamp: new Date().toISOString(),
        tools: currentTools.length > 0 ? [...currentTools] : undefined,
      }

      setMessages((prev) => {
        const updated = [...prev, assistantMessage]
        onMessageComplete?.(updated)
        return updated
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled, don't show error
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
      }
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      setCurrentTools([])
      abortControllerRef.current = null
    }
  }

  const clearMessages = () => {
    setMessages([])
    setError(null)
  }

  return {
    messages,
    isStreaming,
    streamingContent,
    currentTools,
    error,
    sendMessage,
    clearMessages,
  }
}
