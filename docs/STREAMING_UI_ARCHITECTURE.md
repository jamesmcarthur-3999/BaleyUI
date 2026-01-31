# Streaming UI Architecture

> Performance-first design for real-time AI output rendering

---

## Performance Targets

| Metric | Target | Why |
|--------|--------|-----|
| **Frame Rate** | 60fps during streaming | Smooth animations, no jank |
| **Time to First Paint** | <50ms after first token | Instant perceived response |
| **Memory Growth** | <10MB per 10K tokens | No leaks during long sessions |
| **CPU Usage** | <30% on M1 Air | Room for local models |
| **Bundle Size** | <50KB for streaming components | Fast initial load |

---

## The Problem with Naive Streaming

```typescript
// DISASTER - Don't do this
function NaiveStreamingText({ stream }) {
  const [text, setText] = useState('');

  useEffect(() => {
    stream.on('text_delta', (event) => {
      setText(prev => prev + event.content);  // Re-render on EVERY token
    });
  }, []);

  return <p>{text}</p>;  // React diffs entire string every time
}
```

**What goes wrong:**
1. **100+ re-renders/second** - React reconciliation on every token
2. **String concatenation** - Creating new string objects constantly
3. **Virtual DOM diffing** - Comparing entire text content each time
4. **Layout thrashing** - If you auto-scroll, you're reading + writing layout
5. **GC pressure** - Hundreds of temporary string allocations

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STREAMING UI ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    1. TRANSPORT LAYER                                │   │
│  │                                                                      │   │
│  │  EventSource / fetch + ReadableStream                                │   │
│  │  ├── Connection management (reconnect, backoff)                     │   │
│  │  ├── Chunk buffering (handle split events)                          │   │
│  │  └── Parse SSE format → raw events                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    2. EVENT ROUTER                                   │   │
│  │                                                                      │   │
│  │  Route events by type to specialized handlers                       │   │
│  │  ├── text_delta → TextAccumulator                                   │   │
│  │  ├── tool_* → ToolStateManager                                      │   │
│  │  ├── reasoning → ThinkingAccumulator                                │   │
│  │  └── structured_output_delta → JSONAccumulator                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    3. ACCUMULATORS (No React)                        │   │
│  │                                                                      │   │
│  │  Pure JS classes that batch updates                                 │   │
│  │  ├── Append to internal buffer                                      │   │
│  │  ├── Flush on requestAnimationFrame                                 │   │
│  │  └── Emit batched updates to subscribers                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    4. RENDER LAYER                                   │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ StreamText   │  │ ToolCard     │  │ JSONViewer   │              │   │
│  │  │              │  │              │  │              │              │   │
│  │  │ Direct DOM   │  │ React state  │  │ Web Worker   │              │   │
│  │  │ manipulation │  │ (batched)    │  │ parsing      │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   ↓                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    5. ANIMATION LAYER                                │   │
│  │                                                                      │   │
│  │  CSS-only animations (GPU accelerated)                              │   │
│  │  ├── Cursor blink (CSS animation)                                   │   │
│  │  ├── Tool card entrance (CSS transition)                            │   │
│  │  ├── Scroll (CSS scroll-behavior: smooth)                           │   │
│  │  └── Skeleton shimmer (CSS animation)                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Transport

### SSE Connection with Resilience

```typescript
// packages/core/src/streaming/transport.ts

interface TransportConfig {
  url: string;
  onEvent: (event: BaleybotStreamEvent) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  signal?: AbortSignal;
}

export async function createStreamTransport(config: TransportConfig) {
  const { url, onEvent, onError, onComplete, signal } = config;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Accept': 'text/event-stream' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';  // Handle split chunks

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE events from buffer
      const events = parseSSEBuffer(buffer);
      buffer = events.remainder;

      for (const event of events.parsed) {
        onEvent(event);
      }
    }
    onComplete();
  } catch (error) {
    if (error.name !== 'AbortError') {
      onError(error);
    }
  }
}

function parseSSEBuffer(buffer: string): {
  parsed: BaleybotStreamEvent[];
  remainder: string
} {
  const events: BaleybotStreamEvent[] = [];
  const lines = buffer.split('\n');
  let remainder = '';
  let currentData = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('data: ')) {
      currentData = line.slice(6);
    } else if (line === '' && currentData) {
      // Empty line = end of event
      try {
        const parsed = JSON.parse(currentData);
        events.push(parsed.event || parsed);
      } catch (e) {
        // Incomplete JSON, keep in buffer
        remainder = `data: ${currentData}\n`;
      }
      currentData = '';
    } else if (i === lines.length - 1 && line !== '') {
      // Last line incomplete
      remainder = line;
    }
  }

  return { parsed: events, remainder };
}
```

