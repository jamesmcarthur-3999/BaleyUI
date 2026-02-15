'use client';

import { useState, useRef, useEffect } from 'react';
import { AppScaffoldPreview } from './AppScaffoldPreview';
import { DESIGN_PRESETS } from '@/lib/design-packages/presets';
import type { DesignPackageData } from '@/lib/design-packages/types';
import { ensureDesignPackageDataV2 } from '@/lib/design-packages/schema';
import {
  runDesignCalibrationStream,
  type DesignCalibrationCallbacks,
  type DesignConceptPayload,
} from '@/lib/design-packages/calibration-streaming';
import { DesignTokenStreamParser } from '@/lib/design-packages/token-stream-parser';
import { checkContrast } from '@/lib/design-packages/css-variables';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import { AttachmentThumbnails } from '@/components/chat';
import type { ChatAttachment } from '@/components/chat';
import { useFileUpload } from '@/hooks/useFileUpload';
import { cn } from '@/lib/utils';

/** Local tool call state for the calibration wizard's streaming UI */
interface ToolCallState {
  id: string;
  toolName: string;
  status: 'streaming_args' | 'args_complete' | 'executing' | 'complete' | 'error';
  arguments: string;
  parsedArguments?: unknown;
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}
import {
  Send,
  Sparkles,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Undo2,
  Redo2,
  Paperclip,
  Upload,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ContentBlock {
  type: 'text' | 'tool_call' | 'error';
  text?: string;
  toolCallId?: string;
}

interface DesignMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  blocks: ContentBlock[];
  toolCallStates: Record<string, ToolCallState>;
  timestamp: number;
  attachments?: ChatAttachment[];
}

interface DesignCalibrationWizardProps {
  onComplete: (packageId: string) => void;
  onSkip?: () => void;
  existingPackage?: {
    id: string;
    name: string;
    description: string | null;
    packageData: DesignPackageData;
  };
}

type SurfaceTab = 'landing' | 'customerApp' | 'internalApp';
type DirectionId = 'directionA' | 'directionB' | 'directionC';

// ============================================================================
// Constants
// ============================================================================

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  spawn_baleybot: 'Running design analysis',
  fetch_url: 'Fetching website',
  web_search: 'Searching for brand info',
  set_design_package: 'Updating preview',
  save_design_package: 'Saving design',
  analyze_brand_asset: 'Analyzing brand asset',
};

const BASE_PROMPTS = [
  { label: 'More vibrant', prompt: 'Make the colors more vibrant and saturated' },
  { label: 'More minimal', prompt: 'Make the design more minimal — tighter spacing, neutral palette' },
  { label: 'Darker theme', prompt: 'Use a darker, moodier color scheme' },
];

const WELCOME_MESSAGE: DesignMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm here to help you create a design system. You can:\n\n- **Paste a website URL** and I'll extract its design language\n- **Describe your brand** and I'll generate a theme\n- **Upload brand assets** (logos, style guides, PDFs) and I'll analyze them\n- **Pick a preset** to start from\n\nWhat would you like to do?",
  blocks: [
    {
      type: 'text',
      text: "Hey! I'm here to help you create a design system. You can:\n\n- **Paste a website URL** and I'll extract its design language\n- **Describe your brand** and I'll generate a theme\n- **Upload brand assets** (logos, style guides, PDFs) and I'll analyze them\n- **Pick a preset** to start from\n\nWhat would you like to do?",
    },
  ],
  toolCallStates: {},
  timestamp: Date.now(),
};

// ============================================================================
// Component
// ============================================================================

