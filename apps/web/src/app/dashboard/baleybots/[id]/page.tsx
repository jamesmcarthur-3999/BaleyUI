'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ConnectionsPanel will be wired into advanced mode
import { ChatInput, LeftPanel, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, isSaveConflictError, ConnectionsPanel, BaleybotHeader } from '@/components/creator';
import type {
  TestCase,
} from '@/components/creator';

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
import type { ConflictAction } from '@/components/creator';
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
import { ArrowLeft, LayoutGrid, Code2, MessageSquare, PanelRight, FlaskConical, Rocket } from 'lucide-react';
import { IntegrationDashboard } from '@/components/integrate/IntegrationDashboard';
import { BotMonitorPanel } from '@/components/monitor';
import { AdaptiveTestSurface } from '@/components/test';
import { analyzeBotCapabilities } from '@/lib/baleybot/capabilities';
import { ROUTES } from '@/lib/routes';
import { ErrorBoundary } from '@/components/errors';
import { useDirtyState, useDebouncedCallback, useNavigationGuard, useHistory } from '@/hooks';
import { formatErrorWithAction, parseCreatorError } from '@/lib/errors/creator-errors';
import { generateChangeSummary, formatChangeSummaryForChat } from '@/lib/baleybot/change-summary';
import { safeParseDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type {
  VisualEntity,
  Connection,
  CreatorMessage,
  CreatorGuidanceAction,
  CreationProgress,
  CreationStatus,
  AdaptiveTab,
  CreatorOutput,
  BuilderPresentationMode,
} from '@/lib/baleybot/creator-types';
import { computeReadiness, createInitialReadiness } from '@/lib/baleybot/readiness';
import type { ReadinessState, SpecialistSignals } from '@/lib/baleybot/readiness';
import type { ValidationStatus } from '@/lib/baleybot/creator-validation';
import { getConnectionSummary } from '@/lib/baleybot/tools/requirements-scanner';
import type { GraphRuntimeEvent } from '@/lib/streaming/types/events';
import { parseBalCode } from '@/lib/baleybot/bal-parser-pure';
import { sanitizeCreatorText } from '@/lib/baleybot/creator-sanitization';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';
import {
  isAdvancedEditorTab,
  computeAvailableTabs,
  truncateName,
  extractSidecarFromStructure,
  buildDerivedGraphSidecar,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by GraphSidecar visualization (planned)
  appendGraphRuntimeEvent,
  isSameReadiness,
  escapeRegExp,
  buildCreatorHistoryPayload,
  buildGuidanceQuickPrompts,
} from '@/lib/baleybot/creator-helpers';
import { POST_DESIGN_TABS, EXAMPLE_PROMPTS } from '@/lib/baleybot/creator-constants';

// Pure functions and constants extracted to:
// - @/lib/baleybot/creator-helpers.ts
// - @/lib/baleybot/creator-constants.ts


type CreatorStreamEvent =
  | {
      type: 'creator_stream_started';
      executionId?: string;
      timestamp?: number;
    }
  | {
      type: 'creator_text_delta';
      content?: string;
      timestamp?: number;
    }
  | {
      type: 'creator_progress';
      phase?: string;
      message?: string;
      heartbeat?: boolean;
      timestamp?: number;
    }
  | {
      type: 'creator_complete';
      result?: CreatorOutput;
      summary?: string;
      specialist?: {
        connections: unknown | null;
        tests: unknown | null;
        deployment: unknown | null;
      };
      timestamp?: number;
    }
  | {
      type: 'creator_error';
      message?: string;
      timestamp?: number;
    }
  | {
      type: 'creator_agent_event';
      event?: Record<string, unknown>;
      entityName?: string;
      timestamp?: number;
    }
  | {
      type: 'creator_connection_action';
      action?: string;
      result?: Record<string, unknown>;
      timestamp?: number;
    }
  | {
      type: 'creator_trigger_saved';
      triggerConfig?: TriggerConfigType;
      timestamp?: number;
    }
  | {
      type: 'creator_webhook_enabled';
      webhookUrl?: string;
      webhookSecret?: string;
      timestamp?: number;
    }
  | {
      type: 'creator_navigate_tab';
      tab?: string;
      timestamp?: number;
    };

/**
 * State snapshot for undo/redo history
 */
interface HistoryState {
  entities: VisualEntity[];
  connections: Connection[];
  balCode: string;
  name: string;
  icon: string;
}

/**
 * Unified BaleyBot creation and detail page.
 *
 * Handles both:
 * - New creation (id === 'new')
 * - Viewing/editing existing BaleyBots (id is a UUID)
 *
 * Provides a conversational interface for building and modifying BaleyBots
 * with a visual canvas showing the assembled entities and connections.
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

  // -- Conversation --
  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const streamingTextRef = useRef('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const streamingReasoningRef = useRef('');
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentEvents, setAgentEvents] = useState<Array<{ event: Record<string, unknown>; entityName?: string; timestamp: number }>>([]);
  const [connectionActions, setConnectionActions] = useState<Array<{
    action: string;
    result: Record<string, unknown>;
    timestamp: number;
  }>>([]);
  const [, setCreationProgress] = useState<CreationProgress | null>(null);
  const [creatorStreamingProgress, setCreatorStreamingProgress] =
    useState<{ phase: string; message: string; startedAt: number } | null>(null);
  const [creatorGuidanceActions, setCreatorGuidanceActions] = useState<CreatorGuidanceAction[]>([]);
  const isStreamingRef = useRef(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialPromptSentRef = useRef(false);

  // -- Persistence --
  const [savedBaleybotId, setSavedBaleybotId] = useState<string | null>(isNew ? null : id);
  const [isSaving, setIsSaving] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  // -- Navigation --
  const [viewMode, setViewMode] = useState<AdaptiveTab>('visual');
  const [builderMode, setBuilderMode] = useState<BuilderPresentationMode>('simple');
  const showAdvancedUI = builderMode === 'advanced';
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  type MobileView = 'editor' | 'chat';
  const [mobileView, setMobileView] = useState<MobileView>('editor');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- setter used by runtime graph panel (planned)
  const [runtimeGraphEvents, setRuntimeGraphEvents] = useState<GraphRuntimeEvent[]>([]);

  // -- Launch --
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType | undefined>(undefined);
  const [webhookInfo, setWebhookInfo] = useState<{ url: string; secret: string } | null>(null);

  // -- Confirmation Dialogs --
  const [showGoLiveDialog, setShowGoLiveDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);

  // -- AI Navigation Feedback --
  const [lastAINavigatedTab, setLastAINavigatedTab] = useState<string | null>(null);

  // -- Readiness --
  const validationStatus: ValidationStatus = 'idle'; // Validation now handled by specialist team
  const [readiness, setReadiness] = useState(createInitialReadiness());
  const prevReadinessRef = useRef<ReadinessState | null>(isNew ? createInitialReadiness() : null);
  const [specialistSignals, setSpecialistSignals] = useState<SpecialistSignals>({});
  const [isDesignConfirmed, setIsDesignConfirmed] = useState(!isNew);
  const designGateReminderShownRef = useRef(false);

  // Cleanup throttle timer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
    };
  }, []);
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
  const canSave = hasContent && !!balCode && !!name && !isSaving && !isStreaming;
  const isInputDisabled = isStreaming || isSaving;

  // Backward-compatible derived status for component props and query inputs
  const status: CreationStatus = isStreaming ? 'building'
    : lastError ? 'error'
    : (hasContent || messages.length > 0) ? 'ready'
    : 'empty';

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

  // Workspace-level overview query removed (analytics tab removed)

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
  const creatorMutation = trpc.baleybots.sendCreatorMessage.useMutation();
  const saveMutation = trpc.baleybots.saveFromSession.useMutation();
  const generateLaunchKitMutation = trpc.baleybots.generateLaunchKit.useMutation();
  const promoteToLiveMutation = trpc.baleybots.promoteToLive.useMutation();
  const pauseLiveBotMutation = trpc.baleybots.pauseLiveBot.useMutation();
  const revertToDraftMutation = trpc.baleybots.revertToDraft.useMutation();
  const saveTestCasesMutation = trpc.baleybots.saveTestCases.useMutation();

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
    messages: messages
      .filter((m) => m.role !== 'system')
      .slice(-30)
      .map((message) => {
        const metadata: Record<string, unknown> = {};
        if (message.metadata?.creatorLifecycle) {
          metadata.creatorLifecycle = message.metadata.creatorLifecycle;
        }
        if (message.metadata?.diagnostic) {
          metadata.diagnostic = message.metadata.diagnostic;
        }
        if (message.metadata?.streamSummary) {
          metadata.streamSummary = message.metadata.streamSummary;
        }
        return {
          role: message.role as 'user' | 'assistant',
          content: message.content.slice(0, 4000),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };
      }),
    readinessContext,
  };
  const {
    data: creatorGuidanceData,
  } = trpc.baleybots.getCreatorGuidance.useQuery(creatorGuidanceInput, {
    enabled: messages.length > 0 && status !== 'building',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (!creatorGuidanceData?.actions) return;
    if (isStreaming) return;
    setCreatorGuidanceActions(creatorGuidanceData.actions);
  }, [creatorGuidanceData, isStreaming]);

  // Lifecycle-aware quick prompts based on active tab
  const tabQuickPrompts: Record<string, Array<{ id: string; label: string; prompt: string; mode: 'send' }>> = {
    test: [
      { id: 'qp-test-sample', label: 'Run with sample input', prompt: 'Run a test with sample input to check the bot works correctly', mode: 'send' },
      { id: 'qp-test-error', label: 'Test error handling', prompt: 'Test how the bot handles invalid or missing input', mode: 'send' },
      { id: 'qp-test-complex', label: 'Try a complex case', prompt: 'Run a more complex test case to stress-test the bot', mode: 'send' },
    ],
    integrate: [
      { id: 'qp-int-webhook', label: 'Set up a webhook', prompt: 'Set up a webhook so this bot can be triggered from external services', mode: 'send' },
      { id: 'qp-int-schedule', label: 'Schedule recurring runs', prompt: 'Set up a schedule so this bot runs automatically on a recurring basis', mode: 'send' },
      { id: 'qp-int-chain', label: 'Chain from another bot', prompt: 'Configure this bot to be triggered when another BaleyBot completes', mode: 'send' },
      { id: 'qp-int-api', label: 'Show API endpoint', prompt: 'Show me the API endpoint and how to call this bot programmatically', mode: 'send' },
    ],
  };

  const guidancePrompts = buildGuidanceQuickPrompts(creatorGuidanceActions);
  const quickPrompts = (viewMode === 'test' || viewMode === 'integrate')
    ? tabQuickPrompts[viewMode] ?? guidancePrompts
    : guidancePrompts;

  const quickPromptContextLabel = quickPrompts.length > 0
    ? (viewMode === 'test' ? 'Test suggestions' : viewMode === 'integrate' ? 'Integration options' : 'Suggested next action')
    : undefined;

  // =====================================================================
  // TEST EXECUTION HOOK
  // =====================================================================

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by test execution feedback injection (planned)
  const injectMessage = (message: CreatorMessage) => {
    setMessages(prev => [...prev, message]);
  };

  /**
   * Fetch advisor suggestions and inject them as a system message in the chat.
   * Called after lifecycle events (test completion, save, go-live).
   */
  const injectAdvisorSuggestions = async (eventLabel: string) => {
    if (isStreamingRef.current) return;
    try {
      const result = await utils.baleybots.getCreatorGuidance.fetch(creatorGuidanceInput);
      if (result?.actions?.length) {
        const sanitizedActions = result.actions.map(a => ({
          ...a,
          label: sanitizeCreatorText(a.label),
          prompt: sanitizeCreatorText(a.prompt),
        }));
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system' as const,
          content: `Here's what I'd suggest next:`,
          timestamp: new Date(),
          metadata: {
            diagnostic: { level: 'info' as const, title: eventLabel },
            advisorActions: sanitizedActions,
          },
        }]);
      }
    } catch { /* swallow — advisory, not critical */ }
  };

  const isDesignReviewRequired =
    status === 'ready' && entities.length > 0 && !isDesignConfirmed;
  const requiresDesignReviewForTab = (tab: AdaptiveTab) =>
    isDesignReviewRequired && POST_DESIGN_TABS.includes(tab);

  const navigateToTab = (tab: AdaptiveTab, options?: { bypassDesignGate?: boolean }) => {
    if (!options?.bypassDesignGate && requiresDesignReviewForTab(tab)) {
      // Soft reminder via toast — don't block navigation
      if (!designGateReminderShownRef.current) {
        designGateReminderShownRef.current = true;
        toast({
          title: 'Review your design',
          description: 'Consider confirming the visual layout before proceeding to setup.',
        });
      }
    }

    setViewMode(tab);
    setMobileView('editor');
    return true;
  };

  const [testCases, setTestCases] = useState<TestCase[]>([]);

  // =====================================================================
  // HANDLERS
  // =====================================================================

  const startCreatorStream = async (args: {
    message: string;
    conversationHistory: ReturnType<typeof buildCreatorHistoryPayload>;
  }): Promise<{
    result: CreatorOutput;
    summary?: string;
  }> => {
    const startedAt = Date.now();
    let finalResult: CreatorOutput | null = null;
    let finalSummary: string | undefined;
    // Creator streaming progress is tracked via setCreatorStreamingProgress state

    setCreatorGuidanceActions([]);
    setAgentEvents([]);
    setConnectionActions([]);
    // Clear any stale throttle timer from a previous turn before resetting refs
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    streamingTextRef.current = '';
    setStreamingText('');
    streamingReasoningRef.current = '';
    setStreamingReasoning('');
    setCreatorStreamingProgress({
      phase: 'discovery',
      message: 'Starting creator workflow...',
      startedAt,
    });

    await streamPostSSE<CreatorStreamEvent>({
      url: '/api/baleybots/creator/stream',
      body: {
        baleybotId: savedBaleybotId ?? undefined,
        message: args.message,
        conversationHistory: args.conversationHistory,
        currentState: balCode ? {
          balCode,
          name,
          description,
          icon,
          entities: entities.map(e => ({ name: e.name, purpose: e.purpose, tools: e.tools })),
        } : undefined,
        uiState: {
          activeTab: viewMode,
          availableTabs: availableTabs,
          lifecycleStage: existingBaleybot?.lifecycleStage ?? 'draft',
          readinessSummary: Object.entries(readiness)
            .map(([dim, status]) => `${dim} (${status})`)
            .join(', '),
          triggerConfigured: !!triggerConfig,
          webhookEnabled: !!webhookInfo || existingBaleybot?.webhookEnabled === true,
        },
      },
      onEvent: (event) => {
        try {
        if (event.type === 'creator_stream_started') {
          setCreatorStreamingProgress((previous) =>
            previous
              ? {
                  ...previous,
                  phase: 'discovery',
                  message: 'Understanding your request...',
                }
              : previous
          );
          return;
        }

        // Agent activity events (for expandable activity panel)
        if (event.type === 'creator_agent_event') {
          if (event.event) {
            const agentEvent = event.event as Record<string, unknown>;

            // Capture top-level reasoning from creator_bot
            if (agentEvent.type === 'reasoning' && agentEvent.content) {
              streamingReasoningRef.current += String(agentEvent.content);
              // Throttle reasoning updates with the same timer as text
              if (!throttleRef.current) {
                throttleRef.current = setTimeout(() => {
                  setStreamingReasoning(streamingReasoningRef.current);
                  setStreamingText(streamingTextRef.current);
                  throttleRef.current = null;
                }, 200);
              }
            }

            setAgentEvents((prev) => [
              ...prev,
              {
                event: agentEvent,
                entityName: event.entityName,
                timestamp: event.timestamp ?? Date.now(),
              },
            ]);
          }
          return;
        }

        // Connection action events → visual action cards
        if (event.type === 'creator_connection_action') {
          if (event.result) {
            setConnectionActions(prev => [...prev, {
              action: event.action ?? 'unknown',
              result: event.result!,
              timestamp: event.timestamp ?? Date.now(),
            }]);
          }
          utils.connections.list.invalidate();
          return;
        }

        // Integration events from companion tools
        if (event.type === 'creator_trigger_saved') {
          if (event.triggerConfig) {
            setTriggerConfig(event.triggerConfig);
            if (savedBaleybotId) {
              utils.baleybots.getTriggerConfig.invalidate({ baleybotId: savedBaleybotId });
            }
          }
          return;
        }

        if (event.type === 'creator_webhook_enabled') {
          if (event.webhookUrl && event.webhookSecret) {
            setWebhookInfo({ url: event.webhookUrl, secret: event.webhookSecret });
          }
          if (savedBaleybotId) {
            utils.baleybots.get.invalidate({ id: savedBaleybotId });
          }
          return;
        }

        if (event.type === 'creator_navigate_tab') {
          if (event.tab) {
            const tabName = event.tab as string;
            navigateToTab(tabName as AdaptiveTab, { bypassDesignGate: true });
            toast({
              title: `Switched to ${tabName.charAt(0).toUpperCase() + tabName.slice(1)} tab`,
              description: 'The AI assistant navigated here to show you something relevant.',
            });
            setLastAINavigatedTab(tabName);
            setTimeout(() => setLastAINavigatedTab(null), 3000);
          }
          return;
        }

        // Show streaming text in chat (creator_bot is conversational now)
        if (event.type === 'creator_text_delta') {
          const content = event.content ?? '';
          if (content) {
            streamingTextRef.current += content;
            // Throttle state updates to ~5fps (200ms)
            if (!throttleRef.current) {
              throttleRef.current = setTimeout(() => {
                setStreamingText(streamingTextRef.current);
                throttleRef.current = null;
              }, 200);
            }
          }
          return;
        }

        if (event.type === 'creator_progress') {
          const phase = event.phase ?? 'building';
          const progressMessage = event.message?.trim() || 'Building...';
          setCreationProgress({
            phase: 'generating',
            message: progressMessage,
          });

          setCreatorStreamingProgress((previous) => ({
            phase,
            message: progressMessage,
            startedAt: previous?.startedAt ?? startedAt,
          }));
          return;
        }

        if (event.type === 'creator_complete') {
          if (event.result) {
            finalResult = event.result;
          }
          finalSummary =
            event.summary?.trim() ||
            'Creator completed the response.';

          // Capture specialist findings for readiness enrichment
          if (event.specialist) {
            setSpecialistSignals((prev) => ({
              ...prev,
              connectionAdvisorRan: prev.connectionAdvisorRan || event.specialist!.connections != null,
              testOrchestratorRan: prev.testOrchestratorRan || event.specialist!.tests != null,
              deploymentAdvisorRan: prev.deploymentAdvisorRan || event.specialist!.deployment != null,
            }));
          }

          setCreationProgress({ phase: 'complete', message: 'Ready!' });
          setCreatorStreamingProgress((previous) =>
            previous
              ? {
                  ...previous,
                  phase: 'complete',
                  message: finalSummary || 'Ready!',
                }
              : previous
          );
          return;
        }

        if (event.type === 'creator_error') {
          throw new Error(event.message || 'Creator stream failed');
        }
        } catch (eventError) {
          // Don't let a single malformed event kill the entire stream
          if (event.type === 'creator_error') throw eventError;
          console.warn('Error processing creator stream event:', event.type, eventError);
        }
      },
    });

    // Flush any remaining streaming text — clear timer first to prevent stale writes
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }

    // If the concierge streamed text but no structured result (conversation-only turn),
    // build a synthetic building response from the streamed text
    const finalStreamedText = streamingTextRef.current.trim();
    if (!finalResult && finalStreamedText) {
      finalResult = {
        status: 'building' as const,
        message: finalStreamedText,
        entities: [],
        connections: [],
        balCode: '',
        name: 'Unnamed BaleyBot',
        description: '',
        icon: '🤖',
      };
    }

    // Reset streaming state atomically — ref first, then UI state
    streamingTextRef.current = '';
    setStreamingText('');
    streamingReasoningRef.current = '';
    setStreamingReasoning('');

    if (!finalResult) {
      // Stream completed but produced neither a creator_complete event nor streamed text.
      // Pass empty message so applyCreatorResult surfaces a system notice.
      finalResult = {
        status: 'building' as const,
        message: '',
        entities: [],
        connections: [],
        balCode: '',
        name: 'Unnamed BaleyBot',
        description: '',
        icon: '🤖',
      };
    }

    return {
      result: finalResult,
      summary: finalSummary,
    };
  };

  const applyCreatorResult = (
    result: CreatorOutput,
    args: {
      prevEntities: VisualEntity[];
      prevConnections: Connection[];
      prevName: string;
      streamSummary?: string;
    }
  ) => {
    const { prevEntities, prevConnections, prevName, streamSummary } = args;

    if (result.status === 'building') {
      // Conversational turn — creator_bot streamed text directly to the user.
      // The message is the full conversation from this turn.
      const responseContent = (result.message?.trim() || result.thinking?.trim() || '').replace(
        /\n{3,}/g,
        '\n\n'
      );

      if (!name && result.name && result.name !== 'Unnamed BaleyBot') {
        setName(truncateName(result.name));
      }
      if (!icon && result.icon && result.icon !== '🤖') {
        setIcon(result.icon);
      }
      if (!description && result.description) {
        setDescription(result.description);
      }

      if (responseContent) {
        const assistantMessage: CreatorMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: responseContent,
          timestamp: new Date(),
          thinking: result.thinking || undefined,
          metadata: {
            streamSummary,
          },
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Model produced nothing — surface as system notice
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'system' as const,
          content: 'No response received. Try rephrasing or simplifying your request.',
          timestamp: new Date(),
          metadata: { isError: true },
        }]);
      }
      setIsStreaming(false);
      isStreamingRef.current = false;
      setCreationProgress(null);
      setCreatorStreamingProgress(null);
      return;
    }

    setCreationProgress({
      phase: 'designing',
      message: `Designed ${result.entities.length} entit${result.entities.length === 1 ? 'y' : 'ies'}`,
    });

    const visualEntities: VisualEntity[] = result.entities.map((entity) => ({
      ...entity,
      position: { x: 0, y: 0 },
      status: 'appearing' as const,
    }));

    const visualConnections: Connection[] = result.connections.map((conn, index) => ({
      id: `conn-${index}`,
      from: conn.from,
      to: conn.to,
      label: conn.label,
      status: 'stable' as const,
    }));
    if (visualConnections.length > 0) {
      setCreationProgress({
        phase: 'connecting',
        message: `Connected ${visualConnections.length} workflow${visualConnections.length === 1 ? '' : 's'}`,
      });
    }
    setCreationProgress({ phase: 'generating', message: 'Generating BAL code...' });

    setEntities(visualEntities);

    setTimeout(() => {
      setEntities((prev) => prev.map((entity) => ({ ...entity, status: 'stable' as const })));
    }, 600);
    setConnections(visualConnections);
    setBalCode(result.balCode);
    setName(truncateName(result.name));
    setIcon(result.icon);
    if (result.description) {
      setDescription(result.description);
    }

    const truncatedName = truncateName(result.name);
    pushHistory(
      {
        entities: visualEntities,
        connections: visualConnections,
        balCode: result.balCode,
        name: truncatedName,
        icon: result.icon,
      },
      `AI response: ${truncatedName}`
    );

    const changeSummary = generateChangeSummary(
      prevEntities,
      visualEntities,
      prevConnections,
      visualConnections,
      prevName,
      result.name
    );
    const summaryText = formatChangeSummaryForChat(changeSummary);

    const isInitialCreation = prevEntities.length === 0;
    const modelNarrative = result.message?.trim();

    // Use model's text if provided; otherwise generate a concise summary
    const responseContent = modelNarrative || summaryText || '';

    const prevEntityIds = new Set(prevEntities.map((entity) => entity.id));
    const entityMetadata = visualEntities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      icon: entity.icon,
      tools: entity.tools,
      isNew: !prevEntityIds.has(entity.id),
    }));

    const metadata: CreatorMessage['metadata'] = {
      entities: entityMetadata,
      isInitialCreation,
    };

    if (responseContent) {
      const assistantMessage: CreatorMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: responseContent.trim(),
        timestamp: new Date(),
        thinking: result.thinking || undefined,
        metadata,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }

    // Build notification — "here's what I built" moment
    {
      const entityCount = visualEntities.length;
      const toolCount = new Set(visualEntities.flatMap(e => e.tools ?? [])).size;
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: `Built "${truncateName(result.name)}" \u2014 ${entityCount} step${entityCount !== 1 ? 's' : ''}, ${toolCount} tool${toolCount !== 1 ? 's' : ''}.`,
        timestamp: new Date(),
        metadata: {
          diagnostic: {
            level: 'success',
            title: 'BaleyBot Created',
            details: 'Review in the visual editor or code tab.',
          },
        },
      }]);
    }

    setIsStreaming(false);
    isStreamingRef.current = false;
    setLastError(null);
    if (isInitialCreation) {
      setIsDesignConfirmed(false);
      designGateReminderShownRef.current = false;
    }
    setCreationProgress({ phase: 'complete', message: 'Ready!' });
    setTimeout(() => setCreationProgress(null), 1000);
    setCreatorStreamingProgress(null);
  };

  /**
   * Handle sending a message to the Creator Bot
   */
  const handleSendMessage = async (message: string) => {
    // Concurrency guard — prevent overlapping sends
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    // Cancel any in-flight stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const sanitizedMessage = sanitizeCreatorText(message);

    // 0. Capture previous state for change summary
    const prevEntities = [...entities];
    const prevConnections = [...connections];
    const prevName = name;

    // 1. Add user message
    const userMessage: CreatorMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: sanitizedMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const nextConversationHistory = buildCreatorHistoryPayload([...messages, userMessage]);

    // 2. Enter streaming state
    setIsStreaming(true);
    isStreamingRef.current = true;
    setLastError(null);
    setCreationProgress({ phase: 'understanding', message: 'Understanding your request...' });

    try {
      let streamResult:
        | {
            result: CreatorOutput;
            summary?: string;
          }
        | null = null;
      try {
        streamResult = await startCreatorStream({
          message: sanitizedMessage,
          conversationHistory: nextConversationHistory,
        });
      } catch (streamError) {
        console.warn('Creator stream failed, falling back to mutation:', streamError);
        setCreatorStreamingProgress(null);
      }

      const result =
        streamResult?.result ??
        (await creatorMutation.mutateAsync({
          baleybotId: savedBaleybotId ?? undefined,
          message: sanitizedMessage,
          conversationHistory: nextConversationHistory,
        }));

      applyCreatorResult(result, {
        prevEntities,
        prevConnections,
        prevName,
        streamSummary: streamResult?.summary,
      });
    } catch (error) {
      console.error('Creator message failed:', error);
      setIsStreaming(false);
      isStreamingRef.current = false;
      setLastError(error instanceof Error ? error.message : 'Unknown error');
      setCreationProgress(null);
      setCreatorStreamingProgress(null);

      // Pipeline error → system message (not from the model)
      const parsed = parseCreatorError(error);
      const errorMessage: CreatorMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `${parsed.title}: ${parsed.message}${parsed.action ? ` ${parsed.action}` : ''}`,
        timestamp: new Date(),
        metadata: {
          isError: true,
          options: [
            { id: 'retry', label: 'Retry', description: 'Send the same message again', icon: '🔄' },
          ],
        },
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      isSendingRef.current = false;
    }
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

  /**
   * Handle saving the BaleyBot
   * Returns the saved BaleyBot ID if successful, null if failed
   */
  const handleSave = async (): Promise<string | null> => {
    if (!balCode || !name) return null;

    setIsSaving(true);

    try {
      const result = await saveMutation.mutateAsync({
        baleybotId: savedBaleybotId ?? undefined,
        name,
        description: description || undefined,
        icon: icon || undefined,
        balCode,
        conversationHistory: buildCreatorHistoryPayload(messages),
      });

      // If new, update savedBaleybotId and URL
      if (!savedBaleybotId) {
        setSavedBaleybotId(result.id);
        // Update URL without reload
        window.history.replaceState(null, '', ROUTES.baleybots.detail(result.id));
      }

      // Invalidate queries
      utils.baleybots.list.invalidate();
      if (savedBaleybotId) {
        utils.baleybots.get.invalidate({ id: savedBaleybotId });
      }

      // Mark state as clean after successful save
      markClean();

      utils.baleybots.getCreatorGuidance.invalidate();
      injectAdvisorSuggestions('Bot saved');

      return result.id;
    } catch (error) {
      console.error('Save failed:', error);

      // Check for save conflict (Phase 5.4)
      if (isSaveConflictError(error)) {
        setShowConflictDialog(true);
        return null;
      }

      const errorContent = formatErrorWithAction(error);
      toast({ title: 'Save failed', description: errorContent, variant: 'destructive' });
      setLastError(errorContent);

      return null;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle save conflict resolution (Phase 5.4)
   */
  const handleConflictAction = async (action: ConflictAction) => {
    setIsResolvingConflict(true);

    try {
      switch (action) {
        case 'reload':
          // Reload the latest version from server
          if (savedBaleybotId) {
            await utils.baleybots.get.invalidate({ id: savedBaleybotId });
            // Force refetch will trigger the effect to update local state
            window.location.reload();
          }
          break;

        case 'force-save':
          // Retry save uses optimistic locking (updateWithLock) — safer than force-overwrite
          setShowConflictDialog(false);
          await handleSave();
          break;

        case 'cancel':
        default:
          setShowConflictDialog(false);
          break;
      }
    } finally {
      setIsResolvingConflict(false);
      if (action !== 'force-save') {
        setShowConflictDialog(false);
      }
    }
  };

  // Debounced save to prevent rapid clicks (Phase 1.5)
  const { debouncedFn: debouncedSave, isPending: isSavePending } = useDebouncedCallback(
    handleSave,
    500
  );

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

  const sessionKey = `creator-session:${id}`;

  // Save state to sessionStorage after each meaningful change
  // Stop persisting once the BB has been saved (savedBaleybotId is set)
  useEffect(() => {
    if (!isNew || messages.length === 0 || savedBaleybotId) return;
    try {
      const snapshot = {
        ts: Date.now(),
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
          metadata: m.metadata,
        })),
        entities,
        balCode,
        name,
        description,
        icon,
      };
      sessionStorage.setItem(sessionKey, JSON.stringify(snapshot));
    } catch {
      // sessionStorage full or unavailable — non-critical
    }
  }, [isNew, messages, entities, balCode, name, description, icon, sessionKey, savedBaleybotId]);

  // Restore session on mount (new BBs only, < 24h old, unless ?fresh=1)
  useEffect(() => {
    if (!isNew) return;
    // Skip restore if fresh flag is set (user clicked "Start Fresh")
    if (searchParams.get('fresh')) {
      try { sessionStorage.removeItem(sessionKey); } catch { /* noop */ }
      return;
    }
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as {
        ts: number;
        messages: Array<{ id: string; role: string; content: string; timestamp: string; metadata?: Record<string, unknown> }>;
        entities: VisualEntity[];
        balCode: string;
        name: string;
        description: string;
        icon: string;
      };
      // Only restore if < 24 hours old
      if (Date.now() - snapshot.ts > 24 * 60 * 60 * 1000) {
        sessionStorage.removeItem(sessionKey);
        return;
      }
      if (snapshot.messages.length > 0) {
        setMessages(
          snapshot.messages.map((m) => ({
            ...m,
            role: m.role as 'user' | 'assistant' | 'system',
            timestamp: new Date(m.timestamp),
          }))
        );
      }
      if (snapshot.entities.length > 0) setEntities(snapshot.entities);
      if (snapshot.balCode) setBalCode(snapshot.balCode);
      if (snapshot.name) setName(snapshot.name);
      if (snapshot.description) setDescription(snapshot.description);
      if (snapshot.icon) setIcon(snapshot.icon);
    } catch {
      // Corrupted session data — ignore
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear session storage after successful save
  // Note: isNew (from params.id) stays 'new' after replaceState, so we cannot
  // rely on !isNew. Instead, clear whenever savedBaleybotId is set — the session
  // persist effect above already guards against re-writing after save.
  useEffect(() => {
    if (savedBaleybotId) {
      try { sessionStorage.removeItem(`creator-session:new`); } catch { /* noop */ }
    }
  }, [savedBaleybotId]);

  // Compute readiness whenever relevant state changes
  useEffect(() => {
    const allTools = entities.flatMap(e => e.tools);
    const wsConns = workspaceConnections ?? [];
    const connectedTypes = new Set(wsConns.filter(c => c.status === 'connected').map(c => c.type));
    const hasAiProvider = connectedTypes.has('openai') || connectedTypes.has('anthropic') || connectedTypes.has('ollama');

    // Check tool-specific connection requirements
    const summary = getConnectionSummary(allTools);
    const toolRequirementsMet = summary.required.every(req =>
      wsConns.some(c => c.type === req.connectionType && (c.status === 'connected' || c.status === 'unconfigured'))
    );
    const allConnectionsMet = hasAiProvider && (summary.required.length === 0 || toolRequirementsMet);

    const newReadiness = computeReadiness({
      hasBalCode: balCode.length > 0,
      hasEntities: entities.length > 0,
      tools: allTools,
      connectionsMet: allConnectionsMet,
      hasConnections: wsConns.length > 0,
      testsPassed: testCases.length > 0 && testCases.every(t => t.status === 'passed'),
      hasTestRuns: testCases.filter(t => t.status !== 'pending').length,
      hasTrigger: !!triggerConfig,
      hasMonitoring: (analyticsData?.total ?? 0) >= 1,
      specialist: specialistSignals,
    });
    setReadiness((prev) => (isSameReadiness(prev, newReadiness) ? prev : newReadiness));

    prevReadinessRef.current = newReadiness;
  }, [
    balCode,
    entities,
    testCases,
    triggerConfig,
    workspaceConnections,
    analyticsData,
    isDesignConfirmed,
    specialistSignals,
  ]);

  // Once user has progressed past design, don't block stage tabs again.
  useEffect(() => {
    if (isDesignConfirmed) return;
    const hasProgressedBeyondDesign =
      readiness.connected === 'complete' ||
      readiness.tested !== 'incomplete' ||
      readiness.integrated === 'complete' ||
      readiness.monitored === 'complete';
    if (hasProgressedBeyondDesign) {
      setIsDesignConfirmed(true);
      designGateReminderShownRef.current = false;
    }
  }, [isDesignConfirmed, readiness]);

  // Auto-switch to a visible tab if current tab becomes hidden
  useEffect(() => {
    const visibleTabs = computeAvailableTabs({
      readiness,
      savedBaleybotId,
      showAdvancedUI,
      isDesignReviewRequired,
    });
    if (!showAdvancedUI && isAdvancedEditorTab(viewMode)) {
      setViewMode('visual');
      return;
    }
    if (!visibleTabs.includes(viewMode)) {
      setViewMode('visual');
    }
  }, [
    readiness,
    viewMode,
    showAdvancedUI,
    savedBaleybotId,
    existingBaleybot?.lifecycleStage,
    existingBaleybot?.runtimeInterfaceSpec,
    isDesignReviewRequired,
  ]);

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

  const handleOptionSelect = (optionId: string) => {
    if (optionId === 'confirm-design') {
      setIsDesignConfirmed(true);
      designGateReminderShownRef.current = false;
      navigateToTab('test', { bypassDesignGate: true });
      return;
    }

    // Readiness-guided option cards → navigate to tab
    const optionToTab: Record<string, AdaptiveTab> = {
      'review-design': 'visual',
      'setup-connections': 'integrate',
      'run-tests': 'test',
      'setup-integration': 'integrate',
      'enable-monitoring': 'integrate',
    };

    const tabTarget = optionToTab[optionId];
    if (tabTarget) {
      navigateToTab(tabTarget);
      return;
    }

    // Retry last user message
    if (optionId === 'retry') {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) {
        handleSendMessage(lastUserMsg.content);
      }
      return;
    }
    handleSendMessage(`I'd like to go with: ${optionId}`);
  };

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
      designGateReminderShownRef.current = false;
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

      // Load conversation history (Phase 2.6)
      if (existingBaleybot.conversationHistory && Array.isArray(existingBaleybot.conversationHistory)) {
        const loadedMessages: CreatorMessage[] = existingBaleybot.conversationHistory
          .filter((msg): msg is { id: string; role: 'user' | 'assistant'; content: string; timestamp: string; metadata?: Record<string, unknown> } =>
            msg && typeof msg.id === 'string' && typeof msg.content === 'string'
          )
          .map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: sanitizeCreatorText(msg.content),
            timestamp: safeParseDate(msg.timestamp),
            metadata: msg.metadata as CreatorMessage['metadata'],
          }));
        setMessages(loadedMessages);
      }

      // Mark as clean since we just loaded from database
      markClean();

      // Mark state as initialized after all state updates
      setIsStateInitialized(true);
    }
  }, [isNew, existingBaleybot, markClean, setTestCases]);

  // Auto-send initial prompt if provided (using ref to track sent state)
  // Note: handleSendMessage is intentionally excluded from deps - we use ref to ensure single execution
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
  const availableTabs = computeAvailableTabs({
    readiness,
    savedBaleybotId,
    showAdvancedUI,
    isDesignReviewRequired,
  });
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
        validationStatus={validationStatus}
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
        onStartFresh={messages.length > 0 ? handleStartFresh : undefined}
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
                messages={messages}
                status={status}
                onSendMessage={handleSendMessage}
                isCreatorDisabled={isInputDisabled}
                executions={!isNew && existingBaleybot?.executions ? existingBaleybot.executions : undefined}
                onExecutionClick={(executionId) => router.push(ROUTES.activity.execution(executionId))}
                onOptionSelect={handleOptionSelect}
                streamingProgress={creatorStreamingProgress}
                quickPrompts={quickPrompts}
                quickPromptContextLabel={quickPromptContextLabel}
                agentEvents={agentEvents}
                streamingText={streamingText}
                connectionActions={connectionActions}
                streamingReasoning={streamingReasoning}
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
