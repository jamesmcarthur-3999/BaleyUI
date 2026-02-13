'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { PageShell } from '@/components/layout/page-shell';
import { ActionCard, type RecommendationItem } from '@/components/actions';
import {
  Sparkles,
  AlertCircle,
  ChevronDown,
  Loader2,
  X,
} from 'lucide-react';

// ============================================================================
// TYPE FILTER OPTIONS
// ============================================================================

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'approval_pattern', label: 'Auto-approval' },
  { value: 'bal_patch', label: 'Code fix' },
  { value: 'error_review', label: 'Error analysis' },
  { value: 'configuration', label: 'Configuration' },
  { value: 'insight', label: 'Insight' },
  { value: 'performance', label: 'Performance' },
];

// ============================================================================
// ACTIONS PAGE
// ============================================================================

export default function ActionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const highlightId = searchParams.get('highlight');
  const sourceTypeParam = searchParams.get('sourceType');
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // State
  const [typeFilter, setTypeFilter] = useState('all');
  const [suggestionCursor, setSuggestionCursor] = useState<string | undefined>(undefined);
  const [accumulatedSuggestions, setAccumulatedSuggestions] = useState<RecommendationItem[]>([]);
  const prevSuggestionsRef = useRef<{ items: RecommendationItem[]; nextCursor?: string } | undefined>(undefined);
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const [criticalShowAll, setCriticalShowAll] = useState(false);

  // ========================================================================
  // DATA FETCHING
  // ========================================================================

  // Critical items
  const { data: criticalData, isLoading: criticalLoading } = trpc.recommendations.list.useQuery({
    status: 'pending',
    severity: 'critical',
  });

  // Suggestions (warning + info) — paginated, excludes critical items
  const { data: suggestionsData, isLoading: suggestionsLoading, isFetching: suggestionsFetching } =
    trpc.recommendations.list.useQuery({
      status: 'pending',
      excludeSeverity: 'critical',
      ...(sourceTypeParam ? { sourceType: sourceTypeParam } : {}),
      limit: 30,
      cursor: suggestionCursor,
    });

  // Resolved items — only fetch when expanded
  const { data: resolvedData, isLoading: resolvedLoading } = trpc.recommendations.list.useQuery(
    { status: 'accepted', limit: 20 },
    { enabled: resolvedExpanded }
  );
  const { data: dismissedData } = trpc.recommendations.list.useQuery(
    { status: 'dismissed', limit: 20 },
    { enabled: resolvedExpanded }
  );

  // Counts for badges
  const { data: counts } = trpc.recommendations.counts.useQuery();

  // ========================================================================
  // ACCUMULATE SUGGESTIONS
  // ========================================================================

  useEffect(() => {
    if (!suggestionsData || suggestionsData === prevSuggestionsRef.current) return;
    prevSuggestionsRef.current = suggestionsData;

    if (!suggestionCursor) {
      setAccumulatedSuggestions(suggestionsData.items as RecommendationItem[]);
    } else {
      setAccumulatedSuggestions((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const newItems = (suggestionsData.items as RecommendationItem[]).filter(
          (item) => !existingIds.has(item.id)
        );
        return [...prev, ...newItems];
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionsData]);

  // Reset cursor + accumulated when type filter or sourceType changes
  useEffect(() => {
    setSuggestionCursor(undefined);
    setAccumulatedSuggestions([]);
    prevSuggestionsRef.current = undefined;
  }, [typeFilter, sourceTypeParam]);

  const clearSourceTypeFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('sourceType');
    const query = params.toString();
    router.replace(query ? `/dashboard/actions?${query}` : '/dashboard/actions');
  };

  // ========================================================================
  // HIGHLIGHT SCROLL
  // ========================================================================

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`action-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        }, 3000);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [highlightId]);

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  const invalidateRecommendations = () => {
    utils.recommendations.list.invalidate();
    utils.recommendations.counts.invalidate();
  };

  const handleMutationError = (error: { data?: { code?: string } | null; message: string }) => {
    if (error.data?.code === 'BAD_REQUEST') {
      toast({ title: 'Already handled', description: 'This suggestion was already handled.' });
    } else {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const acceptMutation = trpc.recommendations.accept.useMutation({
    onSuccess: () => {
      toast({ title: 'Applied' });
      invalidateRecommendations();
    },
    onError: handleMutationError,
  });

  const dismissMutation = trpc.recommendations.dismiss.useMutation({
    onSuccess: () => {
      toast({ title: 'Dismissed' });
      invalidateRecommendations();
    },
    onError: handleMutationError,
  });

  const mutatingId = acceptMutation.variables?.id ?? dismissMutation.variables?.id;

  // ========================================================================
  // DERIVED DATA
  // ========================================================================

  const criticalItems = (criticalData?.items ?? []) as RecommendationItem[];
  const hasCritical = criticalItems.length > 0;
  const displayedCritical = criticalShowAll ? criticalItems : criticalItems.slice(0, 5);
  const hiddenCriticalCount = criticalItems.length - 5;

  // Apply type filter (critical items already excluded server-side via excludeSeverity)
  const filteredSuggestions = accumulatedSuggestions.filter((item) => {
    if (typeFilter !== 'all' && item.targetType !== typeFilter) return false;
    return true;
  });

  const pendingBySeverity = counts?.pendingBySeverity;
  const suggestionsCount = (pendingBySeverity?.warning ?? 0) + (pendingBySeverity?.info ?? 0);
  const suggestionsNextCursor = suggestionsData?.nextCursor;

  // Merge resolved + dismissed, sort by date
  const resolvedItems = [
    ...((resolvedData?.items ?? []) as RecommendationItem[]),
    ...((dismissedData?.items ?? []) as RecommendationItem[]),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  const pendingTotal = counts?.pending ?? 0;
  const isLoading = criticalLoading && suggestionsLoading;

  // ========================================================================
  // EMPTY STATE
  // ========================================================================

  const resolvedTotal = (counts?.accepted ?? 0) + (counts?.dismissed ?? 0) + (counts?.rejected ?? 0);

  if (!isLoading && pendingTotal === 0 && !resolvedExpanded) {
    const hasHistory = resolvedTotal > 0;
    return (
      <PageShell
        title="Actions"
        description="AI-generated suggestions for your workspace"
      >
        <EmptyState
          icon={Sparkles}
          title={hasHistory ? 'All caught up' : 'No suggestions yet'}
          description={hasHistory
            ? `You've handled all suggestions. ${resolvedTotal} resolved so far.`
            : 'As your BaleyBots run, Baley analyzes their performance and surfaces improvement ideas here.'
          }
        />
      </PageShell>
    );
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <PageShell
      title="Actions"
      description="AI-generated suggestions for your workspace"
    >
      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {/* ── Needs Attention Section ── */}
      {hasCritical && (
        <div className="rounded-lg border border-red-500/50 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <h2 className="text-sm font-semibold">
              {criticalItems.length} item{criticalItems.length !== 1 ? 's' : ''} need{criticalItems.length === 1 ? 's' : ''} your attention
            </h2>
          </div>

          <div className="space-y-2">
            {displayedCritical.map((item) => (
              <div key={item.id} id={`action-${item.id}`}>
                <ActionCard
                  recommendation={item}
                  defaultExpanded
                  onAccept={(id) => acceptMutation.mutate({ id })}
                  onDismiss={(id) => dismissMutation.mutate({ id })}
                  isPending={mutatingId === item.id}
                />
              </div>
            ))}
          </div>

          {!criticalShowAll && hiddenCriticalCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCriticalShowAll(true)}
              className="text-red-600 hover:text-red-700"
            >
              Show {hiddenCriticalCount} more
            </Button>
          )}
        </div>
      )}

      {/* ── Suggestions Section ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Suggestions</CardTitle>
            {suggestionsCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {suggestionsCount}
              </Badge>
            )}
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>

        {sourceTypeParam && (
          <div className="px-6 pb-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
              Filtered: {sourceTypeParam.replace(/_/g, ' ')}
              <button
                onClick={clearSourceTypeFilter}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label="Clear source type filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        <CardContent>
          {suggestionsLoading && !suggestionCursor ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredSuggestions.length > 0 ? (
            <div className="space-y-2">
              {filteredSuggestions.map((item) => (
                <div key={item.id} id={`action-${item.id}`}>
                  <ActionCard
                    recommendation={item}
                    defaultExpanded={item.id === highlightId}
                    onAccept={(id) => acceptMutation.mutate({ id })}
                    onDismiss={(id) => dismissMutation.mutate({ id })}
                    isPending={mutatingId === item.id}
                  />
                </div>
              ))}

              {suggestionsNextCursor && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setSuggestionCursor(suggestionsNextCursor)}
                    disabled={suggestionsFetching}
                  >
                    {suggestionsFetching && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Load More
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No suggestions yet"
              description="As your BaleyBots run, Baley analyzes their performance and surfaces improvement ideas here."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      {/* ── Recently Resolved ── */}
      <Collapsible open={resolvedExpanded} onOpenChange={setResolvedExpanded}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${resolvedExpanded ? 'rotate-180' : ''}`}
            />
            <span>Recently resolved</span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          {resolvedLoading ? (
            <div className="space-y-2 pt-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : resolvedItems.length > 0 ? (
            <div className="space-y-2 pt-2">
              {resolvedItems.map((item) => (
                <ActionCard
                  key={item.id}
                  recommendation={item}
                  onAccept={() => {}}
                  onDismiss={() => {}}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              No resolved actions yet.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </PageShell>
  );
}
