/**
 * BaleyBot API Client
 *
 * Connects to BaleyUI's API to execute BaleyBots with SSE streaming.
 */

// API key from environment
const API_KEY = import.meta.env.VITE_BALEYUI_API_KEY as string | undefined

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`
  }
  return headers
}

// Types for the client
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  tools?: ToolExecution[]
}

export interface ToolExecution {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  arguments?: unknown
  result?: unknown
  error?: string
}

export interface BaleybotConfig {
  id: string
  name: string
}

// Event types from BaleyUI's streaming API
export type StreamEvent =
  | { type: 'execution_started'; executionId: string; replay?: boolean }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_stream_start'; id: string; toolName: string }
  | { type: 'tool_call_arguments_delta'; id: string; argumentsDelta: string }
  | { type: 'tool_call_stream_complete'; id: string; toolName: string; arguments: unknown }
  | { type: 'tool_execution_start'; id: string; toolName: string; arguments: unknown }
  | { type: 'tool_execution_output'; id: string; toolName: string; result: unknown; error?: string }
  | { type: 'tool_execution_stream'; toolName: string; nestedEvent: StreamEvent; childBotName?: string; toolCallId?: string }
  | { type: 'done'; reason: string; agent_id?: string; timestamp?: string; duration_ms?: number }
  | { type: 'error'; error: string }
  | { type: 'execution_result'; status: string; output?: unknown; error?: string; durationMs?: number }
  // SDK execution events
  | { type: 'parsing'; message: string }
  | { type: 'compiled'; entities: string[]; structure: unknown }
  | { type: 'started'; input: unknown }
  | { type: 'completed'; result: unknown }
  | { type: 'cancelled' }

export interface StreamCallbacks {
  onTextDelta?: (content: string) => void
  onToolStart?: (id: string, toolName: string) => void
  onToolArgsDelta?: (id: string, delta: string) => void
  onToolComplete?: (id: string, toolName: string, args: unknown) => void
  onToolExecStart?: (id: string, toolName: string, args: unknown) => void
  onToolExecOutput?: (id: string, toolName: string, result: unknown, error?: string) => void
  onNestedEvent?: (event: StreamEvent, childBotName?: string) => void
  onDone?: (reason: string, durationMs?: number) => void
  onError?: (error: string) => void
  onExecutionStarted?: (executionId: string) => void
  onCompleted?: (result: unknown) => void
}

/**
 * Execute a BaleyBot and stream the response
 */
export async function executeBaleybot(
  baleybotId: string,
  input: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`/api/baleybots/${baleybotId}/execute-stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ input }),
    signal,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to execute BaleyBot: ${response.status} ${text}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()

        if (data === '[DONE]') {
          return
        }

        try {
          const event = JSON.parse(data) as StreamEvent
          handleStreamEvent(event, callbacks)
        } catch (e) {
          console.error('Failed to parse SSE event:', e, data)
        }
      }
    }
  }
}

function handleStreamEvent(event: StreamEvent, callbacks: StreamCallbacks): void {
  switch (event.type) {
    case 'execution_started':
      callbacks.onExecutionStarted?.(event.executionId)
      break

    case 'text_delta':
      callbacks.onTextDelta?.(event.content)
      break

    case 'tool_call_stream_start':
      callbacks.onToolStart?.(event.id, event.toolName)
      break

    case 'tool_call_arguments_delta':
      callbacks.onToolArgsDelta?.(event.id, event.argumentsDelta)
      break

    case 'tool_call_stream_complete':
      callbacks.onToolComplete?.(event.id, event.toolName, event.arguments)
      break

    case 'tool_execution_start':
      callbacks.onToolExecStart?.(event.id, event.toolName, event.arguments)
      break

    case 'tool_execution_output':
      callbacks.onToolExecOutput?.(event.id, event.toolName, event.result, event.error)
      break

    case 'tool_execution_stream':
      callbacks.onNestedEvent?.(event.nestedEvent, event.childBotName)
      break

    case 'done':
      callbacks.onDone?.(event.reason, event.duration_ms)
      break

    case 'error':
      callbacks.onError?.(event.error)
      break

    case 'execution_result':
      // This is the final result, typically sent after done
      if (event.error) {
        callbacks.onError?.(event.error)
      }
      break

    case 'completed':
      // SDK completed event with full result
      callbacks.onCompleted?.(event.result)
      // Also treat result as text delta if it's a string
      if (typeof event.result === 'string') {
        callbacks.onTextDelta?.(event.result)
      }
      break

    case 'parsing':
    case 'compiled':
    case 'started':
    case 'cancelled':
      // Informational events, no action needed
      break
  }
}

/**
 * Fetch list of available BaleyBots
 * Uses TRPC API endpoint
 */
export async function listBaleybots(): Promise<BaleybotConfig[]> {
  // The app proxies to BaleyUI, so we use the TRPC endpoint
  const response = await fetch('/api/trpc/baleybots.list?batch=1&input={}', {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    console.error('Failed to fetch baleybots:', response.status)
    return []
  }

  try {
    const data = await response.json()
    // TRPC batched response format: [{ result: { data: { json: [...] } } }]
    // Non-batched format: { result: { data: { json: [...] } } }
    const result = Array.isArray(data)
      ? data[0]?.result?.data?.json
      : data?.result?.data?.json
    if (Array.isArray(result)) {
      return result.map((bb: { id: string; name: string }) => ({
        id: bb.id,
        name: bb.name,
      }))
    }
  } catch (e) {
    console.error('Failed to parse baleybots response:', e)
  }

  return []
}

/**
 * Get a specific BaleyBot by ID
 */
export async function getBaleybot(id: string): Promise<BaleybotConfig | null> {
  const response = await fetch(
    `/api/trpc/baleybots.get?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: { id } } }))}`,
    {
      headers: getAuthHeaders(),
    }
  )

  if (!response.ok) {
    console.error('Failed to fetch baleybot:', response.status)
    return null
  }

  try {
    const data = await response.json()
    const result = data[0]?.result?.data?.json
    if (result) {
      return {
        id: result.id,
        name: result.name,
      }
    }
  } catch (e) {
    console.error('Failed to parse baleybot response:', e)
  }

  return null
}

/**
 * Find a BaleyBot by name
 */
export async function findBaleybotByName(name: string): Promise<BaleybotConfig | null> {
  const bots = await listBaleybots()
  return bots.find((bb) => bb.name.toLowerCase() === name.toLowerCase()) || null
}