---

## Layer 2: Event Router

```typescript
// packages/core/src/streaming/router.ts

type EventHandler<T> = (event: T) => void;

interface EventRouterConfig {
  onTextDelta: EventHandler<TextDeltaEvent>;
  onToolCallStart: EventHandler<ToolCallStartEvent>;
  onToolCallArgsDelta: EventHandler<ToolCallArgsDeltaEvent>;
  onToolCallComplete: EventHandler<ToolCallCompleteEvent>;
  onToolExecStart: EventHandler<ToolExecStartEvent>;
  onToolExecOutput: EventHandler<ToolExecOutputEvent>;
  onToolExecStream: EventHandler<ToolExecStreamEvent>;
  onReasoning: EventHandler<ReasoningEvent>;
  onStructuredDelta: EventHandler<StructuredDeltaEvent>;
  onError: EventHandler<ErrorEvent>;
  onDone: EventHandler<DoneEvent>;
}

export function createEventRouter(config: EventRouterConfig) {
  return (event: BaleybotStreamEvent) => {
    switch (event.type) {
      case 'text_delta':
        config.onTextDelta(event);
        break;
      case 'tool_call_stream_start':
        config.onToolCallStart(event);
        break;
      case 'tool_call_arguments_delta':
        config.onToolCallArgsDelta(event);
        break;
      case 'tool_call_stream_complete':
        config.onToolCallComplete(event);
        break;
      case 'tool_execution_start':
        config.onToolExecStart(event);
        break;
      case 'tool_execution_output':
        config.onToolExecOutput(event);
        break;
      case 'tool_execution_stream':
        config.onToolExecStream(event);
        break;
      case 'reasoning':
        config.onReasoning(event);
        break;
      case 'structured_output_delta':
        config.onStructuredDelta(event);
        break;
      case 'error':
        config.onError(event);
        break;
      case 'done':
        config.onDone(event);
        break;
    }
  };
}
```

---

## Layer 3: Accumulators (The Performance Secret)

### Text Accumulator - RAF Batching + Direct DOM

```typescript
// packages/core/src/streaming/accumulators/text.ts

export class TextAccumulator {
  private buffer: string[] = [];
  private rafId: number | null = null;
  private totalText = '';
  private domTarget: HTMLElement | null = null;
  private subscribers = new Set<(text: string) => void>();

  // Option 1: Direct DOM manipulation (fastest)
  attachToDOM(element: HTMLElement) {
    this.domTarget = element;
  }

  // Option 2: Subscribe to batched updates (for React)
  subscribe(callback: (text: string) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  append(content: string) {
    this.buffer.push(content);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.flush();
      this.rafId = null;
    });
  }

  private flush() {
    if (this.buffer.length === 0) return;

    const chunk = this.buffer.join('');
    this.buffer = [];
    this.totalText += chunk;

    // Direct DOM update (bypasses React entirely)
    if (this.domTarget) {
      // Use textContent for plain text (faster than innerHTML)
      // Append only the new chunk, don't rewrite entire content
      this.domTarget.appendChild(document.createTextNode(chunk));
    }

    // Notify React subscribers with full text
    for (const sub of this.subscribers) {
      sub(this.totalText);
    }
  }

  getText(): string {
    return this.totalText + this.buffer.join('');
  }

  reset() {
    this.buffer = [];
    this.totalText = '';
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.domTarget) {
      this.domTarget.textContent = '';
    }
  }

  destroy() {
    this.reset();
    this.subscribers.clear();
    this.domTarget = null;
  }
}
```

