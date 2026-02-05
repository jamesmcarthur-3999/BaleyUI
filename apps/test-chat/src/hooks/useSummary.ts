import { useState, useRef, useEffect } from 'react'
import {
  executeBaleybot,
  findBaleybotByName,
  type ChatMessage,
} from '@/lib/baleybot-client'

interface UseSummaryOptions {
  baleybotId?: string
  baleybotName?: string
  messages: ChatMessage[]
  autoTriggerAfter?: number // Number of messages before auto-triggering
}

interface UseSummaryReturn {
  summary: string | null
  lastUpdated: string | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useSummary(options: UseSummaryOptions): UseSummaryReturn {
  const {
    baleybotId,
    baleybotName = 'Conversation Summarizer',
    messages,
    autoTriggerAfter = 5,
  } = options

  const [summary, setSummary] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lastSummarizedCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const summarize = async () => {
    if (isLoading || messages.length === 0) return

    // Build conversation context
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const input = `Create a concise summary of this conversation. Highlight key topics discussed, decisions made, and any action items or follow-ups mentioned. Keep it brief (2-4 sentences).

Conversation:
${conversationText}

Summary:`

    // Find the BaleyBot ID
    let resolvedId = baleybotId
    if (!resolvedId && baleybotName) {
      const bot = await findBaleybotByName(baleybotName)
      if (bot) {
        resolvedId = bot.id
      }
    }

    if (!resolvedId) {
      // Summarizer not configured, silently skip
      return
    }

    setIsLoading(true)
    setError(null)

    abortControllerRef.current = new AbortController()

    let responseText = ''

    try {
      await executeBaleybot(
        resolvedId,
        input,
        {
          onTextDelta: (delta) => {
            responseText += delta
          },
          onError: (err) => {
            setError(err)
          },
        },
        abortControllerRef.current.signal
      )

      if (responseText.trim()) {
        setSummary(responseText.trim())
        setLastUpdated(new Date().toISOString())
        lastSummarizedCountRef.current = messages.length
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Summarizer error:', err)
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  // Auto-trigger when message count threshold is reached
  useEffect(() => {
    const messageCount = messages.length
    const shouldTrigger =
      messageCount > 0 &&
      messageCount >= autoTriggerAfter &&
      (lastSummarizedCountRef.current === 0 ||
        messageCount >= lastSummarizedCountRef.current + autoTriggerAfter)

    if (shouldTrigger) {
      summarize()
    }
  }, [messages.length, autoTriggerAfter])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  return {
    summary,
    lastUpdated,
    isLoading,
    error,
    refresh: summarize,
  }
}
