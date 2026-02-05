import { Lightbulb, Sparkles, TrendingUp, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActivitySuggestion {
  id: string
  content: string
  type: 'topic' | 'followup' | 'insight'
  timestamp: string
}

interface ActivitySidebarProps {
  suggestions: ActivitySuggestion[]
  onSuggestionClick: (suggestion: ActivitySuggestion) => void
  isLoading?: boolean
  onRefresh?: () => void
}

const typeIcons = {
  topic: Sparkles,
  followup: TrendingUp,
  insight: Lightbulb,
}

const typeLabels = {
  topic: 'Related Topic',
  followup: 'Follow Up',
  insight: 'Insight',
}

const typeColors = {
  topic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  followup: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  insight: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

export function ActivitySidebar({
  suggestions,
  onSuggestionClick,
  isLoading,
  onRefresh,
}: ActivitySidebarProps) {
  return (
    <div className="flex h-full w-72 flex-col border-l border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Activity Tracker</h3>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={cn(
              'rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground',
              'transition-colors disabled:opacity-50'
            )}
            title="Refresh suggestions"
          >
            <RefreshCw
              className={cn('h-4 w-4', isLoading && 'animate-spin')}
            />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 rounded-full bg-muted p-3">
              <Lightbulb className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? 'Analyzing conversation...'
                : 'Suggestions will appear as you chat'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion) => {
              const Icon = typeIcons[suggestion.type]
              return (
                <button
                  key={suggestion.id}
                  onClick={() => onSuggestionClick(suggestion)}
                  className={cn(
                    'group w-full rounded-lg border border-border bg-background p-3',
                    'text-left transition-all hover:border-primary/50 hover:shadow-sm'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded',
                        typeColors[suggestion.type]
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          'text-[10px] font-medium uppercase tracking-wider',
                          typeColors[suggestion.type].split(' ')[1]
                        )}
                      >
                        {typeLabels[suggestion.type]}
                      </span>
                      <p className="mt-1 text-sm text-foreground line-clamp-3">
                        {suggestion.content}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Click to send
                    </span>
                    <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      →
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <p className="text-[10px] text-muted-foreground">
          Activity Tracker analyzes your conversation and suggests relevant
          topics and follow-ups.
        </p>
      </div>
    </div>
  )
}
