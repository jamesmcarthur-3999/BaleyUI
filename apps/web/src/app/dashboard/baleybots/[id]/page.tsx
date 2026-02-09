'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
import { ChatInput, LeftPanel, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, isSaveConflictError, ReadinessChecklist, ConnectionsPanel, TestPanel, MonitorPanel } from '@/components/creator';
import type { TestCase } from '@/components/creator';

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
import { ArrowLeft, Save, Loader2, Pencil, Undo2, Redo2, Keyboard, LayoutGrid, Code2, Zap, BarChart3, MessageSquare, PanelRight, Cable, FlaskConical, Activity, Rocket, CirclePlay, PauseCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
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
  CreationStatus,
  CreationProgress,
  AdaptiveTab,
} from '@/lib/baleybot/creator-types';
import type { LaunchKit, RuntimeInterfaceSpec } from '@/lib/baleybot/types';
import { computeReadiness, createInitialReadiness, getVisibleTabs, countCompleted, getRecommendedAction } from '@/lib/baleybot/readiness';
import type { ReadinessDimension, ReadinessState } from '@/lib/baleybot/readiness';
import { getConnectionSummary } from '@/lib/baleybot/tools/requirements-scanner';
import { parseBalCode } from '@/lib/baleybot/bal-parser-pure';
import { detectBalSkills, summarizeBalSkills } from '@/lib/baleybot/bal-skills';
import {
  sanitizeCreatorConversationHistory,
  sanitizeCreatorText,
} from '@/lib/baleybot/creator-sanitization';
import type { DiscoveryIntakeSubmission } from '@/components/creator/DiscoveryIntakeForm';

const ADVANCED_EDITOR_TABS: AdaptiveTab[] = ['code', 'analytics'];
const POST_DESIGN_TABS: AdaptiveTab[] = ['connections', 'test', 'triggers', 'monitor', 'launch'];

