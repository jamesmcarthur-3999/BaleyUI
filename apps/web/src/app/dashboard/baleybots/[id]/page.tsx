'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
import { ChatInput, LeftPanel, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, isSaveConflictError, ConnectionsPanel, TestPanel, MonitorPanel, StreamingProgressCard } from '@/components/creator';
import type {
  TestCase,
  StreamingHighlightType,
  StreamingProgressSnapshot,
  StreamingTool,
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
  CreatorOutput,
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
import { streamPostSSE } from '@/lib/streaming/client-post-sse';

const ADVANCED_EDITOR_TABS: AdaptiveTab[] = ['code', 'analytics'];
const POST_DESIGN_TABS: AdaptiveTab[] = ['connections', 'test', 'triggers', 'monitor', 'launch'];

function isAdvancedEditorTab(tab: AdaptiveTab): boolean {
  return ADVANCED_EDITOR_TABS.includes(tab);
}

function computeAvailableTabs(args: {
  readiness: ReadinessState;
  savedBaleybotId: string | null;
  lifecycleStage?: string;
  hasRuntimeSpec: boolean;
  showAdvancedUI: boolean;
  isDesignReviewRequired: boolean;
}): AdaptiveTab[] {
  const tabs = [...getVisibleTabs(args.readiness)];

  if (args.savedBaleybotId && !tabs.includes('launch')) {
    tabs.push('launch');
  }

  if (
    args.savedBaleybotId &&
    (
      args.lifecycleStage === 'live' ||
      args.lifecycleStage === 'paused' ||
      args.hasRuntimeSpec
    ) &&
    !tabs.includes('runtime')
  ) {
    tabs.push('runtime');
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

type CreatorStreamEvent =
  | {
      type: 'creator_stream_started';
      timestamp?: number;
    }
  | {
      type: 'creator_progress';
      phase?: string;
      message?: string;
      highlightType?: StreamingHighlightType;
      toolName?: string;
      heartbeat?: boolean;
      cycle?: number;
      timestamp?: number;
    }
  | {
      type: 'creator_highlight';
      phase?: string;
      highlight?: string;
      highlightType?: StreamingHighlightType;
      toolName?: string;
      cycle?: number;
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
    };

interface RuntimeExecutionResult {
  status: string;
  output?: unknown;
  error?: string;
  durationMs?: number;
  executionId?: string;
}

type RuntimeStreamEvent = {
  type: string;
  toolName?: string;
  content?: string;
  error?: unknown;
  status?: string;
  output?: unknown;
  durationMs?: number;
  executionId?: string;
};

function getStreamEventErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = record.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return 'Streaming request failed.';
}

function normalizeHighlightType(value: string | undefined): StreamingHighlightType {
  if (value === 'thinking' || value === 'tool' || value === 'loop' || value === 'status') {
    return value;
  }
  return 'status';
}

function appendStreamingHighlight(
  highlights: StreamingProgressSnapshot['highlights'],
  entry: Omit<StreamingProgressSnapshot['highlights'][number], 'id'>,
  maxEntries = 5
): StreamingProgressSnapshot['highlights'] {
  const text = entry.text.trim();
  if (!text) return highlights;

  const normalized = text.toLowerCase();
  const existing = highlights.find(
    (item) =>
      item.type === entry.type &&
      item.toolName === entry.toolName &&
      item.text.trim().toLowerCase() === normalized
  );
  if (existing) {
    return highlights;
  }

  const next = [
    ...highlights,
    {
      ...entry,
      id: `${entry.type}-${entry.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    },
  ];
  return next.slice(-maxEntries);
}

function upsertStreamingTool(
  tools: StreamingTool[],
  name: string,
  status: StreamingTool['status']
): StreamingTool[] {
  const normalizedName = name.trim();
  if (!normalizedName) return tools;

  const now = Date.now();
  const existingIndex = tools.findIndex(
    (tool) => tool.name.toLowerCase() === normalizedName.toLowerCase()
  );

  if (existingIndex === -1) {
    return [...tools, { name: normalizedName, status, updatedAt: now }];
  }

  const current = tools[existingIndex];
  if (!current) return tools;

  const next = [...tools];
  next[existingIndex] = {
    ...current,
    status,
    updatedAt: now,
  };
  return next;
}

function inferToolStatusFromMessage(
  message: string,
  fallback: StreamingTool['status'] = 'running'
): StreamingTool['status'] {
  const lower = message.toLowerCase();
  if (lower.includes('failed') || lower.includes('error')) return 'error';
  if (lower.includes('complete') || lower.includes('done') || lower.includes('success')) {
    return 'success';
  }
  if (lower.includes('preparing') || lower.includes('queue')) return 'pending';
  if (lower.includes('running') || lower.includes('execut')) return 'running';
  return fallback;
}

function mapCreatorPhaseToCreationProgress(
  phase: string | undefined
): CreationProgress['phase'] {
  if (!phase) return 'understanding';
  if (phase === 'discovery') return 'understanding';
  if (phase === 'orchestration') return 'designing';
  if (phase === 'generation') return 'generating';
  if (phase === 'recovery') return 'connecting';
  if (phase === 'complete') return 'complete';
  return 'understanding';
}

function buildProgressSummary(
  tools: StreamingTool[],
  highlights: StreamingProgressSnapshot['highlights'],
  fallback: string
): string {
  if (tools.length > 0) {
    const successful = tools.filter((tool) => tool.status === 'success');
    const errored = tools.filter((tool) => tool.status === 'error');

    if (successful.length > 0 && errored.length === 0) {
      return `Completed using ${successful.length} tool${successful.length === 1 ? '' : 's'} (${successful
        .slice(0, 3)
        .map((tool) => tool.name)
        .join(', ')}).`;
    }
    if (errored.length > 0) {
      return `Finished with ${errored.length} tool issue${errored.length === 1 ? '' : 's'} (${errored
        .slice(0, 2)
        .map((tool) => tool.name)
        .join(', ')}).`;
    }
  }

  if (highlights.length > 0) {
    const last = highlights[highlights.length - 1];
    if (last?.text) return last.text;
  }

  return fallback;
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

type CreatorLifecycleSummary = NonNullable<
  NonNullable<CreatorMessage['metadata']>['creatorLifecycle']
>;

interface DiscoveryQuestionSummary {
  id: string;
  label: string;
  description: string;
  requiredNow: boolean;
}

function getLatestCreatorLifecycle(messages: CreatorMessage[]): CreatorLifecycleSummary | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'assistant' && message.metadata?.creatorLifecycle) {
      return message.metadata.creatorLifecycle;
    }
  }
  return null;
}

function getDiscoveryQuestionsFromLifecycle(
  lifecycle: CreatorLifecycleSummary | null
): DiscoveryQuestionSummary[] {
  if (!lifecycle || lifecycle.stage !== 'discovery') return [];

  const questions: DiscoveryQuestionSummary[] = [];
  const seen = new Set<string>();
  const append = (
    entries:
      | Array<{
          id: string;
          label: string;
          description: string;
          requiredNow?: boolean;
        }>
      | undefined,
    requiredNowFallback: boolean
  ) => {
    if (!entries) return;
    for (const entry of entries) {
      const key = `${entry.id}::${entry.label}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push({
        id: entry.id,
        label: entry.label,
        description: entry.description,
        requiredNow: entry.requiredNow ?? requiredNowFallback,
      });
    }
  };

  append(lifecycle.requiredQuestions, true);
  append(lifecycle.optionalQuestions, false);
  return questions;
}

function getLatestDiscoveryAssistantMessage(
  messages: CreatorMessage[]
): CreatorMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== 'assistant') continue;
    if (message.metadata?.creatorLifecycle?.stage === 'discovery') {
      return message;
    }
  }
  return null;
}

function normalizeDiscoveryLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function compactDiscoveryText(value: string, max = 110): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}...`;
}

function formatStreamingPhaseLabel(phase: string | undefined): string {
  if (!phase) return 'Working';
  const normalized = phase.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Working';
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
  const [runtimeStreamingProgress, setRuntimeStreamingProgress] =
    useState<StreamingProgressSnapshot | null>(null);
  const [runtimeLastProgressSummary, setRuntimeLastProgressSummary] = useState<string | null>(null);

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
  const [creatorStreamingProgress, setCreatorStreamingProgress] =
    useState<StreamingProgressSnapshot | null>(null);

  // Ref to track if initial prompt was sent (avoids effect dependency issues)
  const initialPromptSentRef = useRef(false);
  const designGateReminderShownRef = useRef(false);
  const latestCreatorLifecycle = useMemo(
    () => getLatestCreatorLifecycle(messages),
    [messages]
  );
  const latestDiscoveryQuestions = useMemo(
    () => getDiscoveryQuestionsFromLifecycle(latestCreatorLifecycle),
    [latestCreatorLifecycle]
  );
  const historicalRequiredDiscoveryMax = useMemo(() => {
    let max = 0;
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const lifecycle = message.metadata?.creatorLifecycle;
      if (!lifecycle || lifecycle.stage !== 'discovery') continue;
      const count = lifecycle.requiredQuestions?.length ?? 0;
      if (count > max) max = count;
    }
    return max;
  }, [messages]);
  const requiredDiscoveryQuestionCount = latestDiscoveryQuestions.filter((question) => question.requiredNow).length;
  const resolvedRequiredDiscoveryQuestionCount = Math.max(
    0,
    historicalRequiredDiscoveryMax - requiredDiscoveryQuestionCount
  );
  const ideationProgress = historicalRequiredDiscoveryMax > 0
    ? resolvedRequiredDiscoveryQuestionCount / historicalRequiredDiscoveryMax
    : requiredDiscoveryQuestionCount === 0
      ? 1
      : 0;
  const nextDiscoveryQuestion =
    latestDiscoveryQuestions.find((question) => question.requiredNow) ??
    latestDiscoveryQuestions.find((question) => !question.requiredNow);
  const isDiscoveryWorkspaceActive =
    isNew &&
    viewMode === 'visual' &&
    entities.length === 0 &&
    !balCode.trim() &&
    messages.length > 0 &&
    (
      latestCreatorLifecycle?.stage === 'discovery' ||
      status === 'building' ||
      requiredDiscoveryQuestionCount > 0
    );
  const leftPanelWidthClass = isDiscoveryWorkspaceActive
    ? 'md:w-1/2 lg:w-1/2 xl:w-1/2'
    : 'md:w-[380px] lg:w-[420px] xl:w-[460px]';
  const ideationPercent = Math.max(0, Math.min(100, Math.round(ideationProgress * 100)));
  const latestDiscoveryAssistantMessage = useMemo(
    () => getLatestDiscoveryAssistantMessage(messages),
    [messages]
  );
  const latestDiscoverySummary = latestDiscoveryAssistantMessage?.metadata?.streamSummary?.trim();
  const unresolvedDiscoveryLabels = useMemo(
    () =>
      latestDiscoveryQuestions
        .filter((question) => question.requiredNow)
        .map((question) => question.label),
    [latestDiscoveryQuestions]
  );
  const resolvedDiscoveryLabels = useMemo(() => {
    const askedRequired = new Map<string, string>();
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const lifecycle = message.metadata?.creatorLifecycle;
      if (!lifecycle || lifecycle.stage !== 'discovery') continue;
      for (const question of lifecycle.requiredQuestions ?? []) {
        const normalized = normalizeDiscoveryLabel(question.label);
        if (!askedRequired.has(normalized)) {
          askedRequired.set(normalized, question.label);
        }
      }
    }

    const unresolved = new Set(unresolvedDiscoveryLabels.map((label) => normalizeDiscoveryLabel(label)));
    return [...askedRequired.entries()]
      .filter(([normalized]) => !unresolved.has(normalized))
      .map(([, label]) => label);
  }, [messages, unresolvedDiscoveryLabels]);
  const discoveryAssumptionNotes = useMemo(
    () =>
      (latestCreatorLifecycle?.assumptions ?? []).map(
        (assumption) => `${assumption.label}: ${compactDiscoveryText(assumption.value, 80)}`
      ),
    [latestCreatorLifecycle]
  );
  const discoveryRecentUserReplies = useMemo(() => {
    return messages
      .filter((message) => message.role === 'user')
      .slice(-3)
      .map((message) => compactDiscoveryText(message.content));
  }, [messages]);
  const discoveryLiveHighlights = useMemo(
    () => creatorStreamingProgress?.highlights.slice(-4).reverse() ?? [],
    [creatorStreamingProgress]
  );
  const discoveryBoardHeading = nextDiscoveryQuestion
    ? `Working through ${nextDiscoveryQuestion.label}`
    : requiredDiscoveryQuestionCount > 0
      ? 'Shaping the first draft'
      : status === 'building'
        ? 'Generating your first draft'
        : 'Discovery complete';
  const discoveryBoardSubheading =
    creatorStreamingProgress?.message ||
    latestCreatorLifecycle?.whatIDid ||
    latestDiscoverySummary ||
    'Share details naturally. The creator will ask only what it still needs.';
  const discoveryContextChips = [
    ...resolvedDiscoveryLabels.map((label) => `Resolved: ${label}`),
    ...discoveryAssumptionNotes.map((item) => `Assumption: ${item}`),
  ].slice(0, 6);

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
  const discoveryCopilotInput = useMemo(
    () => ({
      status,
      messages: messages.slice(-12).map((message) => {
        const metadata: Record<string, unknown> = {};
        if (message.metadata?.creatorLifecycle) {
          metadata.creatorLifecycle = message.metadata.creatorLifecycle;
        }
        if (message.metadata?.streamSummary) {
          metadata.streamSummary = message.metadata.streamSummary;
        }
        return {
          role: message.role,
          content: message.content.slice(0, 900),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };
      }),
    }),
    [messages, status]
  );
  const {
    data: discoveryCopilotData,
    isFetching: isDiscoveryCopilotFetching,
  } = trpc.baleybots.getCreatorSuggestedActions.useQuery(discoveryCopilotInput, {
    enabled: isDiscoveryWorkspaceActive && messages.length > 0 && status !== 'running',
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const discoveryCopilotActions = (discoveryCopilotData?.actions ?? []).slice(0, 3);

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

  const startCreatorStream = async (args: {
    message: string;
    conversationHistory: ReturnType<typeof buildCreatorHistoryPayload>;
  }): Promise<{ result: CreatorOutput; summary?: string }> => {
    const startedAt = Date.now();
    let finalResult: CreatorOutput | null = null;
    let finalSummary: string | undefined;
    let latestTools: StreamingTool[] = [];
    let latestHighlights: StreamingProgressSnapshot['highlights'] = [];

    setCreatorStreamingProgress({
      phase: 'discovery',
      message: 'Starting creator workflow...',
      highlights: [],
      tools: [],
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

        if (event.type === 'creator_progress') {
          const phase = event.phase ?? 'orchestration';
          const progressMessage = event.message?.trim() || 'Continuing creator workflow...';
          setCreationProgress({
            phase: mapCreatorPhaseToCreationProgress(phase),
            message: progressMessage,
          });

          setCreatorStreamingProgress((previous) => {
            const base: StreamingProgressSnapshot =
              previous ?? {
                phase,
                message: progressMessage,
                highlights: [],
                tools: [],
                startedAt,
              };

            let nextTools = base.tools;
            if (event.toolName) {
              nextTools = upsertStreamingTool(
                nextTools,
                event.toolName,
                inferToolStatusFromMessage(progressMessage)
              );
            }

            const next: StreamingProgressSnapshot = {
              ...base,
              phase,
              message: progressMessage,
              tools: nextTools,
            };
            latestTools = next.tools;
            latestHighlights = next.highlights;
            return next;
          });
          return;
        }

        if (event.type === 'creator_highlight') {
          const text = event.highlight?.trim();
          if (!text) return;
          const phase = event.phase ?? 'orchestration';
          const highlightType = normalizeHighlightType(event.highlightType);
          const timestamp = event.timestamp ?? Date.now();

          setCreatorStreamingProgress((previous) => {
            const base: StreamingProgressSnapshot =
              previous ?? {
                phase,
                message: 'Working...',
                highlights: [],
                tools: [],
                startedAt,
              };

            const nextTools = event.toolName
              ? upsertStreamingTool(
                  base.tools,
                  event.toolName,
                  highlightType === 'tool' ? 'running' : 'pending'
                )
              : base.tools;

            const nextHighlights = appendStreamingHighlight(base.highlights, {
              text,
              type: highlightType,
              toolName: event.toolName,
              timestamp,
            });

            const next: StreamingProgressSnapshot = {
              ...base,
              phase,
              highlights: nextHighlights,
              tools: nextTools,
            };
            latestTools = next.tools;
            latestHighlights = next.highlights;
            return next;
          });
          return;
        }

        if (event.type === 'creator_complete') {
          if (event.result) {
            finalResult = event.result;
          }
          finalSummary =
            event.summary?.trim() ||
            buildProgressSummary(
              latestTools,
              latestHighlights,
              'Creator completed the response.'
            );
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
      },
    });

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
      const discoveryAssumptions = result.assumptions ?? [];
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
      const previousDiscoveryIteration = [...messages]
        .reverse()
        .find(
          (msg) =>
            msg.role === 'assistant' &&
            msg.metadata?.creatorLifecycle?.stage === 'discovery'
        )?.metadata?.creatorLifecycle?.iteration ?? 0;
      const discoveryIteration = previousDiscoveryIteration + 1;
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
            iteration: discoveryIteration,
            blockerMode: lifecycleBlockMode,
            runnableConfidence,
            assumptions: discoveryAssumptions.map((assumption) => ({
              id: assumption.id,
              label: assumption.label,
              value: assumption.value,
              confidence: assumption.confidence ?? 'medium',
              requiresConfirmation: assumption.requiresConfirmation,
            })),
            whatIDid:
              discoveryIteration > 1
                ? lifecycleBlockMode === 'soft'
                  ? 'Re-evaluated your latest response, resolved hard blockers, and prepared safe defaults for remaining setup details.'
                  : 'Re-evaluated your latest response and checked which required details are still missing.'
                : 'Reviewed your request and identified the minimum details needed for a runnable first version.',
            nextStage: 'Design Generation',
            nextAction:
              requiredQuestions.length > 0
                ? 'Answer this question so generation can continue.'
                : lifecycleBlockMode === 'soft'
                  ? 'Generation can proceed now. Review assumptions in Connections after build output.'
                  : 'Generation can proceed now.',
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
    const detectedBalSkills = detectBalSkills(result.balCode);
    const balSkillSummary = summarizeBalSkills(detectedBalSkills);

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
      balSkills: detectedBalSkills,
      streamSummary,
    };
    const wsConns = workspaceConnections ?? [];

    const toolSummary = getConnectionSummary(visualEntities.flatMap((entity) => entity.tools));
    if (toolSummary.required.length > 0) {
      metadata.connectionStatus = {
        connections: [
          {
            name: 'AI Provider',
            type: 'ai',
            status: wsConns.some((conn) => ['openai', 'anthropic', 'ollama'].includes(conn.type) && conn.status === 'connected')
              ? 'connected' : 'missing',
          },
          ...toolSummary.required.map((req) => ({
            name: req.connectionType,
            type: req.connectionType,
            status: wsConns.some((conn) => conn.type === req.connectionType && conn.status === 'connected')
              ? 'connected' as const : 'missing' as const,
            requiredBy: req.tools,
          })),
        ],
      };
    }

    const hasAiProviderConnected = wsConns.some(
      (connection) =>
        ['openai', 'anthropic', 'ollama'].includes(connection.type) &&
        connection.status === 'connected'
    );
    const missingRequiredConnectionTypes = toolSummary.required
      .filter((req) => !wsConns.some((connection) => connection.type === req.connectionType && connection.status === 'connected'))
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
      blockerMode: result.blockMode ?? 'none',
      runnableConfidence:
        typeof result.runnableConfidence === 'number'
          ? Math.max(0, Math.min(1, result.runnableConfidence))
          : undefined,
      assumptions: (result.assumptions ?? []).map((assumption) => ({
        id: assumption.id,
        label: assumption.label,
        value: assumption.value,
        confidence: assumption.confidence ?? 'medium',
        requiresConfirmation: assumption.requiresConfirmation,
      })),
      whatIDid: `Designed ${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'}, mapped ${totalEntityTools} ${totalEntityTools === 1 ? 'tool' : 'tools'}, generated BAL code, and applied ${balSkillSummary}.`,
      nextStage: isInitialCreation
        ? 'Visual Review'
        : needsConnectionStage
          ? 'Connections'
          : 'Testing',
      nextAction: nextLifecycleAction,
    };

    if (isInitialCreation) {
      metadata.diagnostic = {
        level: 'success',
        title: 'Bot Created',
        details: `${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'} designed and ready.`,
        suggestions: [],
      };

      metadata.options = [
        {
          id: 'review-design',
          label: 'Review Design',
          description: 'Inspect the visual layout and key tools',
          icon: '👁️',
        },
        {
          id: 'confirm-design',
          label: 'Confirm Design',
          description: 'Lock this design and continue to guided setup',
          icon: '✅',
        },
      ];
    }

    if (isInitialCreation && result.balCode) {
      metadata.codeBlock = {
        language: 'bal',
        code:
          result.balCode.length > 500
            ? `${result.balCode.slice(0, 500)}\n// ... (click Code tab for full code)`
            : result.balCode,
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
      let streamResult: { result: CreatorOutput; summary?: string } | null = null;
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

  const startRuntimeStream = async (
    baleybotIdToRun: string,
    payload: unknown
  ): Promise<RuntimeExecutionResult & { summary?: string }> => {
    const startedAt = Date.now();
    const finalResultRef: { current: RuntimeExecutionResult | null } = { current: null };
    let latestTools: StreamingTool[] = [];
    let latestHighlights: StreamingProgressSnapshot['highlights'] = [];

    setRuntimeStreamingProgress({
      phase: 'execution',
      message: 'Running your bot...',
      highlights: [],
      tools: [],
      startedAt,
    });

    await streamPostSSE<RuntimeStreamEvent>({
      url: `/api/baleybots/${baleybotIdToRun}/execute-stream`,
      body: {
        input: payload,
        triggeredBy: 'manual',
      },
      onEvent: (event) => {
        const now = Date.now();
        const type = event.type;

        if (type === 'execution_started') {
          setRuntimeStreamingProgress((previous) =>
            previous
              ? {
                  ...previous,
                  phase: 'execution',
                  message: 'Execution started...',
                }
              : previous
          );
          return;
        }

        if (type === 'reasoning' && typeof event.content === 'string' && event.content.trim()) {
          const reasoningContent = event.content;
          setRuntimeStreamingProgress((previous) => {
            const base =
              previous ??
              ({
                phase: 'thinking',
                message: 'Thinking...',
                highlights: [],
                tools: [],
                startedAt,
              } satisfies StreamingProgressSnapshot);
            const nextHighlights = appendStreamingHighlight(base.highlights, {
              text: reasoningContent,
              type: 'thinking',
              timestamp: now,
            });
            const next: StreamingProgressSnapshot = {
              ...base,
              phase: 'thinking',
              message: 'Planning response...',
              highlights: nextHighlights,
            };
            latestTools = next.tools;
            latestHighlights = next.highlights;
            return next;
          });
          return;
        }

        if (type === 'tool_call_stream_start' && event.toolName) {
          const toolName = event.toolName;
          setRuntimeStreamingProgress((previous) => {
            const base =
              previous ??
              ({
                phase: 'tools',
                message: `Preparing ${toolName}`,
                highlights: [],
                tools: [],
                startedAt,
              } satisfies StreamingProgressSnapshot);
            const nextTools = upsertStreamingTool(base.tools, toolName, 'pending');
            const nextHighlights = appendStreamingHighlight(base.highlights, {
              text: `Preparing ${toolName}`,
              type: 'tool',
              toolName,
              timestamp: now,
            });
            const next: StreamingProgressSnapshot = {
              ...base,
              phase: 'tools',
              message: `Preparing ${toolName}`,
              tools: nextTools,
              highlights: nextHighlights,
            };
            latestTools = next.tools;
            latestHighlights = next.highlights;
            return next;
          });
          return;
        }

        if (type === 'tool_execution_start' && event.toolName) {
          const toolName = event.toolName;
          setRuntimeStreamingProgress((previous) => {
            const base =
              previous ??
              ({
                phase: 'tools',
                message: `Running ${toolName}`,
                highlights: [],
                tools: [],
                startedAt,
              } satisfies StreamingProgressSnapshot);
            const nextTools = upsertStreamingTool(base.tools, toolName, 'running');
            const nextHighlights = appendStreamingHighlight(base.highlights, {
              text: `Running ${toolName}`,
              type: 'tool',
              toolName,
              timestamp: now,
            });
            const next: StreamingProgressSnapshot = {
              ...base,
              phase: 'tools',
              message: `Running ${toolName}`,
              tools: nextTools,
              highlights: nextHighlights,
            };
            latestTools = next.tools;
            latestHighlights = next.highlights;
            return next;
          });
          return;
        }

        if (type === 'tool_execution_output' && event.toolName) {
          const toolName = event.toolName;
          const errorMessage = getStreamEventErrorMessage(event.error);
          const isError =
            typeof event.error === 'string'
              ? event.error.trim().length > 0
              : Boolean(event.error);
          setRuntimeStreamingProgress((previous) => {
            const base =
              previous ??
              ({
                phase: 'tools',
                message: isError
                  ? `${toolName} failed`
                  : `${toolName} complete`,
                highlights: [],
                tools: [],
                startedAt,
              } satisfies StreamingProgressSnapshot);
            const nextTools = upsertStreamingTool(
              base.tools,
              toolName,
              isError ? 'error' : 'success'
            );
            const nextHighlights = appendStreamingHighlight(base.highlights, {
              text: isError ? errorMessage : `Completed ${toolName}`,
              type: 'tool',
              toolName,
              timestamp: now,
            });
            const next: StreamingProgressSnapshot = {
              ...base,
              phase: 'tools',
              message: isError
                ? `${toolName} failed`
                : `${toolName} complete`,
              tools: nextTools,
              highlights: nextHighlights,
            };
            latestTools = next.tools;
            latestHighlights = next.highlights;
            return next;
          });
          return;
        }

        if (type.includes('loop')) {
          setRuntimeStreamingProgress((previous) => {
            const base =
              previous ??
              ({
                phase: 'loop',
                message: 'Running loop cycle...',
                highlights: [],
                tools: [],
                startedAt,
              } satisfies StreamingProgressSnapshot);
            const nextHighlights = appendStreamingHighlight(base.highlights, {
              text: `Loop update: ${type.replace(/_/g, ' ')}`,
              type: 'loop',
              timestamp: now,
            });
            const next: StreamingProgressSnapshot = {
              ...base,
              phase: 'loop',
              message: 'Running loop cycle...',
              highlights: nextHighlights,
            };
            latestTools = next.tools;
            latestHighlights = next.highlights;
            return next;
          });
          return;
        }

        if (type === 'error') {
          const errorMessage = getStreamEventErrorMessage(event.error);
          setRuntimeStreamingProgress((previous) => {
            const base =
              previous ??
              ({
                phase: 'error',
                message: 'Execution hit an error',
                highlights: [],
                tools: [],
                startedAt,
              } satisfies StreamingProgressSnapshot);
            const nextHighlights = appendStreamingHighlight(base.highlights, {
              text: errorMessage,
              type: 'status',
              timestamp: now,
            });
            const next: StreamingProgressSnapshot = {
              ...base,
              phase: 'error',
              message: 'Execution hit an error',
              highlights: nextHighlights,
            };
            latestTools = next.tools;
            latestHighlights = next.highlights;
            return next;
          });
          return;
        }

        if (type === 'execution_result') {
          finalResultRef.current = {
            status: event.status ?? 'failed',
            output: event.output,
            error:
              typeof event.error === 'string' && event.error.length > 0
                ? event.error
                : undefined,
            durationMs:
              typeof event.durationMs === 'number'
                ? event.durationMs
                : undefined,
            executionId:
              typeof event.executionId === 'string'
                ? event.executionId
                : undefined,
          };
          setRuntimeStreamingProgress((previous) =>
            previous
              ? {
                  ...previous,
                  phase: 'complete',
                  message:
                    finalResultRef.current?.status === 'completed'
                      ? 'Execution complete'
                      : 'Execution finished with issues',
                }
              : previous
          );
        }
      },
    });

    const completedResult = finalResultRef.current;
    if (!completedResult) {
      throw new Error('Runtime stream completed without execution result.');
    }

    return {
      ...completedResult,
      summary: buildProgressSummary(
        latestTools,
        latestHighlights,
        completedResult.status === 'completed'
          ? 'Execution completed successfully.'
          : 'Execution finished with issues.'
      ),
    };
  };

  /**
   * Runtime-mode execution entrypoint (live mini-app usage).
   */
  const handleRuntimeRun = async () => {
    if (isRunLocked) return;
    setIsRunLocked(true);
    setRuntimeError(null);
    setRuntimeLastProgressSummary(null);

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

      let execution: {
        status: string;
        output?: unknown;
        error?: string | null;
        durationMs?: number | null;
        summary?: string;
      };

      try {
        execution = await startRuntimeStream(baleybotIdToRun, payload);
      } catch (streamError) {
        console.warn('Runtime stream failed, falling back to mutation:', streamError);
        setRuntimeStreamingProgress(null);
        execution = await executeMutation.mutateAsync({
          id: baleybotIdToRun,
          input: payload,
          triggeredBy: 'manual',
        });
      }

      if ('summary' in execution && typeof execution.summary === 'string') {
        setRuntimeLastProgressSummary(execution.summary);
      }

      if (execution.status === 'completed' || execution.status === 'success') {
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
      setRuntimeStreamingProgress(null);
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
    const visibleTabs = computeAvailableTabs({
      readiness,
      savedBaleybotId,
      lifecycleStage: existingBaleybot?.lifecycleStage,
      hasRuntimeSpec: Boolean(existingBaleybot?.runtimeInterfaceSpec),
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
  const availableTabs = computeAvailableTabs({
    readiness,
    savedBaleybotId,
    lifecycleStage: existingBaleybot?.lifecycleStage,
    hasRuntimeSpec: Boolean(existingBaleybot?.runtimeInterfaceSpec),
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
                streamingProgress={creatorStreamingProgress}
              />
            </div>

            {/* Right Panel — Editor (desktop: always visible, mobile: toggled) */}
            <div className={cn(
              'flex-1 flex-col min-w-0 overflow-hidden transition-all duration-500 ease-out',
              mobileView === 'editor' ? 'flex' : 'hidden md:flex'
            )}>
              {/* Adaptive Tab bar */}
              <div className="flex items-center px-4 py-2 border-b border-border/30">
                {isDiscoveryWorkspaceActive ? (
                  <div className="flex w-full items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{discoveryBoardHeading}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Details lock in here first, then the visual editor unlocks automatically.
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatStreamingPhaseLabel(
                        creatorStreamingProgress?.phase ??
                        latestCreatorLifecycle?.stage
                      )}
                    </span>
                  </div>
                ) : (
                  <>
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
                    <div className="ml-auto" />
                  </>
                )}
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
                    isDiscoveryWorkspaceActive ? (
                      <div className="h-full overflow-auto">
                        <div className="mx-auto max-w-4xl h-full flex flex-col justify-center py-3">
                          <div className="rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 via-background/95 to-background p-6 space-y-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-wide text-primary font-semibold">
                                  Adaptive Discovery
                                </p>
                                <p className="text-xl font-semibold mt-1">{discoveryBoardHeading}</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {discoveryBoardSubheading}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] text-muted-foreground">
                                  {formatStreamingPhaseLabel(
                                    creatorStreamingProgress?.phase ??
                                    latestCreatorLifecycle?.stage
                                  )}
                                </p>
                                <p className="text-2xl font-semibold leading-none">{ideationPercent}%</p>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  {resolvedRequiredDiscoveryQuestionCount} resolved
                                  {historicalRequiredDiscoveryMax > 0
                                    ? ` / ${historicalRequiredDiscoveryMax} required`
                                    : ''}
                                </p>
                              </div>
                            </div>

                            <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-500"
                                style={{ width: `${Math.max(6, ideationPercent)}%` }}
                              />
                            </div>

                            {status === 'building' && (
                              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <p className="text-xs text-muted-foreground">
                                  {creatorStreamingProgress
                                    ? 'Locking in details and updating the plan...'
                                    : 'Thinking through the next best question...'}
                                </p>
                              </div>
                            )}

                            <div className="grid gap-3 lg:grid-cols-2">
                              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-emerald-300 font-medium">
                                  Locked In
                                </p>
                                {resolvedDiscoveryLabels.length > 0 ? (
                                  <ul className="mt-1.5 space-y-1.5">
                                    {resolvedDiscoveryLabels.slice(0, 4).map((label) => (
                                      <li key={label} className="text-sm text-foreground/90 flex items-center gap-2">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                                        <span>{label}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1.5 text-sm text-muted-foreground">
                                    No locked details yet. The first answer will appear here.
                                  </p>
                                )}
                              </div>

                              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-amber-300 font-medium">
                                  Still Needed
                                </p>
                                {unresolvedDiscoveryLabels.length > 0 ? (
                                  <ul className="mt-1.5 space-y-1.5">
                                    {unresolvedDiscoveryLabels.slice(0, 4).map((label) => (
                                      <li key={label} className="text-sm text-foreground/90">
                                        {label}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1.5 text-sm text-muted-foreground">
                                    Required discovery is complete. Next step is generation.
                                  </p>
                                )}
                              </div>
                            </div>

                            {nextDiscoveryQuestion && (
                              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-primary font-medium">
                                  Current Question
                                </p>
                                <p className="text-lg font-semibold mt-1">
                                  {nextDiscoveryQuestion.label}
                                </p>
                                <p className="text-sm text-foreground/90 mt-1.5">
                                  {nextDiscoveryQuestion.description}
                                </p>
                              </div>
                            )}

                            {(creatorStreamingProgress || latestDiscoverySummary) && (
                              <div className="rounded-xl border border-primary/25 bg-background/60 px-4 py-3 space-y-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                                  Live Planner Feed
                                </p>
                                {discoveryLiveHighlights.length > 0 ? (
                                  <ul className="space-y-1.5">
                                    {discoveryLiveHighlights.map((highlight) => (
                                      <li key={highlight.id} className="text-sm text-foreground/90">
                                        {highlight.text}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    {latestDiscoverySummary ?? 'Waiting for the next planning update...'}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="grid gap-3 lg:grid-cols-2">
                              <div className="rounded-xl border border-border/50 bg-background/60 px-4 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                                  Recent Answers
                                </p>
                                {discoveryRecentUserReplies.length > 0 ? (
                                  <ul className="mt-1.5 space-y-1.5">
                                    {discoveryRecentUserReplies.map((reply, idx) => (
                                      <li key={`${reply}-${idx}`} className="text-sm text-foreground/90">
                                        {reply}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1.5 text-sm text-muted-foreground">
                                    Your responses will appear here as the plan forms.
                                  </p>
                                )}
                              </div>

                              <div className="rounded-xl border border-border/50 bg-background/60 px-4 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                                  Plan Memory
                                </p>
                                {discoveryContextChips.length > 0 ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {discoveryContextChips.map((chip) => (
                                      <span
                                        key={chip}
                                        className="text-[11px] rounded-full border border-border/60 bg-muted/20 px-2 py-0.5 text-muted-foreground"
                                      >
                                        {chip}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-1.5 text-sm text-muted-foreground">
                                    Assumptions and confirmed decisions will be tracked here.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] uppercase tracking-wide text-primary font-medium">
                                  Linked Discovery Copilot
                                </p>
                                {isDiscoveryCopilotFetching && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    analyzing
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                A secondary BB tracks planning state in parallel so guidance keeps moving while the main creator works.
                              </p>
                              {discoveryCopilotActions.length > 0 ? (
                                <ul className="mt-2 space-y-1.5">
                                  {discoveryCopilotActions.map((action, idx) => (
                                    <li key={`${action.label}-${idx}`} className="text-sm text-foreground/90">
                                      {action.label}
                                      {action.reason ? (
                                        <span className="text-xs text-muted-foreground ml-2">
                                          {action.reason}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  Copilot suggestions will appear as soon as enough context is available.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col gap-3">
                        <VisualEditor
                          balCode={balCode}
                          onChange={handleCodeChange}
                          readOnly={status === 'building' || status === 'running'}
                          className="flex-1 min-h-0"
                          hideToolbar
                          toolSuggestions={connectionToolSuggestions}
                        />
                      </div>
                    )
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
                    <div className="h-full min-h-0 flex flex-col gap-3">
                      <div className="shrink-0 rounded-xl border border-border/50 bg-background/80 px-3.5 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Connections</p>
                          <p className="text-[11px] text-muted-foreground">
                            Confirm runtime, data sources, and tool checks before testing.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigateToTab('visual', { bypassDesignGate: true })}
                          className="h-8 text-xs"
                        >
                          View Canvas
                        </Button>
                      </div>
                      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
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
                            <p className="text-sm font-medium">Live tool and source map</p>
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
                    </div>
                  )}

                  {/* Test View */}
                  {viewMode === 'test' && (
                    <div className="h-full min-h-0 flex flex-col gap-3">
                      <div className="shrink-0 rounded-xl border border-border/50 bg-background/80 px-3.5 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Testing</p>
                          <p className="text-[11px] text-muted-foreground">
                            Validate outcomes before activation.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigateToTab('connections', { bypassDesignGate: true })}
                          className="h-8 text-xs"
                        >
                          Review Connections
                        </Button>
                      </div>
                      <div className="flex-1 overflow-auto bg-background rounded-lg border p-4">
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
                                    setRuntimeStreamingProgress(null);
                                    setRuntimeLastProgressSummary(null);
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
                                {runtimeLastProgressSummary && (
                                  <span className="text-xs text-muted-foreground/80">
                                    {runtimeLastProgressSummary}
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

                              {runtimeStreamingProgress &&
                                (!isMessageRuntime || runtimeConversation.length === 0) && (
                                <StreamingProgressCard progress={runtimeStreamingProgress} />
                              )}

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
                                      {runtimeStreamingProgress && (
                                        <div className="mr-auto max-w-[95%]">
                                          <StreamingProgressCard
                                            progress={runtimeStreamingProgress}
                                            className="p-3"
                                            maxHighlights={3}
                                          />
                                        </div>
                                      )}
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
