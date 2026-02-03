# Streaming Performance Review

> Analysis of potential bottlenecks and optimization strategies

---

## Architecture Review Summary

The proposed architecture addresses the main performance killers:

| Issue | Solution | Status |
|-------|----------|--------|
| Re-render on every token | RAF batching + direct DOM | Solved |
| String concatenation | Append to existing node | Solved |
| Layout thrashing | Single RAF for scroll | Solved |
| JSON parsing cost | Web Worker offload | Solved |
| Memory leaks | Explicit cleanup patterns | Solved |

---

## Remaining Bottlenecks & Optimizations

### 1. React Reconciliation for Tool Cards

**Issue**: Tool cards still use React state. With 5+ concurrent tool calls, we could see jank.

**Current**:
```typescript
const [tools, setTools] = useState<ToolCallState[]>([]);
// Called on every tool state change → React reconciles array
```

**Optimization Option A: Stable Keys + Memo**
```typescript
// Already using memo, but ensure keys are stable
{tools.map(tool => (
  <ToolCallCard key={tool.id} tool={tool} />  // ID is stable
))}
```

**Optimization Option B: Individual State per Tool**
```typescript
// Instead of array state, use a Map with individual subscribers
const ToolCardContainer = memo(({ toolId }) => {
  const [tool, setTool] = useState<ToolCallState | null>(null);

  useEffect(() => {
    return toolManager.subscribeToTool(toolId, setTool);
  }, [toolId]);

  if (!tool) return null;
  return <ToolCallCard tool={tool} />;
});
```

**Recommendation**: Start with Option A. Only move to B if profiling shows tool card renders as a bottleneck.

---

### 2. Nested Bot Streams (Recursive Rendering)

**Issue**: `tool_execution_stream` events contain nested events from spawned bots. This creates recursive UI that could compound performance issues.

**Current Design**:
```typescript
onToolExecStream: (event) => {
  // This is called for EVERY event from child bot
  toolManager.current.handleNestedEvent(event);
}
```

**Potential Problem**:
- Parent bot streams 100 tokens
- Parent bot spawns 3 child bots
- Each child streams 100 tokens
- Total: 400 events, each bubbling through parent

**Optimizations**:

**A. Separate Accumulator per Nested Bot**
```typescript
class ToolStateManager {
  private nestedAccumulators = new Map<string, TextAccumulator>();

  handleNestedEvent(event: ToolExecStreamEvent) {
    const { toolCallId, nestedEvent } = event;

    // Get or create accumulator for this tool's nested stream
    if (!this.nestedAccumulators.has(toolCallId)) {
      this.nestedAccumulators.set(toolCallId, new TextAccumulator());
    }

    const accumulator = this.nestedAccumulators.get(toolCallId)!;

    if (nestedEvent.type === 'text_delta') {
      // Direct DOM append, no React
      accumulator.append(nestedEvent.content);
    }
  }
}
```

**B. Depth Limit**
```typescript
// Don't render nested streams beyond depth 2
const MAX_NESTED_DEPTH = 2;

function NestedStreamRenderer({ event, depth = 0 }) {
  if (depth >= MAX_NESTED_DEPTH) {
    return <CollapsedNestedIndicator count={event.childCount} />;
  }

  return <FullNestedStream event={event} depth={depth + 1} />;
}
```

**Recommendation**: Implement both. Separate accumulators prevent event storms from causing React re-renders. Depth limit prevents UI complexity explosion.

---

### 3. JSON Syntax Highlighting

**Issue**: Syntax highlighting large JSON during streaming could be expensive.

**Current**:
```typescript
// Naive: re-highlight entire JSON on every update
<pre>
  <code dangerouslySetInnerHTML={{ __html: highlight(json) }} />
</pre>
```

**Optimization: Incremental Highlighting**
```typescript
// Only highlight the visible portion, update incrementally
class IncrementalJSONHighlighter {
  private highlighted = '';
  private pendingText = '';

  append(newText: string) {
    this.pendingText += newText;

    // Only re-highlight when we have complete tokens
    const lastCompleteToken = this.findLastCompleteToken(this.pendingText);
    if (lastCompleteToken > 0) {
      const toHighlight = this.pendingText.slice(0, lastCompleteToken);
      this.highlighted += this.highlightChunk(toHighlight);
      this.pendingText = this.pendingText.slice(lastCompleteToken);
    }
  }

  private findLastCompleteToken(text: string): number {
    // Find last complete JSON token (string, number, bracket, comma)
    // This prevents re-parsing incomplete tokens
  }
}
```

**Alternative: Defer Highlighting**
```typescript
// Show plain text during streaming, highlight when complete
const [isComplete, setIsComplete] = useState(false);

return isComplete ? (
  <HighlightedJSON json={json} />
) : (
  <PlainJSON json={json} />  // No highlighting overhead
);
```

