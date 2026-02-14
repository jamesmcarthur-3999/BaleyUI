'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ConnectionsPanel will be wired into advanced mode
import { ChatInput, LeftPanel, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, ConnectionsPanel, BaleybotHeader } from '@/components/creator';
import type {
  TestCase,
} from '@/components/creator';
import type { ChatMessage, ChatAttachment } from '@/components/chat';
import { useBaleyChat } from '@/hooks/useBaleyChat';

// Dynamic import to avoid bundling @baleybots/core server-only modules in client
const VisualEditor = dynamic(
  () => import('@/components/visual-editor/VisualEditor').then(mod => ({ default: mod.VisualEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center bg-muted/20 rounded-2xl">
        <span className="text-sm text-muted-foreground">Loading visual editor...</span>
      </div>
    ),
  }
);
const BalCodeEditor = dynamic(
  () => import('@/components/baleybot/BalCodeEditor').then(mod => ({ default: mod.BalCodeEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center bg-muted/20 rounded-2xl">
        <span className="text-sm text-muted-foreground">Loading editor...</span>
      </div>
    ),
  }
);
import type { TriggerConfig as TriggerConfigType } from '@/lib/baleybot/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
// ConflictAction type is now handled internally by useBaleybotPersistence hook
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, LayoutGrid, Code2, MessageSquare, PanelRight, FlaskConical, Rocket, ClipboardList } from 'lucide-react';

function PanelSkeleton() {
  return (
    <div className="h-full flex items-center justify-center bg-muted/20 rounded-2xl">
      <span className="text-sm text-muted-foreground">Loading...</span>
    </div>
  );
}

const IntegrationDashboard = dynamic(
  () => import('@/components/integrate/IntegrationDashboard').then(mod => ({ default: mod.IntegrationDashboard })),
  { ssr: false, loading: () => <PanelSkeleton /> }
);
const BotMonitorPanel = dynamic(
  () => import('@/components/monitor').then(mod => ({ default: mod.BotMonitorPanel })),
  { ssr: false, loading: () => <PanelSkeleton /> }
);
const AdaptiveTestSurface = dynamic(
  () => import('@/components/test').then(mod => ({ default: mod.AdaptiveTestSurface })),
  { ssr: false, loading: () => <PanelSkeleton /> }
);
const PlanPreview = dynamic(
  () => import('@/components/plan').then(mod => ({ default: mod.PlanPreview })),
  { ssr: false, loading: () => <PanelSkeleton /> }
);
const TestSuitePanel = dynamic(
  () => import('@/components/test').then(mod => ({ default: mod.TestSuitePanel })),
  { ssr: false, loading: () => <PanelSkeleton /> }
);
// TestAnalysis type is used internally by TestSuitePanel via useTestStream
import { analyzeBotCapabilities } from '@/lib/baleybot/capabilities';
import { ROUTES } from '@/lib/routes';
import { ErrorBoundary } from '@/components/errors';
import { useDirtyState, useNavigationGuard, useHistory, useBaleybotPersistence, useSessionRecovery, useEditorNavigation, useReadiness } from '@/hooks';
import { useTestStream } from '@/hooks/use-test-stream';
import { safeParseDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type {
  VisualEntity,
  Connection,
  CreatorGuidanceAction,
  CreationStatus,
  AdaptiveTab,
  HistoryState,
  PlanPreviewData,
} from '@/lib/baleybot/creator-types';
import type { ReadinessState } from '@/lib/baleybot/readiness';
import type { GraphRuntimeEvent } from '@/lib/streaming/types/events';
import { parseBalCode } from '@/lib/baleybot/bal-parser-pure';
import { sanitizeCreatorText } from '@/lib/baleybot/creator-sanitization';
import { buildCreatorResultPatch } from '@/lib/baleybot/creator-response-handler';
import {
  extractSidecarFromStructure,
  buildDerivedGraphSidecar,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by GraphSidecar visualization (planned)
  appendGraphRuntimeEvent,
  escapeRegExp,
  buildGuidanceQuickPrompts,
} from '@/lib/baleybot/creator-helpers';
import { EXAMPLE_PROMPTS, TAB_QUICK_PROMPTS } from '@/lib/baleybot/creator-constants';

// Pure functions and constants extracted to:
// - @/lib/baleybot/creator-helpers.ts
// - @/lib/baleybot/creator-constants.ts
// - @/lib/baleybot/creator-response-handler.ts


/**
 * Unified BaleyBot creation and detail page.
 *
 * Handles both:
 * - New creation (id === 'new')
 * - Viewing/editing existing BaleyBots (id is a UUID)
 *
 * Provides a conversational interface for building and modifying BaleyBots
 * with a visual canvas showing the assembled entities and connections.
 *
 * Uses the unified Baley chat pipeline (useBaleyChat) for all AI interactions.
 */
export default function BaleybotPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const id = params.id as string;
  const isNew = id === 'new';
  const initialPrompt = searchParams.get('prompt');

  // =====================================================================
  // STATE
  // =====================================================================

  const { toast } = useToast();

  // -- Core Design --
  const [entities, setEntities] = useState<VisualEntity[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [balCode, setBalCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [icon, setIcon] = useState<string>('');

  // -- Conversation (managed by useBaleyChat) --
  const [creatorGuidanceActions, setCreatorGuidanceActions] = useState<CreatorGuidanceAction[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const initialPromptSentRef = useRef(false);

  // -- Persistence --
  const [savedBaleybotId, setSavedBaleybotId] = useState<string | null>(isNew ? null : id);

  // -- Navigation (managed by useEditorNavigation hook, initialized below after readiness) --
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- setter used by runtime graph panel (planned)
  const [runtimeGraphEvents, setRuntimeGraphEvents] = useState<GraphRuntimeEvent[]>([]);

  // -- Launch --
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType | undefined>(undefined);
  const [webhookInfo, setWebhookInfo] = useState<{ url: string; secret: string } | null>(null);

  // -- Plan Preview --
  const [planData, setPlanData] = useState<PlanPreviewData | null>(null);

  // -- Test Cases --
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isRegeneratingTests, setIsRegeneratingTests] = useState(false);

  // -- Confirmation Dialogs --
  const [showGoLiveDialog, setShowGoLiveDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);

  // -- Readiness (ref breaks circular dep: useReadiness ↔ useEditorNavigation) --
  const resetDesignGateReminderRef = useRef<(() => void) | null>(null);

  const leftPanelWidthClass = 'md:w-[380px] lg:w-[420px] xl:w-[460px]';

  // =====================================================================
  // UNDO/REDO HISTORY (Phase 3.5)
  // =====================================================================

  /**
   * Callback when undo/redo restores a state
   */
  const handleHistoryStateChange = (snapshot: HistoryState) => {
    setEntities(snapshot.entities);
    setConnections(snapshot.connections);
    setBalCode(snapshot.balCode);
    setName(snapshot.name);
    setIcon(snapshot.icon);
  };

  const {
    push: pushHistory,
    undo: handleUndo,
    redo: handleRedo,
    canUndo,
    canRedo,
  } = useHistory<HistoryState>({
    maxStates: 20,
    enableKeyboardShortcuts: true,
    onStateChange: handleHistoryStateChange,
  });

  // =====================================================================
  // KEYBOARD SHORTCUTS DIALOG (Phase 3.8)
  // =====================================================================

  const { isOpen: isShortcutsOpen, setIsOpen: setShortcutsOpen } = useKeyboardShortcutsDialog();

  // =====================================================================
  // NETWORK STATUS (Phase 5.6)
  // =====================================================================

  const { isOffline, isReconnecting } = useNetworkStatus();

  // =====================================================================
  // DERIVED STATE (replaces status state machine)
  // =====================================================================

  const hasContent = entities.length > 0 || balCode.length > 0;

  // =====================================================================
  // READINESS (design confirmation, specialist signals, readiness state)
  // Queries needed by readiness are co-located here to avoid stale values.
  // =====================================================================

  // Fetch workspace connections (for connections panel AND readiness computation)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- isLoadingConnections used by ConnectionsPanel (planned)
  const { data: workspaceConnections, isLoading: isLoadingConnections } = trpc.connections.list.useQuery(
    { limit: 50 },
  );

  // Fetch per-bot analytics (for readiness computation and Monitor tab)
  const { data: analyticsData } = trpc.analytics.getBaleybotAnalytics.useQuery(
    { baleybotId: savedBaleybotId! },
    { enabled: !!savedBaleybotId },
  );

  // =====================================================================
  // UNIFIED BALEY CHAT (replaces runCreatorStream + manual state)
  // =====================================================================

  const baley = useBaleyChat({
    mode: 'creator',
    creatorContext: {
      baleybotId: savedBaleybotId ?? undefined,
      currentState: {
        balCode,
        name: name || undefined,
        description: description || undefined,
        icon: icon || undefined,
        entities: entities.map(e => ({ name: e.name, purpose: e.purpose, tools: e.tools })),
      },
      uiState: {
        activeTab: 'visual', // Will be updated after viewMode is available
        availableTabs: ['visual', 'code'],
        lifecycleStage: 'draft',
        readinessSummary: '',
        triggerConfigured: !!triggerConfig,
        webhookEnabled: !!webhookInfo,
      },
    },
    creatorCallbacks: {
      onCreatorComplete: (result, specialist) => {
        // Apply builder state patch from creator result
        const patch = buildCreatorResultPatch({
          result,
          prevEntities: entities,
          prevConnections: connections,
          prevName: name,
          currentName: name,
          currentIcon: icon,
          currentDescription: description,
        });

        if (patch.entities) {
          setEntities(patch.entities);
          setTimeout(() => setEntities(prev => prev.map(e => ({ ...e, status: 'stable' as const }))), 600);
        }
        if (patch.connections) setConnections(patch.connections);
        if (patch.balCode !== undefined) setBalCode(patch.balCode);
        if (patch.name) setName(patch.name);
        if (patch.icon) setIcon(patch.icon);
        if (patch.description) setDescription(patch.description);
        if (patch.historyEntry) pushHistory(patch.historyEntry.state, patch.historyEntry.label);
        if (!patch.isConversationOnly) setLastError(null);
        if (patch.resetDesignConfirmation) {
          setIsDesignConfirmed(false);
          resetDesignGateReminder();
        }

        // Update specialist signals for readiness
        if (specialist) {
          setSpecialistSignals(prev => ({
            ...prev,
            connectionAdvisorRan: prev.connectionAdvisorRan || !!specialist.connections,
            testOrchestratorRan: prev.testOrchestratorRan || !!specialist.tests,
            deploymentAdvisorRan: prev.deploymentAdvisorRan || !!specialist.deployment,
          }));
        }
      },
      onConnectionAction: (_action, _result) => {
        utils.connections.list.invalidate();
      },
      onTriggerSaved: (config) => {
        setTriggerConfig(config as TriggerConfigType);
        if (savedBaleybotId) utils.baleybots.getTriggerConfig.invalidate({ baleybotId: savedBaleybotId });
      },
      onWebhookEnabled: (url, secret) => {
        setWebhookInfo({ url, secret });
        if (savedBaleybotId) utils.baleybots.get.invalidate({ id: savedBaleybotId });
      },
      onShowPlan: (plan) => {
        setPlanData(plan);
        navigateToTab('plan' as AdaptiveTab, { bypassDesignGate: true });
      },
      onShowSurface: (surface, reason) => {
        navigateToTab(surface as AdaptiveTab, { bypassDesignGate: true });
        if (reason) {
          toast({
            title: `Switched to ${surface.charAt(0).toUpperCase() + surface.slice(1)}`,
            description: reason,
          });
        }
        setLastAINavigatedTab(surface);
        setTimeout(() => setLastAINavigatedTab(null), 3000);
      },
    },
  });

  // Derive isStreaming and messages from baley hook
  const { isStreaming, messages: baleyMessages } = baley;

  // External message state for injecting system messages (errors, advisor actions, etc.)
  const [injectedMessages, setInjectedMessages] = useState<ChatMessage[]>([]);

  // Merged message list: baley messages + injected system messages
  const allMessages = [...baleyMessages, ...injectedMessages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Backward-compatible derived status for component props and query inputs
  const status: CreationStatus = isStreaming ? 'building'
    : lastError ? 'error'
    : (hasContent || allMessages.length > 0) ? 'ready'
    : 'empty';

  const {
    readiness,
    setIsDesignConfirmed,
    isDesignReviewRequired,
    setSpecialistSignals,
  } = useReadiness({
    entities,
    balCode,
    testCases,
    triggerConfig,
    workspaceConnections,
    analyticsData,
    isNew,
    status,
    resetDesignGateReminderRef,
  });

  // =====================================================================
  // EDITOR NAVIGATION (tabs, builder mode, mobile view, design gate)
  // =====================================================================

  const {
    viewMode,
    setViewMode,
    builderMode,
    setBuilderMode,
    mobileView,
    setMobileView,
    availableTabs,
    navigateToTab,
    lastAINavigatedTab,
    setLastAINavigatedTab,
    resetDesignGateReminder,
  } = useEditorNavigation({
    readiness,
    savedBaleybotId,
    isDesignReviewRequired,
    hasPlanData: planData !== null,
  });

  // Wire up the ref to break circular dep (useReadiness needs this, useEditorNavigation provides it)
  resetDesignGateReminderRef.current = resetDesignGateReminder;

  // =====================================================================
  // DIRTY STATE TRACKING (Phase 1.1)
  // =====================================================================

  const dirtyState = {
    entities,
    connections,
    balCode,
    name,
    description,
    icon,
  };

  const { isDirty, markClean } = useDirtyState(dirtyState);

  // =====================================================================
  // TRPC QUERIES AND MUTATIONS
  // =====================================================================

  const utils = trpc.useUtils();

  // Fetch existing BaleyBot (only if not new)
  const { data: existingBaleybot, isLoading: isLoadingBaleybot, isFetching: isFetchingBaleybot } = trpc.baleybots.get.useQuery(
    { id },
    { enabled: !isNew }
  );

  // Track whether initial data has been loaded and state has been initialized
  // This prevents rendering with stale state before the effect populates data
  const [isStateInitialized, setIsStateInitialized] = useState(isNew);

  // Combined loading check: loading, fetching, or state not yet initialized from fetched data
  const isFullyLoaded = isNew || (!isLoadingBaleybot && !isFetchingBaleybot && isStateInitialized && existingBaleybot);

  // Fetch trigger config from baleybotTriggers table
  const { data: savedTriggerConfig } = trpc.baleybots.getTriggerConfig.useQuery(
    { baleybotId: savedBaleybotId! },
    { enabled: !!savedBaleybotId },
  );

  // Fetch recent executions for this bot (for token info + webhook deliveries)
  const { data: botExecutions } = trpc.analytics.getBaleybotExecutions.useQuery(
    { baleybotId: savedBaleybotId!, limit: 20 },
    { enabled: !!savedBaleybotId },
  );

  // Fetch API keys for code snippet display
  const { data: apiKeysData } = trpc.apiKeys.list.useQuery(undefined, {
    staleTime: 60_000,
  });

  // Launch prep readiness and runtime interface
  const {
    isFetching: isFetchingLaunchReadiness,
    refetch: refetchLaunchReadiness,
  } = trpc.baleybots.evaluateLaunchReadiness.useQuery(
    { baleybotId: savedBaleybotId!, requiredPassRate: 0.8 },
    { enabled: !!savedBaleybotId && viewMode === 'integrate' },
  );

  // Load trigger config when query completes
  useEffect(() => {
    if (savedTriggerConfig && !triggerConfig) {
      setTriggerConfig(savedTriggerConfig as unknown as TriggerConfigType);
    }
  }, [savedTriggerConfig, triggerConfig]);

  // Mutations
  const generateLaunchKitMutation = trpc.baleybots.generateLaunchKit.useMutation();
  const promoteToLiveMutation = trpc.baleybots.promoteToLive.useMutation();
  const pauseLiveBotMutation = trpc.baleybots.pauseLiveBot.useMutation();
  const revertToDraftMutation = trpc.baleybots.revertToDraft.useMutation();
  const saveTestCasesMutation = trpc.baleybots.saveTestCases.useMutation();
  const generateTestsMutation = trpc.baleybots.generateTests.useMutation();

  // Normalize workspace connections once for ConnectionsPanel
  const normalizedConnections = workspaceConnections?.map(c => ({
    id: c.id,
    type: c.type,
    name: c.name,
    status: c.status ?? 'unconfigured',
    isDefault: c.isDefault ?? false,
  }));
  const connectionToolSuggestions = (normalizedConnections ?? [])
    .filter(
      (connection) =>
        connection.status === 'connected' &&
        (connection.type === 'postgres' || connection.type === 'mysql')
    )
    .map((connection) =>
      `query_${connection.type}_${connection.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')}`
    );
  const savedStructureSidecar = extractSidecarFromStructure(existingBaleybot?.structure);
  const graphSidecar = buildDerivedGraphSidecar({
    entities,
    connections: normalizedConnections,
    existingSidecar: savedStructureSidecar,
  });
  const readinessContext = `Readiness: ${Object.entries(readiness).map(([dim, s]) => `${dim}=${s === 'complete'}`).join(', ')}. Active tab: ${viewMode}.`;
  const creatorGuidanceInput = {
    status,
    messages: allMessages
      .filter((m) => m.role !== 'system')
      .slice(-30)
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content.slice(0, 4000),
      })),
    readinessContext,
  };
  const {
    data: creatorGuidanceData,
  } = trpc.baleybots.getCreatorGuidance.useQuery(creatorGuidanceInput, {
    enabled: allMessages.length > 0 && status !== 'building',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (!creatorGuidanceData?.actions) return;
    if (isStreaming) return;
    setCreatorGuidanceActions(creatorGuidanceData.actions);
  }, [creatorGuidanceData, isStreaming]);

  const guidancePrompts = buildGuidanceQuickPrompts(creatorGuidanceActions);
  const quickPrompts = (viewMode === 'test' || viewMode === 'integrate')
    ? TAB_QUICK_PROMPTS[viewMode] ?? guidancePrompts
    : guidancePrompts;

  const quickPromptContextLabel = quickPrompts.length > 0
    ? (viewMode === 'test' ? 'Test suggestions' : viewMode === 'integrate' ? 'Integration options' : 'Suggested next action')
    : undefined;

  // =====================================================================
  // TEST EXECUTION HOOK (streaming SSE)
  // =====================================================================

  const testStream = useTestStream(savedBaleybotId ?? '');

  // Sync fix_applied BAL code changes back to editor state
  const latestBalCodeFromFix = testStream.latestBalCode;
  const prevLatestBalCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (latestBalCodeFromFix && latestBalCodeFromFix !== prevLatestBalCodeRef.current) {
      prevLatestBalCodeRef.current = latestBalCodeFromFix;
      setBalCode(latestBalCodeFromFix);
    }
  }, [latestBalCodeFromFix]);

  /**
   * Fetch advisor suggestions and inject them as a system message in the chat.
   * Called after lifecycle events (test completion, save, go-live).
   */
  const injectAdvisorSuggestions = async (_eventLabel: string) => {
    if (isStreaming) return;
    try {
      const result = await utils.baleybots.getCreatorGuidance.fetch(creatorGuidanceInput);
      if (result?.actions?.length) {
        const sanitizedActions = result.actions.map(a => ({
          ...a,
          label: sanitizeCreatorText(a.label),
          prompt: sanitizeCreatorText(a.prompt),
        }));
        setInjectedMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system' as const,
          content: `Here's what I'd suggest next: ${sanitizedActions.map(a => a.label).join(', ')}`,
          timestamp: new Date(),
          status: 'complete' as const,
        }]);
      }
    } catch { /* swallow — advisory, not critical */ }
  };

  // =====================================================================
  // HANDLERS
  // =====================================================================

  /**
   * Handle sending a message — delegates to useBaleyChat
   */
  const handleSendMessage = async (message: string, attachments?: ChatAttachment[]) => {
    setLastError(null);
    setCreatorGuidanceActions([]);
    baley.send(message, attachments);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- wired when ConnectionsPanel is added to advanced mode
  const handleApplyToolRemap = (remaps: Array<{ fromTool: string; toTool: string }>) => {
    if (remaps.length === 0) return;

    let updatedCode = balCode;
    const applied: Array<{ fromTool: string; toTool: string }> = [];

    for (const remap of remaps) {
      if (remap.fromTool === remap.toTool) continue;
      const pattern = new RegExp(`"${escapeRegExp(remap.fromTool)}"`, 'g');
      const nextCode = updatedCode.replace(pattern, `"${remap.toTool}"`);
      if (nextCode !== updatedCode) {
        updatedCode = nextCode;
        applied.push(remap);
      }
    }

    if (applied.length === 0 || updatedCode === balCode) return;

    handleCodeChange(updatedCode);

    toast({
      title: 'Tool Mapping Updated',
      description: `Remapped ${applied.length} tool${applied.length === 1 ? '' : 's'} in BAL code.`,
    });
  };

  // =====================================================================
  // PERSISTENCE (save, auto-save, conflict handling)
  // =====================================================================

  const {
    handleSave,
    debouncedSave,
    isSaving,
    isSavePending,
    showConflictDialog,
    setShowConflictDialog,
    handleConflictAction,
    isResolvingConflict,
  } = useBaleybotPersistence({
    savedBaleybotId,
    setSavedBaleybotId,
    balCode,
    name,
    description,
    icon,
    messages: allMessages,
    isDirty,
    isStreaming,
    markClean,
    onSaveSuccess: (id, isFirstSave) => {
      if (isFirstSave) {
        // Update URL without reload
        window.history.replaceState(null, '', ROUTES.baleybots.detail(id));
      }
      // Invalidate queries
      utils.baleybots.list.invalidate();
      if (savedBaleybotId) {
        utils.baleybots.get.invalidate({ id: savedBaleybotId });
      }
      utils.baleybots.getCreatorGuidance.invalidate();
      injectAdvisorSuggestions('Bot saved');
    },
    onError: (message) => setLastError(message),
    toast,
  });

  // Derived values that depend on isSaving from persistence hook
  const canSave = hasContent && !!balCode && !!name && !isSaving && !isStreaming;
  const isInputDisabled = isStreaming || isSaving;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- available for explicit launch prep panel
  const handleGenerateLaunchKit = async () => {
    if (!savedBaleybotId) return;
    try {
      await generateLaunchKitMutation.mutateAsync({ baleybotId: savedBaleybotId, requiredPassRate: 0.8 });
      await utils.baleybots.get.invalidate({ id: savedBaleybotId });
      await refetchLaunchReadiness();
    } catch (error) {
      toast({
        title: 'Launch kit generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // =====================================================================
  // TEST SUITE HANDLERS
  // =====================================================================

  const handleRunAllTests = () => {
    if (!savedBaleybotId || testCases.length === 0) return;
    testStream.startTestRun(testCases);
  };

  const handleRegenerateTests = async () => {
    if (!savedBaleybotId) return;
    setIsRegeneratingTests(true);
    try {
      const result = await generateTestsMutation.mutateAsync({
        baleybotId: savedBaleybotId,
        balCode,
        entities: entities.map(e => ({ name: e.name, tools: e.tools, purpose: e.purpose })),
      });

      if (result.tests) {
        const newCases: TestCase[] = (result.tests as Array<Record<string, unknown>>).map((tc, i) => ({
          id: (tc.id as string) ?? crypto.randomUUID(),
          name: (tc.name as string) ?? `Test ${i + 1}`,
          level: ((tc.level as string) ?? 'unit') as TestCase['level'],
          input: (tc.input as string) ?? '',
          expectedOutput: (tc.expectedOutput as string) ?? undefined,
          matchStrategy: (tc.matchStrategy as TestCase['matchStrategy']) ?? 'semantic',
          description: (tc.description as string) ?? undefined,
          status: 'pending' as const,
        }));
        setTestCases(newCases);

        // Persist the generated tests
        saveTestCasesMutation.mutate({ id: savedBaleybotId, testCases: newCases });

        // Auto-trigger streaming test run after generation
        if (newCases.length > 0) {
          setViewMode('test');
          // Small delay to let state settle before starting stream
          setTimeout(() => {
            testStream.startTestRun(newCases);
          }, 100);
        }
      }
    } catch (error) {
      toast({
        title: 'Test generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsRegeneratingTests(false);
    }
  };

  const handlePromoteToLive = () => {
    setShowGoLiveDialog(true);
  };

  const confirmPromoteToLive = async () => {
    if (!savedBaleybotId) return;
    setShowGoLiveDialog(false);
    try {
      // Pre-validate launch readiness
      const { readiness: launchReadiness } = await refetchLaunchReadiness().then(r => r.data ?? { readiness: null });
      if (launchReadiness?.blockingIssues?.length) {
        toast({
          title: 'Not ready to go live',
          description: launchReadiness.blockingIssues.join('. '),
          variant: 'destructive',
        });
        return;
      }

      // Auto-generate LaunchKit if it doesn't exist yet
      if (!existingBaleybot?.launchKit) {
        await generateLaunchKitMutation.mutateAsync({
          baleybotId: savedBaleybotId,
          requiredPassRate: 0.8,
        });
        // Re-fetch to get the updated version with launchKit
        await utils.baleybots.get.invalidate({ id: savedBaleybotId });
      }

      await promoteToLiveMutation.mutateAsync({ baleybotId: savedBaleybotId });
      await utils.baleybots.get.invalidate({ id: savedBaleybotId });
      await utils.analytics.getBaleybotAnalytics.invalidate({ baleybotId: savedBaleybotId });
      setViewMode('integrate');
      utils.baleybots.getCreatorGuidance.invalidate();
      injectAdvisorSuggestions('Bot is live');
    } catch (error) {
      toast({
        title: 'Could not promote to live',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handlePauseOrResumeLive = async () => {
    if (!savedBaleybotId) return;
    try {
      const stage = existingBaleybot?.lifecycleStage;
      if (stage === 'live') {
        await pauseLiveBotMutation.mutateAsync({ baleybotId: savedBaleybotId });
      } else {
        await promoteToLiveMutation.mutateAsync({ baleybotId: savedBaleybotId });
      }
      await utils.baleybots.get.invalidate({ id: savedBaleybotId });
      await utils.analytics.getBaleybotAnalytics.invalidate({ baleybotId: savedBaleybotId });
    } catch (error) {
      toast({
        title: 'Live state update failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleRevertToDraft = () => {
    setShowRevertDialog(true);
  };

  const confirmRevertToDraft = async () => {
    if (!savedBaleybotId) return;
    setShowRevertDialog(false);
    try {
      await revertToDraftMutation.mutateAsync({ baleybotId: savedBaleybotId });
      await utils.baleybots.get.invalidate({ id: savedBaleybotId });
    } catch (error) {
      toast({
        title: 'Could not revert to draft',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // =====================================================================
  // NAVIGATION GUARD (Phase 1.3)
  // =====================================================================

  const {
    guardedNavigate,
    showDialog,
    closeDialog,
    handleDiscard: rawDiscard,
    handleSaveAndLeave,
  } = useNavigationGuard(isDirty, handleSave);

  // Wrap discard to also clear sessionStorage for new BBs
  const handleDiscard = () => {
    if (isNew) {
      try { sessionStorage.removeItem(`creator-session:new`); } catch { /* noop */ }
    }
    rawDiscard();
  };

  /**
   * Handle back navigation (uses guard)
   */
  const handleBack = () => {
    guardedNavigate(ROUTES.baleybots.list);
  };

  /**
   * Start a fresh creation session (clear state and session storage)
   */
  const handleStartFresh = () => {
    try { sessionStorage.removeItem(`creator-session:new`); } catch { /* noop */ }
    // Navigate to /new with fresh flag to skip session restore
    router.push('/dashboard/baleybots/new?fresh=1');
    // Force a full page reload since the route is the same
    window.location.href = '/dashboard/baleybots/new?fresh=1';
  };

  // =====================================================================
  // CODE EDITOR & SCHEMA BUILDER HANDLERS (Phase 2 Integration)
  // =====================================================================

  /**
   * Handle BAL code changes from the code editor
   */
  const handleCodeChange = (newCode: string) => {
    setBalCode(newCode);

    // Re-parse code to sync entities with visual editor
    try {
      const parsed = parseBalCode(newCode);
      if (parsed.entities.length > 0) {
        const updatedEntities: VisualEntity[] = parsed.entities.map(
          (entity) => {
            // Preserve position from existing entity if it exists
            const existing = entities.find(e => e.name === entity.name);
            return {
              id: existing?.id ?? entity.name,
              name: entity.name,
              icon: existing?.icon ?? '🤖',
              purpose: (entity.config.goal as string) || existing?.purpose || '',
              tools: (entity.config.tools as string[]) || [],
              position: existing?.position ?? { x: 0, y: 0 },
              status: 'stable' as const,
            };
          }
        );
        setEntities(updatedEntities);
      }
    } catch {
      // Parse error is expected during editing — don't update entities
    }

    // Push to history
    pushHistory(
      {
        entities,
        connections,
        balCode: newCode,
        name,
        icon,
      },
      'Code edit'
    );
  };

  // =====================================================================
  // BEFOREUNLOAD HANDLER (Phase 1.2)
  // =====================================================================

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but we set it for older ones
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // =====================================================================
  // SESSION RECOVERY (persists conversation + canvas state to sessionStorage)
  // =====================================================================

  useSessionRecovery({
    id,
    isNew,
    savedBaleybotId,
    state: { messages: allMessages, entities, balCode, name, description, icon },
    restore: {
      setMessages: (updater) => {
        // Session recovery restores into injectedMessages since baley.messages
        // are managed by the hook internally
        const restored = updater([]);
        setInjectedMessages(restored);
      },
      setEntities,
      setBalCode,
      setName,
      setDescription,
      setIcon,
    },
  });

  // Auto-save trigger config when it changes (debounced)
  const saveTriggerMutation = trpc.baleybots.saveTriggerConfig.useMutation();
  const saveTriggerRef = useRef(saveTriggerMutation.mutate);
  useEffect(() => { saveTriggerRef.current = saveTriggerMutation.mutate; });
  const getPersistableTriggerConfig = (
    config: TriggerConfigType | undefined
  ):
    | {
        type: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'db_event' | 'mcp_event' | 'file_upload';
        schedule?: string;
        sourceBaleybotId?: string;
        completionType?: 'success' | 'failure' | 'completion';
        webhookPath?: string;
        dbConnectionId?: string;
        dbTable?: string;
        dbEvent?: 'insert' | 'update' | 'delete' | 'change';
        mcpServer?: string;
        mcpTool?: string;
        mcpResource?: string;
        acceptedMimeTypes?: string[];
        maxFileSizeMb?: number;
        multiple?: boolean;
        payloadMode?: 'metadata' | 'inline_base64';
        enabled?: boolean;
      }
    | null => {
    if (!config) return null;
    return {
      type: config.type,
      schedule: config.schedule,
      sourceBaleybotId: config.sourceBaleybotId,
      completionType: config.completionType,
      webhookPath: config.webhookPath,
      dbConnectionId: config.dbConnectionId,
      dbTable: config.dbTable,
      dbEvent: config.dbEvent,
      mcpServer: config.mcpServer,
      mcpTool: config.mcpTool,
      mcpResource: config.mcpResource,
      acceptedMimeTypes: config.acceptedMimeTypes,
      maxFileSizeMb: config.maxFileSizeMb,
      multiple: config.multiple,
      payloadMode: config.payloadMode,
      enabled: config.enabled,
    };
  };

  useEffect(() => {
    if (!savedBaleybotId) return;
    const timeout = setTimeout(() => {
      saveTriggerRef.current({
        id: savedBaleybotId,
        triggerConfig: getPersistableTriggerConfig(triggerConfig),
      });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [triggerConfig, savedBaleybotId]);


  // =====================================================================
  // EFFECTS
  // =====================================================================

  // Initialize state from existing BaleyBot (guarded to run only once per bot load)
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    if (!isNew && existingBaleybot) {
      hasInitializedRef.current = true;
      setName(existingBaleybot.name);
      setDescription(existingBaleybot.description || '');
      setIcon(existingBaleybot.icon || '');
      setBalCode(existingBaleybot.balCode);
      setIsDesignConfirmed(true);
      resetDesignGateReminder();
      if (existingBaleybot.lifecycleStage === 'live' || existingBaleybot.lifecycleStage === 'paused') {
        setViewMode('integrate');
      }

      // Parse BAL code to extract entity details (tools, goal, model)
      // This is much richer than just using entityNames which loses tool info
      if (existingBaleybot.balCode) {
        const parsed = parseBalCode(existingBaleybot.balCode);
        if (parsed.entities.length > 0) {
          const visualEntities: VisualEntity[] = parsed.entities.map(
            (entity, index) => ({
              id: `entity-${index}`,
              name: entity.name,
              icon: '🤖',
              purpose: (entity.config.goal as string) || '',
              tools: (entity.config.tools as string[]) || [],
              position: { x: 0, y: 0 },
              status: 'stable' as const,
            })
          );
          setEntities(visualEntities);
        } else if (existingBaleybot.entityNames && existingBaleybot.entityNames.length > 0) {
          // Fallback: if parsing fails, use entityNames with empty tools
          const visualEntities: VisualEntity[] = existingBaleybot.entityNames.map(
            (entityName, index) => ({
              id: `entity-${index}`,
              name: entityName,
              icon: '🤖',
              purpose: '',
              tools: [],
              position: { x: 0, y: 0 },
              status: 'stable' as const,
            })
          );
          setEntities(visualEntities);
        }
      } else if (existingBaleybot.entityNames && existingBaleybot.entityNames.length > 0) {
        // No BAL code available, use entityNames
        const visualEntities: VisualEntity[] = existingBaleybot.entityNames.map(
          (entityName, index) => ({
            id: `entity-${index}`,
            name: entityName,
            icon: '🤖',
            purpose: '',
            tools: [],
            position: { x: 0, y: 0 },
            status: 'stable' as const,
          })
        );
        setEntities(visualEntities);
      }

      // Load persisted test cases
      if (existingBaleybot.testCasesJson && Array.isArray(existingBaleybot.testCasesJson)) {
        setTestCases(existingBaleybot.testCasesJson as TestCase[]);
      }

      // Trigger config is loaded separately via getTriggerConfig query

      // Load conversation history into injectedMessages (since baley manages its own messages)
      if (existingBaleybot.conversationHistory && Array.isArray(existingBaleybot.conversationHistory)) {
        const loadedMessages: ChatMessage[] = existingBaleybot.conversationHistory
          .filter((msg): msg is { id: string; role: 'user' | 'assistant'; content: string; timestamp: string } =>
            msg && typeof msg.id === 'string' && typeof msg.content === 'string'
          )
          .map((msg): ChatMessage => ({
            id: msg.id,
            role: msg.role,
            content: sanitizeCreatorText(msg.content),
            timestamp: safeParseDate(msg.timestamp),
            status: 'complete',
          }));
        setInjectedMessages(loadedMessages);
      }

      // Mark as clean since we just loaded from database
      markClean();

      // Mark state as initialized after all state updates
      setIsStateInitialized(true);
    }
  }, [isNew, existingBaleybot, markClean, setTestCases, resetDesignGateReminder, setViewMode, setIsDesignConfirmed]);

  // Auto-send initial prompt if provided (using ref to track sent state)
  useEffect(() => {
    if (isNew && initialPrompt && !initialPromptSentRef.current && status === 'empty') {
      initialPromptSentRef.current = true;
      handleSendMessage(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, initialPrompt, status]);

  // =====================================================================
  // LOADING STATE
  // =====================================================================

  // Show loading skeleton when:
  // - Not a new BaleyBot AND (loading OR fetching OR state not initialized)
  // This prevents race conditions where component renders before state is populated
  if (!isFullyLoaded) {
    return (
      <div className="flex flex-col h-screen bg-gradient-hero">
        {/* Header skeleton */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>

        {/* Two-column skeleton */}
        <div className="flex-1 flex overflow-hidden">
          <div className="hidden md:flex w-[380px] shrink-0 flex-col border-r border-border/50 p-4 space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-3/4 rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <div className="flex-1" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="flex-1 p-4">
            <Skeleton className="h-9 w-64 mb-4" />
            <Skeleton className="h-full w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // =====================================================================
  // NOT FOUND STATE
  // =====================================================================

  // At this point, isFullyLoaded is true, so if existingBaleybot is missing, it's not found
  if (!isNew && !existingBaleybot) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-hero">
        <h1 className="text-2xl font-bold mb-4">BaleyBot not found</h1>
        <Button onClick={() => router.push(ROUTES.baleybots.list)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to BaleyBots
        </Button>
      </div>
    );
  }

  // =====================================================================
  // RENDER
  // =====================================================================

  const displayName = name || 'New BaleyBot';
  const displayIcon = icon || '✨';
  const lifecycleStage = existingBaleybot?.lifecycleStage ?? 'draft';
  const launchBusy =
    isFetchingLaunchReadiness ||
    generateLaunchKitMutation.isPending ||
    promoteToLiveMutation.isPending ||
    pauseLiveBotMutation.isPending ||
    revertToDraftMutation.isPending;
  // Compute save button disabled reason for tooltip (Phase 1.8)
  const saveDisabledReason = !balCode || !name
    ? 'Build something first'
    : !isDirty
    ? 'No changes to save'
    : null;

  return (
    <div className="flex flex-col h-screen bg-gradient-hero">
      {/* Network Status Banner (Phase 5.6) */}
      <NetworkStatus isOffline={isOffline} isReconnecting={isReconnecting} className="fixed top-4 left-1/2 -translate-x-1/2 z-50" />

      {/* Navigation Guard Dialog (Phase 1.3) */}
      <AlertDialog open={showDialog} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDialog}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDiscard}>
              Discard
            </Button>
            <AlertDialogAction onClick={handleSaveAndLeave}>
              Save & Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Conflict Dialog (Phase 5.4) */}
      <SaveConflictDialog
        open={showConflictDialog}
        onOpenChange={setShowConflictDialog}
        onAction={handleConflictAction}
        isLoading={isResolvingConflict}
        baleybotName={name || undefined}
      />

      {/* Go Live Confirmation Dialog */}
      <AlertDialog open={showGoLiveDialog} onOpenChange={setShowGoLiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deploy {displayName} to production?</AlertDialogTitle>
            <AlertDialogDescription>
              Webhooks and scheduled tasks will start executing immediately. You can pause or revert at any time from the Integrate tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPromoteToLive}>
              Go Live
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revert to Draft Confirmation Dialog */}
      <AlertDialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert {displayName} to draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable webhooks, pause scheduled tasks, and stop accepting new executions. In-progress executions will complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevertToDraft} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revert to Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BaleybotHeader
        displayName={displayName}
        displayIcon={displayIcon}
        description={description}
        isNew={isNew}
        isDirty={isDirty}
        lifecycleStage={lifecycleStage}
        validationStatus={'idle'}
        canSave={canSave}
        isSaving={isSaving}
        isSavePending={isSavePending}
        saveDisabledReason={saveDisabledReason}
        canUndo={canUndo}
        canRedo={canRedo}
        isEditingDescription={isEditingDescription}
        showFullDescription={showFullDescription}
        onBack={handleBack}
        onSave={() => debouncedSave()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onDescriptionChange={setDescription}
        onEditDescriptionToggle={setIsEditingDescription}
        onToggleFullDescription={() => setShowFullDescription(!showFullDescription)}
        onStartFresh={allMessages.length > 0 ? handleStartFresh : undefined}
      />

      {status === 'empty' ? (
        /* Welcome / creation view for new bots — full width centered */
        <div className="flex-1 relative overflow-hidden p-2 sm:p-4 md:p-6">
          <div className="mx-auto max-w-2xl h-full flex flex-col items-center justify-center text-center px-4">
            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
                What should your BaleyBot do?
              </h2>
              <p className="text-muted-foreground">
                Describe what you want in plain language
              </p>
            </div>

            {/* Chat input — centered for creation */}
            <div className="w-full mb-6">
              <ChatInput
                status={status}
                onSend={handleSendMessage}
                disabled={isSaving}
                quickPrompts={EXAMPLE_PROMPTS.slice(0, 3).map((example) => ({
                  id: `quick-${example.label}`,
                  label: example.label,
                  prompt: example.prompt,
                  mode: 'send' as const,
                }))}
              />
            </div>

            {/* Quick prompts are shown via ChatInput's quickPrompts prop above */}
          </div>
        </div>
      ) : (
        /* Two-column layout: Left = Chat, Right = Editor */
        <>
          {/* Mobile view toggle — only shown below md */}
          <div className="flex md:hidden border-b border-border/30">
            <button
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm transition-colors relative',
                mobileView === 'chat'
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setMobileView('chat')}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
              {/* Mobile building indicator — pulsing dot when AI is working and user is on editor tab */}
              {isStreaming && mobileView === 'editor' && (
                <span className="absolute top-1.5 right-[calc(50%-24px)] w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </button>
            <button
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm transition-colors',
                mobileView === 'editor'
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setMobileView('editor')}
            >
              <PanelRight className="h-3.5 w-3.5" />
              Editor
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel — Chat + Controls (desktop: always visible, mobile: toggled) */}
            <div className={cn(
              'w-full shrink-0 flex-col border-r border-border/50 bg-background/60 transition-[width] duration-500 ease-out',
              leftPanelWidthClass,
              mobileView === 'chat' ? 'flex' : 'hidden md:flex'
            )}>
              <LeftPanel
                messages={allMessages}
                status={status}
                onSendMessage={handleSendMessage}
                isCreatorDisabled={isInputDisabled}
                isStreaming={isStreaming}
                executions={!isNew && existingBaleybot?.executions ? existingBaleybot.executions : undefined}
                onExecutionClick={(executionId) => router.push(ROUTES.activity.execution(executionId))}
                quickPrompts={quickPrompts}
                quickPromptContextLabel={quickPromptContextLabel}
                pendingNavigations={baley.pendingNavigations}
                onApproveNavigation={baley.approveNavigation}
                onDismissNavigation={baley.dismissNavigation}
              />
            </div>

            {/* Right Panel — Editor (desktop: always visible, mobile: toggled) */}
            <div className={cn(
              'flex-1 flex-col min-w-0 overflow-hidden transition-all duration-500 ease-out',
              mobileView === 'editor' ? 'flex' : 'hidden md:flex'
            )}>
              {/* Adaptive Tab bar */}
              <div className="flex items-center px-4 py-2 border-b border-border/30">
                <Tabs value={viewMode} onValueChange={(v) => navigateToTab(v as AdaptiveTab)} className="w-auto">
                  <TabsList className="h-9 bg-muted/50">
                    {availableTabs.map((tab) => {
                      const tabConfig: Record<AdaptiveTab, { icon: React.ReactNode; label: string }> = {
                        plan: { icon: <ClipboardList className="h-3.5 w-3.5" />, label: 'Plan' },
                        visual: { icon: <LayoutGrid className="h-3.5 w-3.5" />, label: 'Builder' },
                        code: { icon: <Code2 className="h-3.5 w-3.5" />, label: 'Code' },
                        test: { icon: <FlaskConical className="h-3.5 w-3.5" />, label: 'Test' },
                        integrate: { icon: <Rocket className="h-3.5 w-3.5" />, label: 'Integrate' },
                      };
                      const readinessMap: Partial<Record<AdaptiveTab, keyof ReadinessState>> = {
                        visual: 'designed',
                        test: 'tested',
                        integrate: 'integrated',
                      };
                      const config = tabConfig[tab];
                      const dimension = readinessMap[tab];
                      const dimStatus = dimension ? readiness[dimension] : undefined;
                      return (
                        <TabsTrigger key={tab} value={tab} className={cn('gap-1.5 text-xs sm:text-sm px-2 sm:px-3', lastAINavigatedTab === tab && 'animate-pulse-soft')}>
                          {config.icon}
                          <span className="hidden sm:inline">{config.label}</span>
                          {dimStatus === 'complete' && (
                            <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400 ring-1 ring-emerald-500/20" />
                          )}
                          {dimStatus === 'in-progress' && (
                            <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse-soft" />
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() =>
                      setBuilderMode((previous) =>
                        previous === 'simple' ? 'advanced' : 'simple'
                      )
                    }
                  >
                    {builderMode === 'simple' ? 'Advanced Mode' : 'Simple Mode'}
                  </Button>
                </div>
              </div>

              {/* Editor content */}
              <div key={viewMode} className="flex-1 min-h-0 p-4 animate-fade-in">
                <ErrorBoundary
                  fallback={
                    <div className="h-full flex items-center justify-center bg-muted/20 rounded-2xl">
                      <p className="text-muted-foreground">Failed to render. Please refresh.</p>
                    </div>
                  }
                >
                  {/* Plan Preview */}
                  {viewMode === 'plan' && planData && (
                    <PlanPreview
                      plan={planData}
                      onApprove={() => handleSendMessage('I approve the plan. Go ahead and build it.')}
                      onRevise={() => {
                        navigateToTab('plan' as AdaptiveTab);
                        setMobileView('chat');
                      }}
                      isStreaming={isStreaming}
                      className="h-full"
                    />
                  )}

                  {/* Visual Editor View */}
                  {viewMode === 'visual' && (
                    <div className="h-full flex flex-col gap-3">
                      <VisualEditor
                        balCode={balCode}
                        onChange={handleCodeChange}
                        readOnly={isStreaming}
                        className="flex-1 min-h-0"
                        hideToolbar
                        toolSuggestions={connectionToolSuggestions}
                        triggerConfig={triggerConfig}
                        graphSidecar={graphSidecar}
                        runtimeEvents={runtimeGraphEvents}
                        presentationMode={builderMode}
                      />
                    </div>
                  )}

                  {/* Code Editor View */}
                  {viewMode === 'code' && (
                    <div className="h-full">
                      <BalCodeEditor
                        value={balCode}
                        onChange={handleCodeChange}
                        height="100%"
                        className="h-full"
                        readOnly={isStreaming}
                      />
                    </div>
                  )}



                  {/* Test View */}
                  {viewMode === 'test' && savedBaleybotId && (
                    <div className="h-full overflow-y-auto space-y-4">
                      {/* AI-Driven Streaming Test Suite */}
                      <TestSuitePanel
                        testCases={testCases}
                        testStates={testStream.testStates}
                        streamPhase={testStream.streamPhase}
                        overallProgress={testStream.overallProgress}
                        activeTestId={testStream.activeTestId}
                        analysis={testStream.analysis}
                        fixAttempts={testStream.fixAttempts}
                        onRunAll={handleRunAllTests}
                        onCancel={testStream.cancelTestRun}
                        onRegenerate={handleRegenerateTests}
                        onStopAutoFix={testStream.cancelTestRun}
                        isRegenerating={isRegeneratingTests}
                      />

                      {/* Divider */}
                      <div className="border-t border-border/30" />

                      {/* Manual Testing */}
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">Manual Testing</h3>
                        <AdaptiveTestSurface
                          baleybotId={savedBaleybotId}
                          capabilities={analyzeBotCapabilities(balCode, entities, connections, triggerConfig)}
                          botName={name}
                          botIcon={icon}
                          onFetchExecutionDetails={async (executionId) => {
                            const executions = await utils.analytics.getBaleybotExecutions.fetch({
                              baleybotId: savedBaleybotId,
                              limit: 1,
                            });
                            const exec = executions?.find(e => e.id === executionId);
                            if (!exec) return null;
                            return { tokenCount: exec.tokenCount, estimatedCost: exec.estimatedCost };
                          }}
                          onExecutionComplete={(result) => {
                            const newCase: TestCase = {
                              id: result.executionId ?? crypto.randomUUID(),
                              name: `Test run ${testCases.length + 1}`,
                              level: 'integration',
                              input: '',
                              status: result.success ? 'passed' : 'failed',
                              durationMs: result.durationMs,
                            };
                            const updatedCases = [...testCases, newCase];
                            setTestCases(updatedCases);
                            // Auto-persist test results so Go Live readiness check sees them
                            if (savedBaleybotId) {
                              saveTestCasesMutation.mutate(
                                { id: savedBaleybotId, testCases: updatedCases },
                                { onSuccess: () => refetchLaunchReadiness() },
                              );
                            }
                            utils.baleybots.getCreatorGuidance.invalidate();
                            injectAdvisorSuggestions('Test complete');
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Integrate / Monitor View */}
                  {viewMode === 'integrate' && savedBaleybotId && (
                    <div className="h-full overflow-y-auto space-y-4">
                      <IntegrationDashboard
                        baleybotId={savedBaleybotId}
                        workspaceId={existingBaleybot?.workspaceId ?? ''}
                        triggerConfig={triggerConfig}
                        webhookInfo={webhookInfo}
                        lifecycleStage={lifecycleStage}
                        readiness={readiness}
                        onGoLive={handlePromoteToLive}
                        onPause={handlePauseOrResumeLive}
                        onRevertToDraft={handleRevertToDraft}
                        isLaunchBusy={launchBusy}
                        onTestWebhook={webhookInfo ? async () => {
                          const webhookUrl = webhookInfo.url;
                          const start = Date.now();
                          try {
                            const res = await fetch(webhookUrl, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(webhookInfo.secret ? { 'X-Webhook-Secret': webhookInfo.secret } : {}),
                              },
                              body: JSON.stringify({ message: 'Test from dashboard', _test: true }),
                            });
                            return {
                              success: res.ok,
                              statusCode: res.status,
                              responseTimeMs: Date.now() - start,
                            };
                          } catch {
                            return { success: false, statusCode: 0, responseTimeMs: Date.now() - start };
                          }
                        } : undefined}
                        webhookExecutions={botExecutions
                          ?.filter(e => e.triggeredBy === 'webhook')
                          .map(e => ({ id: e.id, status: e.status, durationMs: e.durationMs, createdAt: e.createdAt }))
                        }
                        apiKeyDisplay={apiKeysData?.[0]?.keyDisplay}
                      />
                      {lifecycleStage === 'live' && (
                        <BotMonitorPanel
                          baleybotId={savedBaleybotId}
                          baleybotName={existingBaleybot?.name ?? (name || 'BaleyBot')}
                          onPauseOrResume={handlePauseOrResumeLive}
                          isPauseResumeBusy={pauseLiveBotMutation.isPending || promoteToLiveMutation.isPending}
                          className="p-4"
                        />
                      )}
                    </div>
                  )}

                </ErrorBoundary>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Keyboard Shortcuts Dialog (Phase 3.8) */}
      <KeyboardShortcutsDialog open={isShortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
