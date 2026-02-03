'use client';

import { useState } from 'react';
import {
  Lightbulb,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  Zap,
  Filter,
  Layers,
  Database,
  FileText,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OptimizationSuggestion, OptimizationType } from '@/lib/baleybot/cost/optimization-suggester';

interface OptimizationPanelProps {
  suggestions: OptimizationSuggestion[];
  className?: string;
}

const OPTIMIZATION_ICONS: Record<OptimizationType, React.ElementType> = {
  model_downgrade: TrendingDown,
  add_filter: Filter,
  batch_processing: Layers,
  caching: Database,
  reduce_tokens: FileText,
  schedule_optimization: Clock,
};

const OPTIMIZATION_COLORS: Record<OptimizationType, string> = {
  model_downgrade: 'text-blue-500 bg-blue-500/10',
  add_filter: 'text-amber-500 bg-amber-500/10',
  batch_processing: 'text-purple-500 bg-purple-500/10',
  caching: 'text-emerald-500 bg-emerald-500/10',
  reduce_tokens: 'text-rose-500 bg-rose-500/10',
  schedule_optimization: 'text-cyan-500 bg-cyan-500/10',
};

function formatCurrency(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  if (amount < 1) {
    return `$${amount.toFixed(3)}`;
  }
  return `$${amount.toFixed(2)}`;
}

function SuggestionCard({ suggestion }: { suggestion: OptimizationSuggestion }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = OPTIMIZATION_ICONS[suggestion.type] || Lightbulb;
  const colorClass = OPTIMIZATION_COLORS[suggestion.type] || 'text-primary bg-primary/10';

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className={cn('p-2 rounded-lg', colorClass)}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm">{suggestion.title}</h4>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                suggestion.confidence === 'high'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : suggestion.confidence === 'medium'
                    ? 'bg-amber-500/10 text-amber-600'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {suggestion.confidence} confidence
            </span>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2">
            {suggestion.description}
          </p>

          {/* Savings summary */}
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-600">
                Save {formatCurrency(suggestion.savingsAmount)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({suggestion.savingsPercent.toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>

        <div className="text-muted-foreground">
          {expanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          {/* Cost comparison */}
          <div className="flex gap-4 py-4">
            <div className="flex-1 p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Current Cost</p>
              <p className="text-lg font-semibold">
                {formatCurrency(suggestion.currentCost)}
              </p>
              <p className="text-xs text-muted-foreground">last 30 days</p>
            </div>
            <div className="flex items-center">
              <Zap className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-xs text-emerald-600 mb-1">Projected Cost</p>
              <p className="text-lg font-semibold text-emerald-600">
                {formatCurrency(suggestion.projectedCost)}
              </p>
              <p className="text-xs text-emerald-600/70">with optimization</p>
            </div>
          </div>

          {/* Implementation details */}
          <div className="space-y-2">
            <h5 className="text-sm font-medium">How to implement</h5>
            <div className="p-3 rounded-lg bg-muted/50 font-mono text-xs whitespace-pre-wrap">
              {suggestion.implementation}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OptimizationPanel({ suggestions, className }: OptimizationPanelProps) {
  if (suggestions.length === 0) {
    return (
      <div
        className={cn(
          'p-6 rounded-2xl border border-border bg-card text-center',
          className
        )}
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 mb-3">
          <Lightbulb className="h-6 w-6 text-emerald-500" />
        </div>
        <h3 className="font-medium mb-1">All Optimized</h3>
        <p className="text-sm text-muted-foreground">
          No optimization suggestions at this time. Your BaleyBot is running efficiently.
        </p>
      </div>
    );
  }

  // Calculate total potential savings
  const totalSavings = suggestions.reduce((sum, s) => sum + s.savingsAmount, 0);
  const totalCurrentCost = suggestions.reduce((sum, s) => sum + s.currentCost, 0);
  const totalSavingsPercent =
    totalCurrentCost > 0 ? (totalSavings / totalCurrentCost) * 100 : 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary header */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <Lightbulb className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="font-medium">
              {suggestions.length} Optimization{suggestions.length !== 1 ? 's' : ''} Found
            </h3>
            <p className="text-sm text-muted-foreground">
              Potential savings: {formatCurrency(totalSavings)} (
              {totalSavingsPercent.toFixed(0)}%)
            </p>
          </div>
        </div>
      </div>

      {/* Suggestion list */}
      <div className="space-y-3">
        {suggestions.map((suggestion, index) => (
          <SuggestionCard key={`${suggestion.type}-${index}`} suggestion={suggestion} />
        ))}
      </div>
    </div>
  );
}

/**
 * Compact optimization badge for cards
 */
export function OptimizationBadge({
  count,
  savings,
}: {
  count: number;
  savings: number;
}) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 text-xs font-medium">
      <Lightbulb className="h-3 w-3" />
      <span>
        {count} tip{count !== 1 ? 's' : ''} · Save {formatCurrency(savings)}
      </span>
    </div>
  );
}
