'use client';

import { useState, useRef, useEffect } from 'react';
import { AppScaffoldPreview } from './AppScaffoldPreview';
import { DESIGN_PRESETS } from '@/lib/design-packages/presets';
import type { DesignPackageData } from '@/lib/design-packages/types';
import {
  runDesignCalibrationStream,
  type DesignCalibrationCallbacks,
} from '@/lib/design-packages/calibration-streaming';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import type { ToolCallState } from '@/lib/streaming/types/state';
import { cn } from '@/lib/utils';
import {
  Send,
  Sparkles,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
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
};

const BASE_PROMPTS = [
  { label: 'More vibrant', prompt: 'Make the colors more vibrant and saturated' },
  { label: 'More minimal', prompt: 'Make the design more minimal — tighter spacing, neutral palette' },
  { label: 'Darker theme', prompt: 'Use a darker, moodier color scheme' },
];

const WELCOME_MESSAGE: DesignMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm here to help you create a design system. You can:\n\n- **Paste a website URL** and I'll extract its design language\n- **Describe your brand** and I'll generate a theme\n- **Pick a preset** to start from\n\nWhat would you like to do?",
  blocks: [
    {
      type: 'text',
      text: "Hey! I'm here to help you create a design system. You can:\n\n- **Paste a website URL** and I'll extract its design language\n- **Describe your brand** and I'll generate a theme\n- **Pick a preset** to start from\n\nWhat would you like to do?",
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

  // ── Send Message ────────────────────────────────────────

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSendingRef.current) return;
    isSendingRef.current = true;

    setInputValue('');

    // Add user message
    const userMsg: DesignMessage = {
      id: nextMsgId(),
      role: 'user',
      content: trimmed,
      blocks: [{ type: 'text', text: trimmed }],
      toolCallStates: {},
      timestamp: Date.now(),
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
        setPackageData(data);
      },

      onDesignSaved: (packageId) => {
        setSavedPackageId(packageId);
        onComplete(packageId);
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
        setIsStreaming(false);
        isSendingRef.current = false;
        abortControllerRef.current = null;
      },
    };

    try {
      await runDesignCalibrationStream(
        {
          message: trimmed,
          conversationHistory,
          existingPackageData: packageData ?? undefined,
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
        <div className="flex h-full w-[420px] shrink-0 flex-col border-l border-border bg-card/40">
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
                    <p className="text-[13px] leading-relaxed whitespace-pre-line">{msg.content}</p>
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
          </div>

          {/* Quick prompts + input */}
          <div className="border-t border-border px-4 pt-3 pb-3 space-y-2">
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

            {/* Input */}
            <div className="flex gap-2">
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
                        : 'Paste a URL or describe your brand...'
                }
                className="flex-1 rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none ring-ring transition-shadow placeholder:text-muted-foreground focus:ring-2"
                disabled={isStreaming || !!savedPackageId}
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim() || isStreaming || !!savedPackageId}
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
