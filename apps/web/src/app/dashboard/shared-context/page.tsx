'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { EmptyState } from '@/components/ui/empty-state';
import { UnifiedStatusBadge } from '@/components/ui/unified-status-badge';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { PageShell } from '@/components/layout/page-shell';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/format';
import type { FileReaderResult } from '@/hooks/useFileReader';
import {
  BookOpen, Plus, Pencil, Trash2, Check, Upload, FileText,
  Loader2, Sparkles, Search, PanelRightOpen, Zap, Pause,
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'domain_knowledge', label: 'Domain Knowledge' },
  { value: 'coding_standards', label: 'Coding Standards' },
  { value: 'safety_rules', label: 'Safety Rules' },
  { value: 'brand_voice', label: 'Brand Voice' },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]['value'];

function categoryLabel(value: string | null): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value ?? 'General';
}

function categoryColor(value: string | null): string {
  switch (value) {
    case 'safety_rules': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'brand_voice': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    case 'coding_standards': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    case 'domain_knowledge': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    default: return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface SuggestedEntry {
  key: string;
  value: string;
  category: string;
  description: string;
}

type SmartView = 'all' | 'active' | 'inactive' | 'ai_imported' | 'recent';
type SortMode = 'newest' | 'oldest' | 'alpha' | 'category';
type PanelMode = 'view' | 'create' | 'edit' | null;
type ImportStep = 'input' | 'processing' | 'review';

const SMART_VIEW_COPY: Record<SmartView, { label: string; description: string }> = {
  all: { label: 'All entries', description: 'Everything in the workspace.' },
  active: { label: 'Active only', description: 'Currently injected into executions.' },
  inactive: { label: 'Inactive', description: 'Disabled entries.' },
  ai_imported: { label: 'AI-imported', description: 'Extracted from uploaded files.' },
  recent: { label: 'Recently added', description: 'Created in the last 7 days.' },
};

// ============================================================================
// PAGE
// ============================================================================

export default function SharedContextPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.sharedContext.list.useQuery();

  // Smart views & filtering
  const [smartView, setSmartView] = useState<SmartView>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // Table selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // SlidePanel state
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('general');

  // Import SlidePanel state
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>('input');
  const [importContent, setImportContent] = useState('');
  const [importSource, setImportSource] = useState('');
  const [importFileData, setImportFileData] = useState<string | null>(null);
  const [importFileMimeType, setImportFileMimeType] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedEntry[] | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [processSummary, setProcessSummary] = useState('');

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const createMutation = trpc.sharedContext.create.useMutation({
    onSuccess: () => {
      utils.sharedContext.list.invalidate();
      closePanel();
      toast({ title: 'Entry created' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = trpc.sharedContext.update.useMutation({
    onSuccess: () => {
      utils.sharedContext.list.invalidate();
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = trpc.sharedContext.delete.useMutation({
    onSuccess: () => {
      utils.sharedContext.list.invalidate();
      setDeleteId(null);
      if (inspectedId === deleteId) closePanel();
      toast({ title: 'Entry deleted' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const processMutation = trpc.sharedContext.processContent.useMutation({
    onSuccess: (data) => {
      const typedEntries = (data.entries as SuggestedEntry[]).filter(
        (e) => e.key && e.value
      );
      setSuggestions(typedEntries);
      setSelectedIndices(new Set(typedEntries.map((_, i) => i)));
      setProcessSummary(data.summary);
      setImportStep('review');
    },
    onError: (err) => {
      toast({ title: 'Processing failed', description: err.message, variant: 'destructive' });
      setImportStep('input');
    },
  });

  const batchMutation = trpc.sharedContext.createBatch.useMutation({
    onSuccess: ({ created }) => {
      utils.sharedContext.list.invalidate();
      resetImport();
      toast({ title: `${created} context ${created === 1 ? 'entry' : 'entries'} created` });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const bulkDeleteMutation = trpc.sharedContext.bulkDelete.useMutation({
    onSuccess: ({ deleted }) => {
      utils.sharedContext.list.invalidate();
      toast({ title: `${deleted} ${deleted === 1 ? 'entry' : 'entries'} deleted` });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const bulkUpdateMutation = trpc.sharedContext.bulkUpdate.useMutation({
    onSuccess: ({ updated }) => {
      utils.sharedContext.list.invalidate();
      const action = 'updated';
      toast({ title: `${updated} ${updated === 1 ? 'entry' : 'entries'} ${action}` });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // ============================================================================
  // DERIVED DATA
  // ============================================================================

  const allEntries = entries ?? [];

  const activeCount = allEntries.filter((e) => e.isActive).length;
  const inactiveCount = allEntries.filter((e) => !e.isActive).length;
  const aiImportedCount = allEntries.filter((e) => e.contentType === 'file').length;
  const categoriesUsed = new Set(allEntries.map((e) => e.category ?? 'general')).size;

  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = allEntries.filter((e) => {
    const created = new Date(e.createdAt).getTime();
    return created >= recentCutoff;
  }).length;

  const lastUpdated = allEntries.length > 0
    ? allEntries.reduce((latest, e) => {
        const t = new Date(e.updatedAt).getTime();
        return t > latest ? t : latest;
      }, 0)
    : null;

  const smartViewCounts: Record<SmartView, number> = {
    all: allEntries.length,
    active: activeCount,
    inactive: inactiveCount,
    ai_imported: aiImportedCount,
    recent: recentCount,
  };

  // Category breakdown for sidebar
  const categoryBreakdown: Array<{ value: string; label: string; count: number }> = [];
  const categoryCounts = new Map<string, number>();
  for (const entry of allEntries) {
    const cat = entry.category ?? 'general';
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  for (const [cat, count] of categoryCounts) {
    categoryBreakdown.push({ value: cat, label: categoryLabel(cat), count });
  }

  // Filtering
  const matchesSmartView = (entry: (typeof allEntries)[number]) => {
    if (smartView === 'all') return true;
    if (smartView === 'active') return entry.isActive;
    if (smartView === 'inactive') return !entry.isActive;
    if (smartView === 'ai_imported') return entry.contentType === 'file';
    if (smartView === 'recent') return new Date(entry.createdAt).getTime() >= recentCutoff;
    return true;
  };

  const filteredEntries = allEntries
    .filter((entry) => {
      const matchesSearch =
        !searchQuery ||
        entry.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.value.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || entry.category === categoryFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && entry.isActive) ||
        (statusFilter === 'inactive' && !entry.isActive);
      return matchesSearch && matchesCategory && matchesStatus && matchesSmartView(entry);
    })
    .sort((a, b) => {
      if (sortMode === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortMode === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortMode === 'alpha') return a.key.localeCompare(b.key);
      if (sortMode === 'category') return (a.category ?? '').localeCompare(b.category ?? '');
      return 0;
    });

  const inspectedEntry = allEntries.find((e) => e.id === inspectedId) ?? null;

  const allVisibleSelected =
    filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.has(e.id));
  const someVisibleSelected = filteredEntries.some((e) => selectedIds.has(e.id));
  const selectedEntries = allEntries.filter((e) => selectedIds.has(e.id));

  const hasFilters = searchQuery || categoryFilter !== 'all' || statusFilter !== 'all' || smartView !== 'all';

  // ============================================================================
  // HELPERS
  // ============================================================================

  function closePanel() {
    setPanelMode(null);
    setInspectedId(null);
    setFormKey('');
    setFormValue('');
    setFormDescription('');
    setFormCategory('general');
  }

  function openCreate() {
    setFormKey('');
    setFormValue('');
    setFormDescription('');
    setFormCategory('general');
    setInspectedId(null);
    setPanelMode('create');
  }

  function openView(id: string) {
    setInspectedId(id);
    setPanelMode('view');
  }

  function openEdit() {
    if (!inspectedEntry) return;
    setFormKey(inspectedEntry.key);
    setFormValue(inspectedEntry.value);
    setFormDescription(inspectedEntry.description ?? '');
    setFormCategory(inspectedEntry.category ?? 'general');
    setPanelMode('edit');
  }

  function handleSubmit() {
    if (panelMode === 'edit' && inspectedId) {
      updateMutation.mutate(
        {
          id: inspectedId,
          value: formValue,
          description: formDescription || undefined,
          category: formCategory as CategoryValue,
        },
        {
          onSuccess: () => {
            closePanel();
            toast({ title: 'Entry updated' });
          },
        }
      );
    } else if (panelMode === 'create') {
      createMutation.mutate({
        key: formKey,
        value: formValue,
        description: formDescription || undefined,
        category: formCategory as CategoryValue,
      });
    }
  }

  function resetImport() {
    setImportOpen(false);
    setImportStep('input');
    setImportContent('');
    setImportSource('');
    setImportFileData(null);
    setImportFileMimeType(null);
    setSuggestions(null);
    setSelectedIndices(new Set());
    setEditingIndex(null);
    setProcessSummary('');
  }

  function handleFileResult(result: FileReaderResult) {
    setImportContent(result.content);
    setImportSource(result.fileName);
    setImportFileData(result.fileData);
    setImportFileMimeType(result.mimeType);
  }

  function handleProcess() {
    if (!importContent.trim()) return;
    setImportStep('processing');
    processMutation.mutate({
      content: importContent,
      source: importSource || undefined,
      fileData: importFileData ?? undefined,
      fileMimeType: importFileMimeType ?? undefined,
    });
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSuggestionSelection(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleSaveSelected() {
    if (!suggestions) return;
    const selected = suggestions.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;

    batchMutation.mutate({
      entries: selected.map((s) => ({
        key: s.key,
        value: s.value,
        description: s.description || undefined,
        category: (CATEGORIES.find((c) => c.value === s.category) ? s.category : 'general') as CategoryValue,
        contentType: importFileData ? 'file' as const : 'text' as const,
        fileMetadata: importSource ? {
          fileName: importSource,
          fileType: importFileMimeType ?? 'text/plain',
          fileSizeBytes: importContent.length,
          uploadedAt: new Date().toISOString(),
        } : undefined,
      })),
    });
  }

  function updateSuggestion(index: number, updates: Partial<SuggestedEntry>) {
    setSuggestions((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index]!, ...updates };
      return next;
    });
  }

  function runBulkAction(action: 'activate' | 'deactivate' | 'delete') {
    if (selectedEntries.length === 0) return;
    const ids = selectedEntries.map((e) => e.id);

    if (action === 'delete') {
      if (inspectedId && selectedIds.has(inspectedId)) closePanel();
      bulkDeleteMutation.mutate({ ids }, { onSuccess: () => setSelectedIds(new Set()) });
    } else {
      const isActive = action === 'activate';
      bulkUpdateMutation.mutate({ ids, isActive }, { onSuccess: () => setSelectedIds(new Set()) });
    }
  }

  function clearFilters() {
    setSearchQuery('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setSmartView('all');
  }

  const isMutating = updateMutation.isPending || deleteMutation.isPending || bulkDeleteMutation.isPending || bulkUpdateMutation.isPending;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <PageShell
      title={
        <span className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          Shared Context
        </span>
      }
      description="Define workspace-wide knowledge that gets injected into every BaleyBot execution."
      actions={
        <>
          <Button variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Manually
          </Button>
          <Button onClick={() => { setImportOpen(true); setImportStep('input'); }}>
            <Sparkles className="h-4 w-4 mr-2" />
            Import with AI
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* ================================================================ */}
        {/* LEFT SIDEBAR                                                     */}
        {/* ================================================================ */}
        <aside className="space-y-4">
          {/* Stats Card */}
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Context snapshot
            </h2>
            {isLoading ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Total entries</span>
                  <span className="font-semibold">{allEntries.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Active</span>
                  <span className="font-semibold">{activeCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Inactive</span>
                  <span className="font-semibold">{inactiveCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Categories used</span>
                  <span className="font-semibold">{categoriesUsed}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>Last updated</span>
                  <span className="font-semibold text-xs">{lastUpdated ? formatTimeAgo(lastUpdated) : '-'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Smart Views Card */}
          <div className="rounded-2xl border border-border/60 bg-card p-3">
            <h2 className="px-1 pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Smart views
            </h2>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {(Object.keys(SMART_VIEW_COPY) as SmartView[]).map((view) => {
                  const selected = smartView === view;
                  return (
                    <button
                      key={view}
                      type="button"
                      onClick={() => {
                        setSmartView(view);
                        setCategoryFilter('all');
                        setStatusFilter('all');
                      }}
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

                {/* Category breakdown */}
                {categoryBreakdown.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      By category
                    </p>
                    {categoryBreakdown.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(cat.value);
                          setSmartView('all');
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors',
                          categoryFilter === cat.value && smartView === 'all'
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-transparent hover:border-border hover:bg-muted/40'
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', categoryColor(cat.value))}>
                            {cat.label}
                          </Badge>
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                          {cat.count}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm">
            <div className="flex items-start gap-2">
              <BookOpen className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">How shared context works</p>
                <p className="mt-1 text-muted-foreground">
                  Active entries are injected into every BaleyBot execution as system knowledge.
                  Use this to enforce domain rules, safety guidelines, and brand standards.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ================================================================ */}
        {/* MAIN CONTENT AREA                                                */}
        {/* ================================================================ */}
        <section className="space-y-4">
          {/* Search + Filter + Sort Toolbar */}
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by key or value"
                  className="pl-9"
                />
              </div>

              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setSmartView('all'); }}>
                <SelectTrigger className="w-full md:w-[170px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="alpha">Alphabetical</SelectItem>
                  <SelectItem value="category">By category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Showing <span className="font-medium text-foreground">{filteredEntries.length}</span> of{' '}
                <span className="font-medium text-foreground">{allEntries.length}</span> entries
              </span>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {selectedEntries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <span className="text-sm font-medium">
                {selectedEntries.length} selected
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
                onClick={() => runBulkAction('deactivate')}
                disabled={isMutating}
              >
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                Deactivate
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
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </Button>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : filteredEntries.length > 0 ? (
            <div className="animate-fade-in overflow-hidden rounded-2xl border border-border/60 bg-card">
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
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              for (const entry of filteredEntries) next.add(entry.id);
                              return next;
                            });
                          } else {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              for (const entry of filteredEntries) next.delete(entry.id);
                              return next;
                            });
                          }
                        }}
                        aria-label="Select all visible entries"
                      />
                    </TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="hidden lg:table-cell">Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer"
                      onClick={() => openView(entry.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={() => toggleSelection(entry.id)}
                          aria-label={`Select ${entry.key}`}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{entry.key}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={categoryColor(entry.category)}>
                          {categoryLabel(entry.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="block max-w-md truncate text-sm text-muted-foreground">
                          {entry.value}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={entry.isActive}
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({ id: entry.id, isActive: checked })
                          }
                          aria-label={`Toggle ${entry.key}`}
                        />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {entry.contentType === 'file' ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            AI
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                            Manual
                          </span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openView(entry.id)}
                            aria-label={`Inspect ${entry.key}`}
                          >
                            <PanelRightOpen className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : allEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10">
              <EmptyState
                icon={BookOpen}
                title="No Shared Context Entries"
                description="Add workspace-wide knowledge that all BaleyBots will see during execution."
                action={{
                  label: 'Add Your First Entry',
                  onClick: openCreate,
                }}
              />
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Manually
                </Button>
                <Button onClick={() => { setImportOpen(true); setImportStep('input'); }}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Import with AI
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10">
              <EmptyState
                icon={Search}
                title="No matching entries"
                description="Try clearing one or more filters to broaden results."
                action={{
                  label: 'Clear Filters',
                  onClick: clearFilters,
                }}
              />
            </div>
          )}
        </section>
      </div>

      {/* ================================================================ */}
      {/* VIEW / CREATE / EDIT SLIDE PANEL                                 */}
      {/* ================================================================ */}
      <SlidePanel
        open={panelMode !== null}
        onOpenChange={(open) => { if (!open) closePanel(); }}
        width="default"
        title={
          panelMode === 'create'
            ? 'New Context Entry'
            : panelMode === 'edit'
              ? 'Edit Entry'
              : inspectedEntry?.key ?? 'Entry details'
        }
        description={
          panelMode === 'create'
            ? 'Add a new knowledge entry for all BaleyBots.'
            : panelMode === 'edit'
              ? 'Update this entry\'s value, description, or category.'
              : 'Inspect and manage this shared context entry.'
        }
        footer={
          <SlidePanelFooter>
            {panelMode === 'view' && inspectedEntry && (
              <>
                <Button variant="outline" onClick={openEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteId(inspectedEntry.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
            {(panelMode === 'create' || panelMode === 'edit') && (
              <>
                <Button variant="outline" onClick={() => panelMode === 'edit' ? setPanelMode('view') : closePanel()}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    (panelMode === 'create' && !formKey.trim()) ||
                    !formValue.trim() ||
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {panelMode === 'edit' ? 'Save Changes' : 'Create Entry'}
                </Button>
              </>
            )}
          </SlidePanelFooter>
        }
      >
        {panelMode === 'view' && inspectedEntry && (
          <div className="space-y-5">
            {/* Header card */}
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl">
                {inspectedEntry.contentType === 'file' ? (
                  <FileText className="h-5 w-5 text-primary" />
                ) : (
                  <Pencil className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{inspectedEntry.key}</span>
                  <Badge variant="outline" className={categoryColor(inspectedEntry.category)}>
                    {categoryLabel(inspectedEntry.category)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Updated {formatTimeAgo(inspectedEntry.updatedAt)}
                </p>
              </div>
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <UnifiedStatusBadge
                  status={inspectedEntry.isActive ? 'active' : 'paused'}
                  domain="lifecycle"
                  size="sm"
                />
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="text-sm font-semibold flex items-center gap-1.5 mt-0.5">
                  {inspectedEntry.contentType === 'file' ? (
                    <><FileText className="h-3.5 w-3.5" /> AI Imported</>
                  ) : (
                    <><Pencil className="h-3.5 w-3.5" /> Manual</>
                  )}
                </p>
              </div>
            </div>

            <Separator />

            {/* Full value */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Value
              </h3>
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-sm whitespace-pre-wrap">{inspectedEntry.value}</p>
              </div>
            </div>

            {/* Description */}
            {inspectedEntry.description && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Description
                </h3>
                <p className="text-sm text-muted-foreground">{inspectedEntry.description}</p>
              </div>
            )}

            {/* File metadata */}
            {inspectedEntry.contentType === 'file' && !!inspectedEntry.fileMetadata && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  File metadata
                </h3>
                <div className="rounded-xl border border-border/60 bg-card p-3 text-sm space-y-1">
                  {(() => {
                    const meta = inspectedEntry.fileMetadata as Record<string, unknown>;
                    return (
                      <>
                        {meta.fileName && <p><span className="text-muted-foreground">File:</span> {String(meta.fileName)}</p>}
                        {meta.fileType && <p><span className="text-muted-foreground">Type:</span> {String(meta.fileType)}</p>}
                        {meta.fileSizeBytes && <p><span className="text-muted-foreground">Size:</span> {Math.round(Number(meta.fileSizeBytes) / 1024)}KB</p>}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>Created {formatTimeAgo(inspectedEntry.createdAt)}</p>
              <p>Last updated {formatTimeAgo(inspectedEntry.updatedAt)}</p>
            </div>
          </div>
        )}

        {(panelMode === 'create' || panelMode === 'edit') && (
          <div className="space-y-4">
            {panelMode === 'create' && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Key</label>
                <Input
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="e.g. Brand Voice, Safety Rule, Domain Knowledge"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Value</label>
              <Textarea
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="The content that will be shared with all BaleyBots"
                rows={6}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Internal note about this entry"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Category</label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </SlidePanel>

      {/* ================================================================ */}
      {/* AI IMPORT SLIDE PANEL                                            */}
      {/* ================================================================ */}
      <SlidePanel
        open={importOpen}
        onOpenChange={(open) => { if (!open) resetImport(); }}
        width="wide"
        title="Import with AI"
        description="Paste text or upload a file. AI will analyze it and suggest structured context entries."
      >
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0 mb-6">
          {(['input', 'processing', 'review'] as const).map((step, i) => {
            const stepNum = i + 1;
            const labels = ['Upload', 'Processing', 'Review'];
            const isCurrent = importStep === step;
            const isComplete =
              (step === 'input' && (importStep === 'processing' || importStep === 'review')) ||
              (step === 'processing' && importStep === 'review');

            return (
              <div key={step} className="flex items-center">
                {i > 0 && (
                  <div className={cn(
                    'h-0.5 w-8',
                    isComplete || isCurrent ? 'bg-primary' : 'bg-border'
                  )} />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                      isCurrent || isComplete
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : stepNum}
                  </div>
                  <span className={cn(
                    'text-[10px] font-medium',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {labels[i]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Step */}
        {importStep === 'input' && (
          <div className="space-y-4">
            <Tabs defaultValue="paste" className="w-full">
              <TabsList>
                <TabsTrigger value="paste">
                  <FileText className="h-4 w-4 mr-2" />
                  Paste Text
                </TabsTrigger>
                <TabsTrigger value="upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </TabsTrigger>
              </TabsList>
              <TabsContent value="paste" className="mt-4">
                <Textarea
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  placeholder="Paste your company handbook, coding standards, brand guidelines, domain knowledge, or any reference material..."
                  rows={10}
                  className="font-mono text-sm"
                />
              </TabsContent>
              <TabsContent value="upload" className="mt-4">
                <FileDropzone
                  onFile={handleFileResult}
                  maxSizeMb={10}
                  preview={
                    importFileData
                      ? { data: importFileData, mimeType: importFileMimeType ?? 'application/octet-stream', name: importSource }
                      : importSource
                        ? { data: '', mimeType: 'text/plain', name: importSource, description: `${Math.round(importContent.length / 1024)}KB loaded` }
                        : null
                  }
                />
              </TabsContent>
            </Tabs>

            <div className="flex gap-2">
              <Button
                onClick={handleProcess}
                disabled={!importContent.trim() || processMutation.isPending}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Process with AI
              </Button>
              <Button variant="outline" onClick={resetImport}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Processing Step */}
        {importStep === 'processing' && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Analyzing content...</p>
            <p className="text-sm text-muted-foreground mt-1">
              {importFileData
                ? 'The AI is examining the uploaded file and extracting structured knowledge.'
                : 'The AI is reading the text and extracting structured knowledge.'}
            </p>
          </div>
        )}

        {/* Review Step */}
        {importStep === 'review' && suggestions && (
          <div className="space-y-4">
            {/* Summary card */}
            {processSummary && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
                <p className="font-medium">Summary</p>
                <p className="text-muted-foreground mt-1">{processSummary}</p>
              </div>
            )}

            {suggestions.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No entries extracted"
                description="The AI couldn't extract structured entries from this content. Try different content or paste more detailed text."
                action={{
                  label: 'Try Again',
                  onClick: () => {
                    setSuggestions(null);
                    setImportStep('input');
                  },
                }}
              />
            ) : (
              <>
                {/* Selection header */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedIndices.size} of {suggestions.length} selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIndices(new Set(suggestions.map((_, i) => i)))}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIndices(new Set())}
                    >
                      Deselect all
                    </Button>
                  </div>
                </div>

                {/* Suggestion cards */}
                <div className="flex flex-col gap-3">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className={cn(
                        'border rounded-xl p-4 transition-colors',
                        selectedIndices.has(i) ? 'border-primary/30 bg-primary/5' : 'opacity-50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedIndices.has(i)}
                          onCheckedChange={() => toggleSuggestionSelection(i)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          {editingIndex === i ? (
                            <div className="flex flex-col gap-2">
                              <Input
                                value={s.key}
                                onChange={(e) => updateSuggestion(i, { key: e.target.value })}
                                placeholder="Key"
                                className="font-semibold"
                              />
                              <Textarea
                                value={s.value}
                                onChange={(e) => updateSuggestion(i, { value: e.target.value })}
                                placeholder="Value"
                                rows={2}
                              />
                              <Select
                                value={CATEGORIES.find((c) => c.value === s.category) ? s.category : 'general'}
                                onValueChange={(v) => updateSuggestion(i, { category: v })}
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CATEGORIES.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {/* Show AI's original category if non-standard */}
                              {!CATEGORIES.find((c) => c.value === s.category) && (
                                <p className="text-xs text-muted-foreground">
                                  AI suggested: <span className="font-medium">{s.category}</span> — mapped to closest category above
                                </p>
                              )}
                              <Button size="sm" variant="outline" onClick={() => setEditingIndex(null)}>
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Done
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold">{s.key}</span>
                                <Badge variant="outline" className={categoryColor(
                                  CATEGORIES.find((c) => c.value === s.category) ? s.category : 'general'
                                )}>
                                  {categoryLabel(
                                    CATEGORIES.find((c) => c.value === s.category) ? s.category : s.category
                                  )}
                                </Badge>
                                {!CATEGORIES.find((c) => c.value === s.category) && (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    AI category
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-foreground">{s.value}</p>
                              {s.description && (
                                <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                              )}
                            </>
                          )}
                        </div>
                        {editingIndex !== i && (
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingIndex(i)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSuggestions((prev) => prev?.filter((_, idx) => idx !== i) ?? null);
                                setSelectedIndices((prev) => {
                                  const next = new Set<number>();
                                  prev.forEach((idx) => {
                                    if (idx < i) next.add(idx);
                                    else if (idx > i) next.add(idx - 1);
                                  });
                                  return next;
                                });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={handleSaveSelected}
                    disabled={selectedIndices.size === 0 || batchMutation.isPending}
                  >
                    {batchMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Save Selected ({selectedIndices.size})
                  </Button>
                  <Button variant="outline" onClick={resetImport}>
                    Discard All
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </SlidePanel>

      {/* ================================================================ */}
      {/* DELETE CONFIRMATION DIALOG                                        */}
      {/* ================================================================ */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this shared context entry.
              BaleyBots will no longer see this knowledge during execution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
