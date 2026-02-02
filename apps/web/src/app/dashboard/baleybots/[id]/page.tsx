'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { trpc } from '@/lib/trpc/client';
import { Canvas, ChatInput, ActionBar } from '@/components/creator';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import type {
  VisualEntity,
  Connection,
  CreatorMessage,
  CreationStatus,
} from '@/lib/baleybot/creator-types';

/**
 * Result from running a BaleyBot
 */
interface RunResult {
  success: boolean;
  output: unknown;
  error?: string;
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
  const [icon, setIcon] = useState<string>('');
  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [savedBaleybotId, setSavedBaleybotId] = useState<string | null>(isNew ? null : id);

  // Run state
  const [runResult, setRunResult] = useState<RunResult | undefined>(undefined);

  // UI state
  const [isSaving, setIsSaving] = useState(false);

  // Ref to track if initial prompt was sent (avoids effect dependency issues)
  const initialPromptSentRef = useRef(false);

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
      const visualEntities: VisualEntity[] = result.entities.map((entity, index) => ({
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

      // 7. Update all state
      setEntities(visualEntities);
      setConnections(visualConnections);
      setBalCode(result.balCode);
      setName(result.name);
      setIcon(result.icon);

      // 8. Add assistant message with brief summary
      const entityCount = visualEntities.length;
      const assistantMessage: CreatorMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: `I've created a BaleyBot with ${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}. ${result.thinking || ''}`.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // 9. Set status to 'ready'
      setStatus('ready');
    } catch (error) {
      console.error('Creator message failed:', error);
      setStatus('error');

      // Add error message
      const errorMessage: CreatorMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  /**
   * Handle saving the BaleyBot
   * Returns the saved ID (for use in handleRun)
   */
  const handleSave = async (): Promise<string | null> => {
    if (!balCode || !name) return null;

    setIsSaving(true);

    try {
      const result = await saveMutation.mutateAsync({
        baleybotId: savedBaleybotId ?? undefined,
        name,
        description: messages[0]?.content,
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

      return result.id;
    } catch (error) {
      console.error('Save failed:', error);

      // Add error message to conversation for user feedback
      const errorMessage: CreatorMessage = {
        id: `msg-${Date.now()}-save-error`,
        role: 'assistant',
        content: `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
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
   * Handle running the BaleyBot
   */
  const handleRun = async (input: string) => {
    let baleybotIdToRun = savedBaleybotId;

    // 1. Auto-save if not saved yet
    if (!baleybotIdToRun) {
      const newId = await handleSave();
      if (!newId) {
        setRunResult({
          success: false,
          output: null,
          error: 'Failed to save BaleyBot before running',
        });
        return;
      }
      baleybotIdToRun = newId;
    }

    // 2. Set status to 'running'
    setStatus('running');

    try {
      // 3. Call execute mutation
      const result = await executeMutation.mutateAsync({
        id: baleybotIdToRun,
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

      // Set error result
      setRunResult({
        success: false,
        output: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Set status to 'error'
      setStatus('error');
    }
  };

  /**
   * Handle back navigation
   */
  const handleBack = () => {
    router.push(ROUTES.baleybots.list);
  };

  // =====================================================================
  // EFFECTS
  // =====================================================================

  // Initialize state from existing BaleyBot
  useEffect(() => {
    if (!isNew && existingBaleybot) {
      setName(existingBaleybot.name);
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
    }
  }, [isNew, existingBaleybot]);

  // Auto-send initial prompt if provided (using ref to track sent state)
  useEffect(() => {
    if (isNew && initialPrompt && !initialPromptSentRef.current && status === 'empty') {
      initialPromptSentRef.current = true;
      handleSendMessage(initialPrompt);
    }
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
        <Button onClick={handleBack}>
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
  const canSave = status === 'ready' && balCode && name;

  return (
    <div className="flex flex-col h-screen bg-gradient-hero">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm"
      >
        <div className="flex items-center gap-3 max-w-6xl mx-auto w-full">
          {/* Back button */}
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Icon and name */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-2xl">{displayIcon}</span>
            <h1 className="text-lg font-semibold truncate">{displayName}</h1>
          </div>

          {/* Save button */}
          <Button
            onClick={() => handleSave()}
            disabled={!canSave || isSaving}
            size="sm"
            className="shrink-0"
          >
            {isSaving ? (
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
        </div>
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
          {/* Action bar (when ready) */}
          <ActionBar
            status={status}
            balCode={balCode}
            onRun={handleRun}
            runResult={runResult}
          />

          {/* Chat input (always visible) */}
          <ChatInput
            status={status}
            onSend={handleSendMessage}
            disabled={creatorMutation.isPending}
          />
        </div>
      </motion.div>
    </div>
  );
}
