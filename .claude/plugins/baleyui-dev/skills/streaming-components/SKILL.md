---
name: streaming-components
description: Performance patterns for streaming UI - RAF batching, DOM manipulation, CSS animations
---

# Streaming UI Components

Performance targets: 60fps, <50ms time to first token.

## Core Pattern: RAF Batching

```typescript
// DON'T update React state per token
const [text, setText] = useState(''); // BAD

// DO use RAF batching with direct DOM
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const textNode = document.createTextNode('');
  containerRef.current?.appendChild(textNode);

  let buffer = '';
  let rafId = 0;

  const flush = () => {
    textNode.textContent += buffer;
    buffer = '';
    rafId = 0;
  };

  stream.on('text_delta', (event) => {
    buffer += event.content;
    if (!rafId) rafId = requestAnimationFrame(flush);
  });

  return () => { if (rafId) cancelAnimationFrame(rafId); };
}, [stream]);
```

## Animations: CSS Only

```css
/* DON'T use Framer Motion */
/* DO use CSS animations */
.streaming-cursor {
  animation: pulse 1s ease-in-out infinite;
}
```

## SSE Reconnection

Always implement exponential backoff reconnection for EventSource connections.
