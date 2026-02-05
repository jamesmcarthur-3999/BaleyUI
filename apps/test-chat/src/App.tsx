import { useState, useEffect } from 'react'
import { Bot, Settings, X, AlertCircle } from 'lucide-react'
import { ChatPanel } from '@/components/ChatPanel'
import { InputBar } from '@/components/InputBar'
import { ActivitySidebar, type ActivitySuggestion } from '@/components/ActivitySidebar'
import { SummaryPanel } from '@/components/SummaryPanel'
import { useBaleybotChat } from '@/hooks/useBaleybotChat'
import { useActivityTracker } from '@/hooks/useActivityTracker'
import { useSummary } from '@/hooks/useSummary'
import { listBaleybots, type BaleybotConfig } from '@/lib/baleybot-client'
import { cn } from '@/lib/utils'

// Configuration for the BaleyBots this app uses
const BOT_NAMES = {
  chat: 'Chat Companion',
  activity: 'Activity Tracker',
  summarizer: 'Conversation Summarizer',
}

function App() {
  const [showSidebar, setShowSidebar] = useState(true)
  const [configuredBots, setConfiguredBots] = useState<Record<string, BaleybotConfig | null>>({
    chat: null,
    activity: null,
    summarizer: null,
  })
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)

  // Load BaleyBot configurations on mount
  useEffect(() => {
    async function loadBots() {
      setIsLoadingConfig(true)
      setConfigError(null)

      try {
        const bots = await listBaleybots()

        const chatBot = bots.find(
          (b) => b.name.toLowerCase() === BOT_NAMES.chat.toLowerCase()
        )
        const activityBot = bots.find(
          (b) => b.name.toLowerCase() === BOT_NAMES.activity.toLowerCase()
        )
        const summarizerBot = bots.find(
          (b) => b.name.toLowerCase() === BOT_NAMES.summarizer.toLowerCase()
        )

        setConfiguredBots({
          chat: chatBot || null,
          activity: activityBot || null,
          summarizer: summarizerBot || null,
        })

        if (!chatBot) {
          setConfigError(
            `Chat bot "${BOT_NAMES.chat}" not found. Create it in BaleyUI first.`
          )
        }
      } catch (err) {
        console.error('Failed to load bots:', err)
        setConfigError(
          'Failed to connect to BaleyUI. Make sure it\'s running at localhost:3000'
        )
      } finally {
        setIsLoadingConfig(false)
      }
    }

    loadBots()
  }, [])

  // Chat hook
  const {
    messages,
    isStreaming,
    streamingContent,
    error: chatError,
    sendMessage,
  } = useBaleybotChat({
    baleybotId: configuredBots.chat?.id,
    baleybotName: BOT_NAMES.chat,
  })

  // Activity tracker hook
  const {
    suggestions,
    isLoading: activityLoading,
    refresh: refreshActivity,
  } = useActivityTracker({
    baleybotId: configuredBots.activity?.id,
    baleybotName: BOT_NAMES.activity,
    messages,
    autoTriggerAfter: 3,
  })

  // Summary hook
  const {
    summary,
    lastUpdated: summaryLastUpdated,
    isLoading: summaryLoading,
    refresh: refreshSummary,
  } = useSummary({
    baleybotId: configuredBots.summarizer?.id,
    baleybotName: BOT_NAMES.summarizer,
    messages,
    autoTriggerAfter: 5,
  })

  const handleSuggestionClick = (suggestion: ActivitySuggestion) => {
    if (!isStreaming) {
      sendMessage(suggestion.content)
    }
  }

  const displayError = configError || chatError

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">BaleyBot Test Chat</h1>
            <p className="text-[10px] text-muted-foreground">
              {configuredBots.chat
                ? `Connected to ${configuredBots.chat.name}`
                : 'Not connected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bot status indicators */}
          <div className="hidden items-center gap-2 md:flex">
            <StatusPill
              label="Chat"
              active={!!configuredBots.chat}
              loading={isLoadingConfig}
            />
            <StatusPill
              label="Activity"
              active={!!configuredBots.activity}
              loading={isLoadingConfig}
            />
            <StatusPill
              label="Summary"
              active={!!configuredBots.summarizer}
              loading={isLoadingConfig}
            />
          </div>

          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={cn(
              'rounded-md p-2 transition-colors',
              showSidebar
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            {showSidebar ? (
              <X className="h-4 w-4" />
            ) : (
              <Settings className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {displayError && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{displayError}</p>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-1 flex-col">
          {/* Summary panel (collapsible) */}
          <SummaryPanel
            summary={summary}
            lastUpdated={summaryLastUpdated}
            isLoading={summaryLoading}
            onRefresh={configuredBots.summarizer ? refreshSummary : undefined}
            messageCount={messages.length}
          />

          {/* Chat messages */}
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
          />

          {/* Input */}
          <InputBar
            onSend={sendMessage}
            disabled={!configuredBots.chat || isLoadingConfig}
            isLoading={isStreaming}
          />
        </div>

        {/* Activity sidebar */}
        {showSidebar && (
          <ActivitySidebar
            suggestions={suggestions}
            onSuggestionClick={handleSuggestionClick}
            isLoading={activityLoading}
            onRefresh={configuredBots.activity ? refreshActivity : undefined}
          />
        )}
      </div>
    </div>
  )
}

function StatusPill({
  label,
  active,
  loading,
}: {
  label: string
  active: boolean
  loading: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
        loading
          ? 'bg-muted text-muted-foreground'
          : active
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          loading
            ? 'bg-muted-foreground animate-pulse'
            : active
              ? 'bg-green-500'
              : 'bg-red-500'
        )}
      />
      {label}
    </div>
  )
}

export default App
