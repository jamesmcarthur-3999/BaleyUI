'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { trpc } from '@/lib/trpc/client';
import { ChatInput, ActionBar, ConversationThread, ExecutionHistory, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, isSaveConflictError } from '@/components/creator';
import { BalCodeEditor, SchemaBuilder } from '@/components/baleybot';

// Dynamic import to avoid bundling @baleybots/core server-only modules in client
const VisualEditor = dynamic(
  () => import('@/components/visual-editor/VisualEditor').then(mod => ({ default: mod.VisualEditor })),
  { ssr: false }
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
import { ArrowLeft, Save, Loader2, Pencil, Undo2, Redo2, Keyboard, LayoutGrid, Code2, ListTree, Zap, BarChart3 } from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import { ErrorBoundary } from '@/components/errors';
import { useDirtyState, useDebouncedCallback, useNavigationGuard, useHistory } from '@/hooks';
import { formatErrorWithAction, parseCreatorError } from '@/lib/errors/creator-errors';
import { generateChangeSummary, formatChangeSummaryForChat } from '@/lib/baleybot/change-summary';
import { safeParseDate } from '@/lib/utils/date';
import type {
  VisualEntity,
  Connection,
  CreatorMessage,
  CreationStatus,
} from '@/lib/baleybot/creator-types';

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
 * Result from running a BaleyBot
 */
interface RunResult {
  success: boolean;
  output: unknown;
  error?: string;
  /** Parser error location (if applicable) */
  parserLocation?: {
    line: number;
    column: number;
    sourceLine?: string;
  };
}

/**
 * Auto-save status for visual feedback
 */
type AutoSaveStatus = 'idle' | 'saving' | 'saved';

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
  const [runResult, setRunResult] = useState<RunResult | undefined>(undefined);
  const [isRunLocked, setIsRunLocked] = useState(false);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  // View mode state (Phase 2 - Editor & Schema integration)
  type ViewMode = 'visual' | 'code' | 'schema' | 'triggers' | 'analytics';
  const [viewMode, setViewMode] = useState<ViewMode>('visual');

  // Output schema state (extracted from BAL code when switching to schema view)
  const [outputSchema, setOutputSchema] = useState<Record<string, string>>({});

  // Trigger config state
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType | undefined>(undefined);

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

  // Fetch per-bot analytics (only when analytics tab is active and we have an ID)
  const { data: analyticsData, isLoading: isLoadingAnalytics } = trpc.analytics.getBaleybotAnalytics.useQuery(
    { baleybotId: savedBaleybotId! },
    { enabled: viewMode === 'analytics' && !!savedBaleybotId },
  );

  // Mutations
  const creatorMutation = trpc.baleybots.sendCreatorMessage.useMutation();
  const saveMutation = trpc.baleybots.saveFromSession.useMutation();
  const executeMutation = trpc.baleybots.execute.useMutation();

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

    // 3. Clear runResult
    setRunResult(undefined);

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

      // Build response message
      let responseContent = '';
      if (prevEntities.length === 0) {
        // Initial creation
        responseContent = `I've created "${result.name}" with ${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'}.`;
      } else {
        // Update - include change summary
        responseContent = summaryText || `Updated "${result.name}".`;
      }

      // Add AI thinking if available
      if (result.thinking) {
        responseContent += ` ${result.thinking}`;
      }

      const assistantMessage: CreatorMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: responseContent.trim(),
        timestamp: new Date(),
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
        description: description || messages[0]?.content,
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
      // 1. Auto-save if not saved yet (with visual indicator - Phase 1.7)
      if (!baleybotIdToRun) {
        setAutoSaveStatus('saving');
        const newId = await handleSave();
        if (!newId) {
          setRunResult({
            success: false,
            output: null,
            error: 'Failed to save BaleyBot before running',
          });
          setAutoSaveStatus('idle');
          return;
        }
        baleybotIdToRun = newId;
        setAutoSaveStatus('saved');
        // Clear "saved" indicator after 2 seconds
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      }

      // 2. Set status to 'running'
      setStatus('running');

      // 3. Call execute mutation (Phase 2.1: Real execution)
      const execution = await executeMutation.mutateAsync({
        id: baleybotIdToRun!,
        input: input || undefined,
        triggeredBy: 'manual',
      });

      // 4. Set runResult based on execution status
      if (execution.status === 'completed') {
        setRunResult({
          success: true,
          output: execution.output,
        });
      } else if (execution.status === 'failed') {
        setRunResult({
          success: false,
          output: null,
          error: execution.error || 'Execution failed',
        });
      } else if (execution.status === 'cancelled') {
        setRunResult({
          success: false,
          output: null,
          error: 'Execution was cancelled',
        });
      } else {
        // Pending or running - shouldn't happen but handle gracefully
        setRunResult({
          success: true,
          output: execution,
        });
      }

      // 5. Set status to 'ready'
      setStatus('ready');
    } catch (error) {
      console.error('Execution failed:', error);

      // Set user-friendly error result
      const parsed = parseCreatorError(error);
      setRunResult({
        success: false,
        output: null,
        error: `${parsed.title}: ${parsed.message}`,
        parserLocation: parsed.parserLocation,
      });

      // Set status to 'error'
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

        {/* Canvas skeleton */}
        <div className="flex-1 p-6">
          <Skeleton className="h-full w-full rounded-2xl" />
        </div>

        {/* Controls skeleton */}
        <div className="px-4 pb-4">
          <Skeleton className="h-16 w-full max-w-2xl mx-auto rounded-2xl" />
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
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border-b border-border/50 bg-background/80 backdrop-blur-sm"
      >
        {/* Main header row - responsive padding (Phase 4.6) */}
        <div className="flex items-center gap-2 sm:gap-3 max-w-6xl mx-auto w-full px-2 sm:px-4 py-2 sm:py-3">
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
          <div className="hidden sm:block max-w-6xl mx-auto w-full px-4 pb-3 pl-14">
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
      </motion.header>

      {/* Main content area with view tabs */}
      <div className="flex-1 relative overflow-hidden p-2 sm:p-4 md:p-6">
        <div className="max-w-4xl mx-auto h-full flex flex-col">
          {/* View mode tabs */}
          <div className="flex items-center justify-between mb-3">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-auto">
              <TabsList className="h-9 bg-muted/50">
                <TabsTrigger value="visual" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Visual</span>
                </TabsTrigger>
                <TabsTrigger value="code" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <Code2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Code</span>
                </TabsTrigger>
                <TabsTrigger value="schema" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <ListTree className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Schema</span>
                </TabsTrigger>
                <TabsTrigger value="triggers" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <Zap className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Triggers</span>
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Analytics</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* View content */}
          <div className="flex-1 min-h-0">
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
                  <SchemaBuilder
                    value={outputSchema}
                    onChange={handleSchemaChange}
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
                <div className="h-full overflow-auto bg-background rounded-lg border p-4 space-y-6">
                  {!savedBaleybotId ? (
                    <p className="text-muted-foreground text-sm">Save this BaleyBot first to see analytics.</p>
                  ) : isLoadingAnalytics ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-40 w-full" />
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : analyticsData ? (
                    <>
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-2xl font-bold">{analyticsData.total}</p>
                          <p className="text-xs text-muted-foreground">Total Runs</p>
                        </div>
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-2xl font-bold">{(analyticsData.successRate * 100).toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">Success Rate</p>
                        </div>
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-2xl font-bold">{analyticsData.avgDurationMs > 1000 ? `${(analyticsData.avgDurationMs / 1000).toFixed(1)}s` : `${analyticsData.avgDurationMs}ms`}</p>
                          <p className="text-xs text-muted-foreground">Avg Duration</p>
                        </div>
                      </div>

                      {/* Additional stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-xl font-bold">{analyticsData.totalTokens.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Total Tokens</p>
                        </div>
                        <div className="rounded-lg border p-4 text-center">
                          <p className="text-xl font-bold">{analyticsData.failures}</p>
                          <p className="text-xs text-muted-foreground">Failures</p>
                        </div>
                      </div>

                      {/* Daily trend */}
                      {analyticsData.dailyTrend.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium mb-3">Daily Executions</h3>
                          <div className="flex items-end gap-1 h-24">
                            {analyticsData.dailyTrend.map((day) => {
                              const maxCount = Math.max(...analyticsData.dailyTrend.map(d => d.count));
                              const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                              return (
                                <div
                                  key={day.date}
                                  className="flex-1 min-w-0 group relative"
                                >
                                  <div
                                    className="bg-primary/70 hover:bg-primary rounded-t transition-colors w-full"
                                    style={{ height: `${Math.max(height, 4)}%` }}
                                    title={`${day.date}: ${day.count} executions`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">{analyticsData.dailyTrend[0]?.date}</span>
                            <span className="text-[10px] text-muted-foreground">{analyticsData.dailyTrend[analyticsData.dailyTrend.length - 1]?.date}</span>
                          </div>
                        </div>
                      )}

                      {/* Top errors */}
                      {analyticsData.topErrors.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium mb-3">Recent Errors</h3>
                          <div className="space-y-2">
                            {analyticsData.topErrors.map((err, i) => (
                              <div key={i} className="flex items-start justify-between gap-2 text-sm rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                                <p className="text-destructive text-xs break-all flex-1">{err.message}</p>
                                <span className="text-muted-foreground text-xs shrink-0">{err.count}x</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {analyticsData.total === 0 && (
                        <p className="text-muted-foreground text-sm text-center py-8">No executions in the last 30 days. Run this BaleyBot to see analytics.</p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Bottom controls - responsive padding (Phase 4.6, 4.8) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="border-t border-border/50 bg-background/80 backdrop-blur-sm px-2 sm:px-4 md:px-6 py-3 sm:py-4"
      >
        <div className="max-w-2xl md:max-w-3xl mx-auto space-y-4">
          {/* Conversation thread (Phase 2.7) */}
          <ConversationThread
            messages={messages}
            defaultCollapsed={messages.length > 3}
            maxHeight="250px"
          />

          {/* Execution history (Phase 2.9) */}
          {!isNew && existingBaleybot?.executions && existingBaleybot.executions.length > 0 && (
            <ExecutionHistory
              executions={existingBaleybot.executions}
              defaultCollapsed={true}
              onExecutionClick={(executionId) => {
                router.push(ROUTES.activity.execution(executionId));
              }}
            />
          )}

          {/* Action bar (when ready) */}
          <ActionBar
            status={status}
            balCode={balCode}
            onRun={handleRun}
            runResult={runResult}
            isRunLocked={isRunLocked}
            autoSaveStatus={autoSaveStatus}
          />

          {/* Chat input (always visible) */}
          <ChatInput
            status={status}
            onSend={handleSendMessage}
            disabled={creatorMutation.isPending || isSaving}
          />
        </div>
      </motion.div>

      {/* Keyboard Shortcuts Dialog (Phase 3.8) */}
      <KeyboardShortcutsDialog open={isShortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
