import { useState } from 'react'
import { FileText, ChevronDown, ChevronUp, RefreshCw, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SummaryPanelProps {
  summary: string | null
  lastUpdated: string | null
  isLoading?: boolean
  onRefresh?: () => void
  messageCount: number
}

export function SummaryPanel({
  summary,
  lastUpdated,
  isLoading,
  onRefresh,
  messageCount,
}: SummaryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!summary && !isLoading && messageCount < 4) {
    return null
  }

  return (
    <div className="border-b border-border bg-muted/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex w-full items-center justify-between px-4 py-3',
          'text-left hover:bg-muted/50 transition-colors'
        )}
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Conversation Summary</span>
          {isLoading && (
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(lastUpdated)}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {summary ? (
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {summary}
              </p>
              {onRefresh && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRefresh()
                    }}
                    disabled={isLoading}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-1 text-xs',
                      'text-muted-foreground hover:bg-muted hover:text-foreground',
                      'transition-colors disabled:opacity-50'
                    )}
                  >
                    <RefreshCw
                      className={cn('h-3 w-3', isLoading && 'animate-spin')}
                    />
                    Refresh
                  </button>
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating summary...
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background/50 p-4">
              <p className="text-sm text-muted-foreground text-center">
                {messageCount < 4
                  ? `Summary will be generated after ${4 - messageCount} more messages`
                  : 'Click refresh to generate a summary'}
              </p>
              {onRefresh && messageCount >= 4 && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRefresh()
                    }}
                    className={cn(
                      'flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs',
                      'text-primary-foreground hover:bg-primary/90 transition-colors'
                    )}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Generate Summary
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return date.toLocaleDateString()
}
