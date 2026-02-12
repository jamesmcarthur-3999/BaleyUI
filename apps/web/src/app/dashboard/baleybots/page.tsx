'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SlidePanel, SlidePanelFooter } from '@/components/ui/slide-panel';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/routes';
import {
  BaleybotCard,
} from '@/components/baleybots';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LayoutGrid,
  List,
  Loader2,
  PanelRightOpen,
  Pause,
  Search,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useGridNavigation } from '@/hooks/useGridNavigation';
import { cn } from '@/lib/utils';

type BaleybotStatus = 'draft' | 'active' | 'paused' | 'error';
type SmartView =
  | 'all'
  | 'active'
  | 'needs_attention'
  | 'recently_run'
  | 'never_run';
type ViewMode = 'cards' | 'list';
type SortMode = 'recent' | 'name' | 'runs' | 'last_executed';
type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

const SMART_VIEW_COPY: Record<
  SmartView,
  { label: string; description: string }
> = {
  all: {
    label: 'All bots',
    description: 'Everything in this workspace.',
  },
  active: {
    label: 'Active',
    description: 'Ready for regular use.',
  },
  needs_attention: {
    label: 'Needs attention',
    description: 'Paused, error, or recently failed.',
  },
  recently_run: {
    label: 'Recently run',
    description: 'Executed in the last 24 hours.',
  },
  never_run: {
    label: 'Never run',
    description: 'Drafted but not validated yet.',
  },
};

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTimeAgo(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return 'Never';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDateTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return 'Not available';
  return date.toLocaleString();
}

function getStatusTone(status: BaleybotStatus): string {
  switch (status) {
    case 'active':
      return 'badge-success';
    case 'paused':
      return 'badge-warning';
    case 'error':
      return 'badge-error';
    default:
      return 'badge-playful';
  }
}

function getExecutionStatusBadge(status: ExecutionStatus) {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <XCircle className="h-3 w-3" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <Clock3 className="h-3 w-3" />
          Pending
        </span>
      );
  }
}

