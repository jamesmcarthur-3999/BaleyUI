'use client';

import { useState, useMemo } from 'react';
import { DecisionTable } from '@/components/decisions/DecisionTable';
import { DecisionDetail } from '@/components/decisions/DecisionDetail';
import { DecisionFilters } from '@/components/decisions/DecisionFilters';
import { DecisionStats } from '@/components/decisions/DecisionStats';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { ChevronLeft, Loader2 } from 'lucide-react';

export default function DecisionsPage() {
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    blockId?: string;
    model?: string;
    startDate?: Date;
    endDate?: Date;
    hasFeedback?: boolean;
  }>({});

  // Fetch decisions list with infinite query for cursor-based pagination
  const {
    data,
    isLoading: isLoadingDecisions,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = trpc.decisions.list.useInfiniteQuery(
    {
      blockId: filters.blockId,
      model: filters.model,
      startDate: filters.startDate,
      endDate: filters.endDate,
      hasFeedback: filters.hasFeedback,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  // Fetch selected decision details
  const { data: selectedDecision, isLoading: isLoadingDetail } =
    trpc.decisions.getById.useQuery(
      { id: selectedDecisionId! },
      { enabled: !!selectedDecisionId }
    );

  // Fetch stats
  const { data: stats, isLoading: isLoadingStats } = trpc.decisions.getStats.useQuery({
    blockId: filters.blockId,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  // Flatten all pages into a single array of decisions
  const decisions = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) || [];
  }, [data]);

  // Get total count from the first page
  const totalCount = data?.pages[0]?.totalCount || 0;

  const handleDecisionSelect = (decision: any) => {
    setSelectedDecisionId(decision.id);
  };

  const handleCloseDetail = () => {
    setSelectedDecisionId(null);
  };

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleRetry = () => {
    fetchNextPage();
  };

  // If a decision is selected, show detail view
  if (selectedDecisionId && selectedDecision) {
    return (
      <div className="container py-10 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={handleCloseDetail} className="gap-2 -ml-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Decisions
          </Button>
        </div>
        {isLoadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-muted-foreground">Loading decision details...</div>
          </div>
        ) : (
          <DecisionDetail decision={selectedDecision} onClose={handleCloseDetail} />
        )}
      </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Decision Inspector</h1>
            <p className="text-muted-foreground">
              Monitor and provide feedback on AI decisions
            </p>
          </div>
        </div>

        {/* Stats */}
        {stats && <DecisionStats stats={stats} isLoading={isLoadingStats} />}

        {/* Filters */}
        <DecisionFilters
          blockId={filters.blockId}
          model={filters.model}
          startDate={filters.startDate}
          endDate={filters.endDate}
          hasFeedback={filters.hasFeedback}
          onFilterChange={setFilters}
        />

        {/* Decisions count */}
        {!isLoadingDecisions && decisions.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {decisions.length} of {totalCount} decision{totalCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Decisions Table */}
        <div>
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-destructive/10 p-3 mb-4">
                <svg
                  className="h-6 w-6 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">Failed to load decisions</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm mb-4">
                {error.message || 'An error occurred while fetching decisions'}
              </p>
              <Button onClick={handleRetry} variant="outline">
                Try Again
              </Button>
            </div>
          ) : (
            <DecisionTable
              decisions={decisions}
              isLoading={isLoadingDecisions}
              onDecisionSelect={handleDecisionSelect}
            />
          )}
        </div>

        {/* Load More */}
        {hasNextPage && !error && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isFetchingNextPage}
              className="gap-2"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </Button>
          </div>
        )}

        {/* Loading more indicator */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more decisions...
            </div>
          </div>
        )}

        {/* End of results indicator */}
        {!hasNextPage && decisions.length > 0 && !isLoadingDecisions && !error && (
          <div className="flex items-center justify-center py-4">
            <div className="text-sm text-muted-foreground">
              You&apos;ve reached the end of the list
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