### Tool State Manager - Batched React Updates

```typescript
// packages/core/src/streaming/accumulators/tools.ts

interface ToolCallState {
  id: string;
  toolName: string;
  status: 'streaming_args' | 'args_complete' | 'executing' | 'complete' | 'error';
  arguments: string;
  parsedArguments?: unknown;
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

export class ToolStateManager {
  private tools = new Map<string, ToolCallState>();
  private pendingUpdates = new Map<string, Partial<ToolCallState>>();
  private rafId: number | null = null;
  private subscribers = new Set<(tools: ToolCallState[]) => void>();

  subscribe(callback: (tools: ToolCallState[]) => void) {
    this.subscribers.add(callback);
    // Immediately send current state
    callback(this.getToolsArray());
    return () => this.subscribers.delete(callback);
  }

  handleToolCallStart(event: ToolCallStartEvent) {
    this.tools.set(event.id, {
      id: event.id,
      toolName: event.toolName,
      status: 'streaming_args',
      arguments: '',
      startTime: Date.now(),
    });
    this.scheduleNotify();
  }

  handleToolCallArgsDelta(event: ToolCallArgsDeltaEvent) {
    const tool = this.tools.get(event.id);
    if (!tool) return;

    // Accumulate arguments without notifying (high frequency)
    tool.arguments += event.argumentsDelta;

    // Batch notification
    this.pendingUpdates.set(event.id, { arguments: tool.arguments });
    this.scheduleNotify();
  }

  handleToolCallComplete(event: ToolCallCompleteEvent) {
    const tool = this.tools.get(event.id);
    if (!tool) return;

    tool.status = 'args_complete';
    tool.parsedArguments = event.arguments;
    this.scheduleNotify();
  }

  handleToolExecStart(event: ToolExecStartEvent) {
    const tool = this.tools.get(event.id);
    if (!tool) return;

    tool.status = 'executing';
    this.scheduleNotify();
  }

  handleToolExecOutput(event: ToolExecOutputEvent) {
    const tool = this.tools.get(event.id);
    if (!tool) return;

    tool.status = event.error ? 'error' : 'complete';
    tool.result = event.result;
    tool.error = event.error;
    tool.endTime = Date.now();
    this.scheduleNotify();
  }

  private scheduleNotify() {
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.notify();
      this.rafId = null;
    });
  }

  private notify() {
    const toolsArray = this.getToolsArray();
    for (const sub of this.subscribers) {
      sub(toolsArray);
    }
    this.pendingUpdates.clear();
  }

  private getToolsArray(): ToolCallState[] {
    return Array.from(this.tools.values());
  }

  reset() {
    this.tools.clear();
    this.pendingUpdates.clear();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
```

### JSON Accumulator - Web Worker Parsing

