# BaleyUI Coding Guidelines

> Modern patterns for Next.js 15, React 19, and the BaleyBots ecosystem.

**Last Updated**: December 2024

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [React 19 Patterns](#react-19-patterns)
3. [Next.js 15 Patterns](#nextjs-15-patterns)
4. [Server vs Client Components](#server-vs-client-components)
5. [Data Fetching](#data-fetching)
6. [State Management](#state-management)
7. [Streaming & Real-Time](#streaming--real-time)
8. [BaleyBots Integration](#baleybots-integration)
9. [Styling](#styling)
10. [TypeScript](#typescript)
11. [Performance](#performance)
12. [Testing](#testing)
13. [Common Mistakes to Avoid](#common-mistakes-to-avoid)

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js | 15.1+ |
| UI Library | React | 19.0+ |
| Language | TypeScript | 5.7+ |
| Styling | Tailwind CSS | 3.4+ |
| Components | shadcn/ui + Radix | Latest |
| Flow Editor | @xyflow/react | 12.3+ |
| State | Zustand | 5.0+ |
| Server State | TanStack Query | 5.62+ |
| API | tRPC | 11.0+ |
| Database | PostgreSQL + Drizzle | 0.38+ |
| Auth | Clerk | 6.9+ |
| AI Runtime | BaleyBots | Latest |

---

## React 19 Patterns

### The React Compiler (Automatic Memoization)

React 19 includes a compiler that automatically memoizes components. **Do not manually add `useMemo`, `useCallback`, or `React.memo` unless profiling shows a specific need.**

```tsx
// BAD - React 19 handles this automatically
const MemoizedComponent = React.memo(({ data }) => {
  const processed = useMemo(() => expensiveCalc(data), [data]);
  const handler = useCallback(() => doSomething(), []);
  return <div onClick={handler}>{processed}</div>;
});

// GOOD - Let React 19 compiler optimize
function Component({ data }) {
  const processed = expensiveCalc(data);
  const handler = () => doSomething();
  return <div onClick={handler}>{processed}</div>;
}
```

### The `use()` Hook

React 19 introduces `use()` for reading resources (Promises, Context) in render:

```tsx
// Reading a Promise
function UserProfile({ userPromise }) {
  const user = use(userPromise); // Suspends until resolved
  return <div>{user.name}</div>;
}

// Reading Context (can now be used conditionally!)
function ConditionalTheme({ showTheme }) {
  if (showTheme) {
    const theme = use(ThemeContext);
    return <div style={{ color: theme.primary }}>Themed</div>;
  }
  return <div>Default</div>;
}
```

### Actions (Form Handling)

React 19 Actions replace the old form handling patterns:

```tsx
// BAD - Old pattern
function OldForm() {
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsPending(true);
    await submitData(new FormData(e.target));
    setIsPending(false);
  }

  return <form onSubmit={handleSubmit}>...</form>;
}

// GOOD - React 19 Actions
function ModernForm() {
  async function submitAction(formData: FormData) {
    'use server';
    await saveToDatabase(formData);
  }

  return (
    <form action={submitAction}>
      <input name="title" />
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Saving...' : 'Save'}</button>;
}
```

### `useOptimistic` Hook

For optimistic UI updates:

```tsx
function TodoList({ todos }) {
  const [optimisticTodos, addOptimistic] = useOptimistic(
    todos,
    (state, newTodo) => [...state, { ...newTodo, pending: true }]
  );

  async function addTodo(formData: FormData) {
    const title = formData.get('title');
    addOptimistic({ id: Date.now(), title, pending: true });
    await saveTodo({ title });
  }

  return (
    <>
      {optimisticTodos.map(todo => (
        <div key={todo.id} style={{ opacity: todo.pending ? 0.5 : 1 }}>
          {todo.title}
        </div>
      ))}
      <form action={addTodo}>
        <input name="title" />
      </form>
    </>
  );
}
```

### `useActionState` Hook

For managing action state:

```tsx
function CreateBlock() {
  const [state, formAction, isPending] = useActionState(
    async (prevState, formData) => {
      const result = await createBlock(formData);
      if (result.error) return { error: result.error };
      return { success: true };
    },
    { error: null, success: false }
  );

  return (
    <form action={formAction}>
      <input name="name" />
      {state.error && <p className="text-red-500">{state.error}</p>}
      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Block'}
      </button>
    </form>
  );
}
```

---

## Next.js 15 Patterns

### App Router Structure

```
src/
├── app/
│   ├── (dashboard)/           # Route group (no URL segment)
│   │   ├── blocks/
│   │   │   ├── page.tsx       # /blocks
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx   # /blocks/[id]
│   │   │   │   └── edit/
│   │   │   │       └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── flows/
│   │   └── layout.tsx         # Shared dashboard layout
│   ├── api/
│   │   ├── trpc/
│   │   │   └── [trpc]/
│   │   │       └── route.ts
│   │   └── stream/            # Hono streaming endpoints
│   │       └── [...path]/
│   │           └── route.ts
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Home page
├── components/
├── lib/
└── hooks/
```

### Server Actions

Define server actions with `'use server'`:

```tsx
// lib/actions/blocks.ts
'use server';

import { db } from '@/lib/db';
import { blocks } from '@/lib/db/schema';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const createBlockSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['ai', 'function']),
  goal: z.string().optional(),
});

export async function createBlock(formData: FormData) {
  const parsed = createBlockSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    goal: formData.get('goal'),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten() };
  }

  const block = await db.insert(blocks).values(parsed.data).returning();

  revalidatePath('/blocks');
  return { data: block[0] };
}
```

### Parallel Routes

For complex layouts with independent loading states:

```
app/
├── (dashboard)/
│   ├── @sidebar/
│   │   └── page.tsx
│   ├── @main/
│   │   └── page.tsx
│   └── layout.tsx
```

```tsx
// layout.tsx
export default function DashboardLayout({
  sidebar,
  main,
}: {
  sidebar: React.ReactNode;
  main: React.ReactNode;
}) {
  return (
    <div className="flex">
      <aside className="w-64">{sidebar}</aside>
      <main className="flex-1">{main}</main>
    </div>
  );
}
```

### Streaming with Suspense

```tsx
// app/blocks/[id]/page.tsx
import { Suspense } from 'react';
import { BlockEditor } from '@/components/blocks/BlockEditor';
import { BlockExecutions } from '@/components/blocks/BlockExecutions';

export default async function BlockPage({ params }: { params: { id: string } }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Block editor loads immediately */}
      <Suspense fallback={<BlockEditorSkeleton />}>
        <BlockEditor id={params.id} />
      </Suspense>

      {/* Executions stream in separately */}
      <Suspense fallback={<ExecutionsSkeleton />}>
        <BlockExecutions blockId={params.id} />
      </Suspense>
    </div>
  );
}
```

### Turbopack (Dev Server)

Next.js 15 uses Turbopack by default for faster dev builds. The `dev` script is already configured:

```json
{
  "scripts": {
    "dev": "next dev --turbopack"
  }
}
```

---

## Server vs Client Components

### Default: Server Components

All components are Server Components by default in Next.js 15. Only add `'use client'` when necessary.

```tsx
// Server Component (default) - Can fetch data directly
async function BlockList() {
  const blocks = await db.query.blocks.findMany();
  return (
    <ul>
      {blocks.map(block => (
        <li key={block.id}>{block.name}</li>
      ))}
    </ul>
  );
}
```

### When to Use Client Components

Add `'use client'` only when you need:

| Feature | Requires Client |
|---------|-----------------|
| `useState`, `useReducer` | Yes |
| `useEffect`, `useLayoutEffect` | Yes |
| Browser APIs (`window`, `localStorage`) | Yes |
| Event handlers (`onClick`, `onChange`) | Yes |
| Custom hooks with state | Yes |
| `useContext` (non-`use()` pattern) | Yes |

```tsx
'use client';

import { useState } from 'react';

// Client Component - Has interactivity
function BlockEditor({ block }) {
  const [name, setName] = useState(block.name);

  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
  );
}
```

### Composition Pattern

Mix Server and Client components effectively:

```tsx
// ServerWrapper.tsx (Server Component)
async function ServerWrapper() {
  const data = await fetchData(); // Server-side fetch

  return (
    <ClientInteractive initialData={data}>
      <ServerContent data={data} />
    </ClientInteractive>
  );
}

// ClientInteractive.tsx
'use client';

function ClientInteractive({ initialData, children }) {
  const [state, setState] = useState(initialData);

  return (
    <div onClick={() => setState(/*...*/)}>
      {children} {/* Server-rendered content passed through */}
    </div>
  );
}
```

---

## Data Fetching

### Server Components (Preferred)

```tsx
// Direct database access in Server Components
async function BlocksPage() {
  const blocks = await db.query.blocks.findMany({
    with: { tools: true },
    orderBy: (blocks, { desc }) => [desc(blocks.updatedAt)],
  });

  return <BlockList blocks={blocks} />;
}
```

### TanStack Query (Client Components)

For client-side data with caching, refetching, and mutations:

```tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc/client';

function BlocksManager() {
  const queryClient = useQueryClient();

  // Query
  const { data: blocks, isLoading } = trpc.blocks.list.useQuery();

  // Mutation with optimistic update
  const createBlock = trpc.blocks.create.useMutation({
    onMutate: async (newBlock) => {
      await queryClient.cancelQueries({ queryKey: ['blocks'] });
      const previous = queryClient.getQueryData(['blocks']);

      queryClient.setQueryData(['blocks'], (old) => [
        ...old,
        { ...newBlock, id: 'temp-' + Date.now() },
      ]);

      return { previous };
    },
    onError: (err, newBlock, context) => {
      queryClient.setQueryData(['blocks'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['blocks'] });
    },
  });

  if (isLoading) return <Skeleton />;

  return (
    <div>
      {blocks.map(block => <BlockCard key={block.id} block={block} />)}
      <button onClick={() => createBlock.mutate({ name: 'New Block' })}>
        Add Block
      </button>
    </div>
  );
}
```

### tRPC Router Pattern

```tsx
// lib/trpc/routers/blocks.ts
import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';

export const blocksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.blocks.findMany({
      where: eq(blocks.workspaceId, ctx.workspaceId),
    });
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      type: z.enum(['ai', 'function']),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.insert(blocks).values({
        ...input,
        workspaceId: ctx.workspaceId,
      }).returning();
    }),
});
```

---

## State Management

### Zustand 5.0 Patterns

```tsx
// stores/ui.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  selectedBlockId: string | null;
  toggleSidebar: () => void;
  selectBlock: (id: string | null) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        sidebarOpen: true,
        selectedBlockId: null,
        toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
        selectBlock: (id) => set({ selectedBlockId: id }),
      }),
      { name: 'ui-storage' }
    )
  )
);
```

### Selective Subscriptions (Performance)

```tsx
// BAD - Re-renders on any state change
function Component() {
  const store = useUIStore();
  return <div>{store.sidebarOpen}</div>;
}

// GOOD - Only re-renders when sidebarOpen changes
function Component() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  return <div>{sidebarOpen}</div>;
}

// GOOD - Multiple selections with shallow compare
import { shallow } from 'zustand/shallow';

function Component() {
  const { sidebarOpen, selectedBlockId } = useUIStore(
    (s) => ({ sidebarOpen: s.sidebarOpen, selectedBlockId: s.selectedBlockId }),
    shallow
  );
  return <div>{sidebarOpen} {selectedBlockId}</div>;
}
```

---

## Streaming & Real-Time

### High-Frequency Updates Pattern

For streaming AI responses with high update frequency:

```tsx
'use client';

import { useRef, useState, useCallback } from 'react';

function StreamingOutput() {
  // Use ref for high-frequency updates, state for rendering
  const textRef = useRef('');
  const [displayText, setDisplayText] = useState('');
  const rafRef = useRef<number>();

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      setDisplayText(textRef.current);
      rafRef.current = undefined;
    });
  }, []);

  const handleStreamEvent = useCallback((event: StreamEvent) => {
    if (event.type === 'text_delta') {
      textRef.current += event.content;
      scheduleUpdate(); // Batched at 60fps
    }
  }, [scheduleUpdate]);

  return <div>{displayText}</div>;
}
```

### SSE with Hono (High-Performance Streaming)

```tsx
// app/api/stream/blocks/[id]/execute/route.ts
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { handle } from 'hono/vercel';

const app = new Hono().basePath('/api/stream');

app.post('/blocks/:id/execute', async (c) => {
  const blockId = c.req.param('id');
  const body = await c.req.json();

  return stream(c, async (stream) => {
    stream.writeSSE({ data: JSON.stringify({ type: 'start' }) });

    const bot = await compileBlock(blockId);

    await bot.process(body.input, {
      onToken: (name, event) => {
        stream.writeSSE({ data: JSON.stringify(event) });
      },
    });

    stream.writeSSE({ data: JSON.stringify({ type: 'done' }) });
  });
});

export const POST = handle(app);
```

### Client-Side Stream Consumption

```tsx
'use client';

async function executeBlock(blockId: string, input: unknown) {
  const response = await fetch(`/api/stream/blocks/${blockId}/execute`, {
    method: 'POST',
    body: JSON.stringify({ input }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(Boolean);

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        handleEvent(event);
      }
    }
  }
}
```

---

## BaleyBots Integration

### Using BaleyBots in Server Actions

```tsx
// lib/actions/execute.ts
'use server';

import { Baleybot, openai } from '@baleybots/core';
import { db } from '@/lib/db';

export async function executeBlock(blockId: string, input: unknown) {
  const block = await db.query.blocks.findFirst({
    where: eq(blocks.id, blockId),
    with: { tools: true },
  });

  const bot = Baleybot.create({
    name: block.name,
    goal: block.goal,
    model: openai(block.model),
    finalResponseSchema: block.outputSchema,
    tools: compileTools(block.tools),
  });

  const result = await bot.process(input);

  // Log execution
  await db.insert(blockExecutions).values({
    blockId,
    input,
    output: result,
    status: 'completed',
  });

  return result;
}
```

### Using @baleybots/react Hooks

```tsx
'use client';

import { useBaleybot } from '@baleybots/react';
import { openai } from '@baleybots/core';
import { z } from 'zod';

function SentimentAnalyzer() {
  const { send, result, isLoading, streamingText } = useBaleybot({
    name: 'sentiment',
    goal: 'Analyze sentiment of text',
    model: openai('gpt-4o-mini'),
    outputSchema: z.object({
      sentiment: z.enum(['positive', 'negative', 'neutral']),
      confidence: z.number(),
      explanation: z.string(),
    }),
    streamField: 'explanation',
  });

  return (
    <div>
      <button onClick={() => send('I love this product!')}>
        Analyze
      </button>
      {streamingText && <p>{streamingText}</p>}
      {result && (
        <div>
          {result.sentiment} ({Math.round(result.confidence * 100)}%)
        </div>
      )}
    </div>
  );
}
```

### Using @baleybots/chat for Conversations

```tsx
'use client';

import { useChat } from '@baleybots/react';
import { openai } from '@baleybots/core';

function ChatInterface() {
  const { messages, sendStreaming, isStreaming } = useChat({
    model: openai('gpt-4o'),
    systemPrompt: 'You are a helpful assistant for workflow automation.',
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id} className={msg.role === 'user' ? 'text-right' : ''}>
          {msg.content}
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('message') as HTMLInputElement;
          sendStreaming(input.value);
          input.value = '';
        }}
      >
        <input name="message" disabled={isStreaming} />
      </form>
    </div>
  );
}
```

---

## Styling

### Tailwind CSS Patterns

```tsx
// Use cn() utility for conditional classes
import { cn } from '@/lib/utils';

function Button({ variant, className, ...props }) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-md font-medium transition-colors',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'ghost' && 'hover:bg-accent hover:text-accent-foreground',
        className
      )}
      {...props}
    />
  );
}
```

### CSS Variables for Theming

```css
/* globals.css */
:root {
  --color-block-ai: hsl(271 91% 65%);
  --color-block-function: hsl(199 89% 48%);
  --color-stream-active: hsl(142 76% 36%);
}

.dark {
  --color-block-ai: hsl(271 81% 55%);
  --color-block-function: hsl(199 79% 38%);
}
```

### shadcn/ui Components

```tsx
// Always import from @/components/ui
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog';
```

---

## TypeScript

### Strict Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Type Inference (Prefer Over Explicit Types)

```tsx
// BAD - Redundant type annotation
const blocks: Block[] = await db.query.blocks.findMany();

// GOOD - Let TypeScript infer
const blocks = await db.query.blocks.findMany();
```

### Zod for Runtime Validation

```tsx
import { z } from 'zod';

const blockSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['ai', 'function']),
  goal: z.string().optional(),
  model: z.string().default('gpt-4o-mini'),
});

type Block = z.infer<typeof blockSchema>;

// Use in Server Actions
export async function createBlock(formData: FormData) {
  const result = blockSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    goal: formData.get('goal'),
  });

  if (!result.success) {
    return { error: result.error.flatten() };
  }

  // result.data is fully typed
  return db.insert(blocks).values(result.data);
}
```

---

## Performance

### Virtualization for Large Lists

```tsx
'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

function DecisionList({ decisions }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: decisions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
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
            <DecisionCard decision={decisions[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Web Workers for Heavy Computation

```tsx
// workers/pattern-extractor.worker.ts
import { expose } from 'comlink';

const extractor = {
  async extractPatterns(decisions: Decision[]) {
    // Heavy computation off main thread
    const patterns = analyzeDecisions(decisions);
    return patterns;
  },
};

expose(extractor);

// Usage in component
import { wrap } from 'comlink';

const worker = new Worker(
  new URL('../workers/pattern-extractor.worker.ts', import.meta.url)
);
const extractor = wrap<typeof import('../workers/pattern-extractor.worker')>(worker);

const patterns = await extractor.extractPatterns(decisions);
```

### Image Optimization

```tsx
import Image from 'next/image';

// Always use next/image for automatic optimization
function Avatar({ user }) {
  return (
    <Image
      src={user.avatarUrl}
      alt={user.name}
      width={40}
      height={40}
      className="rounded-full"
    />
  );
}
```

---

## Testing

### Component Testing

```tsx
// __tests__/BlockCard.test.tsx
import { render, screen } from '@testing-library/react';
import { BlockCard } from '@/components/blocks/BlockCard';

describe('BlockCard', () => {
  it('renders block name', () => {
    render(<BlockCard block={{ id: '1', name: 'Test Block', type: 'ai' }} />);
    expect(screen.getByText('Test Block')).toBeInTheDocument();
  });
});
```

### Server Action Testing

```tsx
// __tests__/actions/blocks.test.ts
import { createBlock } from '@/lib/actions/blocks';

describe('createBlock', () => {
  it('creates a block with valid data', async () => {
    const formData = new FormData();
    formData.set('name', 'Test Block');
    formData.set('type', 'ai');

    const result = await createBlock(formData);

    expect(result.data).toBeDefined();
    expect(result.data.name).toBe('Test Block');
  });

  it('returns error for invalid data', async () => {
    const formData = new FormData();
    // Missing required fields

    const result = await createBlock(formData);

    expect(result.error).toBeDefined();
  });
});
```

---

## Common Mistakes to Avoid

### 1. Unnecessary Client Components

```tsx
// BAD - 'use client' not needed for static display
'use client';

function BlockDisplay({ block }) {
  return <div>{block.name}</div>;
}

// GOOD - Server Component is fine
function BlockDisplay({ block }) {
  return <div>{block.name}</div>;
}
```

### 2. Manual Memoization in React 19

```tsx
// BAD - React 19 compiler handles this
const Component = React.memo(({ data }) => {
  const value = useMemo(() => compute(data), [data]);
  return <div>{value}</div>;
});

// GOOD - Trust the compiler
function Component({ data }) {
  const value = compute(data);
  return <div>{value}</div>;
}
```

### 3. Using `useEffect` for Data Fetching

```tsx
// BAD - useEffect for fetching
'use client';

function BlockList() {
  const [blocks, setBlocks] = useState([]);

  useEffect(() => {
    fetch('/api/blocks').then(r => r.json()).then(setBlocks);
  }, []);

  return <div>{blocks.map(/*...*/)}</div>;
}

// GOOD - Server Component or TanStack Query
async function BlockList() {
  const blocks = await db.query.blocks.findMany();
  return <div>{blocks.map(/*...*/)}</div>;
}

// OR with TanStack Query for client-side
'use client';

function BlockList() {
  const { data: blocks } = trpc.blocks.list.useQuery();
  return <div>{blocks?.map(/*...*/)}</div>;
}
```

### 4. Prop Drilling Instead of Context/Zustand

```tsx
// BAD - Prop drilling through many levels
function App() {
  const [theme, setTheme] = useState('dark');
  return <Layout theme={theme} setTheme={setTheme}>
    <Sidebar theme={theme}>
      <Nav theme={theme}>
        <ThemeButton theme={theme} setTheme={setTheme} />
      </Nav>
    </Sidebar>
  </Layout>;
}

// GOOD - Use Zustand
const useThemeStore = create((set) => ({
  theme: 'dark',
  setTheme: (theme) => set({ theme }),
}));

function ThemeButton() {
  const { theme, setTheme } = useThemeStore();
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
    Toggle
  </button>;
}
```

### 5. Not Using Suspense Boundaries

```tsx
// BAD - No loading states
async function Page() {
  const data = await fetchSlowData(); // Blocks entire page
  return <div>{data}</div>;
}

// GOOD - Suspense for independent loading
function Page() {
  return (
    <div>
      <FastContent />
      <Suspense fallback={<Skeleton />}>
        <SlowContent />
      </Suspense>
    </div>
  );
}
```

### 6. Forgetting Error Boundaries

```tsx
// Always wrap complex UI in error boundaries
import { ErrorBoundary } from 'react-error-boundary';

function FlowEditor() {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}
```

---

## Quick Reference

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `BlockCard.tsx` |
| Hooks | camelCase with `use` | `useBlockStream.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Actions | camelCase | `createBlock.ts` |
| Types | PascalCase | `Block.ts` |
| Routes | kebab-case folders | `app/flow-editor/page.tsx` |

### Import Order

```tsx
// 1. React/Next.js
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 2. Third-party libraries
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';

// 3. BaleyBots
import { Baleybot } from '@baleybots/core';
import { useChat } from '@baleybots/react';

// 4. Internal - absolute imports
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// 5. Internal - relative imports
import { BlockHeader } from './BlockHeader';

// 6. Types (if separate)
import type { Block } from '@/types';
```

---

*This document should be updated as patterns evolve. Last reviewed: December 2024*
