'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
import { ChatInput, LeftPanel, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, isSaveConflictError, ConnectionsPanel } from '@/components/creator';
import type {
  TestCase,
} from '@/components/creator';
import type { ChatQuickPrompt } from '@/components/creator/ChatInput';

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
import { TriggerConfig } from '@/components/baleybots/TriggerConfig';
import type { TriggerConfig as TriggerConfigType } from '@/lib/baleybot/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ConflictAction } from '@/components/creator';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { ArrowLeft, Save, Loader2, Pencil, Undo2, Redo2, Keyboard, LayoutGrid, Code2, MessageSquare, PanelRight, FlaskConical, Rocket } from 'lucide-react';
import { DeployPanel } from '@/components/deploy';
import { ValidationIndicator, ReviewPage } from '@/components/review';
import { ROUTES } from '@/lib/routes';
import { ErrorBoundary } from '@/components/errors';
import { useDirtyState, useDebouncedCallback, useNavigationGuard, useHistory, useTestExecution } from '@/hooks';
import { formatErrorWithAction, parseCreatorError } from '@/lib/errors/creator-errors';
import { generateChangeSummary, formatChangeSummaryForChat } from '@/lib/baleybot/change-summary';
import { safeParseDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import type {
  VisualEntity,
  Connection,
  CreatorMessage,
  CreatorGuidanceAction,
  CreationStatus,
  CreationProgress,
  AdaptiveTab,
  CreatorOutput,
  BuilderPresentationMode,
  TriggerSetupStep,
} from '@/lib/baleybot/creator-types';
import type { LaunchKit } from '@/lib/baleybot/types';
import { computeReadiness, createInitialReadiness, getVisibleTabs } from '@/lib/baleybot/readiness';
import type { ReadinessDimension, ReadinessState } from '@/lib/baleybot/readiness';
import type { ValidationStatus } from '@/lib/baleybot/creator-validation';
import {
  getConnectionSummary,
  parseConnectionTool,
  connectionNameToSlug,
} from '@/lib/baleybot/tools/requirements-scanner';
import type { BalGraphSidecarMetadata } from '@/lib/baleybot/graph/types';
import type { GraphRuntimeEvent } from '@/lib/streaming/types/events';
import { parseBalCode } from '@/lib/baleybot/bal-parser-pure';
import {
  sanitizeCreatorConversationHistory,
  sanitizeCreatorText,
} from '@/lib/baleybot/creator-sanitization';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';

const ADVANCED_EDITOR_TABS: AdaptiveTab[] = ['code'];
const POST_DESIGN_TABS: AdaptiveTab[] = ['review', 'launch'];

function isAdvancedEditorTab(tab: AdaptiveTab): boolean {
  return ADVANCED_EDITOR_TABS.includes(tab);
}

function computeAvailableTabs(args: {
  readiness: ReadinessState;
  savedBaleybotId: string | null;
  showAdvancedUI: boolean;
  isDesignReviewRequired: boolean;
}): AdaptiveTab[] {
  const tabs = [...getVisibleTabs(args.readiness)];

  if (args.savedBaleybotId && !tabs.includes('launch')) {
    tabs.push('launch');
  }

  const tabsAfterDesignGate = args.isDesignReviewRequired
    ? tabs.filter((tab) => !POST_DESIGN_TABS.includes(tab))
    : tabs;

  return args.showAdvancedUI
    ? tabsAfterDesignGate
    : tabsAfterDesignGate.filter((tab) => !isAdvancedEditorTab(tab));
}

/**
 * Example prompts shown on the /new welcome view
 */
const EXAMPLE_PROMPTS = [
  { label: 'Research & summarize', prompt: 'Create a bot that searches the web for a topic, fetches the top 3 results, and summarizes them into a concise report' },
  { label: 'Data pipeline', prompt: 'Build a bot that reads data from a database, analyzes it, and sends me a notification with insights' },
  { label: 'Multi-bot workflow', prompt: 'Create a team of bots: one that monitors websites for changes and another that summarizes the changes into a daily digest' },
  { label: 'Simple assistant', prompt: 'Create a helpful assistant that can search the web and answer questions' },
];

/**
 * Maximum length for BaleyBot names (Phase 5.1)
 */
const MAX_NAME_LENGTH = 100;

/**
 * Truncate a string to a maximum length
 */
function truncateName(name: string, maxLength: number = MAX_NAME_LENGTH): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength).trim();
}

