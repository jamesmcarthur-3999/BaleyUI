import { useState, useRef, useEffect } from 'react'
import {
  executeBaleybot,
  findBaleybotByName,
  type ChatMessage,
} from '@/lib/baleybot-client'
import type { ActivitySuggestion } from '@/components/ActivitySidebar'

interface UseActivityTrackerOptions {
  baleybotId?: string
  baleybotName?: string
  messages: ChatMessage[]
  autoTriggerAfter?: number // Number of messages before auto-triggering
}

interface UseActivityTrackerReturn {
  suggestions: ActivitySuggestion[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useActivityTracker(
  options: UseActivityTrackerOptions
): UseActivityTrackerReturn {
  const {
    baleybotId,
    baleybotName = 'Activity Tracker',
    messages,
    autoTriggerAfter = 3,
  } = options

  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lastAnalyzedCountRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const analyze = async () => {
    if (isLoading || messages.length === 0) return

    // Build conversation context for the activity tracker
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const input = `Analyze this conversation and suggest 1-3 follow-up topics, related questions, or insights the user might find helpful. Format your response as JSON with an array of suggestions, each with "type" (topic|followup|insight) and "content" fields.

Conversation:
${conversationText}

Respond ONLY with valid JSON in this format:
{ "suggestions": [{ "type": "topic", "content": "..." }, ...] }`

    // Find the BaleyBot ID
    let resolvedId = baleybotId
    if (!resolvedId && baleybotName) {
      const bot = await findBaleybotByName(baleybotName)
      if (bot) {
        resolvedId = bot.id
      }
    }

    if (!resolvedId) {
      // Activity tracker not configured, silently skip
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

      // Parse the response
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed.suggestions)) {
            const newSuggestions: ActivitySuggestion[] = parsed.suggestions.map(
              (s: { type: string; content: string }, i: number) => ({
                id: `suggestion-${Date.now()}-${i}`,
                type: s.type as 'topic' | 'followup' | 'insight',
                content: s.content,
                timestamp: new Date().toISOString(),
              })
            )
            setSuggestions(newSuggestions)
          }
        }
      } catch (parseErr) {
        console.error('Failed to parse activity tracker response:', parseErr)
        // Don't show parsing errors to user
      }

      lastAnalyzedCountRef.current = messages.length
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Activity tracker error:', err)
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
      messageCount > lastAnalyzedCountRef.current + autoTriggerAfter - 1

    if (shouldTrigger) {
      analyze()
    }
  }, [messages.length, autoTriggerAfter])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  return {
    suggestions,
    isLoading,
    error,
    refresh: analyze,
  }
}
