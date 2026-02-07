'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
import { ChatInput, LeftPanel, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, isSaveConflictError, ReadinessDots, ConnectionsPanel, TestPanel, MonitorPanel } from '@/components/creator';
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
import { useDirtyState, useDebouncedCallback, useNavigationGuard, useHistory } from '@/hooks';
import { formatErrorWithAction, parseCreatorError } from '@/lib/errors/creator-errors';
import { generateChangeSummary, formatChangeSummaryForChat } from '@/lib/baleybot/change-summary';
import { safeParseDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import type {
  VisualEntity,
  Connection,
  CreatorMessage,
  CreationStatus,
  AdaptiveTab,
} from '@/lib/baleybot/creator-types';
import { computeReadiness, createInitialReadiness, getVisibleTabs } from '@/lib/baleybot/readiness';
import { getConnectionSummary } from '@/lib/baleybot/tools/requirements-scanner';

/**
 * Example prompts shown on the /new welcome view
 */
const EXAMPLE_PROMPTS = [
  { label: 'Summarize articles', prompt: 'Create a bot that summarizes news articles from URLs I give it' },
  { label: 'Research assistant', prompt: 'Create a research assistant that can search the web and compile findings' },
  { label: 'Data analyzer', prompt: 'Create a bot that analyzes CSV data and answers questions about it' },
  { label: 'Email drafter', prompt: 'Create a bot that drafts professional emails based on bullet points' },
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
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);

  // Save conflict state (Phase 5.4)
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

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

  // Fetch per-bot analytics (for readiness computation and display)
  const { data: analyticsData, isLoading: isLoadingAnalytics } = trpc.analytics.getBaleybotAnalytics.useQuery(
    { baleybotId: savedBaleybotId! },
    { enabled: !!savedBaleybotId },
  );

  // Mutations
  const creatorMutation = trpc.baleybots.sendCreatorMessage.useMutation();
  const saveMutation = trpc.baleybots.saveFromSession.useMutation();
  const executeMutation = trpc.baleybots.execute.useMutation();
  const saveTestsMutation = trpc.baleybots.saveTestCases.useMutation();

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
        })),
      });

      // 5. Transform result entities to VisualEntity[] (add position, status: 'stable')
      const visualEntities: VisualEntity[] = result.entities.map((entity) => ({
        ...entity,
        position: { x: 0, y: 0 }, // Canvas will position them
        status: 'stable' as const,
      }));

      // 6. Transform result connections to Connection[] (add id, status: 'stable')
      const visualConnections: Connection[] = result.connections.map((conn, index) => ({
        id: `conn-${index}`,
        from: conn.from,
        to: conn.to,
        label: conn.label,
        status: 'stable' as const,
      }));

      // 7. Update all state (with name truncation - Phase 5.1)
      setEntities(visualEntities);
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

      // Add diagnostic for initial creation with next steps
      if (isInitialCreation) {
        metadata.diagnostic = {
          level: 'success',
          title: 'Bot Created',
          details: `${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'} ready.`,
          suggestions: [
            'Switch to the Test tab to generate and run tests',
            toolSummary.required.length > 0 ? 'Check the Connections tab to verify required connections' : undefined,
            'Try editing the code in the Code tab',
          ].filter((s): s is string => !!s),
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
    } catch (error) {
      console.error('Creator message failed:', error);
      setStatus('error');

      // Add user-friendly error message
      const parsed = parseCreatorError(error);
      const errorMessage: CreatorMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `${parsed.title}: ${parsed.message}${parsed.action ? ` ${parsed.action}` : ''}`,
        timestamp: new Date(),
        metadata: { isError: true },
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
  }, [balCode, entities, testCases, triggerConfig, workspaceConnections, analyticsData]);

  // Connection analysis — run once when connections tab is first opened
  const analyzeConnectionsMutation = trpc.baleybots.analyzeConnections.useMutation();
  const connectionAnalysisRunRef = useRef(false);

  useEffect(() => {
    if (viewMode !== 'connections' || !savedBaleybotId || connectionAnalysisRunRef.current) return;
    if (entities.length === 0 || !balCode) return;
    connectionAnalysisRunRef.current = true;

    analyzeConnectionsMutation.mutate(
      {
        baleybotId: savedBaleybotId,
        balCode,
        entities: entities.map(e => ({ name: e.name, tools: e.tools })),
      },
      {
        onSuccess: (result) => {
          const msg: CreatorMessage = {
            id: `msg-${Date.now()}-connadvice`,
            role: 'assistant',
            content: result.recommendations.join(' ') || 'Connection analysis complete.',
            timestamp: new Date(),
            metadata: {
              connectionStatus: {
                connections: [
                  {
                    name: 'AI Provider',
                    type: result.analysis.aiProvider.recommended || 'ai',
                    status: (workspaceConnections ?? []).some(c =>
                      ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected'
                    ) ? 'connected' : 'missing',
                  },
                  ...result.analysis.databases.map(db => ({
                    name: db.type,
                    type: db.type,
                    status: 'missing' as const,
                    requiredBy: db.tools,
                  })),
                ],
              },
              diagnostic: result.warnings.length > 0
                ? { level: 'warning' as const, title: 'Connection Warnings', suggestions: result.warnings }
                : undefined,
            },
          };
          setMessages(prev => [...prev, msg]);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, savedBaleybotId]);

  // Auto-save test cases when they change (debounced)
  useEffect(() => {
    if (!savedBaleybotId || testCases.length === 0) return;
    const timeout = setTimeout(() => {
      saveTestsMutation.mutate({
        id: savedBaleybotId,
        testCases: testCases.map(t => ({
          ...t,
          // Reset running status to pending on save (can't persist mid-run)
          status: t.status === 'running' ? 'pending' : t.status,
        })),
      });
    }, 2000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testCases, savedBaleybotId]);

  // =====================================================================
  // TEST HANDLERS
  // =====================================================================

  const generateTestsMutation = trpc.baleybots.generateTests.useMutation();

  const handleGenerateTests = async () => {
    if (!savedBaleybotId) return;
    setIsGeneratingTests(true);

    try {
      const result = await generateTestsMutation.mutateAsync({
        baleybotId: savedBaleybotId,
        balCode,
        entities: entities.map(e => ({
          name: e.name,
          tools: e.tools,
          purpose: e.purpose || e.name,
        })),
      });

      const generated: TestCase[] = result.tests.map((test, i) => ({
        id: `test-${Date.now()}-${i}`,
        name: test.name,
        level: test.level,
        input: test.input,
        expectedOutput: test.expectedOutput,
        status: 'pending' as const,
      }));

      setTestCases(prev => [...prev, ...generated]);

      // Add assistant message with test plan metadata
      const testMessage: CreatorMessage = {
        id: `msg-${Date.now()}-tests`,
        role: 'assistant',
        content: `Generated ${generated.length} tests. Strategy: ${result.strategy}`,
        timestamp: new Date(),
        metadata: {
          testPlan: {
            tests: generated.map(t => ({
              id: t.id,
              name: t.name,
              level: t.level,
              status: t.status,
              input: t.input,
              expectedOutput: t.expectedOutput,
            })),
            summary: result.strategy,
          },
        },
      };
      setMessages(prev => [...prev, testMessage]);
    } catch (error) {
      console.error('Test generation failed:', error);
      const errorMsg: CreatorMessage = {
        id: `msg-${Date.now()}-testerr`,
        role: 'assistant',
        content: 'Failed to generate tests. Please try again.',
        timestamp: new Date(),
        metadata: {
          isError: true,
          diagnostic: {
            level: 'error',
            title: 'Test Generation Failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            suggestions: ['Make sure your bot has been saved first', 'Check that an AI provider is connected'],
          },
        },
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGeneratingTests(false);
    }
  };

  const handleRunTest = async (testId: string) => {
    setTestCases(prev => prev.map(t =>
      t.id === testId ? { ...t, status: 'running' as const } : t
    ));

    try {
      const test = testCases.find(t => t.id === testId);
      if (!test || !savedBaleybotId) return;

      const execution = await executeMutation.mutateAsync({
        id: savedBaleybotId,
        input: test.input,
        triggeredBy: 'manual',
      });

      const actualOutput = execution.output != null
        ? (typeof execution.output === 'string' ? execution.output : JSON.stringify(execution.output, null, 2))
        : undefined;

      // Determine pass/fail
      let testPassed = execution.status === 'completed';

      // If there's an expected output, check if actual output contains it
      if (testPassed && test.expectedOutput && actualOutput) {
        const expected = test.expectedOutput.toLowerCase().trim();
        const actual = actualOutput.toLowerCase();
        testPassed = actual.includes(expected);
      }

      setTestCases(prev => prev.map(t =>
        t.id === testId
          ? {
              ...t,
              status: testPassed ? 'passed' as const : 'failed' as const,
              actualOutput,
              error: execution.error || (!testPassed && test.expectedOutput
                ? `Output did not contain expected: "${test.expectedOutput}"`
                : undefined),
              durationMs: execution.durationMs ?? undefined,
            }
          : t
      ));
    } catch (error: unknown) {
      setTestCases(prev => prev.map(t =>
        t.id === testId
          ? { ...t, status: 'failed' as const, error: error instanceof Error ? error.message : 'Unknown error' }
          : t
      ));
    }
  };

  const handleRunAllTests = async () => {
    for (const test of testCases) {
      await handleRunTest(test.id);
    }
  };

  const handleAddTest = (test: Omit<TestCase, 'id' | 'status'>) => {
    setTestCases(prev => [...prev, { ...test, id: `test-${Date.now()}`, status: 'pending' }]);
  };

  const handleOptionSelect = (optionId: string) => {
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

      // If we have entityNames, create basic entities for display
      if (existingBaleybot.entityNames && existingBaleybot.entityNames.length > 0) {
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

      // Load conversation history (Phase 2.6)
      if (existingBaleybot.conversationHistory && Array.isArray(existingBaleybot.conversationHistory)) {
        const loadedMessages: CreatorMessage[] = existingBaleybot.conversationHistory
          .filter((msg): msg is { id: string; role: 'user' | 'assistant'; content: string; timestamp: string } =>
            msg && typeof msg.id === 'string' && typeof msg.content === 'string'
          )
          .map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: safeParseDate(msg.timestamp),
          }));
        setMessages(loadedMessages);
      }

      // Mark as clean since we just loaded from database
      markClean();

      // Mark state as initialized after all state updates
      setIsStateInitialized(true);
    }
  }, [isNew, existingBaleybot, markClean]);

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
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm transition-colors',
                mobileView === 'chat'
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setMobileView('chat')}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
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
                <ReadinessDots
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
                        availableBaleybots={
                          availableBaleybots
                            ?.filter((bb) => bb.id !== savedBaleybotId)
                            .map((bb) => ({ id: bb.id, name: bb.name })) ?? []
                        }
                      />
                    </div>
                  )}

                  {/* Analytics View */}
                  {viewMode === 'analytics' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      {!savedBaleybotId ? (
                        <p className="text-muted-foreground text-sm">Save this BaleyBot first to see analytics.</p>
                      ) : (
                        <MonitorPanel
                          analyticsData={analyticsData ?? null}
                          isLoading={isLoadingAnalytics}
                          hasTrigger={!!triggerConfig}
                        />
                      )}
                    </div>
                  )}
                  {/* Connections View */}
                  {viewMode === 'connections' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      <ConnectionsPanel
                        tools={entities.flatMap(e => e.tools)}
                        connections={(workspaceConnections ?? []).map(c => ({
                          id: c.id,
                          type: c.type,
                          name: c.name,
                          status: c.status ?? 'unconfigured',
                          isDefault: c.isDefault ?? false,
                        }))}
                        isLoading={isLoadingConnections}
                        onManageConnections={() => router.push(ROUTES.settings.connections)}
                      />
                    </div>
                  )}

                  {/* Test View */}
                  {viewMode === 'test' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4">
                      <TestPanel
                        testCases={testCases}
                        onRunTest={handleRunTest}
                        onRunAll={handleRunAllTests}
                        onAddTest={handleAddTest}
                        onGenerateTests={handleGenerateTests}
                        isGenerating={isGeneratingTests}
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