export function DesignCalibrationWizard({
  onComplete,
  onSkip,
  existingPackage,
}: DesignCalibrationWizardProps) {
  const [packageData, setPackageData] = useState<DesignPackageData | null>(
    existingPackage?.packageData ?? null,
  );
  const [messages, setMessages] = useState<DesignMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [savedPackageId, setSavedPackageId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showSavedBanner, setShowSavedBanner] = useState(true);
  const [componentGenState, setComponentGenState] = useState<
    'idle' | 'generating' | 'complete' | 'error'
  >('idle');
  const [generatedComponents, setGeneratedComponents] = useState<
    Array<{ componentName: string; action: string }>
  >([]);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [designConcepts, setDesignConcepts] = useState<DesignConceptPayload[]>([]);
  const [activeSurfaceTab, setActiveSurfaceTab] = useState<SurfaceTab>('landing');
  const [selectedDirectionId, setSelectedDirectionId] = useState<DirectionId | null>(null);
  const [directionScores, setDirectionScores] = useState<
    Record<string, { score: number; rationale: string }>
  >({});
  const [brandDossier, setBrandDossier] = useState<Record<string, unknown> | null>(null);
  const [qualityRepairs, setQualityRepairs] = useState<Array<{ attempt: number; reason: string }>>([]);
  const [mergePreview, setMergePreview] = useState<Record<string, unknown> | null>(null);
  const [mergeSelection, setMergeSelection] = useState<
    Partial<Record<'colors' | 'typography' | 'motionSystem' | 'layoutSystem' | 'surfaceBlueprints', DirectionId>>
  >({});

  const [brandAlignment, setBrandAlignment] = useState(85);
  const [contrastTarget, setContrastTarget] = useState<'aa' | 'aaa'>('aa');
  const [layoutDensity, setLayoutDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [motionIntensity, setMotionIntensity] = useState<'subtle' | 'moderate' | 'expressive'>('moderate');
  const [voiceTone, setVoiceTone] = useState('clear and confident');

  // File upload state (shared hook)
  const [sessionId] = useState(() => crypto.randomUUID());
  // Maps blob URL → DB asset ID (needed for the design-calibration stream endpoint)
  const assetIdMapRef = useRef(new Map<string, string>());
  const {
    pendingAttachments,
    uploading,
    isDragging,
    fileInputRef,
    handleFileUpload,
    removePendingAttachment,
    clearPendingAttachments,
    dragHandlers,
  } = useFileUpload({
    uploadUrl: '/api/design-calibration/upload',
    maxFiles: 10,
    extraFormData: { sessionId },
    parseResponse: (json: unknown, files: File[]) => {
      const { assets } = json as {
        assets: Array<{ id: string; fileName: string; mimeType: string; fileSize: number; blobUrl: string }>;
      };
      return assets.map((a, i): ChatAttachment => {
        // Track URL → DB ID mapping for stream endpoint
        assetIdMapRef.current.set(a.blobUrl, a.id);
        return {
          fileName: a.fileName,
          mimeType: a.mimeType,
          fileSize: a.fileSize,
          url: a.blobUrl,
          downloadUrl: a.blobUrl,
          localPreviewUrl: files[i]?.type.startsWith('image/')
            ? URL.createObjectURL(files[i]!)
            : undefined,
        };
      });
    },
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);
  const msgIdCounterRef = useRef(0);
  const nextMsgId = () => `design-msg-${++msgIdCounterRef.current}`;

  // Live streaming state (refs for perf)
  const outputAccRef = useRef('');
  const toolCallsRef = useRef<Record<string, ToolCallState>>({});
  const currentBlocksRef = useRef<ContentBlock[]>([]);
  const [, forceUpdate] = useState(0);
  const rafRef = useRef<number>(0);

  // Incremental color morphing
  const tokenParserRef = useRef(new DesignTokenStreamParser());
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const morphTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Undo/redo history
  const historyRef = useRef<DesignPackageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyRef.current.length - 1;

  const pushHistory = (data: DesignPackageData) => {
    // Truncate any redo history beyond current index
    historyRef.current = historyRef.current.slice(0, historyIndex + 1);
    historyRef.current.push(data);
    setHistoryIndex(historyRef.current.length - 1);
  };

  const handleUndo = () => {
    if (!canUndo) return;
    const newIdx = historyIndex - 1;
    setHistoryIndex(newIdx);
    setPackageData(historyRef.current[newIdx]!);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const newIdx = historyIndex + 1;
    setHistoryIndex(newIdx);
    setPackageData(historyRef.current[newIdx]!);
  };

  // WCAG contrast check (primary on background)
  const contrastInfo = packageData
    ? checkContrast(packageData.colors.light.primary, packageData.colors.light.background)
    : null;

  // Scroll ref
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Derive scaffold state
  const scaffoldState = isStreaming && !packageData
    ? 'loading' as const
    : packageData
      ? 'active' as const
      : 'placeholder' as const;

  const getConceptByDirection = (directionId: DirectionId | undefined) =>
    designConcepts.find((concept) => concept.id === directionId);

  const previewMergedConcept = () => {
    const baseDirection = selectedDirectionId ?? designConcepts[0]?.id;
    if (!baseDirection) return;
    const baseConcept = getConceptByDirection(baseDirection);
    if (!baseConcept) return;

    const colorsConcept = getConceptByDirection(mergeSelection.colors ?? baseDirection);
    const typographyConcept = getConceptByDirection(mergeSelection.typography ?? baseDirection);
    const motionConcept = getConceptByDirection(mergeSelection.motionSystem ?? baseDirection);
    const layoutConcept = getConceptByDirection(mergeSelection.layoutSystem ?? baseDirection);
    const blueprintConcept = getConceptByDirection(mergeSelection.surfaceBlueprints ?? baseDirection);

    const merged = ensureDesignPackageDataV2({
      ...baseConcept.packageData,
      colors: colorsConcept?.packageData.colors ?? baseConcept.packageData.colors,
      typography: typographyConcept?.packageData.typography ?? baseConcept.packageData.typography,
      motionSystem: motionConcept?.packageData.motionSystem ?? baseConcept.packageData.motionSystem,
      layoutSystem: layoutConcept?.packageData.layoutSystem ?? baseConcept.packageData.layoutSystem,
      surfaceBlueprints:
        blueprintConcept?.packageData.surfaceBlueprints ?? baseConcept.packageData.surfaceBlueprints,
    });

    setPackageData(merged);
    pushHistory(merged);
  };

  // ── Send Message ────────────────────────────────────────

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isSendingRef.current) return;
    isSendingRef.current = true;

    // Capture and clear pending attachments via shared hook
    const cleared = clearPendingAttachments();
    const attachments = cleared.length > 0 ? cleared : undefined;
    // Map back to DB asset IDs for the design-calibration stream endpoint
    const attachmentIds = attachments
      ?.map(a => assetIdMapRef.current.get(a.url))
      .filter((id): id is string => !!id);
    setInputValue('');
    // Re-focus input so the user can keep typing
    chatInputRef.current?.focus();

    // Build display content — include attachment names if sending with files
    const displayContent = trimmed || (attachments
      ? `Uploaded ${attachments.length} file${attachments.length > 1 ? 's' : ''}`
      : '');
    const userMessage = trimmed || 'Please analyze the uploaded brand assets and create a design system from them.';

    // Add user message
    const userMsg: DesignMessage = {
      id: nextMsgId(),
      role: 'user',
      content: displayContent,
      blocks: [{ type: 'text', text: displayContent }],
      toolCallStates: {},
      timestamp: Date.now(),
      attachments,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Start streaming
    setIsStreaming(true);
    if (!packageData) {
      setDesignConcepts([]);
      setSelectedDirectionId(null);
      setDirectionScores({});
      setBrandDossier(null);
      setQualityRepairs([]);
      setMergePreview(null);
    }
    outputAccRef.current = '';
    toolCallsRef.current = {};
    currentBlocksRef.current = [];

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Build conversation history from previous messages
    const conversationHistory = [...messages, userMsg]
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

    const scheduleRender = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        forceUpdate((n) => n + 1);
        scrollToBottom();
      });
    };

    const callbacks: DesignCalibrationCallbacks = {
      onTextDelta: (content) => {
        outputAccRef.current += content;
        const blocks = currentBlocksRef.current;
        const last = blocks[blocks.length - 1];
        if (last?.type === 'text') {
          last.text = outputAccRef.current;
        } else {
          blocks.push({ type: 'text', text: outputAccRef.current });
        }
        scheduleRender();
      },

      onToolCallStart: (id, toolName) => {
        outputAccRef.current = '';
        toolCallsRef.current[id] = {
          id,
          toolName,
          status: 'streaming_args',
          arguments: '',
          startTime: Date.now(),
        };
        currentBlocksRef.current.push({ type: 'tool_call', toolCallId: id });
        scheduleRender();
      },

      onToolCallArgsDelta: (id, delta) => {
        const tc = toolCallsRef.current[id];
        if (tc) {
          tc.arguments += delta;

          // Incremental color morphing: parse tokens from set_design_package JSON as it streams
          if (tc.toolName === 'set_design_package') {
            const tokens = tokenParserRef.current.feed(delta);
            const container = previewContainerRef.current;
            if (tokens.length > 0 && container) {
              tokens.forEach((token, i) => {
                if (token.cssVariable) {
                  // Stagger tokens 35ms apart for cascade ripple effect
                  const timer = setTimeout(() => {
                    container.style.setProperty(token.cssVariable!, token.value);
                  }, i * 35);
                  morphTimersRef.current.push(timer);
                }
                // Handle Google Fonts injection during streaming
                if (token.path === 'typography.googleFontsUrl' && token.value) {
                  const finalUrl = token.value.includes('display=')
                    ? token.value
                    : `${token.value}${token.value.includes('?') ? '&' : '?'}display=swap`;
                  if (!document.querySelector(`link[href="${finalUrl}"]`)) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = finalUrl;
                    link.dataset.designPackageFonts = 'true';
                    document.head.appendChild(link);
                  }
                }
              });
            }
          }

          scheduleRender();
        }
      },

      onToolCallComplete: (id, _toolName, args) => {
        const tc = toolCallsRef.current[id];
        if (tc) {
          tc.status = 'args_complete';
          tc.arguments = args || tc.arguments;
          try {
            tc.parsedArguments = JSON.parse(tc.arguments);
          } catch {
            // keep raw
          }
          scheduleRender();
        }
      },

      onToolExecStart: (id, _toolName) => {
        const tc = toolCallsRef.current[id];
        if (tc) {
          tc.status = 'executing';
          scheduleRender();
        }
      },

      onToolExecOutput: (id, _toolName, result, error) => {
        const tc = toolCallsRef.current[id];
        if (tc) {
          tc.status = error ? 'error' : 'complete';
          tc.result = result;
          tc.error = error;
          tc.endTime = Date.now();
          scheduleRender();
        }
      },

      onDesignPreviewUpdate: (data) => {
        // Clear stagger timers
        morphTimersRef.current.forEach(clearTimeout);
        morphTimersRef.current = [];
        // Clear inline styles so the <style> tag from packageToCSSString takes over
        const container = previewContainerRef.current;
        if (container) {
          container.style.cssText = '';
          // Re-apply the base inline styles that AppScaffoldPreview sets
          container.style.backgroundColor = 'hsl(var(--background))';
          container.style.color = 'hsl(var(--foreground))';
        }
        // Reset parser for next tool call
        tokenParserRef.current.reset();
        setPackageData(data);
        pushHistory(data);
      },

      onDesignSaved: (packageId) => {
        setSavedPackageId(packageId);
        onComplete(packageId);
      },

      onBrandDossierStarted: () => {
        setBrandDossier(null);
      },

      onBrandDossierReady: (dossier) => {
        setBrandDossier(dossier);
      },

      onConceptDirectionScored: ({ id, score, rationale }) => {
        setDirectionScores((prev) => ({
          ...prev,
          [id]: { score, rationale },
        }));
      },

      onQualityGateRepair: ({ attempt, reason }) => {
        setQualityRepairs((prev) => [...prev, { attempt, reason }]);
      },

      onConceptMergePreview: (payload) => {
        setMergePreview(payload);
        const selectedDirection = payload.selectedDirection;
        if (
          selectedDirection === 'directionA' ||
          selectedDirection === 'directionB' ||
          selectedDirection === 'directionC'
        ) {
          setSelectedDirectionId(selectedDirection);
          setMergeSelection({
            colors: selectedDirection,
            typography: selectedDirection,
            motionSystem: selectedDirection,
            layoutSystem: selectedDirection,
            surfaceBlueprints: selectedDirection,
          });
        }
      },

      onDesignConceptsStarted: () => {
        setConceptsLoading(true);
      },

      onDesignConceptsUpdate: (concepts) => {
        setConceptsLoading(false);
        setDesignConcepts(concepts);
        if (!selectedDirectionId && concepts[0]) {
          setSelectedDirectionId(concepts[0].id);
        }
      },

      onComponentGenerationStarted: () => {
        setComponentGenState('generating');
      },

      onComponentRegistered: (component) => {
        setGeneratedComponents((prev) => [
          ...prev,
          {
            componentName: String((component as Record<string, unknown>).componentName ?? 'Unknown'),
            action: String((component as Record<string, unknown>).action ?? 'created'),
          },
        ]);
      },

      onComponentGenerationComplete: () => {
        setComponentGenState('complete');
      },

      onComponentGenerationError: () => {
        setComponentGenState('error');
      },

      onError: (message) => {
        currentBlocksRef.current.push({ type: 'error', text: message });
        scheduleRender();
      },

      onDone: () => {
        const finalBlocks = [...currentBlocksRef.current];
        const finalToolCalls = { ...toolCallsRef.current };
        const allText = finalBlocks
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('');

        const assistantMsg: DesignMessage = {
          id: nextMsgId(),
          role: 'assistant',
          content: allText,
          blocks: finalBlocks,
          toolCallStates: finalToolCalls,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        outputAccRef.current = '';
        toolCallsRef.current = {};
        currentBlocksRef.current = [];
        tokenParserRef.current.reset();
        morphTimersRef.current.forEach(clearTimeout);
        morphTimersRef.current = [];
        setIsStreaming(false);
        setConceptsLoading(false);
        isSendingRef.current = false;
        abortControllerRef.current = null;
      },
    };

    try {
      await runDesignCalibrationStream(
        {
          message: userMessage,
          conversationHistory,
          existingPackageData: packageData ?? undefined,
          attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
          sessionId,
          controls: {
            brandAlignment,
            contrastTarget,
            layoutDensity,
            motionIntensity,
            voiceTone,
          },
        },
        callbacks,
        abortController.signal,
      );
    } catch (err) {
      if (abortController.signal.aborted) {
        isSendingRef.current = false;
        return;
      }
      callbacks.onError(err instanceof Error ? err.message : 'Stream failed');
      callbacks.onDone();
    }
  };

  // ── Preset Selection ─────────────────────────────────────

  const handlePresetSelect = (preset: typeof DESIGN_PRESETS[number]) => {
    setPackageData(preset.data);
    pushHistory(preset.data);
    const presetMsg: DesignMessage = {
      id: nextMsgId(),
      role: 'assistant',
      content: `Starting from **${preset.name}** — a ${preset.mood} design. What would you like to change?`,
      blocks: [
        {
          type: 'text',
          text: `Starting from **${preset.name}** — a ${preset.mood} design. What would you like to change?`,
        },
      ],
      toolCallStates: {},
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, presetMsg]);
  };

  const applyConcept = (concept: DesignConceptPayload) => {
    setPackageData(concept.packageData);
    pushHistory(concept.packageData);
    setSelectedDirectionId(concept.id);
  };

  // ── Abort / Close ────────────────────────────────────────

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      isSendingRef.current = false;
    }
    if (packageData && !savedPackageId) {
      if (!window.confirm('You have an unsaved design. Close anyway?')) {
        return;
      }
    }
    onSkip?.();
  };

  // ── Render helpers ───────────────────────────────────────
  // NOTE: This will be replaced by the unified chat library
  // (ChatThread + SegmentRenderer from @/components/chat) once
  // feat/unified-chat-library merges into dev/next.

  const renderBlocks = (
    blocks: ContentBlock[],
    toolCalls: Record<string, ToolCallState>,
    streaming: boolean,
  ) =>
    blocks.map((block, i) => {
      if (block.type === 'text' && block.text) {
        return (
          <StreamdownMarkdown
            key={i}
            text={block.text}
            isStreaming={streaming && i === blocks.length - 1}
            className="text-[13px] leading-relaxed"
          />
        );
      }
      if (block.type === 'error' && block.text) {
        return (
          <div
            key={i}
            className="my-1.5 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{block.text}</span>
          </div>
        );
      }
      if (block.type === 'tool_call' && block.toolCallId) {
        const tc = toolCalls[block.toolCallId];
        if (!tc) return null;
        const displayName = TOOL_DISPLAY_NAMES[tc.toolName] ?? tc.toolName;
        return (
          <div
            key={i}
            className="my-1.5 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
          >
            {tc.status === 'complete' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            ) : tc.status === 'error' ? (
              <X className="h-3.5 w-3.5 text-destructive shrink-0" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            )}
            <span className="font-medium">{displayName}</span>
            {tc.endTime && tc.startTime && (
              <span className="ml-auto tabular-nums">
                {((tc.endTime - tc.startTime) / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        );
      }
      return null;
    });

  // ── Layout ───────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">
            {existingPackage ? existingPackage.name : 'New Design Package'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* WCAG Contrast Indicator — only show when contrast fails */}
          {contrastInfo && !contrastInfo.passesAA && (
            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              AA &#10007; {contrastInfo.ratio}:1
            </span>
          )}
          {/* Undo/Redo */}
          {packageData && !savedPackageId && (
            <>
              <button
                onClick={handleUndo}
                disabled={!canUndo || isStreaming}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                title="Undo"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo || isStreaming}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                title="Redo"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {packageData && !savedPackageId && (
            <button
              onClick={() => sendMessage('Save this design package')}
              disabled={isStreaming}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Save Design
            </button>
          )}
          {onSkip && !savedPackageId && (
            <button
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Preview */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-muted/30 p-5">
          <div className="mx-auto max-w-5xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                {([
                  ['landing', 'Landing'],
                  ['customerApp', 'Customer App'],
                  ['internalApp', 'Internal App'],
                ] as Array<[SurfaceTab, string]>).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveSurfaceTab(tab)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      activeSurfaceTab === tab
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <AppScaffoldPreview
              data={packageData}
              brandName={existingPackage?.name ?? 'Your App'}
              surface={activeSurfaceTab}
              state={scaffoldState}
              containerRef={(el) => { previewContainerRef.current = el; }}
            />

            {(conceptsLoading || designConcepts.length > 0) && (
              <div className="mt-4 rounded-xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Concept Directions</p>
                  {conceptsLoading && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generating concepts
                    </span>
                  )}
                </div>
                {designConcepts.length > 0 && (
                  <div className="grid gap-2 md:grid-cols-3">
                    {designConcepts.map((concept) => (
                      <div
                        key={concept.id}
                        className={cn(
                          'rounded-lg border p-2 text-left transition-colors',
                          selectedDirectionId === concept.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">{concept.title}</p>
                          {typeof (directionScores[concept.id]?.score ?? concept.score) === 'number' && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {(directionScores[concept.id]?.score ?? concept.score)}/100
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{concept.summary}</p>
                        {(directionScores[concept.id]?.rationale ?? concept.rationale) && (
                          <p className="mt-1 text-[10px] text-muted-foreground/90">
                            {directionScores[concept.id]?.rationale ?? concept.rationale}
                          </p>
                        )}
                        <div className="mt-2 flex gap-1.5">
                          <button
                            onClick={() => applyConcept(concept)}
                            className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium hover:border-primary/40"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => {
                              setSelectedDirectionId(concept.id);
                              setMergeSelection((prev) => ({
                                colors: prev.colors ?? concept.id,
                                typography: prev.typography ?? concept.id,
                                motionSystem: prev.motionSystem ?? concept.id,
                                layoutSystem: prev.layoutSystem ?? concept.id,
                                surfaceBlueprints: prev.surfaceBlueprints ?? concept.id,
                              }));
                            }}
                            className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium hover:border-primary/40"
                          >
                            Use in Merge
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {designConcepts.length > 0 && (
                  <div className="mt-3 rounded-lg border border-border bg-muted/30 p-2.5">
                    <p className="text-[11px] font-semibold text-foreground">Merge Composer</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-5">
                      {([
                        ['colors', 'Palette'],
                        ['typography', 'Type'],
                        ['motionSystem', 'Motion'],
                        ['layoutSystem', 'Layout'],
                        ['surfaceBlueprints', 'Blueprints'],
                      ] as const).map(([key, label]) => (
                        <div key={key}>
                          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</label>
                          <select
                            value={mergeSelection[key] ?? selectedDirectionId ?? designConcepts[0]!.id}
                            onChange={(e) =>
                              setMergeSelection((prev) => ({
                                ...prev,
                                [key]: e.target.value as DirectionId,
                              }))
                            }
                            className="h-7 w-full rounded-md border border-border bg-background px-1.5 text-[10px]"
                          >
                            {designConcepts.map((concept) => (
                              <option key={`${key}-${concept.id}`} value={concept.id}>
                                {concept.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-muted-foreground">
                        {mergePreview?.selectedDirection
                          ? `Suggested base: ${String(mergePreview.selectedDirection)}`
                          : 'Blend systems across directions and preview instantly.'}
                      </p>
                      <button
                        onClick={previewMergedConcept}
                        className="rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        Preview Merge
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(brandDossier || qualityRepairs.length > 0) && (
              <div className="mt-4 rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Rationale</p>
                    {brandDossier && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Source-backed dossier ready with confidence scoring and inferred defaults.
                      </p>
                    )}
                  </div>
                  {qualityRepairs.length > 0 && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      {qualityRepairs.length} repair pass{qualityRepairs.length > 1 ? 'es' : ''}
                    </span>
                  )}
                </div>
                {qualityRepairs.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {qualityRepairs.slice(-3).map((repair) => (
                      <p key={`${repair.attempt}-${repair.reason}`} className="text-[10px] text-muted-foreground">
                        Attempt {repair.attempt}: {repair.reason}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Brand Alignment ({brandAlignment}%)
                </label>
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={brandAlignment}
                  onChange={(e) => setBrandAlignment(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Contrast Target
                </label>
                <select
                  value={contrastTarget}
                  onChange={(e) => setContrastTarget(e.target.value as 'aa' | 'aaa')}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="aa">AA</option>
                  <option value="aaa">AAA</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Layout Density
                </label>
                <select
                  value={layoutDensity}
                  onChange={(e) => setLayoutDensity(e.target.value as 'compact' | 'comfortable' | 'spacious')}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                  <option value="spacious">Spacious</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Motion Intensity
                </label>
                <select
                  value={motionIntensity}
                  onChange={(e) => setMotionIntensity(e.target.value as 'subtle' | 'moderate' | 'expressive')}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="subtle">Subtle</option>
                  <option value="moderate">Moderate</option>
                  <option value="expressive">Expressive</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Voice Tone
                </label>
                <input
                  value={voiceTone}
                  onChange={(e) => setVoiceTone(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                  placeholder="clear and confident"
                />
              </div>
            </div>

            {/* Preset chips when no package data */}
            {!packageData && !isStreaming && (
              <div className="mt-6 space-y-3">
                <p className="text-xs font-medium text-muted-foreground text-center">
                  or start from a preset
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {DESIGN_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset)}
                      className="group flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/40 hover:shadow-sm active:scale-95"
                    >
                      <div className="flex gap-0.5">
                        {[
                          preset.data.colors.light.primary,
                          preset.data.colors.light.accent,
                        ].map((color, i) => (
                          <div
                            key={i}
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: `hsl(${color})` }}
                          />
                        ))}
                      </div>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Chat */}
        <div
          className="relative flex w-[420px] shrink-0 flex-col overflow-hidden border-l border-border bg-card/40"
          {...dragHandlers}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-primary/5 backdrop-blur-sm border-2 border-dashed border-primary/40 rounded-lg">
              <Upload className="h-8 w-8 text-primary/60" />
              <p className="text-sm font-medium text-primary/80">Drop brand assets here</p>
              <p className="text-xs text-muted-foreground">Images, logos, PDFs</p>
            </div>
          )}
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {/* Finalized messages */}
            {messages.map((msg) => (
              <div key={msg.id} className={cn('space-y-1', msg.role === 'user' && 'flex justify-end')}>
                <div
                  className={cn(
                    'max-w-[95%] rounded-2xl px-3.5 py-2.5',
                    msg.role === 'assistant'
                      ? 'bg-muted/80 text-foreground rounded-tl-md'
                      : 'bg-primary text-primary-foreground rounded-tr-md',
                  )}
                >
                  {msg.role === 'user' ? (
                    <div>
                      <p className="text-[13px] leading-relaxed whitespace-pre-line">{msg.content}</p>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2">
                          <AttachmentThumbnails attachments={msg.attachments} compact />
                        </div>
                      )}
                    </div>
                  ) : (
                    renderBlocks(msg.blocks, msg.toolCallStates, false)
                  )}
                </div>
              </div>
            ))}

            {/* Live streaming block */}
            {isStreaming && currentBlocksRef.current.length > 0 && (
              <div className="space-y-1">
                <div className="max-w-[95%] rounded-2xl rounded-tl-md bg-muted/80 text-foreground px-3.5 py-2.5">
                  {renderBlocks(currentBlocksRef.current, toolCallsRef.current, true)}
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {isStreaming && currentBlocksRef.current.length === 0 && (
              <div className="flex items-center gap-2 max-w-[95%] rounded-2xl rounded-tl-md bg-muted/80 px-3.5 py-3">
                <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-primary/60"
                      style={{
                        animation: 'pulse 1.4s ease-in-out infinite',
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground">Thinking...</span>
              </div>
            )}

            {/* Saved success */}
            {savedPackageId && showSavedBanner && (
              <div className="flex items-center gap-2 rounded-2xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span className="flex-1 text-green-700 dark:text-green-400 font-medium">
                  Design package saved!
                </span>
                <button
                  onClick={() => setShowSavedBanner(false)}
                  className="rounded-md p-0.5 text-green-600 dark:text-green-400 hover:bg-green-500/10 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Component generation progress */}
            {componentGenState !== 'idle' && (
              <div className="rounded-2xl border border-border bg-muted/40 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium">
                  {componentGenState === 'generating' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>Building component library...</span>
                    </>
                  ) : componentGenState === 'complete' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span>{generatedComponents.length} components ready!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      <span>Component generation had issues</span>
                    </>
                  )}
                </div>
                {generatedComponents.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {generatedComponents.map((c, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary animate-in fade-in slide-in-from-bottom-1 duration-300"
                        style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
                      >
                        {c.componentName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick prompts + input — pinned to bottom */}
          <div className="mt-auto shrink-0 border-t border-border bg-card/40 px-4 pt-3 pb-3 space-y-2">
            {/* Quick prompts */}
            {!isStreaming && !savedPackageId && (
              <div className="flex flex-wrap gap-1.5">
                {BASE_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => sendMessage(qp.prompt)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground active:scale-95"
                  >
                    {qp.label}
                  </button>
                ))}
                {packageData && !savedPackageId && (
                  <button
                    onClick={() => sendMessage('Save this design package')}
                    className="rounded-full border border-green-500/30 bg-green-500/5 px-2.5 py-1 text-[11px] text-green-700 dark:text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/10 active:scale-95"
                  >
                    Save it
                  </button>
                )}
              </div>
            )}

            {/* Pending attachment thumbnails */}
            {pendingAttachments.length > 0 && (
              <AttachmentThumbnails
                attachments={pendingAttachments}
                onRemove={removePendingAttachment}
              />
            )}

            {/* Input row */}
            <div className="flex gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFileUpload(e.target.files);
                  }
                  e.target.value = '';
                }}
              />

              {/* Paperclip button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || isStreaming || !!savedPackageId}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-input bg-background text-muted-foreground transition-all hover:text-foreground hover:bg-muted disabled:opacity-40"
                title="Attach brand assets"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
              </button>

              <input
                ref={chatInputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!isStreaming) sendMessage(inputValue);
                  }
                }}
                placeholder={
                  savedPackageId
                    ? 'Design saved!'
                    : isStreaming
                      ? 'Waiting for response...'
                      : packageData
                        ? 'Describe changes or say "save it"...'
                        : 'Paste a URL, describe your brand, or attach files...'
                }
                className={cn(
                  "flex-1 rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none ring-ring transition-shadow placeholder:text-muted-foreground focus:ring-2",
                  isStreaming && !savedPackageId && "opacity-60"
                )}
                disabled={!!savedPackageId}
                aria-busy={isStreaming}
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={(!inputValue.trim() && pendingAttachments.length === 0) || isStreaming || !!savedPackageId}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