```typescript
// packages/core/src/streaming/accumulators/json.ts

// Main thread
export class JSONAccumulator {
  private buffer = '';
  private worker: Worker | null = null;
  private subscribers = new Set<(value: unknown, isComplete: boolean) => void>();
  private lastParsedValue: unknown = undefined;

  constructor() {
    // Only create worker if available (not in SSR)
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('./json-worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e) => {
        const { type, value, isComplete } = e.data;
        if (type === 'parsed') {
          this.lastParsedValue = value;
          for (const sub of this.subscribers) {
            sub(value, isComplete);
          }
        }
      };
    }
  }

  subscribe(callback: (value: unknown, isComplete: boolean) => void) {
    this.subscribers.add(callback);
    if (this.lastParsedValue !== undefined) {
      callback(this.lastParsedValue, false);
    }
    return () => this.subscribers.delete(callback);
  }

  append(content: string) {
    this.buffer += content;

    if (this.worker) {
      // Offload parsing to worker
      this.worker.postMessage({ type: 'parse', json: this.buffer });
    } else {
      // Fallback: parse on main thread (debounced)
      this.parseOnMainThread();
    }
  }

  private parseDebounceId: number | null = null;

  private parseOnMainThread() {
    if (this.parseDebounceId !== null) {
      clearTimeout(this.parseDebounceId);
    }

    this.parseDebounceId = window.setTimeout(() => {
      try {
        const value = parsePartialJSON(this.buffer);
        this.lastParsedValue = value;
        for (const sub of this.subscribers) {
          sub(value, false);
        }
      } catch (e) {
        // Invalid JSON, wait for more
      }
    }, 50); // Debounce parsing to every 50ms
  }

  complete() {
    try {
      const value = JSON.parse(this.buffer);
      for (const sub of this.subscribers) {
        sub(value, true);
      }
    } catch (e) {
      // Final parse failed
    }
  }

  destroy() {
    this.worker?.terminate();
    this.subscribers.clear();
  }
}

// json-worker.ts (Web Worker)
import { parsePartialJSON } from './partial-json';

self.onmessage = (e) => {
  const { type, json } = e.data;

  if (type === 'parse') {
    try {
      const value = parsePartialJSON(json);
      self.postMessage({ type: 'parsed', value, isComplete: false });
    } catch (error) {
      // Can't parse yet, wait for more data
    }
  }
};
```

---

## Layer 4: React Components

### StreamingText - Direct DOM with React Shell

```tsx
// packages/ui/src/components/streaming/StreamingText.tsx

import { useRef, useEffect, memo } from 'react';
import { TextAccumulator } from '@baleyui/core';

interface StreamingTextProps {
  accumulator: TextAccumulator;
  className?: string;
  showCursor?: boolean;
}

export const StreamingText = memo(function StreamingText({
  accumulator,
  className,
  showCursor = true,
}: StreamingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!textRef.current) return;

    // Attach accumulator directly to DOM element
    accumulator.attachToDOM(textRef.current);

    return () => {
      accumulator.reset();
    };
  }, [accumulator]);

  return (
    <div ref={containerRef} className={className}>
      <span ref={textRef} className="streaming-text" />
      {showCursor && (
        <span className="streaming-cursor" aria-hidden="true" />
      )}
    </div>
  );
});

// CSS (GPU-accelerated animations)
/*
.streaming-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: currentColor;
  margin-left: 1px;
  animation: cursor-blink 1s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes cursor-blink {
  50% { opacity: 0; }
}
*/
```

### ToolCallCard - Memoized with Stable Props