function formatSlugLabel(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractSidecarFromStructure(structure: unknown): BalGraphSidecarMetadata | undefined {
  if (!structure || typeof structure !== 'object') return undefined;
  const record = structure as Record<string, unknown>;
  const sidecar = record.sidecar;
  if (!sidecar || typeof sidecar !== 'object') return undefined;
  return sidecar as BalGraphSidecarMetadata;
}

function buildDerivedGraphSidecar(args: {
  entities: VisualEntity[];
  connections: Array<{ id: string; type: string; name: string; status: string }> | undefined;
  existingSidecar?: BalGraphSidecarMetadata;
}): BalGraphSidecarMetadata | undefined {
  const base = args.existingSidecar;
  const datasourceBindings = [...(base?.datasourceBindings ?? [])];

  const existingBindingKey = new Set(
    datasourceBindings.map(
      (binding) => `${binding.entity}:${binding.connectionId}:${binding.tool}`
    )
  );

  for (const entity of args.entities) {
    for (const tool of entity.tools) {
      const parsed = parseConnectionTool(tool);
      if (!parsed.connectionType || !parsed.connectionSlug) continue;

      const matchingConnection = args.connections?.find(
        (connection) =>
          connection.type === parsed.connectionType &&
          connectionNameToSlug(connection.name) === parsed.connectionSlug
      );

      const connectionId = matchingConnection?.id ?? `${parsed.connectionType}:${parsed.connectionSlug}`;
      const key = `${entity.name}:${connectionId}:${tool}`;
      if (existingBindingKey.has(key)) continue;
      existingBindingKey.add(key);

      datasourceBindings.push({
        entity: entity.name,
        connectionId,
        tool,
        mode: 'read',
        connectionLabel: matchingConnection?.name ?? formatSlugLabel(parsed.connectionSlug),
        connectionType: parsed.connectionType,
      });
    }
  }

  const storageParticipants = args.entities
    .filter((entity) => entity.tools.includes('shared_storage'))
    .map((entity) => entity.name);

  const sharedStorageLinks = [...(base?.sharedStorageLinks ?? [])];
  const existingSharedKey = new Set(
    sharedStorageLinks.map((link) => `${link.producer}:${link.consumer}:${link.keyPattern ?? '*'}`)
  );

  for (const producer of storageParticipants) {
    for (const consumer of storageParticipants) {
      if (producer === consumer) continue;
      const key = `${producer}:${consumer}:*`;
      if (existingSharedKey.has(key)) continue;
      existingSharedKey.add(key);
      sharedStorageLinks.push({
        producer,
        consumer,
        keyPattern: '*',
        required: false,
      });
    }
  }

  const hasAny =
    datasourceBindings.length > 0 ||
    sharedStorageLinks.length > 0 ||
    (base?.spawnBindings?.length ?? 0) > 0;

  if (!hasAny) return undefined;

  return {
    ...base,
    datasourceBindings,
    sharedStorageLinks,
  };
}

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
      timestamp?: number;
    }
  | {
      type: 'creator_error';
      message?: string;
      timestamp?: number;
    }
  | {
      type: 'creator_validation_started';
      timestamp?: number;
    }
  | {
      type: 'creator_validation_progress';
      testIndex?: number;
      totalTests?: number;
      testName?: string;
      timestamp?: number;
    }
  | {
      type: 'creator_validation_result';
      status?: 'passed' | 'failed';
      passRate?: number;
      failedTests?: string[];
      timestamp?: number;
    }
  | {
      type: 'creator_agent_event';
      event?: Record<string, unknown>;
      entityName?: string;
      timestamp?: number;
    };

function appendGraphRuntimeEvent(
  events: GraphRuntimeEvent[],
  event: GraphRuntimeEvent,
  maxEvents = 300
): GraphRuntimeEvent[] {
  const next = [...events, event];
  return next.slice(-maxEvents);
}

function isSameReadiness(a: ReadinessState, b: ReadinessState): boolean {
  return (
    a.designed === b.designed &&
    a.connected === b.connected &&
    a.tested === b.tested &&
    a.activated === b.activated &&
    a.monitored === b.monitored
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCreatorHistoryPayload(messages: CreatorMessage[]) {
  return sanitizeCreatorConversationHistory(messages).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    metadata: message.metadata as Record<string, unknown> | undefined,
  }));
}

