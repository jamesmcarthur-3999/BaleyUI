'use client';

import { useState, useRef, useEffect } from 'react';
import { AppScaffoldPreview } from './AppScaffoldPreview';
import { DESIGN_PRESETS } from '@/lib/design-packages/presets';
import type { DesignPackageData } from '@/lib/design-packages/types';
import {
  runDesignCalibrationStream,
  type DesignCalibrationCallbacks,
} from '@/lib/design-packages/calibration-streaming';
import { DesignTokenStreamParser } from '@/lib/design-packages/token-stream-parser';
import { checkContrast } from '@/lib/design-packages/css-variables';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
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
  FileText,
  Upload,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface UploadedAsset {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  blobUrl: string;
  localPreviewUrl?: string;
}

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
  attachments?: UploadedAsset[];
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

  // File upload state
  const [sessionId] = useState(() => crypto.randomUUID());
  const [pendingAttachments, setPendingAttachments] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── File Upload ──────────────────────────────────────────

  const ALLOWED_UPLOAD_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf',
  ]);
  const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Client-side validation
    for (const file of fileArray) {
      if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
        alert(`"${file.name}" is not a supported file type. Use images or PDFs.`);
        return;
      }
      if (file.size > MAX_UPLOAD_SIZE) {
        alert(`"${file.name}" is too large. Maximum 10MB per file.`);
        return;
      }
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      for (const file of fileArray) {
        formData.append('files', file);
      }

      const res = await fetch('/api/design-calibration/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(err.message ?? 'Upload failed');
      }

      const { assets } = await res.json() as {
        assets: Array<{ id: string; fileName: string; mimeType: string; fileSize: number; blobUrl: string }>;
      };

      // Create local preview URLs for images
      const newAssets: UploadedAsset[] = assets.map((a, i) => ({
        ...a,
        localPreviewUrl: fileArray[i]?.type.startsWith('image/')
          ? URL.createObjectURL(fileArray[i]!)
          : undefined,
      }));

      setPendingAttachments((prev) => [...prev, ...newAssets]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.localPreviewUrl) {
        URL.revokeObjectURL(removed.localPreviewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  // ── Send Message ────────────────────────────────────────

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isSendingRef.current) return;
    isSendingRef.current = true;

    // Capture and clear pending attachments
    const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    const attachmentIds = attachments?.map(a => a.id);
    setPendingAttachments([]);
    setInputValue('');

    // Build display content — include attachment names if sending with files
    const displayContent = trimmed || (attachments
      ? `Uploaded ${attachments.length} file${attachments.length > 1 ? 's' : ''}`
      : '');
    const messageForApi = trimmed || 'Please analyze the uploaded brand assets and create a design system from them.';

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
        isSendingRef.current = false;
        abortControllerRef.current = null;
      },
    };

    try {
      await runDesignCalibrationStream(
        {
          message: messageForApi,
          conversationHistory,
          existingPackageData: packageData ?? undefined,
          attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
          sessionId,
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
    <div className="flex h-full flex-col">
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
      <div className="flex flex-1 min-h-0">
        {/* Left: Preview */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-muted/30 p-5">
          <div className="mx-auto max-w-5xl">
            <AppScaffoldPreview
              data={packageData}
              brandName={existingPackage?.name ?? 'Your App'}
              state={scaffoldState}
              containerRef={(el) => { previewContainerRef.current = el; }}
            />

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
          className="relative flex h-full w-[420px] shrink-0 flex-col border-l border-border bg-card/40"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            // Only set false if leaving the container
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDragging(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) {
              handleFileUpload(e.dataTransfer.files);
            }
          }}
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
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {msg.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="flex items-center gap-1.5 rounded-lg bg-primary-foreground/10 px-2 py-1"
                            >
                              {att.mimeType.startsWith('image/') && att.localPreviewUrl ? (
                                <img
                                  src={att.localPreviewUrl}
                                  alt={att.fileName}
                                  className="h-6 w-6 rounded object-cover"
                                />
                              ) : (
                                <FileText className="h-4 w-4 shrink-0 opacity-70" />
                              )}
                              <span className="text-[10px] max-w-[80px] truncate">{att.fileName}</span>
                            </div>
                          ))}
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

          {/* Quick prompts + input */}
          <div className="shrink-0 border-t border-border px-4 pt-3 pb-3 space-y-2">
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
              <div className="flex flex-wrap gap-1.5">
                {pendingAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="group flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-1"
                  >
                    {att.mimeType.startsWith('image/') && att.localPreviewUrl ? (
                      <img
                        src={att.localPreviewUrl}
                        alt={att.fileName}
                        className="h-6 w-6 rounded object-cover"
                      />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-[10px] max-w-[80px] truncate text-muted-foreground">
                      {att.fileName}
                    </span>
                    <button
                      onClick={() => removePendingAttachment(att.id)}
                      className="rounded-full p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
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
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(inputValue);
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
                className="flex-1 rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none ring-ring transition-shadow placeholder:text-muted-foreground focus:ring-2"
                disabled={isStreaming || !!savedPackageId}
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