```tsx
// packages/ui/src/components/streaming/ToolCallCard.tsx

import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ToolCallCardProps {
  tool: ToolCallState;
}

// Animations using CSS transforms (GPU accelerated)
const cardVariants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

export const ToolCallCard = memo(function ToolCallCard({ tool }: ToolCallCardProps) {
  // Memoize derived data
  const duration = useMemo(() => {
    if (!tool.endTime) return null;
    return tool.endTime - tool.startTime;
  }, [tool.startTime, tool.endTime]);

  const statusConfig = useMemo(() => {
    switch (tool.status) {
      case 'streaming_args':
        return { icon: '...', color: 'text-blue-500', label: 'Preparing' };
      case 'args_complete':
        return { icon: '✓', color: 'text-blue-500', label: 'Ready' };
      case 'executing':
        return { icon: '⟳', color: 'text-yellow-500', label: 'Running', spin: true };
      case 'complete':
        return { icon: '✓', color: 'text-green-500', label: 'Done' };
      case 'error':
        return { icon: '✕', color: 'text-red-500', label: 'Error' };
    }
  }, [tool.status]);

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      className="tool-card"
    >
      {/* Header */}
      <div className="tool-card-header">
        <span className={`tool-status-icon ${statusConfig.color} ${statusConfig.spin ? 'animate-spin' : ''}`}>
          {statusConfig.icon}
        </span>
        <span className="tool-name">{tool.toolName}</span>
        {duration && (
          <span className="tool-duration">{duration}ms</span>
        )}
      </div>

      {/* Arguments */}
      <ToolArguments
        status={tool.status}
        rawArgs={tool.arguments}
        parsedArgs={tool.parsedArguments}
      />

      {/* Result */}
      {tool.status === 'complete' && tool.result && (
        <ToolResult result={tool.result} />
      )}

      {/* Error */}
      {tool.status === 'error' && tool.error && (
        <ToolError error={tool.error} />
      )}
    </motion.div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render on meaningful changes
  const prev = prevProps.tool;
  const next = nextProps.tool;

  return (
    prev.status === next.status &&
    prev.arguments === next.arguments &&
    prev.result === next.result &&
    prev.error === next.error
  );
});

// Sub-components are also memoized
const ToolArguments = memo(function ToolArguments({
  status,
  rawArgs,
  parsedArgs
}: {
  status: string;
  rawArgs: string;
  parsedArgs?: unknown;
}) {
  if (status === 'streaming_args') {
    // Show raw streaming args with typing effect
    return (
      <pre className="tool-args streaming">
        <code>{rawArgs}</code>
        <span className="streaming-cursor" />
      </pre>
    );
  }

  // Show pretty-printed parsed args
  return (
    <pre className="tool-args">
      <code>{JSON.stringify(parsedArgs, null, 2)}</code>
    </pre>
  );
});

const ToolResult = memo(function ToolResult({ result }: { result: unknown }) {
  const formatted = useMemo(() => {
    if (typeof result === 'string') return result;
    return JSON.stringify(result, null, 2);
  }, [result]);

  return (
    <div className="tool-result">
      <pre><code>{formatted}</code></pre>
    </div>
  );
});

const ToolError = memo(function ToolError({ error }: { error: string }) {
  return (
    <div className="tool-error">
      <span className="error-icon">⚠</span>
      <span>{error}</span>
    </div>
  );
});
```

### Auto-Scroll Container - No Layout Thrashing

```tsx
// packages/ui/src/components/streaming/AutoScrollContainer.tsx

import { useRef, useEffect, useCallback, memo } from 'react';

interface AutoScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  enabled?: boolean;
  threshold?: number; // Distance from bottom to maintain auto-scroll
}

export const AutoScrollContainer = memo(function AutoScrollContainer({
  children,
  className,
  enabled = true,
  threshold = 100,
}: AutoScrollContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const rafId = useRef<number | null>(null);

  // Check if user has scrolled up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Read layout only once
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    shouldAutoScroll.current = distanceFromBottom < threshold;
  }, [threshold]);

  // Scroll to bottom using RAF to avoid layout thrashing
  const scrollToBottom = useCallback(() => {
    if (!shouldAutoScroll.current || !enabled) return;

    // Cancel any pending scroll
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }

    rafId.current = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;

      // Single layout read + write in same frame
      el.scrollTop = el.scrollHeight;
      rafId.current = null;
    });
  }, [enabled]);

  // Observe content changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      scrollToBottom();
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [scrollToBottom]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={className}
      style={{
        overflowY: 'auto',
        // Use CSS scroll-behavior for smooth scrolling
        scrollBehavior: shouldAutoScroll.current ? 'auto' : 'smooth',
      }}
    >
      {children}
    </div>
  );
});
```

---

## Layer 5: CSS Animations (GPU Only)

```css
/* packages/ui/src/styles/streaming.css */

/* All animations use transform/opacity (GPU accelerated) */

/* Cursor blink */
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1.2em;
  background: currentColor;
  animation: cursor-blink 1s step-end infinite;
  will-change: opacity;
}

/* Tool card entrance */
.tool-card {
  will-change: transform, opacity;
}

/* Spinner for executing state */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
  will-change: transform;
}

/* Skeleton loading */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.skeleton {
  position: relative;
  overflow: hidden;
  background: var(--color-muted);
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  animation: shimmer 1.5s infinite;
  will-change: transform;
}

/* Status dot pulse */
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
}

.status-dot-streaming {
  animation: pulse 1.5s ease-in-out infinite;
  will-change: transform, opacity;
}

/* Thinking panel expansion */
.thinking-panel {
  transition: max-height 0.3s ease-out, opacity 0.2s ease-out;
  will-change: max-height, opacity;
}

.thinking-panel[data-collapsed="true"] {
  max-height: 0;
  opacity: 0;
}

.thinking-panel[data-collapsed="false"] {
  max-height: 500px;
  opacity: 1;
}
```