function isAdvancedEditorTab(tab: AdaptiveTab): boolean {
  return ADVANCED_EDITOR_TABS.includes(tab);
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

function formatExecutionOutput(output: unknown): string {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatFriendlyRuntimeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value == null) return 'null';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getPrimaryRuntimeResponse(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }

  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const record = output as Record<string, unknown>;
    const preferredKeys = ['message', 'summary', 'result', 'output', 'text', 'content'];

    for (const key of preferredKeys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
  }

  return formatExecutionOutput(output);
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

interface RuntimeConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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

  // Run state
  const [isRunLocked, setIsRunLocked] = useState(false);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  // View mode state (adaptive based on readiness)
  const [viewMode, setViewMode] = useState<AdaptiveTab>('visual');
  const [showAdvancedUI, setShowAdvancedUI] = useState(false);
  const [isDesignConfirmed, setIsDesignConfirmed] = useState(!isNew);

  // Runtime/live interaction state
  const [runtimeInput, setRuntimeInput] = useState('');
  const [runtimeInputMode, setRuntimeInputMode] = useState<'message' | 'structured'>('message');
  const [runtimeOutput, setRuntimeOutput] = useState<string>('');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeDurationMs, setRuntimeDurationMs] = useState<number | null>(null);
  const [showRuntimeRawOutput, setShowRuntimeRawOutput] = useState(false);
  const [showRuntimeDiagnostics, setShowRuntimeDiagnostics] = useState(false);
  const [runtimeConversation, setRuntimeConversation] = useState<RuntimeConversationMessage[]>([]);

  // Mobile view toggle (chat vs editor)
  type MobileView = 'editor' | 'chat';
  const [mobileView, setMobileView] = useState<MobileView>('editor');

  // Trigger config state
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType | undefined>(undefined);

  // Readiness state
  const [readiness, setReadiness] = useState(createInitialReadiness());
  // Seed initial readiness for new sessions so first completion can trigger guidance.
  const prevReadinessRef = useRef<ReadinessState | null>(isNew ? createInitialReadiness() : null);

  // Save conflict state (Phase 5.4)
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  // Real-time creation progress (replaces fake phase cycling)
  const [creationProgress, setCreationProgress] = useState<CreationProgress | null>(null);

  // Ref to track if initial prompt was sent (avoids effect dependency issues)
  const initialPromptSentRef = useRef(false);
  const designGateReminderShownRef = useRef(false);

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
    enabled: viewMode === 'triggers',
  });

  // Fetch workspace connections (for connections panel AND readiness computation)
  const { data: workspaceConnections, isLoading: isLoadingConnections } = trpc.connections.list.useQuery(
    { limit: 50 },
  );

  // Fetch per-bot analytics (for readiness computation and Monitor tab)
  const { data: analyticsData, isLoading: isLoadingAnalytics } = trpc.analytics.getBaleybotAnalytics.useQuery(
    { baleybotId: savedBaleybotId! },
    { enabled: !!savedBaleybotId },
  );

  // Fetch workspace-level overview (for Analytics tab — workspace aggregate view)
  // Use isFetching instead of isLoading to avoid stuck loading state when query transitions from disabled to enabled
  const { data: dashboardOverview, isFetching: isFetchingOverview } = trpc.analytics.getDashboardOverview.useQuery(
    { days: 30 },
    { enabled: viewMode === 'analytics' },
  );
  const isLoadingOverview = isFetchingOverview && !dashboardOverview;

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

  const {
    data: runtimeInterfaceData,
    isFetching: isFetchingRuntimeInterface,
  } = trpc.baleybots.getRuntimeInterface.useQuery(
    { baleybotId: savedBaleybotId! },
    {
      enabled:
        !!savedBaleybotId &&
        (viewMode === 'runtime' || existingBaleybot?.lifecycleStage === 'live' || existingBaleybot?.lifecycleStage === 'paused'),
    },
  );

  useEffect(() => {
    const runtimeMode =
      (runtimeInterfaceData as RuntimeInterfaceSpec | null | undefined)?.mode ??
      ((existingBaleybot?.runtimeInterfaceSpec as RuntimeInterfaceSpec | null | undefined)?.mode);
    if (runtimeMode === 'form' && runtimeInputMode !== 'structured') {
      setRuntimeInputMode('structured');
      return;
    }
    if (runtimeMode === 'chat' && runtimeInputMode !== 'message') {
      setRuntimeInputMode('message');
    }
  }, [runtimeInterfaceData, existingBaleybot?.runtimeInterfaceSpec, runtimeInputMode]);

  // Load trigger config when query completes
  useEffect(() => {
    if (savedTriggerConfig && !triggerConfig) {
      setTriggerConfig(savedTriggerConfig as unknown as TriggerConfigType);
    }
  }, [savedTriggerConfig, triggerConfig]);

  // Mutations
  const creatorMutation = trpc.baleybots.sendCreatorMessage.useMutation();
  const saveMutation = trpc.baleybots.saveFromSession.useMutation();
  const executeMutation = trpc.baleybots.execute.useMutation();
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
    isGeneratingTests,
    isRunningAll,
    isSelfHealing,
    runAllProgress,
    lastRunSummary,
    handleGenerateTests,
    handleRunTest,
    handleRunAllTests,
    handleRunAllWithSelfHealing,
    handleAddTest,
    handleUpdateTest,
    handleDeleteTest,
    handleAcceptActual,
  } = useTestExecution({
    savedBaleybotId,
    balCode,
    botName: name,
    entities,
    workspaceConnections: normalizedConnections,
    onInjectMessage: injectMessage,
    onNavigateToTab: navigateToTab,
  });

  // =====================================================================
  // HANDLERS
  // =====================================================================

  /**
   * Handle sending a message to the Creator Bot
   */
  const handleSendMessage = async (message: string | DiscoveryIntakeSubmission) => {
    const normalizedInput = typeof message === 'string'
      ? {
          modelMessage: message,
          displayMessage: message,
          discoverySummary: undefined,
        }
      : {
          modelMessage: message.modelMessage,
          displayMessage: message.displayMessage,
          discoverySummary: message.summary,
        };

    const sanitizedMessage = sanitizeCreatorText(normalizedInput.modelMessage);
    const sanitizedDisplayMessage = sanitizeCreatorText(normalizedInput.displayMessage);

    // 0. Capture previous state for change summary (Phase 3.2)
    const prevEntities = [...entities];
    const prevConnections = [...connections];
    const prevName = name;

    // 1. Add user message to messages
    const userMessage: CreatorMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: sanitizedDisplayMessage,
      timestamp: new Date(),
      ...(normalizedInput.discoverySummary
        ? {
            metadata: {
              discoveryIntake: normalizedInput.discoverySummary,
            },
          }
        : {}),
    };
    setMessages((prev) => [...prev, userMessage]);
    const nextConversationHistory = buildCreatorHistoryPayload([...messages, userMessage]);

    // 2. Set status to 'building'
    setStatus('building');
    setCreationProgress({ phase: 'understanding', message: 'Understanding your request...' });

    try {
      // 4. Call sendCreatorMessage mutation
      const result = await creatorMutation.mutateAsync({
        baleybotId: savedBaleybotId ?? undefined,
        message: sanitizedMessage,
        conversationHistory: nextConversationHistory,
      });

      if (result.status === 'building') {
        const requiredQuestions = (result.questions ?? []).filter(
          (question) => question.requiredNow !== false
        );
        const optionalQuestions = (result.questions ?? []).filter(
          (question) => question.requiredNow === false
        );
        const previousDiscoveryIteration = [...messages]
          .reverse()
          .find(
            (msg) =>
              msg.role === 'assistant' &&
              msg.metadata?.creatorLifecycle?.stage === 'discovery'
          )?.metadata?.creatorLifecycle?.iteration ?? 0;
        const discoveryIteration = previousDiscoveryIteration + 1;

        const fallbackLines: string[] = [];
        if (requiredQuestions.length > 0) {
          fallbackLines.push('To continue right now, please answer:', '');
          for (const question of requiredQuestions) {
            fallbackLines.push(`- **${question.label}**: ${question.description}`);
          }
        }
        if (optionalQuestions.length > 0) {
          fallbackLines.push(
            '',
            'Optional for now (can be configured later):',
            ''
          );
          for (const question of optionalQuestions) {
            fallbackLines.push(`- **${question.label}**: ${question.description}`);
          }
        }

        const baseMessage = result.message?.trim() || result.thinking?.trim();
        const responseContent = baseMessage
          ? baseMessage
          : fallbackLines.length > 0
            ? fallbackLines.join('\n').trim()
            : 'I need a bit more detail before generating BAL.';

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
            diagnostic: {
              level: 'info',
              title: requiredQuestions.length > 0 ? 'Additional Discovery Needed' : 'Optional Configuration Details',
              details: requiredQuestions.length > 0
                ? 'Fill any fields you can in the Discovery Intake form below, then submit. Unfilled fields can be left blank.'
                : 'I can continue now. Use the Discovery Intake form below for any optional details you want to add.',
              suggestions: (result.questions ?? []).map((question) =>
                `${question.requiredNow === false ? '[Later]' : '[Required]'} ${question.label}: ${question.description}`
              ),
            },
            creatorLifecycle: {
              stage: 'discovery',
              iteration: discoveryIteration,
              whatIDid:
                discoveryIteration > 1
                  ? 'Re-evaluated your latest response and checked which required details are still missing.'
                  : 'Reviewed your request and identified the minimum details needed for a runnable first version.',
              nextStage: 'Design Generation',
              nextAction:
                requiredQuestions.length > 0
                  ? 'Answer the required questions so generation can continue.'
                  : 'Generation can proceed now; optional details can be handled later.',
              requiredQuestions: requiredQuestions.map((q) => ({
                id: q.id,
                label: q.label,
                description: q.description,
                requiredNow: true,
              })),
              optionalQuestions: optionalQuestions.map((q) => ({
                id: q.id,
                label: q.label,
                description: q.description,
                requiredNow: false,
              })),
            },
          },
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStatus('ready');
        setCreationProgress(null);
        return;
      }

      setCreationProgress({ phase: 'designing', message: `Designed ${result.entities.length} entit${result.entities.length === 1 ? 'y' : 'ies'}` });

      // 5. Transform result entities to VisualEntity[] (with appearing animation)
      const visualEntities: VisualEntity[] = result.entities.map((entity) => ({
        ...entity,
        position: { x: 0, y: 0 }, // Canvas will position them
        status: 'appearing' as const,
      }));

      // 6. Transform result connections to Connection[] (add id, status: 'stable')
      const visualConnections: Connection[] = result.connections.map((conn, index) => ({
        id: `conn-${index}`,
        from: conn.from,
        to: conn.to,
        label: conn.label,
        status: 'stable' as const,
      }));
      const detectedBalSkills = detectBalSkills(result.balCode);
      const balSkillSummary = summarizeBalSkills(detectedBalSkills);

      if (visualConnections.length > 0) {
        setCreationProgress({ phase: 'connecting', message: `Connected ${visualConnections.length} workflow${visualConnections.length === 1 ? '' : 's'}` });
      }
      setCreationProgress({ phase: 'generating', message: 'Generating BAL code...' });

      // 7. Update all state (with name truncation - Phase 5.1)
      setEntities(visualEntities);

      // Transition entities from 'appearing' to 'stable' after animation
      setTimeout(() => {
        setEntities(prev => prev.map(e => ({ ...e, status: 'stable' as const })));
      }, 600);
      setConnections(visualConnections);
      setBalCode(result.balCode);
      setName(truncateName(result.name));
      setIcon(result.icon);
      if (result.description) {
        setDescription(result.description);
      }

      // 7.5 Push to undo history (Phase 3.5)
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

      // 8. Generate change summary and add assistant message (Phase 3.2)
      const changeSummary = generateChangeSummary(
        prevEntities,
        visualEntities,
        prevConnections,
        visualConnections,
        prevName,
        result.name
      );
      const summaryText = formatChangeSummaryForChat(changeSummary);

      // Build a concise summary — thinking goes in the expandable section, not in content
      const isInitialCreation = prevEntities.length === 0;
      const modelNarrative = result.message?.trim();
      let responseContent = '';
      if (modelNarrative) {
        responseContent = modelNarrative;
      } else if (isInitialCreation) {
        const totalTools = visualEntities.reduce((sum, e) => sum + e.tools.length, 0);
        responseContent = `I've created **${result.name}** with ${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'}`;
        if (totalTools > 0) {
          responseContent += ` and ${totalTools} ${totalTools === 1 ? 'tool' : 'tools'}`;
        }
        responseContent += '.';
      } else {
        responseContent = summaryText || `Updated **${result.name}**.`;
      }

      // Build entity metadata for rich rendering
      const prevEntityIds = new Set(prevEntities.map(e => e.id));
      const entityMetadata = visualEntities.map(e => ({
        id: e.id,
        name: e.name,
        icon: e.icon,
        tools: e.tools,
        isNew: !prevEntityIds.has(e.id),
      }));

      // Build rich metadata for the assistant message
      const metadata: CreatorMessage['metadata'] = {
        entities: entityMetadata,
        isInitialCreation,
        balSkills: detectedBalSkills,
      };
      const wsConns = workspaceConnections ?? [];

      // Add connection status if bot uses tools requiring connections
      const toolSummary = getConnectionSummary(visualEntities.flatMap(e => e.tools));
      if (toolSummary.required.length > 0) {
        metadata.connectionStatus = {
          connections: [
            {
              name: 'AI Provider',
              type: 'ai',
              status: wsConns.some(c => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected')
                ? 'connected' : 'missing',
            },
            ...toolSummary.required.map(req => ({
              name: req.connectionType,
              type: req.connectionType,
              status: wsConns.some(c => c.type === req.connectionType && c.status === 'connected')
                ? 'connected' as const : 'missing' as const,
              requiredBy: req.tools,
            })),
          ],
        };
      }

      const hasAiProviderConnected = wsConns.some(
        (c) =>
          ['openai', 'anthropic', 'ollama'].includes(c.type) &&
          c.status === 'connected'
      );
      const missingRequiredConnectionTypes = toolSummary.required
        .filter((req) => !wsConns.some((c) => c.type === req.connectionType && c.status === 'connected'))
        .map((req) => req.connectionType);
      const needsConnectionStage = !hasAiProviderConnected || missingRequiredConnectionTypes.length > 0;
      const nextLifecycleAction = isInitialCreation
        ? 'Review the visual design and confirm it before moving into setup.'
        : needsConnectionStage
          ? missingRequiredConnectionTypes.length > 0
            ? `Connect required services (${[...new Set(missingRequiredConnectionTypes)].join(', ')}) and verify tools.`
            : 'Connect an AI provider and verify tool requirements.'
          : 'Run generated tests and confirm expected outputs.';
      const totalEntityTools = visualEntities.reduce((sum, entity) => sum + entity.tools.length, 0);
      metadata.creatorLifecycle = {
        stage: 'design',
        whatIDid: `Designed ${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'}, mapped ${totalEntityTools} ${totalEntityTools === 1 ? 'tool' : 'tools'}, generated BAL code, and applied ${balSkillSummary}.`,
        nextStage: isInitialCreation
          ? 'Visual Review'
          : needsConnectionStage
            ? 'Connections'
            : 'Testing',
        nextAction: nextLifecycleAction,
      };

      // Add diagnostic and interactive next-step options for initial creation
      if (isInitialCreation) {
        metadata.diagnostic = {
          level: 'success',
          title: 'Bot Created',
          details: `${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'} designed and ready.`,
          suggestions: [],
        };

        const nextSteps: Array<{ id: string; label: string; description: string; icon: string }> = [];

        nextSteps.push({
          id: 'review-design',
          label: 'Review Design',
          description: 'Inspect the visual layout and key tools',
          icon: '👁️',
        });

        nextSteps.push({
          id: 'confirm-design',
          label: 'Confirm Design',
          description: 'Lock this design and continue to guided setup',
          icon: '✅',
        });

        metadata.options = nextSteps;
      }

      // Show BAL code inline in chat for initial creation
      if (isInitialCreation && result.balCode) {
        metadata.codeBlock = {
          language: 'bal',
          code: result.balCode.length > 500 ? result.balCode.slice(0, 500) + '\n// ... (click Code tab for full code)' : result.balCode,
          filename: `${result.name ?? 'baleybot'}.bal`,
        };
      }

      const assistantMessage: CreatorMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: responseContent.trim(),
        timestamp: new Date(),
        thinking: result.thinking || undefined,
        metadata,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // 9. Set status to 'ready'
      setStatus('ready');
      if (isInitialCreation) {
        setIsDesignConfirmed(false);
        designGateReminderShownRef.current = false;
      }
      setCreationProgress({ phase: 'complete', message: 'Ready!' });
      setTimeout(() => setCreationProgress(null), 1000);
    } catch (error) {
      console.error('Creator message failed:', error);
      setStatus('error');
      setCreationProgress(null);

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

  /**
   * Handle running the BaleyBot with execution lock (Phase 1.6)
   */
  const handleRun = async (input: string) => {
    // Prevent concurrent runs
    if (isRunLocked) return;
    setIsRunLocked(true);

    let baleybotIdToRun = savedBaleybotId;

    try {
      // 1. Auto-save if not saved yet
      if (!baleybotIdToRun) {
        const newId = await handleSave();
        if (!newId) return;
        baleybotIdToRun = newId;
      }

      // 2. Set status to 'running'
      setStatus('running');

      // 3. Execute the bot
      await executeMutation.mutateAsync({
        id: baleybotIdToRun!,
        input: input || undefined,
        triggeredBy: 'manual',
      });

      // 4. Set status to 'ready'
      setStatus('ready');
    } catch (error) {
      console.error('Execution failed:', error);
      setStatus('error');
    } finally {
      setIsRunLocked(false);
    }
  };

  /**
   * Runtime-mode execution entrypoint (live mini-app usage).
   */
  const handleRuntimeRun = async () => {
    if (isRunLocked) return;
    setIsRunLocked(true);
    setRuntimeError(null);

    let baleybotIdToRun = savedBaleybotId;
    try {
      if (!baleybotIdToRun) {
        const newId = await handleSave();
        if (!newId) return;
        baleybotIdToRun = newId;
      }

      const trimmed = runtimeInput.trim();
      let payload: unknown = trimmed;

      if (runtimeInputMode === 'message') {
        if (!trimmed) {
          setRuntimeError('Please enter a message before running.');
          return;
        }
      } else if (runtimeInputMode === 'structured') {
        if (!trimmed) {
          setRuntimeError('Please provide a JSON payload before running.');
          return;
        }
        const parsed = tryParseJson(trimmed);
        if (parsed == null) {
          setRuntimeError('Structured input must be valid JSON.');
          return;
        }
        payload = parsed;
      }

      if (runtimeInputMode === 'message') {
        setRuntimeConversation((prev) => [
          ...prev,
          {
            id: `runtime-user-${Date.now()}`,
            role: 'user',
            content: trimmed,
            timestamp: new Date(),
          },
        ]);
      }

      const execution = await executeMutation.mutateAsync({
        id: baleybotIdToRun,
        input: payload,
        triggeredBy: 'manual',
      });

      if (execution.status === 'completed') {
        setRuntimeOutput(formatExecutionOutput(execution.output));
        setShowRuntimeRawOutput(false);
        setRuntimeDurationMs(execution.durationMs ?? null);
        if (runtimeInputMode === 'message') {
          setRuntimeConversation((prev) => [
            ...prev,
            {
              id: `runtime-assistant-${Date.now()}`,
              role: 'assistant',
              content: getPrimaryRuntimeResponse(execution.output),
              timestamp: new Date(),
            },
          ]);
          setRuntimeInput('');
        }
      } else {
        setRuntimeError(execution.error ?? 'Execution did not complete successfully.');
      }

      await utils.baleybots.get.invalidate({ id: baleybotIdToRun });
      await utils.analytics.getBaleybotAnalytics.invalidate({ baleybotId: baleybotIdToRun });
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Runtime execution failed');
    } finally {
      setIsRunLocked(false);
    }
  };

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

  const handleApproveLaunchPlan = async () => {
    if (!savedBaleybotId) return;
    try {
      await approveLaunchPlanMutation.mutateAsync({ baleybotId: savedBaleybotId });
      await utils.baleybots.get.invalidate({ id: savedBaleybotId });
      await refetchLaunchReadiness();
    } catch (error) {
      const message: CreatorMessage = {
        id: `msg-${Date.now()}-launch-approve-error`,
        role: 'assistant',
        content: `Launch plan approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      setViewMode('runtime');
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
      const dimensionLabels: Record<ReadinessDimension, string> = {
        designed: 'Design', connected: 'Connections', tested: 'Testing',
        activated: 'Triggers', monitored: 'Monitoring',
      };
      const dims: ReadinessDimension[] = ['designed', 'connected', 'tested', 'activated', 'monitored'];

      for (const dim of dims) {
        if (prev[dim] !== 'complete' && newReadiness[dim] === 'complete') {
          const { completed: c, total: t } = countCompleted(newReadiness);
          const nextAction =
            dim === 'designed' && !isDesignConfirmed
              ? {
                  dimension: 'designed' as const,
                  label: 'Confirm Design',
                  description: 'Review visual layout, then confirm before setup',
                  tabTarget: 'visual' as const,
                  optionId: 'confirm-design',
                }
              : getRecommendedAction(newReadiness);
          const autoAdvanceTargets: Partial<Record<ReadinessDimension, AdaptiveTab>> = {
            connected: 'test',
            tested: 'triggers',
            activated: 'monitor',
          };
          const targetTab = autoAdvanceTargets[dim];
          const canAutoAdvance =
            !!targetTab &&
            getVisibleTabs(newReadiness).includes(targetTab);

          let content = `**${dimensionLabels[dim]}** is complete! (${c}/${t})`;
          if (nextAction) {
            content += ` Next up: ${nextAction.label.toLowerCase()}.`;
            if (canAutoAdvance) {
              content += ` I moved you to the ${nextAction.label.toLowerCase()} step to keep momentum.`;
            }
          } else if (c === t) {
            content += ' Your bot is fully production-ready!';
          }

          const followUpMessage: CreatorMessage = {
            id: `msg-${Date.now()}-readiness-${dim}`,
            role: 'assistant',
            content,
            timestamp: new Date(),
            metadata: nextAction ? {
              options: [{
                id: nextAction.optionId,
                label: nextAction.label,
                description: nextAction.description,
              }],
            } : undefined,
          };
          setMessages(prev => [...prev, followUpMessage]);

          if (canAutoAdvance && targetTab) {
            setViewMode(targetTab);
            setMobileView('editor');
          }
          break; // Only one follow-up per render cycle
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
    const nextVisibleTabs = [...getVisibleTabs(readiness)];
    if (savedBaleybotId && !nextVisibleTabs.includes('launch')) {
      nextVisibleTabs.push('launch');
    }
    if (
      savedBaleybotId &&
      (
        existingBaleybot?.lifecycleStage === 'live' ||
        existingBaleybot?.lifecycleStage === 'paused' ||
        !!existingBaleybot?.runtimeInterfaceSpec
      ) &&
      !nextVisibleTabs.includes('runtime')
    ) {
      nextVisibleTabs.push('runtime');
    }
    const baseVisibleTabs = showAdvancedUI
      ? nextVisibleTabs
      : nextVisibleTabs.filter((tab) => !isAdvancedEditorTab(tab));
    const visibleTabs = isDesignReviewRequired
      ? baseVisibleTabs.filter((tab) => !POST_DESIGN_TABS.includes(tab))
      : baseVisibleTabs;

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
        type: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'db_event' | 'mcp_event';
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
    // Test-specific dynamic option IDs
    const acceptMatch = optionId.match(/^accept-actual-(.+)$/);
    if (acceptMatch) {
      handleAcceptActual(acceptMatch[1]!);
      return;
    }
    const editMatch = optionId.match(/^edit-test-(.+)$/);
    if (editMatch) {
      navigateToTab('test');
      return;
    }
    const retryMatch = optionId.match(/^retry-test-(.+)$/);
    if (retryMatch) {
      handleRunTest(retryMatch[1]!);
      return;
    }
    if (optionId === 'retry-all-tests') {
      handleRunAllWithSelfHealing();
      return;
    }
    if (optionId === 'review-mismatches') {
      navigateToTab('test');
      return;
    }

    if (optionId === 'confirm-design') {
      setIsDesignConfirmed(true);
      designGateReminderShownRef.current = false;
      const postConfirmTarget: AdaptiveTab =
        readiness.connected === 'not-applicable' ? 'test' : 'connections';
      navigateToTab(postConfirmTarget, { bypassDesignGate: true });
      const followUpMessage: CreatorMessage = {
        id: `msg-${Date.now()}-design-confirmed`,
        role: 'assistant',
        content:
          postConfirmTarget === 'connections'
            ? 'Design confirmed. Next, connect runtime and data sources, then verify tools.'
            : 'Design confirmed. Next, run your tests to validate behavior.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, followUpMessage]);
      return;
    }

    // Readiness-guided option cards → navigate to tab + add guide message
    const optionToTab: Record<string, AdaptiveTab> = {
      'review-design': 'visual',
      'setup-connections': 'connections',
      'run-tests': 'test',
      'setup-triggers': 'triggers',
      'enable-monitoring': 'monitor',
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
        'run-tests': 'Click **Auto-generate** to create test cases from your bot\'s configuration, then run them to verify everything works.',
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
        const retryMessage = lastUserMsg.metadata?.discoveryIntake?.modelMessage
          ?? lastUserMsg.content;
        handleSendMessage(retryMessage);
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
        setViewMode('runtime');
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
  const runtimeSpec = (
    runtimeInterfaceData ??
    existingBaleybot?.runtimeInterfaceSpec ??
    null
  ) as RuntimeInterfaceSpec | null;
  const launchReadiness = launchReadinessData?.readiness;
  const parsedRuntimeOutput = runtimeOutput ? tryParseJson(runtimeOutput) : null;
  const runtimeOutputRecord =
    parsedRuntimeOutput && typeof parsedRuntimeOutput === 'object' && !Array.isArray(parsedRuntimeOutput)
      ? (parsedRuntimeOutput as Record<string, unknown>)
      : null;
  const runtimeOutputEntries = runtimeOutputRecord
    ? Object.entries(runtimeOutputRecord).slice(0, 8)
    : [];
  const runtimeOutputHasMoreEntries = runtimeOutputRecord
    ? Object.keys(runtimeOutputRecord).length > runtimeOutputEntries.length
    : false;
  const runtimeMode = runtimeSpec?.mode ?? 'chat';
  const canUseMessageMode = runtimeMode !== 'form';
  const isMessageRuntime = runtimeInputMode === 'message' && canUseMessageMode;
  const launchBusy =
    isFetchingLaunchReadiness ||
    generateLaunchKitMutation.isPending ||
    approveLaunchPlanMutation.isPending ||
    promoteToLiveMutation.isPending ||
    pauseLiveBotMutation.isPending;
  const availableTabs: AdaptiveTab[] = (() => {
    const tabs = [...getVisibleTabs(readiness)];
    if (savedBaleybotId && !tabs.includes('launch')) {
      tabs.push('launch');
    }
    if (
      savedBaleybotId &&
      (
        existingBaleybot?.lifecycleStage === 'live' ||
        existingBaleybot?.lifecycleStage === 'paused' ||
        !!existingBaleybot?.runtimeInterfaceSpec
      ) &&
      !tabs.includes('runtime')
    ) {
      tabs.push('runtime');
    }
    const tabsAfterDesignGate = isDesignReviewRequired
      ? tabs.filter((tab) => !POST_DESIGN_TABS.includes(tab))
      : tabs;
    return showAdvancedUI
      ? tabsAfterDesignGate
      : tabsAfterDesignGate.filter((tab) => !isAdvancedEditorTab(tab));
  })();

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
      <header className="animate-fade-slide-down border-b border-border/50 bg-background/80 backdrop-blur-sm">
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
        {(description || isEditingDescription || status === 'ready') && (
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
                {description ? (
                  <>
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
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic">No description</p>
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
              'w-full md:w-[380px] lg:w-[420px] xl:w-[460px] shrink-0 flex-col border-r border-border/50 bg-background/60',
              mobileView === 'chat' ? 'flex' : 'hidden md:flex'
            )}>
              <LeftPanel
                messages={messages}
                status={status}
                onSendMessage={handleSendMessage}
                isCreatorDisabled={status === 'building' || isSaving}
                executions={!isNew && existingBaleybot?.executions ? existingBaleybot.executions : undefined}
                onExecutionClick={(executionId) => router.push(ROUTES.activity.execution(executionId))}
                onViewAction={(action) => {
                  if (action === 'visual') { navigateToTab('visual', { bypassDesignGate: true }); }
                  else if (action === 'code') {
                    setShowAdvancedUI(true);
                    navigateToTab('code', { bypassDesignGate: true });
                  }
                  else if (action === 'run') { handleRun(''); }
                }}
                onOptionSelect={handleOptionSelect}
                creationProgress={creationProgress}
              />
            </div>

            {/* Right Panel — Editor (desktop: always visible, mobile: toggled) */}
            <div className={cn(
              'flex-1 flex-col min-w-0 overflow-hidden',
              mobileView === 'editor' ? 'flex' : 'hidden md:flex'
            )}>
              {/* Adaptive Tab bar */}
              <div className="flex items-center px-4 py-2 border-b border-border/30">
                <Tabs value={viewMode} onValueChange={(v) => navigateToTab(v as AdaptiveTab)} className="w-auto">
                  <TabsList className="h-9 bg-muted/50">
                    {availableTabs.map((tab) => {
                      const tabConfig: Record<AdaptiveTab, { icon: React.ReactNode; label: string }> = {
                        visual: { icon: <LayoutGrid className="h-3.5 w-3.5" />, label: 'Visual' },
                        code: { icon: <Code2 className="h-3.5 w-3.5" />, label: 'Code' },
                        connections: { icon: <Cable className="h-3.5 w-3.5" />, label: 'Connections' },
                        test: { icon: <FlaskConical className="h-3.5 w-3.5" />, label: 'Test' },
                        triggers: { icon: <Zap className="h-3.5 w-3.5" />, label: 'Triggers' },
                        analytics: { icon: <BarChart3 className="h-3.5 w-3.5" />, label: 'Analytics' },
                        monitor: { icon: <Activity className="h-3.5 w-3.5" />, label: 'Monitor' },
                        launch: { icon: <Rocket className="h-3.5 w-3.5" />, label: 'Launch' },
                        runtime: { icon: <CirclePlay className="h-3.5 w-3.5" />, label: 'Runtime' },
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
                <ReadinessChecklist
                  readiness={readiness}
                  onDotClick={(dim) => {
                    const tabMap: Record<string, AdaptiveTab> = {
                      designed: 'visual',
                      connected: 'connections',
                      tested: 'test',
                      activated: 'triggers',
                      monitored: 'monitor',
                    };
                    navigateToTab(tabMap[dim] ?? 'visual');
                  }}
                  onActionClick={(optionId) => handleOptionSelect(optionId)}
                  className="ml-3"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-2 h-8 text-xs text-muted-foreground"
                  onClick={() => setShowAdvancedUI((prev) => !prev)}
                >
                  {showAdvancedUI ? 'Hide advanced' : 'Show advanced'}
                </Button>
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
                      {isDesignReviewRequired && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Confirm Visual Design</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Review entities, tools, and data-source mappings here first. Once confirmed, guided setup unlocks.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleOptionSelect('confirm-design')}
                            className="shrink-0"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Confirm Design
                          </Button>
                        </div>
                      )}
                      <VisualEditor
                        balCode={balCode}
                        onChange={handleCodeChange}
                        readOnly={status === 'building' || status === 'running'}
                        className="flex-1 min-h-0"
                        hideToolbar
                        toolSuggestions={connectionToolSuggestions}
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

                  {/* Triggers View */}
                  {viewMode === 'triggers' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      <TriggerConfig
                        value={triggerConfig}
                        onChange={setTriggerConfig}
                        baleybotId={savedBaleybotId ?? undefined}
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
                  )}

                  {/* Analytics View — workspace-level overview */}
                  {viewMode === 'analytics' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      {isLoadingOverview ? (
                        <div className="space-y-4">
                          <Skeleton className="h-20 w-full" />
                          <div className="grid grid-cols-3 gap-3">
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                          </div>
                          <Skeleton className="h-28 w-full" />
                        </div>
                      ) : !dashboardOverview || dashboardOverview.totalExecutions === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                          <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-4" />
                          <h3 className="text-lg font-medium mb-2">No workspace activity</h3>
                          <p className="text-sm text-muted-foreground max-w-md">
                            Run some BaleyBots to see aggregate workspace analytics here.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Workspace-level stats */}
                          <div>
                            <h3 className="text-sm font-medium mb-3">Workspace Overview (30 days)</h3>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="rounded-lg border p-3 text-center">
                                <p className="text-xl font-bold">{dashboardOverview.totalExecutions}</p>
                                <p className="text-[10px] text-muted-foreground">Total Runs</p>
                              </div>
                              <div className="rounded-lg border p-3 text-center">
                                <p className="text-xl font-bold">{(dashboardOverview.successRate * 100).toFixed(1)}%</p>
                                <p className="text-[10px] text-muted-foreground">Success Rate</p>
                              </div>
                              <div className="rounded-lg border p-3 text-center">
                                <p className="text-xl font-bold">
                                  {dashboardOverview.avgDurationMs > 1000
                                    ? `${(dashboardOverview.avgDurationMs / 1000).toFixed(1)}s`
                                    : `${dashboardOverview.avgDurationMs}ms`}
                                </p>
                                <p className="text-[10px] text-muted-foreground">Avg Duration</p>
                              </div>
                            </div>
                          </div>

                          {/* Daily trend */}
                          {dashboardOverview.dailyTrend.length > 0 && (
                            <div>
                              <h3 className="text-sm font-medium mb-2">Daily Activity</h3>
                              <div className="flex items-end gap-1 h-20 px-1">
                                {dashboardOverview.dailyTrend.map((day) => {
                                  const maxCount = Math.max(...dashboardOverview.dailyTrend.map(d => d.count));
                                  const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                                  return (
                                    <div key={day.date} className="flex-1 min-w-0">
                                      <div
                                        className="bg-primary hover:bg-primary/80 rounded-t transition-colors w-full"
                                        style={{ height: `${Math.max(height, 4)}%` }}
                                        title={`${day.date}: ${day.count} executions`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex justify-between mt-1 px-1">
                                <span className="text-[10px] text-muted-foreground">{dashboardOverview.dailyTrend[0]?.date}</span>
                                <span className="text-[10px] text-muted-foreground">{dashboardOverview.dailyTrend[dashboardOverview.dailyTrend.length - 1]?.date}</span>
                              </div>
                            </div>
                          )}

                          {/* Top bots */}
                          {dashboardOverview.topBots.length > 0 && (
                            <div>
                              <h3 className="text-sm font-medium mb-2">Most Active Bots</h3>
                              <div className="space-y-1">
                                {dashboardOverview.topBots.map((bot) => (
                                  <div key={bot.baleybotId} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border/50">
                                    {bot.icon && <span className="text-base shrink-0">{bot.icon}</span>}
                                    <span className="truncate flex-1">{bot.name || bot.baleybotId.slice(0, 8)}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">{bot.count} runs</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* This bot's stats (if saved) */}
                          {savedBaleybotId && analyticsData && analyticsData.total > 0 && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                              <h3 className="text-sm font-medium mb-2">This Bot</h3>
                              <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                  <p className="text-lg font-bold">{analyticsData.total}</p>
                                  <p className="text-[10px] text-muted-foreground">Runs</p>
                                </div>
                                <div>
                                  <p className="text-lg font-bold">{(analyticsData.successRate * 100).toFixed(0)}%</p>
                                  <p className="text-[10px] text-muted-foreground">Success</p>
                                </div>
                                <div>
                                  <p className="text-lg font-bold">{analyticsData.totalTokens.toLocaleString()}</p>
                                  <p className="text-[10px] text-muted-foreground">Tokens</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Connections View */}
                  {viewMode === 'connections' && (
                    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
                      <div className="h-full overflow-auto bg-background rounded-lg border p-4">
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
                          onNavigateToTest={() => navigateToTab('test')}
                        />
                      </div>
                      <div className="h-full min-h-0 bg-background rounded-lg border overflow-hidden">
                        <div className="px-4 py-2 border-b border-border/40 bg-muted/20">
                          <p className="text-sm font-medium">Visual Tool and Source Map</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Edit tools and data-source mappings directly on nodes while configuring connections.
                          </p>
                        </div>
                        <div className="h-[calc(100%-3.5rem)] min-h-0">
                          <VisualEditor
                            balCode={balCode}
                            onChange={handleCodeChange}
                            readOnly={status === 'building' || status === 'running'}
                            className="h-full"
                            hideToolbar
                            toolSuggestions={connectionToolSuggestions}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Test View */}
                  {viewMode === 'test' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      <TestPanel
                        testCases={testCases}
                        topology={lastRunSummary?.topology}
                        onRunTest={handleRunTest}
                        onRunAll={handleRunAllTests}
                        onRunAllWithSelfHealing={handleRunAllWithSelfHealing}
                        onAddTest={handleAddTest}
                        onGenerateTests={handleGenerateTests}
                        isGenerating={isGeneratingTests}
                        isRunningAll={isRunningAll}
                        isSelfHealing={isSelfHealing}
                        runAllProgress={runAllProgress}
                        lastRunSummary={lastRunSummary}
                        onUpdateTest={handleUpdateTest}
                        onDeleteTest={handleDeleteTest}
                        onAcceptActual={handleAcceptActual}
                      />
                    </div>
                  )}

                  {/* Launch Prep View */}
                  {viewMode === 'launch' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-medium">Launch Prep</h3>
                          <p className="text-xs text-muted-foreground">
                            Verify readiness, generate launch artifacts, then promote this bot to live runtime mode.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => refetchLaunchReadiness()}
                            disabled={launchBusy}
                          >
                            {launchBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                            Refresh
                          </Button>
                          {!launchKit && (
                            <Button
                              size="sm"
                              onClick={handleGenerateLaunchKit}
                              disabled={
                                !savedBaleybotId ||
                                launchBusy ||
                                (launchReadiness ? !launchReadiness.readyForLaunchPrep : false)
                              }
                            >
                              {generateLaunchKitMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5 mr-1.5" />}
                              Generate Launch Kit
                            </Button>
                          )}
                          {launchKit && lifecycleStage !== 'live' && lifecycleStage !== 'paused' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleApproveLaunchPlan}
                                disabled={!savedBaleybotId || launchBusy}
                              >
                                {approveLaunchPlanMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                onClick={handlePromoteToLive}
                                disabled={!savedBaleybotId || launchBusy}
                              >
                                {promoteToLiveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CirclePlay className="h-3.5 w-3.5 mr-1.5" />}
                                Go Live
                              </Button>
                            </>
                          )}
                          {(lifecycleStage === 'live' || lifecycleStage === 'paused') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handlePauseOrResumeLive}
                              disabled={launchBusy}
                            >
                              {launchBusy ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : lifecycleStage === 'live' ? (
                                <PauseCircle className="h-3.5 w-3.5 mr-1.5" />
                              ) : (
                                <CirclePlay className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              {lifecycleStage === 'live' ? 'Pause Live' : 'Resume Live'}
                            </Button>
                          )}
                          {launchKit && (
                            <Button size="sm" variant="outline" onClick={() => setViewMode('runtime')}>
                              <CirclePlay className="h-3.5 w-3.5 mr-1.5" />
                              Open Runtime
                            </Button>
                          )}
                        </div>
                      </div>

                      {launchReadiness && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">BAL</p>
                            <p className={cn('text-sm font-medium mt-1', launchReadiness.balValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                              {launchReadiness.balValid ? 'Valid' : 'Invalid'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Connections</p>
                            <p className={cn('text-sm font-medium mt-1', launchReadiness.connectionsReady ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')}>
                              {launchReadiness.connectionsReady ? 'Ready' : 'Needs setup'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Test Pass Rate</p>
                            <p className={cn('text-sm font-medium mt-1', launchReadiness.testPassRate >= 0.8 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')}>
                              {Math.round(launchReadiness.testPassRate * 100)}%
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              {launchKit ? 'Launch Confidence' : 'Topology'}
                            </p>
                            <p className="text-sm font-medium mt-1">
                              {launchKit
                                ? `${Math.round(launchKit.confidenceScore * 100)}%`
                                : launchReadiness.topology}
                            </p>
                          </div>
                        </div>
                      )}

                      {launchReadiness?.blockingIssues?.length ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Blocking Issues</p>
                          <ul className="space-y-1">
                            {launchReadiness.blockingIssues.map((issue, idx) => (
                              <li key={`${issue}-${idx}`} className="text-xs text-amber-800/90 dark:text-amber-200/90">
                                {idx + 1}. {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : launchReadiness ? (
                        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-xs text-green-700 dark:text-green-300">
                          Launch readiness checks passed.
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Save this bot and run test coverage to evaluate launch readiness.
                        </div>
                      )}

                      {launchKit ? (
                        <div className="space-y-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-sm font-medium mb-2">Activation Plan</p>
                            <p className="text-xs text-muted-foreground mb-2">
                              Primary: <span className="font-medium text-foreground">{launchKit.activationPlan.recommendedPrimary}</span>
                            </p>
                            <div className="space-y-1.5">
                              {launchKit.activationPlan.channels.map((channel, idx) => (
                                <div key={`${channel.type}-${idx}`} className="text-xs rounded border border-border/50 px-2 py-1.5">
                                  <span className="font-medium">{channel.type}</span>
                                  <span className="text-muted-foreground"> — {channel.rationale}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-lg border p-3">
                              <p className="text-sm font-medium mb-2">Monitoring Plan</p>
                              <ul className="space-y-1">
                                {launchKit.monitoringPlan.metrics.map((metric, idx) => (
                                  <li key={`${metric}-${idx}`} className="text-xs">{idx + 1}. {metric}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="rounded-lg border p-3">
                              <p className="text-sm font-medium mb-2">Go-Live Checklist</p>
                              <ul className="space-y-1">
                                {launchKit.goLiveChecklist.map((item, idx) => (
                                  <li key={`${item}-${idx}`} className="text-xs">{idx + 1}. {item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Generate a Launch Kit after tests and connections are ready.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Runtime View */}
                  {viewMode === 'runtime' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium">Runtime Interface</h3>
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide',
                              lifecycleStage === 'live'
                                ? 'bg-green-500/10 text-green-700 dark:text-green-300'
                                : lifecycleStage === 'paused'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                  : 'bg-muted text-muted-foreground'
                            )}>
                              {lifecycleStage}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Use this bot as a live mini-app. Runtime mode: {runtimeMode}.
                          </p>
                        </div>
                        {(lifecycleStage === 'live' || lifecycleStage === 'paused') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handlePauseOrResumeLive}
                            disabled={pauseLiveBotMutation.isPending || promoteToLiveMutation.isPending}
                          >
                            {pauseLiveBotMutation.isPending || promoteToLiveMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : lifecycleStage === 'live' ? (
                              <PauseCircle className="h-3.5 w-3.5 mr-1.5" />
                            ) : (
                              <CirclePlay className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {lifecycleStage === 'live' ? 'Pause Live' : 'Resume Live'}
                          </Button>
                        )}
                      </div>

                      {isFetchingRuntimeInterface && !runtimeSpec ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                          Loading runtime interface...
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                          <div className="xl:col-span-2 space-y-3">
                            <div className="rounded-xl border p-4 space-y-3 bg-gradient-to-b from-background to-muted/10">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">Interact</p>
                                  <p className="text-xs text-muted-foreground">
                                    Choose a simple message or provide structured data.
                                  </p>
                                </div>
                                <div className="inline-flex items-center rounded-lg border border-border/60 p-0.5 bg-muted/30">
                                  <button
                                    type="button"
                                    onClick={() => setRuntimeInputMode('message')}
                                    disabled={!canUseMessageMode}
                                    className={cn(
                                      'px-2.5 py-1 text-xs rounded-md transition-colors',
                                      runtimeInputMode === 'message' && canUseMessageMode
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground',
                                      !canUseMessageMode && 'opacity-50 cursor-not-allowed hover:text-muted-foreground'
                                    )}
                                  >
                                    Message
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRuntimeInputMode('structured')}
                                    className={cn(
                                      'px-2.5 py-1 text-xs rounded-md transition-colors',
                                      runtimeInputMode === 'structured'
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                    )}
                                  >
                                    Structured
                                  </button>
                                </div>
                              </div>

                              {!canUseMessageMode && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-300 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5">
                                  This bot expects structured input. Message mode is disabled for this runtime.
                                </p>
                              )}

                              <textarea
                                value={runtimeInput}
                                onChange={(e) => setRuntimeInput(e.target.value)}
                                placeholder={
                                  isMessageRuntime
                                    ? 'Type what you want this bot to do...'
                                    : runtimeInputMode === 'structured'
                                    ? '{\n  "event": "new_signup",\n  "email": "new.user@example.com"\n}'
                                    : 'Provide input...'
                                }
                                rows={6}
                                className={cn(
                                  'w-full text-sm bg-background border border-border/50 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20',
                                  !isMessageRuntime && 'font-mono text-xs'
                                )}
                              />

                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={handleRuntimeRun}
                                  disabled={isRunLocked || executeMutation.isPending}
                                >
                                  {isRunLocked || executeMutation.isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                  ) : (
                                    <CirclePlay className="h-3.5 w-3.5 mr-1.5" />
                                  )}
                                  {isMessageRuntime ? 'Send' : 'Run'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRuntimeInput('');
                                    setRuntimeOutput('');
                                    setRuntimeError(null);
                                    setRuntimeDurationMs(null);
                                    setShowRuntimeRawOutput(false);
                                    setRuntimeConversation([]);
                                  }}
                                  disabled={isRunLocked || executeMutation.isPending}
                                >
                                  Clear
                                </Button>
                                {runtimeDurationMs != null && (
                                  <span className="text-xs text-muted-foreground">
                                    Last run: {runtimeDurationMs > 1000 ? `${(runtimeDurationMs / 1000).toFixed(1)}s` : `${runtimeDurationMs}ms`}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="rounded-xl border p-4 space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{isMessageRuntime ? 'Conversation' : 'Latest Result'}</p>
                                {runtimeOutput && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => setShowRuntimeRawOutput((prev) => !prev)}
                                  >
                                    {showRuntimeRawOutput ? 'Hide raw output' : 'Show raw output'}
                                  </Button>
                                )}
                              </div>

                              {runtimeError ? (
                                <div className="text-sm whitespace-pre-wrap bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-300 rounded-lg p-3">
                                  {runtimeError}
                                </div>
                              ) : isMessageRuntime ? (
                                <>
                                  {runtimeConversation.length > 0 ? (
                                    <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                                      {runtimeConversation.map((message) => (
                                        <div
                                          key={message.id}
                                          className={cn(
                                            'max-w-[90%] rounded-lg px-3 py-2 text-sm border',
                                            message.role === 'user'
                                              ? 'ml-auto bg-primary/10 border-primary/20'
                                              : 'mr-auto bg-muted/30 border-border/50'
                                          )}
                                        >
                                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                          <p className="text-[10px] text-muted-foreground mt-1">
                                            {message.timestamp.toLocaleTimeString([], {
                                              hour: 'numeric',
                                              minute: '2-digit',
                                            })}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">
                                      Send a message to start the conversation.
                                    </p>
                                  )}

                                  {showRuntimeRawOutput && runtimeOutput && (
                                    <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded-lg p-3 font-mono overflow-x-auto">
                                      {runtimeOutput}
                                    </pre>
                                  )}
                                </>
                              ) : runtimeOutput ? (
                                <>
                                  {runtimeOutputEntries.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {runtimeOutputEntries.map(([key, value]) => (
                                        <div key={key} className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
                                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                            {key.replace(/_/g, ' ')}
                                          </p>
                                          <p className="text-sm mt-1 break-words">
                                            {formatFriendlyRuntimeValue(value)}
                                          </p>
                                        </div>
                                      ))}
                                      {runtimeOutputHasMoreEntries && (
                                        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-2.5">
                                          <p className="text-xs text-muted-foreground">
                                            Additional fields are available in raw output.
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm whitespace-pre-wrap">
                                      {runtimeOutput}
                                    </div>
                                  )}

                                  {showRuntimeRawOutput && (
                                    <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded-lg p-3 font-mono overflow-x-auto">
                                      {runtimeOutput}
                                    </pre>
                                  )}
                                </>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Run the bot to view output.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="rounded-lg border p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground font-medium">Diagnostics</p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => setShowRuntimeDiagnostics((prev) => !prev)}
                                >
                                  {showRuntimeDiagnostics ? 'Hide' : 'Show'}
                                </Button>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Runtime internals and component-level details for power users.
                              </p>
                              {showRuntimeDiagnostics && (
                                <ul className="space-y-1">
                                  {(runtimeSpec?.components ?? []).map((component) => (
                                    <li key={component.id} className="text-xs rounded bg-muted/40 px-2 py-1">
                                      <span className="font-medium">{component.type}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="rounded-lg border p-3">
                              <p className="text-xs text-muted-foreground font-medium mb-2">Live Metrics</p>
                              {isLoadingAnalytics ? (
                                <div className="space-y-2">
                                  <Skeleton className="h-12 w-full" />
                                  <Skeleton className="h-12 w-full" />
                                </div>
                              ) : analyticsData && analyticsData.total > 0 ? (
                                <div className="space-y-2 text-xs">
                                  <div className="rounded border border-border/50 px-2 py-1.5 flex items-center justify-between">
                                    <span className="text-muted-foreground">Runs</span>
                                    <span className="font-medium">{analyticsData.total}</span>
                                  </div>
                                  <div className="rounded border border-border/50 px-2 py-1.5 flex items-center justify-between">
                                    <span className="text-muted-foreground">Success</span>
                                    <span className="font-medium">{Math.round(analyticsData.successRate * 100)}%</span>
                                  </div>
                                  <div className="rounded border border-border/50 px-2 py-1.5 flex items-center justify-between">
                                    <span className="text-muted-foreground">Avg Duration</span>
                                    <span className="font-medium">
                                      {analyticsData.avgDurationMs > 1000
                                        ? `${(analyticsData.avgDurationMs / 1000).toFixed(1)}s`
                                        : `${analyticsData.avgDurationMs}ms`}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  No runtime metrics yet.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Monitor View */}
                  {viewMode === 'monitor' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      {!savedBaleybotId ? (
                        <p className="text-muted-foreground text-sm">Save this BaleyBot first to see monitoring.</p>
                      ) : (
                        <MonitorPanel
                          analyticsData={analyticsData ?? null}
                          isLoading={isLoadingAnalytics}
                          hasTrigger={!!triggerConfig}
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
