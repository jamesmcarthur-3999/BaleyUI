'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { trpc } from '@/lib/trpc/client';
import { Canvas, ChatInput, ActionBar, ConversationThread, ExecutionHistory, KeyboardShortcutsDialog, useKeyboardShortcutsDialog, NetworkStatus, useNetworkStatus, SaveConflictDialog, isSaveConflictError } from '@/components/creator';
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
import { ArrowLeft, Save, Loader2, ChevronDown, ChevronUp, Pencil, Undo2, Redo2, Keyboard } from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import { useDirtyState, useDebouncedCallback, useNavigationGuard, useHistory } from '@/hooks';
import { formatErrorWithAction, parseCreatorError } from '@/lib/errors/creator-errors';
import { generateChangeSummary, formatChangeSummaryForChat } from '@/lib/baleybot/change-summary';
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
  const handleHistoryStateChange = useCallback((snapshot: HistoryState) => {
    setEntities(snapshot.entities);
    setConnections(snapshot.connections);
    setBalCode(snapshot.balCode);
    setName(snapshot.name);
    setIcon(snapshot.icon);
  }, []);

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

  const dirtyState = useMemo(
    () => ({
      entities,
      connections,
      balCode,
      name,
      description,
      icon,
    }),
    [entities, connections, balCode, name, description, icon]
  );

  const { isDirty, markClean } = useDirtyState(dirtyState);

  // =====================================================================
  // TRPC QUERIES AND MUTATIONS
  // =====================================================================

  const utils = trpc.useUtils();

  // Fetch existing BaleyBot (only if not new)
  const { data: existingBaleybot, isLoading: isLoadingBaleybot } = trpc.baleybots.get.useQuery(
    { id },
    { enabled: !isNew }
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
   * Returns true if save was successful
   */
  const handleSave = async (): Promise<boolean> => {
    if (!balCode || !name) return false;

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

      return true;
    } catch (error) {
      console.error('Save failed:', error);

      // Check for save conflict (Phase 5.4)
      if (isSaveConflictError(error)) {
        setShowConflictDialog(true);
        return false;
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

      return false;
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
        const saved = await handleSave();
        if (!saved) {
          setRunResult({
            success: false,
            output: null,
            error: 'Failed to save BaleyBot before running',
          });
          setAutoSaveStatus('idle');
          return;
        }
        baleybotIdToRun = savedBaleybotId;
        setAutoSaveStatus('saved');
        // Clear "saved" indicator after 2 seconds
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      }

      // 2. Set status to 'running'
      setStatus('running');

      // 3. Call execute mutation
      const result = await executeMutation.mutateAsync({
        id: baleybotIdToRun!,
        input: input || undefined,
        triggeredBy: 'manual',
      });

      // 4. Set runResult
      setRunResult({
        success: true,
        output: result,
      });

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
        const loadedMessages: CreatorMessage[] = existingBaleybot.conversationHistory.map(
          (msg: { id: string; role: 'user' | 'assistant'; content: string; timestamp: string }) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
          })
        );
        setMessages(loadedMessages);
      }

      // Mark as clean since we just loaded from database
      markClean();
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

  if (!isNew && isLoadingBaleybot) {
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

  if (!isNew && !existingBaleybot && !isLoadingBaleybot) {
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

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border-b border-border/50 bg-background/80 backdrop-blur-sm"
      >
        {/* Main header row */}
        <div className="flex items-center gap-3 max-w-6xl mx-auto w-full px-4 py-3">
          {/* Back button */}
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Icon and name (Phase 5.1: Handle long names) */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-2xl shrink-0">{displayIcon}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <h1
                    className="text-lg font-semibold truncate max-w-[200px] sm:max-w-[300px] md:max-w-[400px]"
                    title={displayName}
                  >
                    {displayName}
                  </h1>
                </TooltipTrigger>
                {displayName.length > 25 && (
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="break-words">{displayName}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {/* Unsaved indicator */}
            {isDirty && (
              <span className="text-amber-500 text-xs font-medium shrink-0" title="Unsaved changes">
                (unsaved)
              </span>
            )}
          </div>

          {/* Undo/Redo buttons (Phase 3.5) */}
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="min-h-11 min-w-11 h-11 w-11"
                  >
                    <Undo2 className="h-4 w-4" />
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
                  >
                    <Redo2 className="h-4 w-4" />
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
                  >
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Keyboard shortcuts (?)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Save button with tooltip (Phase 1.8) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={saveDisabledReason ? 0 : undefined}>
                  <Button
                    onClick={() => debouncedSave()}
                    disabled={!canSave || !!saveDisabledReason}
                    size="sm"
                    className="shrink-0"
                  >
                    {isSaving || isSavePending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save
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

        {/* Description row (Phase 2.8) */}
        {(description || isEditingDescription || status === 'ready') && (
          <div className="max-w-6xl mx-auto w-full px-4 pb-3 pl-14">
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

      {/* Canvas area */}
      <div className="flex-1 relative overflow-hidden p-4">
        <div className="max-w-4xl mx-auto h-full">
          <Canvas
            entities={entities}
            connections={connections}
            status={status}
            className="h-full"
          />
        </div>
      </div>

      {/* Bottom controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="border-t border-border/50 bg-background/80 backdrop-blur-sm px-4 py-4"
      >
        <div className="max-w-2xl mx-auto space-y-4">
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
            disabled={creatorMutation.isPending}
          />
        </div>
      </motion.div>

      {/* Keyboard Shortcuts Dialog (Phase 3.8) */}
      <KeyboardShortcutsDialog open={isShortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