---

## Complete Hook: useBlockStream

```typescript
// packages/core/src/streaming/useBlockStream.ts

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseBlockStreamOptions {
  blockId: string;
  onComplete?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

interface StreamMetrics {
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';
  ttft: number | null;  // Time to first token
  tokensPerSecond: number | null;
  totalTokens: number;
  startTime: number | null;
  firstTokenTime: number | null;
}

export function useBlockStream({ blockId, onComplete, onError }: UseBlockStreamOptions) {
  // Accumulators (stable references)
  const textAccumulator = useRef(new TextAccumulator());
  const toolManager = useRef(new ToolStateManager());
  const jsonAccumulator = useRef(new JSONAccumulator());
  const thinkingAccumulator = useRef(new TextAccumulator());

  // React state (batched updates)
  const [tools, setTools] = useState<ToolCallState[]>([]);
  const [structuredOutput, setStructuredOutput] = useState<unknown>(null);
  const [metrics, setMetrics] = useState<StreamMetrics>({
    status: 'idle',
    ttft: null,
    tokensPerSecond: null,
    totalTokens: 0,
    startTime: null,
    firstTokenTime: null,
  });

  // Token counting for metrics
  const tokenCount = useRef(0);

  // Subscribe to tool state changes
  useEffect(() => {
    return toolManager.current.subscribe(setTools);
  }, []);

  // Subscribe to JSON updates
  useEffect(() => {
    return jsonAccumulator.current.subscribe((value, isComplete) => {
      setStructuredOutput(value);
    });
  }, []);

  // Abort controller for cancellation
  const abortController = useRef<AbortController | null>(null);

  const execute = useCallback(async (input: unknown) => {
    // Reset state
    textAccumulator.current.reset();
    toolManager.current.reset();
    thinkingAccumulator.current.reset();
    tokenCount.current = 0;

    const startTime = Date.now();
    let firstTokenTime: number | null = null;

    setMetrics({
      status: 'connecting',
      ttft: null,
      tokensPerSecond: null,
      totalTokens: 0,
      startTime,
      firstTokenTime: null,
    });

    // Create abort controller
    abortController.current = new AbortController();

    // Create event router
    const router = createEventRouter({
      onTextDelta: (event) => {
        if (firstTokenTime === null) {
          firstTokenTime = Date.now();
          setMetrics(m => ({
            ...m,
            status: 'streaming',
            ttft: firstTokenTime! - startTime,
            firstTokenTime,
          }));
        }

        tokenCount.current++;
        textAccumulator.current.append(event.content);
      },

      onToolCallStart: (event) => {
        toolManager.current.handleToolCallStart(event);
      },

      onToolCallArgsDelta: (event) => {
        toolManager.current.handleToolCallArgsDelta(event);
      },

      onToolCallComplete: (event) => {
        toolManager.current.handleToolCallComplete(event);
      },

      onToolExecStart: (event) => {
        toolManager.current.handleToolExecStart(event);
      },

      onToolExecOutput: (event) => {
        toolManager.current.handleToolExecOutput(event);
      },

      onToolExecStream: (event) => {
        // Handle nested bot streams
        // Could recursively process or emit to nested UI
        toolManager.current.handleNestedEvent(event);
      },

      onReasoning: (event) => {
        thinkingAccumulator.current.append(event.content);
      },

      onStructuredDelta: (event) => {
        jsonAccumulator.current.append(event.content);
      },

      onError: (event) => {
        setMetrics(m => ({ ...m, status: 'error' }));
        onError?.(event.error);
      },

      onDone: (event) => {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        setMetrics(m => ({
          ...m,
          status: 'complete',
          totalTokens: tokenCount.current,
          tokensPerSecond: duration > 0 ? tokenCount.current / duration : null,
        }));

        jsonAccumulator.current.complete();
      },
    });

    try {
      await createStreamTransport({
        url: `/api/blocks/${blockId}/execute`,
        onEvent: router,
        onError: (error) => {
          setMetrics(m => ({ ...m, status: 'error' }));
          onError?.(error);
        },
        onComplete: () => {
          onComplete?.(structuredOutput);
        },
        signal: abortController.current.signal,
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        setMetrics(m => ({ ...m, status: 'error' }));
        onError?.(error as Error);
      }
    }
  }, [blockId, onComplete, onError, structuredOutput]);

  const cancel = useCallback(() => {
    abortController.current?.abort();
    setMetrics(m => ({ ...m, status: 'idle' }));
  }, []);

  const reset = useCallback(() => {
    textAccumulator.current.reset();
    toolManager.current.reset();
    jsonAccumulator.current.reset();
    thinkingAccumulator.current.reset();
    setTools([]);
    setStructuredOutput(null);
    setMetrics({
      status: 'idle',
      ttft: null,
      tokensPerSecond: null,
      totalTokens: 0,
      startTime: null,
      firstTokenTime: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortController.current?.abort();
      textAccumulator.current.destroy();
      jsonAccumulator.current.destroy();
    };
  }, []);

  return {
    // Accumulators (for direct DOM attachment)
    textAccumulator: textAccumulator.current,
    thinkingAccumulator: thinkingAccumulator.current,

    // React state
    tools,
    structuredOutput,
    metrics,

    // Actions
    execute,
    cancel,
    reset,
  };
}
```