function buildGuidanceQuickPrompts(
  actions: CreatorGuidanceAction[]
): ChatQuickPrompt[] {
  return actions.slice(0, 3).map((action, index) => ({
    id: `guidance-${index}-${action.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label: action.label,
    prompt: action.prompt,
    mode: action.mode ?? 'send',
  }));
}

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

  // Creation state
  const [status, setStatus] = useState<CreationStatus>(isNew ? 'empty' : 'building');
  const [entities, setEntities] = useState<VisualEntity[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [balCode, setBalCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [icon, setIcon] = useState<string>('');
  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [savedBaleybotId, setSavedBaleybotId] = useState<string | null>(isNew ? null : id);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  // View mode state (adaptive based on readiness)
  const [viewMode, setViewMode] = useState<AdaptiveTab>('visual');
  const [builderMode, setBuilderMode] = useState<BuilderPresentationMode>('simple');
  const showAdvancedUI = builderMode === 'advanced';
  const [isDesignConfirmed, setIsDesignConfirmed] = useState(!isNew);
  const [triggerSetupStep, setTriggerSetupStep] = useState<TriggerSetupStep>('start');

  // Live execution graph events (used by test tab's live run map)
  const [runtimeGraphEvents, setRuntimeGraphEvents] = useState<GraphRuntimeEvent[]>([]);

  // Mobile view toggle (chat vs editor)
  type MobileView = 'editor' | 'chat';
  const [mobileView, setMobileView] = useState<MobileView>('editor');

  // Trigger config state
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType | undefined>(undefined);

  // Background validation state
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');

  // Readiness state
  const [readiness, setReadiness] = useState(createInitialReadiness());
  // Seed initial readiness for new sessions so first completion can trigger guidance.
  const prevReadinessRef = useRef<ReadinessState | null>(isNew ? createInitialReadiness() : null);

  // Save conflict state (Phase 5.4)
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  // Real-time creation progress
  const [, setCreationProgress] = useState<CreationProgress | null>(null);
  const [creatorStreamingProgress, setCreatorStreamingProgress] =
    useState<{ phase: string; message: string; startedAt: number } | null>(null);
  const [creatorGuidanceActions, setCreatorGuidanceActions] = useState<CreatorGuidanceAction[]>([]);

  // Agent activity events (for AgentActivityPanel)
  const [agentEvents, setAgentEvents] = useState<Array<{ event: Record<string, unknown>; entityName?: string; timestamp: number }>>([]);

  // Streaming text state — creator_bot's conversational text shown in real-time
  const [streamingText, setStreamingText] = useState('');
  const streamingTextRef = useRef('');
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref to track if initial prompt was sent (avoids effect dependency issues)
  const initialPromptSentRef = useRef(false);
  const designGateReminderShownRef = useRef(false);
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

  // Fetch available BBs for trigger config source selector
  const { data: availableBaleybots } = trpc.baleybots.list.useQuery(undefined, {
    enabled: viewMode === 'launch',
  });

  // Fetch workspace connections (for connections panel AND readiness computation)
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

  // Launch prep readiness and runtime interface
  const {
    data: launchReadinessData,
    isFetching: isFetchingLaunchReadiness,
    refetch: refetchLaunchReadiness,
  } = trpc.baleybots.evaluateLaunchReadiness.useQuery(
    { baleybotId: savedBaleybotId!, requiredPassRate: 0.8 },
    { enabled: !!savedBaleybotId && viewMode === 'launch' },
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
  const approveLaunchPlanMutation = trpc.baleybots.approveLaunchPlan.useMutation();
  const promoteToLiveMutation = trpc.baleybots.promoteToLive.useMutation();
  const pauseLiveBotMutation = trpc.baleybots.pauseLiveBot.useMutation();

  // Normalize workspace connections once for both ConnectionsPanel and useTestExecution
  const normalizedConnections = workspaceConnections?.map(c => ({
    id: c.id,
    type: c.type,
    name: c.name,
    status: c.status ?? 'unconfigured',
    isDefault: c.isDefault ?? false,
  }));
  const connectionToolSuggestions = useMemo(() => {
    return (normalizedConnections ?? [])
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
  }, [normalizedConnections]);
  const savedStructureSidecar = useMemo(
    () => extractSidecarFromStructure(existingBaleybot?.structure),
    [existingBaleybot?.structure]
  );
  const graphSidecar = useMemo(
    () =>
      buildDerivedGraphSidecar({
        entities,
        connections: normalizedConnections,
        existingSidecar: savedStructureSidecar,
      }),
    [entities, normalizedConnections, savedStructureSidecar]
  );
  const creatorGuidanceInput = useMemo(
    () => ({
      status,
      messages: messages.slice(-30).map((message) => {
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
          role: message.role,
          content: message.content.slice(0, 4000),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };
      }),
    }),
    [messages, status]
  );
  const {
    data: creatorGuidanceData,
  } = trpc.baleybots.getCreatorGuidance.useQuery(creatorGuidanceInput, {
    enabled: messages.length > 0 && status !== 'running' && status !== 'building',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (!creatorGuidanceData?.actions) return;
    if (status === 'building') return;
    setCreatorGuidanceActions(creatorGuidanceData.actions);
  }, [creatorGuidanceData, status]);

  const quickPrompts = useMemo(
    () => buildGuidanceQuickPrompts(creatorGuidanceActions),
    [creatorGuidanceActions]
  );

  const quickPromptContextLabel = useMemo(() => {
    if (quickPrompts.length > 0) return 'Suggested next action';
    return undefined;
  }, [quickPrompts.length]);

  // =====================================================================
  // TEST EXECUTION HOOK
  // =====================================================================

  const injectMessage = (message: CreatorMessage) => {
    setMessages(prev => [...prev, message]);
  };

  const isDesignReviewRequired =
    status === 'ready' && entities.length > 0 && !isDesignConfirmed;
  const requiresDesignReviewForTab = (tab: AdaptiveTab) =>
    isDesignReviewRequired && POST_DESIGN_TABS.includes(tab);

  const promptDesignReview = () => {
    if (designGateReminderShownRef.current) return;
    designGateReminderShownRef.current = true;

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-design-gate`,
        role: 'assistant',
        content:
          'Before setup, review the Visual layout and confirm it looks right. Then continue to connections or testing.',
        timestamp: new Date(),
        metadata: {
          options: [
            {
              id: 'confirm-design',
              label: 'Confirm Design',
              description: 'Lock this design and continue to setup',
              icon: '✅',
            },
          ],
        },
      },
    ]);
  };

  const navigateToTab = (tab: AdaptiveTab, options?: { bypassDesignGate?: boolean }) => {
    if (!options?.bypassDesignGate && requiresDesignReviewForTab(tab)) {
      setViewMode('visual');
      setMobileView('editor');
      promptDesignReview();
      return false;
    }

    setViewMode(tab);
    setMobileView('editor');
    return true;
  };

  const {
    testCases,
    setTestCases,
  } = useTestExecution({
    savedBaleybotId,
    balCode,
    botName: name,
    entities,
    workspaceConnections: normalizedConnections,
    onInjectMessage: injectMessage,
    onNavigateToTab: navigateToTab,
    onRuntimeGraphEvent: (event) => {
      setRuntimeGraphEvents((previous) => appendGraphRuntimeEvent(previous, event));
    },
    onExecutionStarted: () => {
      setRuntimeGraphEvents([]);
    },
  });

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
    setValidationStatus('idle');
    setAgentEvents([]);
    setStreamingText('');
    streamingTextRef.current = '';
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
      },
      onEvent: (event) => {
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
            setAgentEvents((prev) => [
              ...prev,
              {
                event: event.event as Record<string, unknown>,
                entityName: event.entityName,
                timestamp: event.timestamp ?? Date.now(),
              },
            ]);
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

        if (event.type === 'creator_validation_started') {
          setValidationStatus('validating');
          return;
        }

        if (event.type === 'creator_validation_result') {
          setValidationStatus(event.status === 'passed' ? 'passed' : 'failed');
          return;
        }

        if (event.type === 'creator_validation_progress') {
          // Progress updates are informational only — status stays 'validating'
          return;
        }

        if (event.type === 'creator_error') {
          throw new Error(event.message || 'Creator stream failed');
        }
      },
    });

    // Flush any remaining streaming text
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    setStreamingText('');

    // If the concierge streamed text but no structured result (conversation-only turn),
    // build a synthetic building response from the streamed text
    if (!finalResult && streamingTextRef.current.trim()) {
      finalResult = {
        status: 'building' as const,
        message: streamingTextRef.current.trim(),
        entities: [],
        connections: [],
        balCode: '',
        name: 'Unnamed BaleyBot',
        description: '',
        icon: '🤖',
      };
    }

    // Reset streaming ref for next turn
    streamingTextRef.current = '';

    if (!finalResult) {
      throw new Error('Creator stream completed without a final result.');
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
      const lifecycleBlockMode =
        result.blockMode ??
        ((result.questions ?? []).some((question) => question.requiredNow !== false)
          ? 'hard'
          : (result.questions ?? []).length > 0
            ? 'soft'
            : 'none');
      const runnableConfidence =
        typeof result.runnableConfidence === 'number'
          ? Math.max(0, Math.min(1, result.runnableConfidence))
          : undefined;
      const requiredQuestions = (result.questions ?? []).filter(
        (question) => question.requiredNow !== false
      );
      const optionalQuestions = (result.questions ?? []).filter(
        (question) => question.requiredNow === false
      );
      const nextRequiredQuestion = requiredQuestions[0];
      const nextOptionalQuestion = optionalQuestions[0];

      const baseMessage = (result.message?.trim() || result.thinking?.trim() || '').replace(
        /\n{3,}/g,
        '\n\n'
      );
      const looksChecklist =
        /\[(required|later|assumption|confidence)\]/i.test(baseMessage) ||
        (/(?:^|\n)\s*(?:[-*]|\d+\.)\s+/m.test(baseMessage) &&
          baseMessage.split('\n').length > 8);
      const shouldUseBaseMessage =
        baseMessage.length > 0 &&
        baseMessage.length <= 900 &&
        !looksChecklist;
      const fallbackMessage = nextRequiredQuestion
        ? `To keep this moving, I need one detail: **${nextRequiredQuestion.label}**\n\n${nextRequiredQuestion.description}`
        : nextOptionalQuestion
          ? `I can build now. Helpful next detail: **${nextOptionalQuestion.label}**\n\n${nextOptionalQuestion.description}`
          : 'Share any final detail and I will continue.';
      const responseContent = shouldUseBaseMessage
        ? baseMessage
        : fallbackMessage;

      if (!name && result.name) {
        setName(truncateName(result.name));
      }
      if (!icon && result.icon) {
        setIcon(result.icon);
      }
      if (!description && result.description) {
        setDescription(result.description);
      }

      const assistantMessage: CreatorMessage = {
        id: `msg-${Date.now()}-assistant-discovery`,
        role: 'assistant',
        content: responseContent.trim(),
        timestamp: new Date(),
        thinking: result.thinking || undefined,
        metadata: {
          streamSummary,
          creatorLifecycle: {
            stage: 'discovery',
            blockerMode: lifecycleBlockMode,
            runnableConfidence,
          },
        },
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStatus('ready');
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
    let responseContent = '';
    if (modelNarrative) {
      responseContent = modelNarrative;
    } else if (isInitialCreation) {
      const totalTools = visualEntities.reduce((sum, entity) => sum + entity.tools.length, 0);
      responseContent = `I've created **${result.name}** with ${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'}`;
      if (totalTools > 0) {
        responseContent += ` and ${totalTools} ${totalTools === 1 ? 'tool' : 'tools'}`;
      }
      responseContent += '.';
    } else {
      responseContent = summaryText || `Updated **${result.name}**.`;
    }

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

    const assistantMessage: CreatorMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content: responseContent.trim(),
      timestamp: new Date(),
      thinking: result.thinking || undefined,
      metadata,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    setStatus('ready');
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
    const sanitizedMessage = sanitizeCreatorText(message);

    // 0. Capture previous state for change summary (Phase 3.2)
    const prevEntities = [...entities];
    const prevConnections = [...connections];
    const prevName = name;

    // 1. Add user message to messages
    const userMessage: CreatorMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: sanitizedMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const nextConversationHistory = buildCreatorHistoryPayload([...messages, userMessage]);

    // 2. Set status to 'building'
    setStatus('building');
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
      setStatus('error');
      setCreationProgress(null);
      setCreatorStreamingProgress(null);

      // Add user-friendly error message with recovery options
      const parsed = parseCreatorError(error);
      const errorMessage: CreatorMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `${parsed.title}: ${parsed.message}${parsed.action ? ` ${parsed.action}` : ''}`,
        timestamp: new Date(),
        metadata: {
          isError: true,
          diagnostic: {
            level: 'error',
            title: parsed.title,
            details: parsed.message,
            suggestions: [
              'Try simplifying your request',
              'Check your AI provider connection in Settings',
              'Try one of the example prompts below',
            ],
          },
          options: [
            { id: 'retry', label: 'Retry', description: 'Send the same message again', icon: '🔄' },
            { id: 'simplify', label: 'Start Simple', description: 'Try with a basic bot first', icon: '✨' },
          ],
        },
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

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

    const summary = applied
      .map((item) => `- \`${item.fromTool}\` -> \`${item.toTool}\``)
      .join('\n');
    const assistantMessage: CreatorMessage = {
      id: `msg-${Date.now()}-tool-remap`,
      role: 'assistant',
      content: `Updated tool mapping in BAL:\n${summary}`,
      timestamp: new Date(),
      metadata: {
        diagnostic: {
          level: 'success',
          title: 'Tool Mapping Updated',
          details: 'The selected source mapping has been written to BAL code.',
        },
      },
    };
    setMessages((prev) => [...prev, assistantMessage]);
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

      return result.id;
    } catch (error) {
      console.error('Save failed:', error);

      // Check for save conflict (Phase 5.4)
      if (isSaveConflictError(error)) {
        setShowConflictDialog(true);
        return null;
      }

      // Add user-friendly error message to conversation
      const errorContent = formatErrorWithAction(error);
      const errorMessage: CreatorMessage = {
        id: `msg-${Date.now()}-save-error`,
        role: 'assistant',
        content: `Save failed: ${errorContent}`,
        timestamp: new Date(),
        metadata: { isError: true },
      };
      setMessages((prev) => [...prev, errorMessage]);
      setStatus('error');

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
          // TODO: In a full implementation, this would pass a flag to skip version check
          // For now, we just retry the save which may work if the conflict was resolved
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

  const handleGenerateLaunchKit = async () => {
    if (!savedBaleybotId) return;
    try {
      await generateLaunchKitMutation.mutateAsync({ baleybotId: savedBaleybotId, requiredPassRate: 0.8 });
      await utils.baleybots.get.invalidate({ id: savedBaleybotId });
      await refetchLaunchReadiness();
    } catch (error) {
      const message: CreatorMessage = {
        id: `msg-${Date.now()}-launchkit-error`,
        role: 'assistant',
        content: `Launch kit generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        metadata: { isError: true },
      };
      setMessages((prev) => [...prev, message]);
    }
  };

  const handlePromoteToLive = async () => {
    if (!savedBaleybotId) return;
    try {
      await promoteToLiveMutation.mutateAsync({ baleybotId: savedBaleybotId });
      await utils.baleybots.get.invalidate({ id: savedBaleybotId });
      await utils.analytics.getBaleybotAnalytics.invalidate({ baleybotId: savedBaleybotId });
      setViewMode('launch');
    } catch (error) {
      const message: CreatorMessage = {
        id: `msg-${Date.now()}-promote-live-error`,
        role: 'assistant',
        content: `Could not promote to live: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        metadata: { isError: true },
      };
      setMessages((prev) => [...prev, message]);
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
      const message: CreatorMessage = {
        id: `msg-${Date.now()}-pause-live-error`,
        role: 'assistant',
        content: `Live state update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        metadata: { isError: true },
      };
      setMessages((prev) => [...prev, message]);
    }
  };

  // =====================================================================
  // NAVIGATION GUARD (Phase 1.3)
  // =====================================================================

  const {
    guardedNavigate,
    showDialog,
    closeDialog,
    handleDiscard,
    handleSaveAndLeave,
  } = useNavigationGuard(isDirty, handleSave);

  /**
   * Handle back navigation (uses guard)
   */
  const handleBack = () => {
    guardedNavigate(ROUTES.baleybots.list);
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
    });
    setReadiness((prev) => (isSameReadiness(prev, newReadiness) ? prev : newReadiness));

    // Detect dimension completions and inject follow-up guidance messages
    if (prevReadinessRef.current && status === 'ready') {
      const prev = prevReadinessRef.current;
      const dims: ReadinessDimension[] = ['designed', 'connected', 'tested', 'activated', 'monitored'];

      for (const dim of dims) {
        if (prev[dim] !== 'complete' && newReadiness[dim] === 'complete') {
          // Auto-advance to the next logical tab when a dimension completes
          const autoAdvanceTargets: Partial<Record<ReadinessDimension, AdaptiveTab>> = {
            connected: 'review',
            tested: 'launch',
            activated: 'launch',
          };
          const targetTab = autoAdvanceTargets[dim];
          const canAutoAdvance =
            !!targetTab &&
            getVisibleTabs(newReadiness).includes(targetTab);

          if (canAutoAdvance && targetTab) {
            setViewMode(targetTab);
            setMobileView('editor');
          }
          break;
        }
      }
    }
    prevReadinessRef.current = newReadiness;
  }, [
    balCode,
    entities,
    testCases,
    triggerConfig,
    workspaceConnections,
    analyticsData,
    status,
    isDesignConfirmed,
  ]);

  // Once user has progressed past design, don't block stage tabs again.
  useEffect(() => {
    if (isDesignConfirmed) return;
    const hasProgressedBeyondDesign =
      readiness.connected === 'complete' ||
      readiness.tested !== 'incomplete' ||
      readiness.activated === 'complete' ||
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
      saveTriggerMutation.mutate({
        id: savedBaleybotId,
        triggerConfig: getPersistableTriggerConfig(triggerConfig),
      });
    }, 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerConfig, savedBaleybotId]);

  const handleOptionSelect = (optionId: string) => {
    if (optionId === 'confirm-design') {
      setIsDesignConfirmed(true);
      designGateReminderShownRef.current = false;
      const postConfirmTarget: AdaptiveTab = 'review';
      navigateToTab(postConfirmTarget, { bypassDesignGate: true });
      const followUpMessage: CreatorMessage = {
        id: `msg-${Date.now()}-design-confirmed`,
        role: 'assistant',
        content: 'Design confirmed. Next, review and interact with your bot.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, followUpMessage]);
      return;
    }

    // Readiness-guided option cards → navigate to tab + add guide message
    const optionToTab: Record<string, AdaptiveTab> = {
      'review-design': 'visual',
      'setup-connections': 'launch',
      'run-tests': 'review',
      'setup-triggers': 'launch',
      'enable-monitoring': 'launch',
    };

    const tabTarget = optionToTab[optionId];
    if (tabTarget) {
      const navigated = navigateToTab(tabTarget);
      if (!navigated) {
        return;
      }

      const guideMessages: Record<string, string> = {
        'review-design': 'Take a look at the visual layout. Confirm the design when it looks right, then continue to guided setup.',
        'setup-connections': 'Check which connections your bot needs. Make sure an **AI provider** is connected, and set up any tool-specific connections.',
        'run-tests': 'Send a message to interact with your bot and verify it works as expected.',
        'setup-triggers': 'Choose how your bot should be triggered — on a schedule, via webhook, or when another bot completes.',
        'enable-monitoring': 'Once your bot has run at least once, monitoring data will appear here.',
      };

      const guideText = guideMessages[optionId];
      if (guideText) {
        const guideMessage: CreatorMessage = {
          id: `msg-${Date.now()}-guide`,
          role: 'assistant',
          content: guideText,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, guideMessage]);
      }
      return;
    }

    // Existing option handling
    if (optionId === 'retry') {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) {
        handleSendMessage(lastUserMsg.content);
      }
      return;
    }
    if (optionId === 'simplify') {
      handleSendMessage('Create a simple assistant that helps answer questions');
      return;
    }
    handleSendMessage(`I'd like to go with: ${optionId}`);
  };

  // =====================================================================
  // EFFECTS
  // =====================================================================

  // Initialize state from existing BaleyBot
  useEffect(() => {
    if (!isNew && existingBaleybot) {
      setName(existingBaleybot.name);
      setDescription(existingBaleybot.description || '');
      setIcon(existingBaleybot.icon || '');
      setBalCode(existingBaleybot.balCode);
      setStatus('ready');
      setIsDesignConfirmed(true);
      designGateReminderShownRef.current = false;
      if (existingBaleybot.lifecycleStage === 'live' || existingBaleybot.lifecycleStage === 'paused') {
        setViewMode('launch');
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
  const canSave = status === 'ready' && balCode && name && !isSaving && !isSavePending;
  const lifecycleStage = existingBaleybot?.lifecycleStage ?? 'draft';
  const launchKit = (existingBaleybot?.launchKit as LaunchKit | null) ?? null;
  const launchReadiness = launchReadinessData?.readiness;
  const launchBusy =
    isFetchingLaunchReadiness ||
    generateLaunchKitMutation.isPending ||
    approveLaunchPlanMutation.isPending ||
    promoteToLiveMutation.isPending ||
    pauseLiveBotMutation.isPending;
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

      {/* Header - Adaptive layout (Phase 4.6) */}
      <header className="animate-fade-slide-down border-b border-border/60 bg-background/85 backdrop-blur-md">
        {/* Main header row - responsive padding (Phase 4.6) */}
        <div className="flex items-center gap-2 sm:gap-3 w-full px-2 sm:px-4 py-2 sm:py-3">
          {/* Back button */}
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0 min-h-10 min-w-10 sm:min-h-11 sm:min-w-11" aria-label="Go back to BaleyBots list">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>

          {/* Icon and name (Phase 5.1: Handle long names) */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <span className="text-xl sm:text-2xl shrink-0">{displayIcon}</span>
            <h1
              className="text-base sm:text-lg font-semibold truncate max-w-[120px] sm:max-w-[200px] md:max-w-[300px] lg:max-w-[400px]"
              title={displayName.length > 15 ? displayName : undefined}
            >
              {displayName}
            </h1>
            {/* Unsaved indicator - shorter text on mobile (Phase 4.6) */}
            {isDirty && (
              <span className="text-amber-500 text-xs font-medium shrink-0" title="Unsaved changes">
                <span className="hidden sm:inline">(unsaved)</span>
                <span className="sm:hidden">•</span>
              </span>
            )}
            {!isNew && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary shrink-0 uppercase tracking-wide">
                {lifecycleStage.replace('_', ' ')}
              </span>
            )}
            {validationStatus !== 'idle' && (
              <ValidationIndicator status={validationStatus} />
            )}
          </div>

          {/* Undo/Redo buttons - hidden on mobile (Phase 4.6) */}
          <div className="hidden sm:flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="min-h-11 min-w-11 h-11 w-11"
                    aria-label="Undo"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Undo (Cmd+Z)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="min-h-11 min-w-11 h-11 w-11"
                    aria-label="Redo"
                  >
                    <Redo2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Redo (Cmd+Shift+Z)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="w-px h-4 bg-border mx-1" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShortcutsOpen(true)}
                    className="min-h-11 min-w-11 h-11 w-11"
                    aria-label="Keyboard shortcuts"
                  >
                    <Keyboard className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Keyboard shortcuts (?)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Save button with tooltip (Phase 1.8) - compact on mobile (Phase 4.6) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={saveDisabledReason ? 0 : undefined}>
                  <Button
                    onClick={() => debouncedSave()}
                    disabled={!canSave || !!saveDisabledReason}
                    size="sm"
                    className="shrink-0 min-h-10 sm:min-h-9"
                  >
                    {isSaving || isSavePending ? (
                      <>
                        <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                        <span className="hidden sm:inline">Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Save</span>
                      </>
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {saveDisabledReason && (
                <TooltipContent>
                  <p>{saveDisabledReason}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Description row (Phase 2.8) - hidden on mobile (Phase 4.6) */}
        {(description || isEditingDescription) && (
          <div className="hidden sm:block w-full px-4 pb-3 pl-14">
            {isEditingDescription ? (
              <div className="flex gap-2">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  className="flex-1 text-sm text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  rows={2}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsEditingDescription(false);
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditingDescription(false)}
                >
                  Done
                </Button>
              </div>
            ) : (
              <div className="group flex items-start gap-2">
                <p
                  className={`text-sm text-muted-foreground flex-1 ${
                    !showFullDescription && description.length > 100 ? 'line-clamp-1' : ''
                  }`}
                >
                  {description}
                </p>
                {description.length > 100 && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    {showFullDescription ? 'Show less' : 'Show more'}
                  </button>
                )}
                <button
                  onClick={() => setIsEditingDescription(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                  title="Edit description"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        )}
      </header>

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

            {/* Example prompt pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => handleSendMessage(ex.prompt)}
                  disabled={creatorMutation.isPending}
                  className="rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {ex.label}
                </button>
              ))}
            </div>
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
              {status === 'building' && mobileView === 'editor' && (
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
                isCreatorDisabled={status === 'building' || isSaving}
                executions={!isNew && existingBaleybot?.executions ? existingBaleybot.executions : undefined}
                onExecutionClick={(executionId) => router.push(ROUTES.activity.execution(executionId))}
                onOptionSelect={handleOptionSelect}
                streamingProgress={creatorStreamingProgress}
                quickPrompts={quickPrompts}
                quickPromptContextLabel={quickPromptContextLabel}
                agentEvents={agentEvents}
                streamingText={streamingText}
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
                        review: { icon: <FlaskConical className="h-3.5 w-3.5" />, label: 'Review' },
                        launch: { icon: <Rocket className="h-3.5 w-3.5" />, label: 'Go Live' },
                      };
                      const config = tabConfig[tab];
                      return (
                        <TabsTrigger key={tab} value={tab} className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                          {config.icon}
                          <span className="hidden sm:inline">{config.label}</span>
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
              <div className="flex-1 min-h-0 p-4">
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
                        readOnly={status === 'building' || status === 'running'}
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
                        readOnly={status === 'building' || status === 'running'}
                      />
                    </div>
                  )}



                  {/* Review View */}
                  {viewMode === 'review' && savedBaleybotId && (
                    <ReviewPage
                      baleybotId={savedBaleybotId}
                      balCode={balCode}
                      entities={entities}
                      triggerConfig={triggerConfig}
                      topology={
                        entities.length <= 1
                          ? 'single'
                          : connections.length > 0
                            ? 'chain'
                            : 'parallel'
                      }
                      validationStatus={validationStatus}
                      botName={name}
                      botIcon={icon}
                    />
                  )}

                  {/* Go Live View */}
                  {viewMode === 'launch' && (
                    <DeployPanel
                      lifecycleStage={lifecycleStage}
                      launchKit={launchKit}
                      launchBusy={launchBusy}
                      savedBaleybotId={savedBaleybotId}
                      baleybotName={existingBaleybot?.name ?? 'BaleyBot'}
                      readiness={readiness}
                      readinessItems={[
                        {
                          dimension: 'designed',
                          label: 'Design',
                          description: balCode && entities.length > 0
                            ? `${entities.length} step${entities.length === 1 ? '' : 's'} configured`
                            : 'Build your bot in the chat first',
                        },
                        {
                          dimension: 'connected',
                          label: 'Connections',
                          description: (normalizedConnections ?? []).some(c => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected')
                            ? 'AI provider connected'
                            : 'Connect an AI provider to power your bot',
                        },
                        {
                          dimension: 'tested',
                          label: 'Tests',
                          description: launchReadiness?.testPassRate != null
                            ? `${Math.round(launchReadiness.testPassRate * 100)}% pass rate`
                            : 'Review your bot in the Review tab first',
                          action: (launchReadiness?.testPassRate == null || launchReadiness.testPassRate < 0.8)
                            ? { label: 'Run tests', onClick: () => navigateToTab('review') }
                            : undefined,
                        },
                        {
                          dimension: 'activated',
                          label: 'Trigger',
                          description: triggerConfig?.type
                            ? `Starts via ${triggerConfig.type.replace(/_/g, ' ')}`
                            : 'Choose how this bot gets triggered',
                        },
                      ]}
                      blockingIssues={launchReadiness?.blockingIssues}
                      readyForLaunchPrep={launchReadiness?.readyForLaunchPrep}
                      entityCount={entities.length}
                      toolCount={new Set(entities.flatMap(e => e.tools)).size}
                      providerCount={(normalizedConnections ?? []).filter(c => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected').length || 1}
                      isGeneratingLaunchKit={generateLaunchKitMutation.isPending}
                      isPromotingToLive={promoteToLiveMutation.isPending}
                      onGenerateLaunchKit={handleGenerateLaunchKit}
                      onPromoteToLive={handlePromoteToLive}
                      onPauseOrResume={handlePauseOrResumeLive}
                      onRefreshReadiness={() => refetchLaunchReadiness()}
                      triggerSetupSlot={
                        !triggerConfig?.type ? (
                          <div className="rounded-xl border p-4 space-y-3">
                            <p className="text-sm font-medium">How should this bot start?</p>
                            <TriggerConfig
                              value={triggerConfig}
                              onChange={setTriggerConfig}
                              workspaceId={existingBaleybot?.workspaceId}
                              baleybotId={savedBaleybotId ?? undefined}
                              presentationMode={builderMode}
                              setupStep={triggerSetupStep}
                              onSetupStepChange={setTriggerSetupStep}
                              availableBaleybots={
                                availableBaleybots
                                  ?.filter((bb) => bb.id !== savedBaleybotId)
                                  .map((bb) => ({ id: bb.id, name: bb.name })) ?? []
                              }
                              availableConnections={
                                (workspaceConnections ?? []).map((conn) => ({
                                  id: conn.id,
                                  name: conn.name,
                                  type: conn.type,
                                  status: conn.status ?? undefined,
                                }))
                              }
                            />
                          </div>
                        ) : undefined
                      }
                      connectionSetupSlot={
                        !(normalizedConnections ?? []).some(c => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected') ? (
                          <ConnectionsPanel
                            tools={entities.flatMap(e => e.tools)}
                            connections={normalizedConnections ?? []}
                            baleybotId={savedBaleybotId ?? undefined}
                            balCode={balCode}
                            entitySummaries={entities.map((entity) => ({
                              name: entity.name,
                              tools: entity.tools,
                            }))}
                            isLoading={isLoadingConnections}
                            onConnectionCreated={() => utils.connections.list.invalidate()}
                            onApplyToolRemap={handleApplyToolRemap}
                            onNavigateToTest={() => navigateToTab('review')}
                          />
                        ) : undefined
                      }
                    />
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
