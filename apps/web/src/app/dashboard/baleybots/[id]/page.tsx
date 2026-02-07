'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
import { ChatInput, LeftPanel, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, isSaveConflictError, ReadinessChecklist, ConnectionsPanel, TestPanel, MonitorPanel } from '@/components/creator';
import type { TestCase } from '@/components/creator';
import { SchemaBuilder } from '@/components/baleybot/SchemaBuilder';

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
import { ArrowLeft, Save, Loader2, Pencil, Undo2, Redo2, Keyboard, LayoutGrid, Code2, ListTree, Zap, BarChart3, MessageSquare, PanelRight, Cable, FlaskConical, Activity } from 'lucide-react';
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
import { computeReadiness, createInitialReadiness, getVisibleTabs, countCompleted, getRecommendedAction } from '@/lib/baleybot/readiness';
import type { ReadinessDimension, ReadinessState } from '@/lib/baleybot/readiness';
import { getConnectionSummary } from '@/lib/baleybot/tools/requirements-scanner';
import { parseBalCode } from '@/lib/baleybot/bal-parser-pure';

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

  // Run state
  const [isRunLocked, setIsRunLocked] = useState(false);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  // View mode state (adaptive based on readiness)
  const [viewMode, setViewMode] = useState<AdaptiveTab>('visual');

  // Mobile view toggle (chat vs editor)
  type MobileView = 'editor' | 'chat';
  const [mobileView, setMobileView] = useState<MobileView>('editor');

  // Output schema state (extracted from BAL code when switching to schema view)
  const [outputSchema, setOutputSchema] = useState<Record<string, string>>({});

  // Trigger config state
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType | undefined>(undefined);

  // Readiness state
  const [readiness, setReadiness] = useState(createInitialReadiness());
  const prevReadinessRef = useRef<ReadinessState | null>(null);

  // Save conflict state (Phase 5.4)
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  // Real-time creation progress (replaces fake phase cycling)
  const [creationProgress, setCreationProgress] = useState<CreationProgress | null>(null);

  // Ref to track if initial prompt was sent (avoids effect dependency issues)
  const initialPromptSentRef = useRef(false);

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

  // Normalize workspace connections once for both ConnectionsPanel and useTestExecution
  const normalizedConnections = workspaceConnections?.map(c => ({
    id: c.id,
    type: c.type,
    name: c.name,
    status: c.status ?? 'unconfigured',
    isDefault: c.isDefault ?? false,
  }));

  // =====================================================================
  // TEST EXECUTION HOOK
  // =====================================================================

  const injectMessage = (message: CreatorMessage) => {
    setMessages(prev => [...prev, message]);
  };

  const navigateToTab = (tab: AdaptiveTab) => {
    setViewMode(tab);
    setMobileView('editor');
  };

  const {
    testCases,
    setTestCases,
    isGeneratingTests,
    isRunningAll,
    runAllProgress,
    lastRunSummary,
    handleGenerateTests,
    handleRunTest,
    handleRunAllTests,
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
  const handleSendMessage = async (message: string) => {
    // 0. Capture previous state for change summary (Phase 3.2)
    const prevEntities = [...entities];
    const prevConnections = [...connections];
    const prevName = name;

    // 1. Add user message to messages
    const userMessage: CreatorMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // 2. Set status to 'building'
    setStatus('building');
    setCreationProgress({ phase: 'understanding', message: 'Understanding your request...' });

    try {
      // 4. Call sendCreatorMessage mutation
      const result = await creatorMutation.mutateAsync({
        baleybotId: savedBaleybotId ?? undefined,
        message,
        conversationHistory: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          metadata: m.metadata as Record<string, unknown> | undefined,
        })),
      });

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
      let responseContent = '';
      if (isInitialCreation) {
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
      };

      // Add connection status if bot uses tools requiring connections
      const toolSummary = getConnectionSummary(visualEntities.flatMap(e => e.tools));
      if (toolSummary.required.length > 0) {
        const wsConns = workspaceConnections ?? [];
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

      // Add diagnostic and interactive next-step options for initial creation
      if (isInitialCreation) {
        metadata.diagnostic = {
          level: 'success',
          title: 'Bot Created',
          details: `${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'} designed and ready.`,
          suggestions: [],
        };

        // Compute post-creation readiness to determine next steps
        const postCreationReadiness = computeReadiness({
          hasBalCode: true,
          hasEntities: true,
          tools: visualEntities.flatMap(e => e.tools),
          connectionsMet: false,
          hasConnections: (workspaceConnections ?? []).length > 0,
          testsPassed: false,
          hasTestRuns: 0,
          hasTrigger: false,
          hasMonitoring: false,
        });

        const nextSteps: Array<{ id: string; label: string; description: string; icon: string }> = [];

        nextSteps.push({
          id: 'review-design',
          label: 'Review Design',
          description: 'Check the visual layout and entities',
          icon: '👁️',
        });

        if (postCreationReadiness.connected === 'incomplete') {
          nextSteps.push({
            id: 'setup-connections',
            label: 'Set Up Connections',
            description: 'Connect AI provider and required services',
            icon: '🔌',
          });
        }

        nextSteps.push({
          id: 'run-tests',
          label: 'Generate Tests',
          description: 'Auto-generate and run test cases',
          icon: '🧪',
        });

        if (postCreationReadiness.activated === 'incomplete') {
          nextSteps.push({
            id: 'setup-triggers',
            label: 'Set Up Triggers',
            description: 'Configure automatic execution',
            icon: '⚡',
          });
        }

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
        conversationHistory: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          metadata: m.metadata as Record<string, unknown> | undefined,
        })),
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

  /**
   * Handle output schema changes from the schema builder
   * Converts schema fields back to BAL and updates the code
   */
  const handleSchemaChange = (newSchema: Record<string, string>) => {
    setOutputSchema(newSchema);

    // Update BAL code with the new output schema
    if (balCode && Object.keys(newSchema).length > 0) {
      // Find and replace the "output" section in the BAL code
      // The BAL output section looks like: "output": { "field": "type", ... }
      const outputJson = JSON.stringify(newSchema, null, 2);
      const outputRegex = /"output"\s*:\s*\{[^}]*\}/;

      let updatedCode: string;
      if (outputRegex.test(balCode)) {
        // Replace existing output section
        updatedCode = balCode.replace(outputRegex, `"output": ${outputJson}`);
      } else {
        // Insert output before the closing brace of the first entity
        const lastBraceIdx = balCode.lastIndexOf('}');
        if (lastBraceIdx > 0) {
          const beforeBrace = balCode.slice(0, lastBraceIdx);
          const needsComma = beforeBrace.trimEnd().endsWith('"') || beforeBrace.trimEnd().endsWith(']') || beforeBrace.trimEnd().endsWith('}');
          updatedCode = `${beforeBrace}${needsComma ? ',' : ''}\n  "output": ${outputJson}\n${balCode.slice(lastBraceIdx)}`;
        } else {
          updatedCode = balCode;
        }
      }

      if (updatedCode !== balCode) {
        setBalCode(updatedCode);
        pushHistory(
          { entities, connections, balCode: updatedCode, name, icon },
          'Schema edit'
        );
      }
    }
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
    setReadiness(newReadiness);

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
          const nextAction = getRecommendedAction(newReadiness);

          let content = `**${dimensionLabels[dim]}** is complete! (${c}/${t})`;
          if (nextAction) {
            content += ` Next up: ${nextAction.label.toLowerCase()}.`;
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
          break; // Only one follow-up per render cycle
        }
      }
    }
    prevReadinessRef.current = newReadiness;
  }, [balCode, entities, testCases, triggerConfig, workspaceConnections, analyticsData, status]);

  // Auto-switch to a visible tab if current tab becomes hidden
  useEffect(() => {
    const visibleTabs = getVisibleTabs(readiness);
    if (!visibleTabs.includes(viewMode)) {
      setViewMode('visual');
    }
  }, [readiness, viewMode]);

  // Connection analysis — re-runs when connections tab is opened and code changes
  const analyzeConnectionsMutation = trpc.baleybots.analyzeConnections.useMutation();
  const lastAnalyzedCodeRef = useRef<string>('');

  useEffect(() => {
    if (viewMode !== 'connections' || !savedBaleybotId) return;
    if (entities.length === 0 || !balCode) return;
    // Skip if we already analyzed this exact code
    if (lastAnalyzedCodeRef.current === balCode) return;
    lastAnalyzedCodeRef.current = balCode;

    analyzeConnectionsMutation.mutate(
      {
        baleybotId: savedBaleybotId,
        balCode,
        entities: entities.map(e => ({ name: e.name, tools: e.tools })),
      },
      {
        onSuccess: (result) => {
          const analysis = result.analysis;
          const recommendations = result.recommendations ?? [];
          const warnings = result.warnings ?? [];
          const msg: CreatorMessage = {
            id: `msg-${Date.now()}-connadvice`,
            role: 'assistant',
            content: recommendations.join(' ') || 'Connection analysis complete.',
            timestamp: new Date(),
            metadata: {
              connectionStatus: {
                connections: [
                  {
                    name: 'AI Provider',
                    type: analysis?.aiProvider?.recommended || 'ai',
                    status: (workspaceConnections ?? []).some(c =>
                      ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected'
                    ) ? 'connected' : 'missing',
                  },
                  ...(analysis?.databases ?? []).map(db => ({
                    name: db.type,
                    type: db.type,
                    status: 'missing' as const,
                    requiredBy: db.tools,
                  })),
                ],
              },
              diagnostic: warnings.length > 0
                ? { level: 'warning' as const, title: 'Connection Warnings', suggestions: warnings }
                : undefined,
            },
          };
          setMessages(prev => [...prev, msg]);
        },
        onError: () => {
          // Connection analysis is a nice-to-have — fail silently.
          // The ConnectionsPanel already shows requirements from the static scanner.
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, savedBaleybotId, balCode]);

  // Auto-save trigger config when it changes (debounced)
  const saveTriggerMutation = trpc.baleybots.saveTriggerConfig.useMutation();

  useEffect(() => {
    if (!savedBaleybotId) return;
    const timeout = setTimeout(() => {
      saveTriggerMutation.mutate({
        id: savedBaleybotId,
        triggerConfig: triggerConfig ?? null,
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
      setViewMode('test');
      setMobileView('editor');
      return;
    }
    const retryMatch = optionId.match(/^retry-test-(.+)$/);
    if (retryMatch) {
      handleRunTest(retryMatch[1]!);
      return;
    }
    if (optionId === 'retry-all-tests') {
      handleRunAllTests();
      return;
    }
    if (optionId === 'review-mismatches') {
      setViewMode('test');
      setMobileView('editor');
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
      setViewMode(tabTarget);
      setMobileView('editor');

      const guideMessages: Record<string, string> = {
        'review-design': 'Take a look at the visual layout. You can drag nodes to rearrange, or switch to the **Code** tab to edit the BAL directly.',
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
      if (lastUserMsg) handleSendMessage(lastUserMsg.content);
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
            content: msg.content,
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
                  if (action === 'visual') { setViewMode('visual'); setMobileView('editor'); }
                  else if (action === 'code') { setViewMode('code'); setMobileView('editor'); }
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
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as AdaptiveTab)} className="w-auto">
                  <TabsList className="h-9 bg-muted/50">
                    {getVisibleTabs(readiness).map((tab) => {
                      const tabConfig: Record<AdaptiveTab, { icon: React.ReactNode; label: string }> = {
                        visual: { icon: <LayoutGrid className="h-3.5 w-3.5" />, label: 'Visual' },
                        code: { icon: <Code2 className="h-3.5 w-3.5" />, label: 'Code' },
                        schema: { icon: <ListTree className="h-3.5 w-3.5" />, label: 'Schema' },
                        connections: { icon: <Cable className="h-3.5 w-3.5" />, label: 'Connections' },
                        test: { icon: <FlaskConical className="h-3.5 w-3.5" />, label: 'Test' },
                        triggers: { icon: <Zap className="h-3.5 w-3.5" />, label: 'Triggers' },
                        analytics: { icon: <BarChart3 className="h-3.5 w-3.5" />, label: 'Analytics' },
                        monitor: { icon: <Activity className="h-3.5 w-3.5" />, label: 'Monitor' },
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
                    setViewMode(tabMap[dim] ?? 'visual');
                  }}
                  onActionClick={(optionId) => handleOptionSelect(optionId)}
                  className="ml-3"
                />
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
                    <VisualEditor
                      balCode={balCode}
                      onChange={handleCodeChange}
                      readOnly={status === 'building' || status === 'running'}
                      className="h-full"
                      hideToolbar
                    />
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

                  {/* Schema Builder View */}
                  {viewMode === 'schema' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      {Object.keys(outputSchema).length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                          <ListTree className="h-10 w-10 text-muted-foreground/40 mb-4" />
                          <h3 className="text-lg font-medium mb-2">Input/Output Schema</h3>
                          <p className="text-sm text-muted-foreground max-w-md mb-4">
                            Define the expected input and output format for your bot. This enables type-safe integrations and API usage.
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => setOutputSchema({ result: 'string' })}
                          >
                            Add Schema
                          </Button>
                        </div>
                      ) : (
                        <SchemaBuilder
                          value={outputSchema}
                          onChange={handleSchemaChange}
                          readOnly={status === 'building' || status === 'running'}
                        />
                      )}
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
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      <ConnectionsPanel
                        tools={entities.flatMap(e => e.tools)}
                        connections={normalizedConnections ?? []}
                        isLoading={isLoadingConnections}
                        onConnectionCreated={() => utils.connections.list.invalidate()}
                      />
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
                        onAddTest={handleAddTest}
                        onGenerateTests={handleGenerateTests}
                        isGenerating={isGeneratingTests}
                        isRunningAll={isRunningAll}
                        runAllProgress={runAllProgress}
                        lastRunSummary={lastRunSummary}
                        onUpdateTest={handleUpdateTest}
                        onDeleteTest={handleDeleteTest}
                        onAcceptActual={handleAcceptActual}
                      />
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