---

## Memory Management

### Cleanup Patterns

```typescript
// Always cleanup subscriptions
useEffect(() => {
  const unsub = accumulator.subscribe(handler);
  return () => unsub();
}, []);

// Always cancel pending RAF
useEffect(() => {
  return () => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
  };
}, []);

// Always abort ongoing requests
useEffect(() => {
  return () => {
    abortController.current?.abort();
  };
}, []);

// Terminate workers
useEffect(() => {
  return () => {
    worker.current?.terminate();
  };
}, []);
```

### Memory Limits for Long Sessions

```typescript
// For very long outputs, consider trimming
class TextAccumulator {
  private maxLength = 1_000_000; // 1MB limit

  private flush() {
    // ... existing code ...

    // Trim if too long (keep last 90%)
    if (this.totalText.length > this.maxLength) {
      this.totalText = this.totalText.slice(-this.maxLength * 0.9);
      // Update DOM if attached
      if (this.domTarget) {
        this.domTarget.textContent = this.totalText;
      }
    }
  }
}
```

---

## Virtualization (For Very Long Outputs)

For outputs exceeding ~10K tokens, consider virtualization:

```tsx
// packages/ui/src/components/streaming/VirtualizedOutput.tsx

import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedOutput({ lines }: { lines: string[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24, // Estimated line height
    overscan: 20, // Render 20 extra items above/below
  });

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {lines[virtualItem.index]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Performance Checklist

### Build Time
- [ ] Tree-shake unused Framer Motion features
- [ ] Code-split streaming components
- [ ] Minimize CSS (remove unused animations)

### Runtime
- [ ] Direct DOM manipulation for text streaming
- [ ] RAF batching for all accumulators
- [ ] Web Worker for JSON parsing
- [ ] Memoized components with custom comparators
- [ ] CSS-only animations (no JS)
- [ ] No layout thrashing in scroll handlers
- [ ] AbortController for request cancellation

### Memory
- [ ] Cleanup all subscriptions on unmount
- [ ] Terminate workers on unmount
- [ ] Cancel pending RAF on unmount
- [ ] Trim very long outputs
- [ ] Virtualize if >10K lines

### Testing
- [ ] Profile with React DevTools Profiler
- [ ] Test with 60fps target during streaming
- [ ] Test memory growth over 10-minute session
- [ ] Test on M1 MacBook Air with Chrome DevTools
- [ ] Test with throttled CPU (4x slowdown)