export default function BaleybotsListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [smartView, setSmartView] = useState<SmartView>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedBotIds, setSelectedBotIds] = useState<Set<string>>(new Set());
  const [inspectedBotId, setInspectedBotId] = useState<string | null>(null);

  const { data: baleybotsData, isLoading } = trpc.baleybots.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const baleybots = baleybotsData?.items;

  const { data: inspectedBot, isLoading: isLoadingInspectedBot } =
    trpc.baleybots.get.useQuery(
      { id: inspectedBotId ?? '' },
      {
        enabled: !!inspectedBotId,
      }
    );

  const activateMutation = trpc.baleybots.activate.useMutation();
  const pauseMutation = trpc.baleybots.pause.useMutation();
  const deleteMutation = trpc.baleybots.delete.useMutation();

  const isMutating =
    activateMutation.isPending || pauseMutation.isPending || deleteMutation.isPending;

  const allBots = baleybots ?? [];
  const activeCount = allBots.filter((bb) => bb.status === 'active').length;
  const needsAttentionCount = allBots.filter((bb) => {
    if (bb.status === 'paused' || bb.status === 'error') return true;
    return bb.lastExecution?.status === 'failed';
  }).length;
  const totalRuns = allBots.reduce((total, bb) => total + (bb.executionCount ?? 0), 0);
  const recentlyRunCount = allBots.filter((bb) => {
    const lastRun = asDate(bb.lastExecutedAt);
    if (!lastRun) return false;
    return Date.now() - lastRun.getTime() <= 24 * 60 * 60 * 1000;
  }).length;

  const smartViewCounts: Record<SmartView, number> = {
    all: allBots.length,
    active: activeCount,
    needs_attention: needsAttentionCount,
    recently_run: recentlyRunCount,
    never_run: allBots.filter((bb) => (bb.executionCount ?? 0) === 0).length,
  };

  const matchesSmartView = (bb: (typeof allBots)[number]) => {
    if (smartView === 'all') return true;
    if (smartView === 'active') return bb.status === 'active';
    if (smartView === 'never_run') return (bb.executionCount ?? 0) === 0;
    if (smartView === 'recently_run') {
      const lastRun = asDate(bb.lastExecutedAt);
      if (!lastRun) return false;
      return Date.now() - lastRun.getTime() <= 24 * 60 * 60 * 1000;
    }
    if (smartView === 'needs_attention') {
      return bb.status === 'paused' || bb.status === 'error' || bb.lastExecution?.status === 'failed';
    }
    return true;
  };

  const filteredBots = allBots
    .filter((bb) => {
      const matchesSearch =
        !searchQuery ||
        bb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (bb.description && bb.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || bb.status === statusFilter;
      return matchesSearch && matchesStatus && matchesSmartView(bb);
    })
    .sort((a, b) => {
      if (sortMode === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortMode === 'runs') {
        return (b.executionCount ?? 0) - (a.executionCount ?? 0);
      }
      if (sortMode === 'last_executed') {
        const aLast = asDate(a.lastExecutedAt)?.getTime() ?? 0;
        const bLast = asDate(b.lastExecutedAt)?.getTime() ?? 0;
        return bLast - aLast;
      }
      return (
        (asDate(b.updatedAt)?.getTime() ?? 0) -
        (asDate(a.updatedAt)?.getTime() ?? 0)
      );
    });

  const selectedBots = allBots.filter((bb) => selectedBotIds.has(bb.id));
  const allVisibleSelected =
    filteredBots.length > 0 && filteredBots.every((bb) => selectedBotIds.has(bb.id));
  const someVisibleSelected = filteredBots.some((bb) => selectedBotIds.has(bb.id));

  const { containerRef, handleKeyDown } = useGridNavigation(filteredBots.length, 3);

  const inspectedBotSummary = allBots.find((bb) => bb.id === inspectedBotId) ?? null;

  const refreshData = async () => {
    await utils.baleybots.list.invalidate();
    if (inspectedBotId) {
      await utils.baleybots.get.invalidate({ id: inspectedBotId });
    }
  };

  const handleExecute = (id: string) => {
    router.push(ROUTES.baleybots.detail(id));
  };

  const handleActivate = async (id: string) => {
    const bb = allBots.find((bot) => bot.id === id);
    if (!bb) return;

    try {
      await activateMutation.mutateAsync({ id, version: bb.version });
      toast({
        title: 'BaleyBot activated',
        description: `${bb.name} is now active.`,
      });
      await refreshData();
    } catch (error) {
      toast({
        title: 'Activation failed',
        description: error instanceof Error ? error.message : 'Unable to activate this BaleyBot.',
        variant: 'destructive',
      });
    }
  };

  const handlePause = async (id: string) => {
    const bb = allBots.find((bot) => bot.id === id);
    if (!bb) return;

    try {
      await pauseMutation.mutateAsync({ id, version: bb.version });
      toast({
        title: 'BaleyBot paused',
        description: `${bb.name} is now paused.`,
      });
      await refreshData();
    } catch (error) {
      toast({
        title: 'Pause failed',
        description: error instanceof Error ? error.message : 'Unable to pause this BaleyBot.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    const bb = allBots.find((bot) => bot.id === id);
    if (!bb) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast({
        title: 'BaleyBot deleted',
        description: `${bb.name} has been removed.`,
      });
      if (inspectedBotId === id) {
        setInspectedBotId(null);
      }
      setSelectedBotIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refreshData();
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete this BaleyBot.',
        variant: 'destructive',
      });
    }
  };

  const runBulkAction = async (action: 'activate' | 'pause' | 'delete') => {
    if (selectedBots.length === 0) return;

    let successCount = 0;
    let failedCount = 0;

    for (const bb of selectedBots) {
      try {
        if (action === 'activate' && bb.status !== 'active') {
          await activateMutation.mutateAsync({ id: bb.id, version: bb.version });
          successCount += 1;
        }

        if (action === 'pause' && bb.status === 'active') {
          await pauseMutation.mutateAsync({ id: bb.id, version: bb.version });
          successCount += 1;
        }

        if (action === 'delete') {
          await deleteMutation.mutateAsync({ id: bb.id });
          successCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    if (action === 'delete' && inspectedBotId && selectedBotIds.has(inspectedBotId)) {
      setInspectedBotId(null);
    }

    setSelectedBotIds(new Set());
    await refreshData();

    const actionTitle =
      action === 'activate' ? 'activated' : action === 'pause' ? 'paused' : 'deleted';

    toast({
      title: `Bulk action complete`,
      description:
        failedCount > 0
          ? `${successCount} ${actionTitle}, ${failedCount} failed.`
          : `${successCount} BaleyBots ${actionTitle}.`,
      variant: failedCount > 0 ? 'destructive' : 'default',
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedBotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="container py-8 md:py-10">
      <div className="flex flex-col gap-6 md:gap-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">BaleyBots</h1>
            <p className="text-muted-foreground">
              Command center for creating, monitoring, and managing workspace BaleyBots.
            </p>
          </div>
          <Button asChild>
            <Link href={ROUTES.baleybots.create}>
              <Zap className="mr-2 h-4 w-4" />
              New BaleyBot
            </Link>
          </Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Workspace snapshot
              </h2>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Total bots</span>
                  <span className="font-semibold">{allBots.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Active</span>
                  <span className="font-semibold">{activeCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Needs attention</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {needsAttentionCount}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Total runs</span>
                  <span className="font-semibold">{totalRuns}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-3">
              <h2 className="px-1 pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Smart views
              </h2>
              <div className="space-y-1.5">
                {(Object.keys(SMART_VIEW_COPY) as SmartView[]).map((view) => {
                  const selected = smartView === view;
                  return (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setSmartView(view)}
                      className={cn(
                        'flex w-full items-start justify-between rounded-xl border px-3 py-2 text-left transition-colors',
                        selected
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-transparent hover:border-border hover:bg-muted/40'
                      )}
                    >
                      <span>
                        <span className="block text-sm font-medium">{SMART_VIEW_COPY[view].label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {SMART_VIEW_COPY[view].description}
                        </span>
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {smartViewCounts[view]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium">Creation stays simple</p>
                  <p className="mt-1 text-muted-foreground">
                    Start with one sentence. Advanced controls remain in details after the first successful run.
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by bot name or description"
                    className="pl-9"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                  <SelectTrigger className="w-full md:w-[170px]">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recently updated</SelectItem>
                    <SelectItem value="name">Name (A-Z)</SelectItem>
                    <SelectItem value="runs">Most runs</SelectItem>
                    <SelectItem value="last_executed">Last executed</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1 rounded-lg border border-border p-1">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                    className="h-8 w-8"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'cards' ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('cards')}
                    aria-label="Card view"
                    className="h-8 w-8"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Showing <span className="font-medium text-foreground">{filteredBots.length}</span> of{' '}
                  <span className="font-medium text-foreground">{allBots.length}</span>
                </span>
                {(searchQuery || statusFilter !== 'all' || smartView !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setSmartView('all');
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {selectedBots.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <span className="text-sm font-medium">
                  {selectedBots.length} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runBulkAction('activate')}
                  disabled={isMutating}
                >
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Activate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runBulkAction('pause')}
                  disabled={isMutating}
                >
                  <Pause className="mr-1.5 h-3.5 w-3.5" />
                  Pause
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => runBulkAction('delete')}
                  disabled={isMutating}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedBotIds(new Set())}
                >
                  Clear selection
                </Button>
              </div>
            )}

            {isLoading ? (
              viewMode === 'cards' ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((value) => (
                    <Skeleton key={value} className="h-36" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-3">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Skeleton key={value} className="h-14" />
                  ))}
                </div>
              )
            ) : filteredBots.length > 0 ? (
              viewMode === 'cards' ? (
                <div
                  ref={containerRef}
                  role="grid"
                  aria-label="BaleyBots card grid"
                  className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  {filteredBots.map((bb, index) => (
                    <div
                      key={bb.id}
                      role="gridcell"
                      tabIndex={index === 0 ? 0 : -1}
                      onKeyDown={(event) => handleKeyDown(event, index)}
                      className="rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <BaleybotCard
                        id={bb.id}
                        name={bb.name}
                        description={bb.description}
                        icon={bb.icon}
                        status={bb.status as BaleybotStatus}
                        version={bb.version}
                        executionCount={bb.executionCount ?? 0}
                        lastExecutedAt={asDate(bb.lastExecutedAt)}
                        onExecute={handleExecute}
                        onActivate={handleActivate}
                        onPause={handlePause}
                        onDelete={handleDelete}
                        onInspect={(id) => setInspectedBotId(id)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              allVisibleSelected
                                ? true
                                : someVisibleSelected
                                  ? 'indeterminate'
                                  : false
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedBotIds((prev) => {
                                  const next = new Set(prev);
                                  for (const bot of filteredBots) {
                                    next.add(bot.id);
                                  }
                                  return next;
                                });
                              } else {
                                setSelectedBotIds((prev) => {
                                  const next = new Set(prev);
                                  for (const bot of filteredBots) {
                                    next.delete(bot.id);
                                  }
                                  return next;
                                });
                              }
                            }}
                            aria-label="Select all visible BaleyBots"
                          />
                        </TableHead>
                        <TableHead>BaleyBot</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last run</TableHead>
                        <TableHead>Runs</TableHead>
                        <TableHead>Last result</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBots.map((bb) => (
                        <TableRow
                          key={bb.id}
                          className="cursor-pointer"
                          onClick={() => setInspectedBotId(bb.id)}
                        >
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selectedBotIds.has(bb.id)}
                              onCheckedChange={() => toggleSelection(bb.id)}
                              aria-label={`Select ${bb.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg">
                                {bb.icon?.trim() || '🤖'}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{bb.name}</p>
                                {bb.description ? (
                                  <p className="line-clamp-1 text-xs text-muted-foreground">
                                    {bb.description}
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No description yet</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={cn(getStatusTone(bb.status as BaleybotStatus), 'shrink-0')}>
                              {(bb.status as string).charAt(0).toUpperCase() + (bb.status as string).slice(1)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatTimeAgo(bb.lastExecutedAt)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {bb.executionCount ?? 0}
                          </TableCell>
                          <TableCell>
                            {bb.lastExecution?.status ? (
                              getExecutionStatusBadge(bb.lastExecution.status as ExecutionStatus)
                            ) : (
                              <span className="text-xs text-muted-foreground">No runs</span>
                            )}
                          </TableCell>
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setInspectedBotId(bb.id)}
                                aria-label={`Inspect ${bb.name}`}
                              >
                                <PanelRightOpen className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => handleExecute(bb.id)}
                                aria-label={`Open workspace for ${bb.name}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : allBots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10">
                <EmptyState
                  icon={Bot}
                  title="No BaleyBots yet"
                  description="Start with one sentence above and we will guide you from draft to first successful run."
                  action={{
                    label: 'Create your first BaleyBot',
                    href: ROUTES.baleybots.create,
                  }}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10">
                <EmptyState
                  icon={Search}
                  title="No matching BaleyBots"
                  description="Try clearing one or more filters to broaden results."
                  action={{
                    label: 'Reset filters',
                    onClick: () => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setSmartView('all');
                    },
                  }}
                />
              </div>
            )}
          </section>
        </div>
      </div>

      <SlidePanel
        open={!!inspectedBotId}
        onOpenChange={(open) => {
          if (!open) setInspectedBotId(null);
        }}
        width="default"
        title={inspectedBotSummary?.name ?? 'BaleyBot details'}
        description={inspectedBotSummary?.description ?? 'Inspect status, activity, and run controls.'}
        footer={
          <SlidePanelFooter>
            {inspectedBotSummary && (
              <>
                <Button variant="outline" asChild>
                  <Link href={ROUTES.baleybots.detail(inspectedBotSummary.id)}>
                    Open workspace
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                {inspectedBotSummary.status === 'active' ? (
                  <Button
                    variant="outline"
                    onClick={() => handlePause(inspectedBotSummary.id)}
                    disabled={isMutating}
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => handleActivate(inspectedBotSummary.id)}
                    disabled={isMutating}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Activate
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(inspectedBotSummary.id)}
                  disabled={isMutating}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </SlidePanelFooter>
        }
      >
        {inspectedBotSummary ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl">
                {inspectedBotSummary.icon?.trim() || '🤖'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{inspectedBotSummary.name}</span>
                  <span className={getStatusTone(inspectedBotSummary.status as BaleybotStatus)}>
                    {(inspectedBotSummary.status as string).charAt(0).toUpperCase() +
                      (inspectedBotSummary.status as string).slice(1)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Updated {formatTimeAgo(inspectedBotSummary.updatedAt)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-xs text-muted-foreground">Total runs</p>
                <p className="text-xl font-semibold">{inspectedBotSummary.executionCount ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-xs text-muted-foreground">Last run</p>
                <p className="text-sm font-semibold">{formatTimeAgo(inspectedBotSummary.lastExecutedAt)}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Recent executions
              </h3>

              {isLoadingInspectedBot ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((value) => (
                    <Skeleton key={value} className="h-16" />
                  ))}
                </div>
              ) : inspectedBot?.executions?.length ? (
                <div className="space-y-2">
                  {inspectedBot.executions.map((execution) => (
                    <div
                      key={execution.id}
                      className="rounded-xl border border-border/60 bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{execution.triggeredBy || 'manual'} trigger</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(execution.startedAt)}
                          </p>
                        </div>
                        {getExecutionStatusBadge(execution.status as ExecutionStatus)}
                      </div>

                      {execution.durationMs != null && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Duration: {execution.durationMs >= 1000
                            ? `${(execution.durationMs / 1000).toFixed(1)}s`
                            : `${execution.durationMs}ms`}
                        </p>
                      )}

                      {execution.error && (
                        <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-700 dark:text-red-400">
                          {String(execution.error).slice(0, 200)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No executions yet. Run this BaleyBot once to validate behavior.
                </p>
              )}
            </div>

            {inspectedBotSummary.lastExecution?.status === 'failed' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                Last run failed. Open the workspace to inspect logs and tune prompts or connections.
              </div>
            )}

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Novice-safe workflow</p>
              <p className="mt-1">
                Keep creation in plain language. Use this panel for management and checks after the first successful run.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Select a BaleyBot to inspect status and recent activity.
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