**Recommendation**: Defer highlighting until complete. Users care more about seeing the data than syntax colors during streaming.

---

### 4. Framer Motion Bundle Size

**Issue**: Framer Motion is ~30KB gzipped. We're only using simple animations.

**Current**:
```typescript
import { motion, AnimatePresence } from 'framer-motion';
```

**Optimization Options**:

**A. Use CSS Only (Recommended)**
```css
/* Replace Framer Motion with CSS */
.tool-card {
  animation: slideIn 200ms ease-out;
}

.tool-card.exiting {
  animation: slideOut 150ms ease-in forwards;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-10px); }
}
```

**B. Use Framer Motion Lite**
```typescript
import { m, LazyMotion, domAnimation } from 'framer-motion';

// Only loads ~5KB instead of 30KB
function App() {
  return (
    <LazyMotion features={domAnimation} strict>
      <m.div animate={{ opacity: 1 }} />
    </LazyMotion>
  );
}
```

**Recommendation**: Use CSS for streaming components. Reserve Framer Motion for complex interactions (drag-and-drop in flow canvas).

---

### 5. Memory Growth in Long Sessions

**Issue**: A 30-minute session with continuous streaming could accumulate significant memory.

**Analysis**:
- 50 tokens/second × 5 chars/token × 1800 seconds = 450KB text
- Plus: tool states, parsed JSON, DOM nodes

**Optimizations**:

**A. Rolling Window for Text**
```typescript
class TextAccumulator {
  private maxChars = 500_000; // 500KB limit

  private flush() {
    // ... existing code ...

    if (this.totalText.length > this.maxChars) {
      // Keep last 80%, show "[truncated]" indicator
      this.totalText = '[... truncated ...]\n' +
        this.totalText.slice(-this.maxChars * 0.8);
      this.rebuildDOM();
    }
  }
}
```

**B. Conversation Chunking**
```typescript
// Split long conversations into chunks
const MESSAGES_PER_CHUNK = 20;

function MessageList({ messages }) {
  const [visibleChunks, setVisibleChunks] = useState(1);
  const totalChunks = Math.ceil(messages.length / MESSAGES_PER_CHUNK);

  // Only render recent chunks, virtualize older ones
  const visibleMessages = messages.slice(
    Math.max(0, messages.length - MESSAGES_PER_CHUNK * visibleChunks)
  );

  return (
    <>
      {visibleChunks < totalChunks && (
        <button onClick={() => setVisibleChunks(v => v + 1)}>
          Load older messages
        </button>
      )}
      {visibleMessages.map(msg => <Message key={msg.id} {...msg} />)}
    </>
  );
}
```

**C. Periodic Cleanup**
```typescript
// In useBlockStream
useEffect(() => {
  // Every 5 minutes, suggest garbage collection
  const interval = setInterval(() => {
    if (metrics.status === 'idle') {
      // Clear accumulated state when not streaming
      textAccumulator.current.compact();
      toolManager.current.archiveCompleted();
    }
  }, 5 * 60 * 1000);

  return () => clearInterval(interval);
}, []);
```

**Recommendation**: Implement all three. Memory management is critical for a dashboard that runs all day.

---

### 6. Server-Sent Events Connection Management

**Issue**: Browser limits concurrent SSE connections (6 per domain in most browsers).

**Current**:
- Each block test opens its own SSE connection
- User could have multiple tabs
- Could hit connection limit

**Optimizations**:

**A. Connection Pooling**
```typescript
// Single SSE connection multiplexed for multiple blocks
class StreamConnectionPool {
  private connection: EventSource | null = null;
  private subscriptions = new Map<string, Set<(event: any) => void>>();

  subscribe(blockId: string, handler: (event: any) => void) {
    if (!this.subscriptions.has(blockId)) {
      this.subscriptions.set(blockId, new Set());
    }
    this.subscriptions.get(blockId)!.add(handler);

    this.ensureConnection();

    return () => {
      this.subscriptions.get(blockId)?.delete(handler);
      this.maybeCloseConnection();
    };
  }

  private ensureConnection() {
    if (this.connection) return;

    this.connection = new EventSource('/api/stream');
    this.connection.onmessage = (e) => {
      const { blockId, event } = JSON.parse(e.data);
      this.subscriptions.get(blockId)?.forEach(h => h(event));
    };
  }
}
```

**B. POST-based Streaming (Current Approach)**
```typescript
// Using fetch + ReadableStream doesn't count against SSE limit
// This is what we already have - good!
const response = await fetch('/api/blocks/${id}/execute', {
  method: 'POST',
  body: JSON.stringify({ input }),
});

const reader = response.body.getReader();
// ... not limited like EventSource
```

**Recommendation**: Keep POST-based streaming. It sidesteps browser SSE limits entirely.

---

### 7. React 18 Concurrent Features

**Issue**: Are we taking advantage of React 18's concurrent rendering?

**Optimization: Use Transitions for Non-Urgent Updates**
```typescript
import { useTransition, useDeferredValue } from 'react';

function ToolList({ tools }) {
  // Defer updates to tool list (non-urgent)
  const deferredTools = useDeferredValue(tools);

  return (
    <div>
      {deferredTools.map(tool => (
        <ToolCallCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
}

function StreamingOutput({ output }) {
  const [isPending, startTransition] = useTransition();

  const handleStructuredOutput = useCallback((value) => {
    // Mark JSON updates as non-urgent
    startTransition(() => {
      setStructuredOutput(value);
    });
  }, []);
}
```

**Recommendation**: Use `useDeferredValue` for tool list and structured output. Keep text streaming as urgent (direct DOM).

---

## Final Performance Budget

| Resource | Budget | Measurement |
|----------|--------|-------------|
| JS Bundle (streaming) | <50KB gzipped | Webpack analyzer |
| First token paint | <50ms | Performance.mark |
| Frame rate | 60fps | Chrome DevTools |
| Memory (10 min session) | <100MB | Memory profiler |
| CPU during streaming | <30% | Chrome DevTools |
| Layout shifts | 0 CLS | Lighthouse |

---

## Testing Strategy

### Automated Performance Tests

```typescript
// packages/core/src/__tests__/streaming.perf.test.ts

describe('Streaming Performance', () => {
  it('should maintain 60fps during token streaming', async () => {
    const accumulator = new TextAccumulator();
    const frameDrops: number[] = [];

    let lastFrameTime = performance.now();
    const checkFrame = () => {
      const now = performance.now();
      const delta = now - lastFrameTime;
      if (delta > 20) { // >20ms = dropped frame at 60fps
        frameDrops.push(delta);
      }
      lastFrameTime = now;
    };

    // Simulate 1000 tokens at 50/sec
    for (let i = 0; i < 1000; i++) {
      accumulator.append('token ');
      checkFrame();
      await new Promise(r => setTimeout(r, 20));
    }

    expect(frameDrops.length).toBeLessThan(10); // Allow <1% frame drops
  });

  it('should not exceed memory budget', async () => {
    const initialMemory = performance.memory?.usedJSHeapSize || 0;

    const accumulator = new TextAccumulator();

    // Simulate 10K tokens
    for (let i = 0; i < 10000; i++) {
      accumulator.append('token ');
    }

    const finalMemory = performance.memory?.usedJSHeapSize || 0;
    const memoryGrowth = finalMemory - initialMemory;

    expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // <10MB
  });
});
```

### Manual Testing Checklist

- [ ] Stream 5000 tokens continuously - check for jank
- [ ] Open 5 concurrent tool executions - check frame rate
- [ ] Run for 30 minutes - check memory growth
- [ ] Test on M1 MacBook Air with 8GB RAM
- [ ] Test with Chrome CPU throttling (4x slowdown)
- [ ] Test with slow 3G network throttling

---

## Summary: What We Need to Do

### Must Have (Phase 1)
1. Direct DOM text accumulator with RAF batching
2. Memoized tool cards with stable keys
3. CSS-only animations (no Framer Motion for streaming)
4. Web Worker for JSON parsing
5. Proper cleanup on unmount

### Should Have (Phase 1.5)
1. Memory limits with truncation
2. Deferred syntax highlighting
3. React 18 useDeferredValue for non-urgent updates
4. Performance tests in CI

### Nice to Have (Phase 2)
1. Virtualization for very long outputs
2. Nested stream depth limiting
3. Connection pooling (if we need concurrent streams)
4. Incremental JSON highlighting

---

## Decision: Framer Motion

**Verdict**: Remove Framer Motion from streaming components.

**Why**:
- Adds 25-30KB to bundle
- CSS animations are sufficient for our use cases
- GPU-accelerated CSS is actually faster
- One less dependency to maintain

**Where to keep Framer Motion**:
- Flow canvas (complex drag/drop interactions)
- Page transitions (if we add them)
- Modal animations (if CSS isn't sufficient)

---

## Appendix: Benchmarks to Run

```bash
# Bundle size
npx bundlephobia @baleyui/ui

# Lighthouse
npx lighthouse http://localhost:3000/blocks/test --only-categories=performance

# Memory profiling
# Use Chrome DevTools > Memory > Allocation instrumentation on timeline

# CPU profiling during streaming
# Use Chrome DevTools > Performance > Record while streaming
```
