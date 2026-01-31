# BaleyUI - Agent Task Guide

> This document provides clear, actionable tasks for AI agents building BaleyUI.

**Current Phase**: Phase 1 - Foundation
**Status**: Ready to Start
**Structure**: Monorepo (apps + packages)

---

## Before You Begin

```
Prerequisites Checklist:

[ ] PostgreSQL database running (local, Neon, or Supabase)
[ ] Clerk account created → https://dashboard.clerk.com
[ ] Node.js 20+ installed
[ ] pnpm 9+ installed (npm install -g pnpm)

Environment variables needed in .env.local:
[ ] DATABASE_URL           → PostgreSQL connection string
[ ] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY → From Clerk dashboard
[ ] CLERK_SECRET_KEY       → From Clerk dashboard
[ ] CLERK_WEBHOOK_SECRET   → Create webhook in Clerk dashboard
[ ] ENCRYPTION_KEY         → Generate with: openssl rand -base64 32
```

---

## How to Use This Document

1. **Find your task** - Tasks are numbered and grouped by category
2. **Check dependencies** - Some tasks require others to be completed first
3. **Follow the spec** - Each task has clear inputs, outputs, and acceptance criteria
4. **Reference guidelines** - Use [CODING_GUIDELINES.md](./CODING_GUIDELINES.md) for patterns
5. **Mark complete** - Update the checkbox when done

---

## Phase 1 Overview

Phase 1 establishes the foundation: project setup, database, connections, blocks, and streaming.

```
Phase 1 Dependency Graph:

[1.1 Project Setup] ──────────────────────────────────────┐
        │                                                   │
        ▼                                                   │
[1.2 Database Schema] ──┬─────────────────────────────────┤
        │               │                                   │
        ▼               ▼                                   │
[1.3 Auth Setup]  [1.4 tRPC Setup]                         │
        │               │                                   │
        └───────┬───────┘                                   │
                │                                           │
                ├──────────────────────────────────┐        │
                │                                  │        │
                ▼                                  ▼        │
[1.5 Connections Module]              [1.10 Data Integrity] │
        │                                  │        ◄───────┤
        ▼                                  │                │
[1.6 Blocks Module] ◄──────────────────────┘                │
        │                                                   │
        ▼                                                   │
[1.7 Streaming Infrastructure]                              │
     (Includes Execution-First API                          │
      & Reconnection Protocol)                              │
        │                                                   │
        ▼                                                   │
[1.8 Testing Interface]                                     │
                                                            │
[1.9 Design System] ────────────────────────────────────────┘
     (can be done in parallel)

RESILIENCE NOTE: Tasks 1.7 and 1.10 implement the "Resilience by Design"
philosophy from PLAN.md. Executions are server-independent, clients can
disconnect/reconnect, and all data operations maintain integrity.
```

---

## Task 1.1: Project Setup

**Status**: [ ] Not Started
**Dependencies**: None
**Estimated Scope**: ~20 files

### Objective
Initialize the Next.js 15 project with all configuration files.

### Deliverables

Initialize monorepo structure with pnpm workspaces:

```
BaleyUI/
├── pnpm-workspace.yaml          # Workspace configuration
├── package.json                 # Root package.json (workspace scripts)
├── turbo.json                   # Turborepo configuration (optional but recommended)
├── apps/
│   └── web/                     # Next.js 15 application
│       ├── package.json
│       ├── next.config.ts
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── drizzle.config.ts
│       ├── eslint.config.mjs
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx           # Root layout with providers
│       │   │   ├── page.tsx             # Landing/redirect page
│       │   │   ├── globals.css          # Global styles + Tailwind
│       │   │   ├── (dashboard)/
│       │   │   │   ├── layout.tsx       # Dashboard layout with sidebar
│       │   │   │   └── page.tsx         # Dashboard home
│       │   │   └── (auth)/
│       │   │       ├── sign-in/[[...sign-in]]/page.tsx
│       │   │       └── sign-up/[[...sign-up]]/page.tsx
│       │   ├── components/
│       │   │   └── ui/                  # shadcn/ui components
│       │   ├── lib/
│       │   │   └── utils.ts             # cn() utility function
│       │   └── middleware.ts            # Clerk auth middleware
├── packages/
│   ├── db/                      # Database package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts         # DB client export
│   │   │   ├── schema.ts        # All table definitions
│   │   │   └── types.ts         # Inferred types
│   └── ui/                      # Shared UI components (future)
│       ├── package.json
│       └── src/
```

**pnpm-workspace.yaml**:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Root package.json** (scripts):
```json
{
  "name": "baleyui",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @baleyui/web dev",
    "build": "pnpm --filter @baleyui/web build",
    "type-check": "pnpm -r type-check",
    "lint": "pnpm -r lint",
    "db:push": "pnpm --filter @baleyui/db db:push",
    "db:studio": "pnpm --filter @baleyui/db db:studio"
  }
}
```

### Specifications

**next.config.ts**:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
```

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "noUncheckedIndexedAccess": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**apps/web/src/lib/utils.ts**:
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**apps/web/src/middleware.ts**:
```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### Acceptance Criteria

- [ ] `pnpm dev` starts without errors
- [ ] TypeScript compiles with no errors (`pnpm type-check`)
- [ ] ESLint passes (`pnpm lint`)
- [ ] Tailwind styles are applied
- [ ] Visiting `/` shows a page
- [ ] Visiting `/sign-in` shows Clerk sign-in
- [ ] Visiting `/blocks` redirects to sign-in if not authenticated

### Commands to Run After

```bash
# Initialize shadcn/ui
pnpm dlx shadcn@latest init

# Add essential components
pnpm dlx shadcn@latest add button card input label select tabs toast dialog dropdown-menu
```

---

## Task 1.2: Database Schema

**Status**: [ ] Not Started
**Dependencies**: Task 1.1
**Estimated Scope**: ~5 files

### Objective
Implement the complete database schema using Drizzle ORM in the `packages/db` package.

### Deliverables

```
packages/db/
├── package.json                # @baleyui/db package
├── tsconfig.json
├── drizzle.config.ts           # Drizzle config for this package
├── src/
│   ├── index.ts                # Database client export
│   ├── schema.ts               # All table definitions
│   └── types.ts                # Inferred types from schema
```

**packages/db/package.json**:
```json
{
  "name": "@baleyui/db",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Specifications

**packages/db/src/index.ts**:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

export const db = drizzle(client, { schema });
```

**src/lib/db/schema.ts**:
See PLAN.md Section 1.3 for complete schema. Implement ALL tables:
- `workspaces`
- `connections`
- `tools`
- `blocks`
- `flows`
- `flowExecutions`
- `blockExecutions` (includes heartbeat, serverId, retry tracking)
- `toolExecutions`
- `decisions`
- `patterns`
- `testCases`
- `executionEvents` (for stream replay and recovery)
- `auditLogs` (for compliance and debugging)
- `backgroundJobs` (for reliable async execution)

**IMPORTANT**: All major tables MUST include:
- `deletedAt` and `deletedBy` for soft deletes
- `version` for optimistic locking

**packages/db/src/types.ts**:
```typescript
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as schema from './schema';

// Select types (for reading)
export type Workspace = InferSelectModel<typeof schema.workspaces>;
export type Connection = InferSelectModel<typeof schema.connections>;
export type Tool = InferSelectModel<typeof schema.tools>;
export type Block = InferSelectModel<typeof schema.blocks>;
// ... etc for all tables

// Insert types (for creating)
export type NewWorkspace = InferInsertModel<typeof schema.workspaces>;
export type NewConnection = InferInsertModel<typeof schema.connections>;
// ... etc
```

**Usage in apps/web**:
```typescript
// Import from the @baleyui/db package
import { db } from '@baleyui/db';
import { blocks, type Block } from '@baleyui/db/schema';
```

### Acceptance Criteria

- [ ] All tables from PLAN.md are defined
- [ ] `pnpm db:push` runs without errors
- [ ] `pnpm db:studio` opens and shows all tables
- [ ] Types are exported and usable in other files
- [ ] Foreign key relationships are correct

---

## Task 1.3: Auth Setup (Clerk)

**Status**: [ ] Not Started
**Dependencies**: Task 1.1
**Estimated Scope**: ~8 files

### Objective
Set up Clerk authentication with workspace creation on sign-up.

### Deliverables

```
apps/web/src/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   └── api/
│       └── webhooks/
│           └── clerk/route.ts   # Webhook for user creation
├── lib/
│   └── auth/
│       ├── index.ts             # Auth utilities
│       └── workspace.ts         # Workspace helpers
```

### Specifications

**Clerk Webhook Handler** (`apps/web/src/app/api/webhooks/clerk/route.ts`):
- Listen for `user.created` event
- Create default workspace for new user
- Store Clerk user ID in workspace

**Auth Utilities** (`apps/web/src/lib/auth/index.ts`):
```typescript
import { auth, currentUser } from '@clerk/nextjs/server';
import { db, workspaces } from '@baleyui/db';
import { eq } from 'drizzle-orm';

export async function getCurrentWorkspace() {
  const { userId } = await auth();
  if (!userId) throw new Error('Not authenticated');

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
  });

  if (!workspace) throw new Error('No workspace found');
  return workspace;
}
```

### Acceptance Criteria

- [ ] Sign up creates new user in Clerk
- [ ] Webhook creates workspace for new user
- [ ] `getCurrentWorkspace()` returns workspace for authenticated user
- [ ] Protected routes redirect to sign-in
- [ ] Sign out works correctly

---

## Task 1.4: tRPC Setup

**Status**: [ ] Not Started
**Dependencies**: Task 1.1, Task 1.2
**Estimated Scope**: ~10 files

### Objective
Set up tRPC with React Query integration.

### Deliverables

```
apps/web/src/
├── lib/trpc/
│   ├── client.ts               # Client-side tRPC hooks
│   ├── server.ts               # Server-side tRPC context
│   ├── trpc.ts                 # tRPC instance and procedures
│   └── routers/
│       ├── index.ts            # Root router (merges all)
│       ├── workspaces.ts       # Workspace CRUD
│       ├── connections.ts      # Connection CRUD
│       ├── blocks.ts           # Block CRUD
│       └── tools.ts            # Tool CRUD
├── app/
│   ├── api/trpc/[trpc]/route.ts    # tRPC HTTP handler
│   └── providers.tsx               # QueryClient + tRPC provider
```

### Specifications

**apps/web/src/lib/trpc/trpc.ts**:
```typescript
import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@clerk/nextjs/server';
import superjson from 'superjson';
import { db } from '@baleyui/db';
import { getCurrentWorkspace } from '@/lib/auth';

export const createTRPCContext = async () => {
  const { userId } = await auth();
  return { db, userId };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const workspace = await getCurrentWorkspace();
  return next({ ctx: { ...ctx, workspace } });
});
```

### Acceptance Criteria

- [ ] `trpc.workspaces.get.useQuery()` works in components
- [ ] Protected procedures require authentication
- [ ] Mutations invalidate relevant queries
- [ ] Error handling shows toast notifications

---

## Task 1.5: Connections Module

**Status**: [ ] Not Started
**Dependencies**: Task 1.4
**Estimated Scope**: ~15 files

### Objective
Build the connections management UI for LLM providers (OpenAI, Anthropic, Ollama).

### Deliverables

```
apps/web/src/
├── app/(dashboard)/settings/
│   ├── page.tsx                # Settings overview
│   └── connections/
│       └── page.tsx            # Connections list
├── components/connections/
│   ├── ConnectionsList.tsx     # List all connections
│   ├── ConnectionCard.tsx      # Single connection card
│   ├── AddConnectionDialog.tsx # Add new connection
│   ├── OpenAIForm.tsx          # OpenAI config form
│   ├── AnthropicForm.tsx       # Anthropic config form
│   ├── OllamaForm.tsx          # Ollama config form
│   └── TestConnectionButton.tsx
├── lib/
│   └── connections/
│       ├── providers.ts        # Provider definitions
│       ├── test.ts             # Test connection functions
│       └── ollama.ts           # Ollama-specific utilities
```

### Specifications

**Connection Types**:
```typescript
type ConnectionType = 'openai' | 'anthropic' | 'ollama' | 'postgres' | 'mysql';

interface OpenAIConfig {
  apiKey: string;  // Encrypted
  organization?: string;
}

interface AnthropicConfig {
  apiKey: string;  // Encrypted
}

interface OllamaConfig {
  baseUrl: string;  // e.g., http://localhost:11434
}
```

**Test Connection**:
- OpenAI: Call `/models` endpoint
- Anthropic: Call `/models` endpoint
- Ollama: Call `/api/tags` to get available models

### UI Requirements

1. **Connections List**:
   - Show all connections with status badge (Connected/Error/Unconfigured)
   - "Add Connection" button
   - Each card shows: name, type, status, last checked

2. **Add Connection Dialog**:
   - Select provider type
   - Provider-specific form
   - Test button before saving
   - Show available models (for Ollama)

### Ollama-Specific UI Requirements

Ollama requires additional management UI beyond OpenAI/Anthropic:

**1. Connection Setup**
```
┌─────────────────────────────────────────────────────────────┐
│ Add Ollama Connection                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Name: [My Local Ollama          ]                          │
│                                                              │
│  Base URL: [http://localhost:11434]  [Test Connection]      │
│                                                              │
│  ✓ Connected - Ollama v0.5.4                                │
│                                                              │
│  API Key (optional): [                    ]                  │
│  Only needed for remote/authenticated instances              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**2. Model Browser (after connection)**
```
┌─────────────────────────────────────────────────────────────┐
│ Ollama Models                              [Pull New Model] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  INSTALLED MODELS                                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ● llama3.2:latest                                       ││
│  │   Size: 2.0 GB  |  Parameters: 3B  |  Quantization: Q4  ││
│  │   [Use in Block]  [Show Details]  [Delete]              ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ ● mistral:7b                                            ││
│  │   Size: 4.1 GB  |  Parameters: 7B  |  Quantization: Q4  ││
│  │   [Use in Block]  [Show Details]  [Delete]              ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ ● deepseek-r1:7b                          🧠 Reasoning  ││
│  │   Size: 4.7 GB  |  Parameters: 7B  |  Quantization: Q4  ││
│  │   [Use in Block]  [Show Details]  [Delete]              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  CURRENTLY LOADED (in memory)                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ llama3.2:latest  |  RAM: 2.3 GB  |  VRAM: 0 GB          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**3. Pull Model Dialog**
```
┌─────────────────────────────────────────────────────────────┐
│ Pull Model from Ollama Library                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Model: [llama3.2:3b                    ] [Search Library]  │
│                                                              │
│  Popular Models:                                             │
│  [llama3.2] [mistral] [phi3] [deepseek-r1] [qwen2.5]       │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Pulling: llama3.2:3b                                       │
│  ████████████████████░░░░░░░░░░  67%  |  1.4 GB / 2.0 GB   │
│  Speed: 45 MB/s  |  ETA: 13s                                │
│                                                              │
│                                            [Cancel]          │
└─────────────────────────────────────────────────────────────┘
```

**4. API Calls We Need to Make**

| Action | Ollama API | BaleyUI Implementation |
|--------|------------|------------------------|
| Test connection | `GET /` | Check if Ollama is running |
| List models | `GET /api/tags` | Populate model list |
| Pull model | `POST /api/pull` | Stream progress to UI |
| Delete model | `DELETE /api/delete` | Confirm then delete |
| Model details | `POST /api/show` | Show in modal |
| Running models | `GET /api/ps` | Show loaded models |

**5. Implementation Files**

```
apps/web/src/lib/connections/ollama/
├── api.ts              # Ollama API client
├── types.ts            # Ollama-specific types
└── hooks.ts            # React Query hooks for Ollama

apps/web/src/components/connections/ollama/
├── OllamaConnectionForm.tsx
├── OllamaModelBrowser.tsx
├── OllamaModelCard.tsx
├── OllamaPullDialog.tsx
├── OllamaPullProgress.tsx
└── OllamaModelDetails.tsx
```

**6. Ollama API Client**

```typescript
// apps/web/src/lib/connections/ollama/api.ts

export class OllamaClient {
  constructor(private baseUrl: string) {}

  async isHealthy(): Promise<boolean> {
    const res = await fetch(this.baseUrl);
    return res.ok;
  }

  async listModels(): Promise<OllamaModel[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    const data = await res.json();
    return data.models;
  }

  async pullModel(
    name: string,
    onProgress: (progress: PullProgress) => void
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      body: JSON.stringify({ name, stream: true }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        const progress = JSON.parse(line);
        onProgress(progress);
      }
    }
  }

  async deleteModel(name: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      body: JSON.stringify({ name }),
    });
  }

  async showModel(name: string): Promise<OllamaModelDetails> {
    const res = await fetch(`${this.baseUrl}/api/show`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return res.json();
  }

  async listRunning(): Promise<OllamaRunningModel[]> {
    const res = await fetch(`${this.baseUrl}/api/ps`);
    const data = await res.json();
    return data.models;
  }
}
```

### Acceptance Criteria

- [ ] Can add OpenAI connection with API key
- [ ] Can add Anthropic connection with API key
- [ ] Can add Ollama connection (discovers local models)
- [ ] Connection test shows success/failure
- [ ] API keys are encrypted before storage
- [ ] Can set a connection as default
- [ ] Can delete connections

**Ollama-Specific Criteria:**
- [ ] Can browse installed Ollama models
- [ ] Can pull new models with progress indicator
- [ ] Can delete models with confirmation
- [ ] Can view model details (size, parameters, quantization)
- [ ] Can see currently loaded models (memory usage)
- [ ] Pull progress streams in real-time
- [ ] Can cancel in-progress pulls

---

## Task 1.6: Blocks Module

**Status**: [ ] Not Started
**Dependencies**: Task 1.5
**Estimated Scope**: ~25 files

### Objective
Build the block editor for AI and Function blocks.

### Deliverables

```
apps/web/src/
├── app/(dashboard)/blocks/
│   ├── page.tsx                # Blocks list
│   ├── new/page.tsx            # Create new block
│   └── [id]/
│       ├── page.tsx            # Block detail/editor
│       └── test/page.tsx       # Block test page
├── components/blocks/
│   ├── BlocksList.tsx          # List all blocks
│   ├── BlockCard.tsx           # Single block card
│   ├── BlockEditor.tsx         # Main editor wrapper
│   ├── AIBlockEditor.tsx       # AI block configuration
│   ├── FunctionBlockEditor.tsx # Function block code editor
│   ├── SchemaEditor.tsx        # Visual JSON schema builder
│   ├── ModelSelector.tsx       # Model dropdown
│   ├── ToolSelector.tsx        # Multi-select tools
│   └── BlockTypeSelector.tsx   # AI vs Function
├── lib/baleybots/
│   ├── compiler.ts             # Compile block to Baleybot
│   └── executor.ts             # Execute block
```

### Specifications

**Block Types**:
- `ai`: Uses BaleyBots `Baleybot.create()`
- `function`: Uses BaleyBots `Deterministic.create()`

**AI Block Editor Fields**:
- Name (required)
- Goal/System prompt (required for AI)
- Connection (select from available)
- Model (filtered by connection)
- Output Schema (visual builder)
- Tools (multi-select)
- Temperature, max tokens (optional)

**Function Block Editor**:
- Name (required)
- Code (Monaco editor with TypeScript)
- Input/Output schemas

**Schema Editor**:
- Visual builder for JSON Schema
- Support for: string, number, boolean, array, object, enum
- Preview of generated schema

### Acceptance Criteria

- [ ] Can create AI block with goal and model
- [ ] Can create Function block with code
- [ ] Schema editor generates valid JSON Schema
- [ ] Model selector shows models from selected connection
- [ ] Can save and load blocks
- [ ] Block list shows all blocks with type badges

---

## Task 1.7: Streaming Infrastructure

**Status**: [ ] Not Started
**Dependencies**: Task 1.6, Task 1.10 (Data Integrity)
**Estimated Scope**: ~20 files

### Objective
Implement **server-independent** real-time streaming for block execution. Executions MUST continue running even if the user navigates away, and clients MUST be able to reconnect and replay missed events.

### Key Principles (from "Resilience by Design")
- Executions run on server, independent of client connection
- All events stored in database for replay
- Client can disconnect/reconnect freely
- Server recovery on startup for stale executions

### Deliverables

```
apps/web/src/
├── app/api/
│   └── executions/
│       ├── start/route.ts           # POST - Start execution (returns executionId)
│       └── [id]/
│           ├── stream/route.ts      # GET - SSE stream with reconnection
│           ├── status/route.ts      # GET - Execution status (polling fallback)
│           ├── result/route.ts      # GET - Final result
│           └── cancel/route.ts      # POST - Cancel execution
├── hooks/
│   ├── useExecutionStream.ts   # Reconnection-aware streaming hook
│   ├── useBlockStream.ts       # Main streaming hook (uses useExecutionStream)
│   ├── useStreamState.ts       # Stream state management
│   └── useVisibilityReconnect.ts  # Reconnect on tab visibility
├── components/streaming/
│   ├── StreamingText.tsx       # Animated text output
│   ├── StreamingJSON.tsx       # Progressive JSON render
│   ├── ToolCallCard.tsx        # Tool execution display
│   └── StreamMetrics.tsx       # TTFT, tokens/sec
├── lib/
│   ├── streaming/
│   │   ├── types.ts            # Stream event types
│   │   ├── parser.ts           # SSE parser
│   │   └── reducer.ts          # Stream state reducer
│   └── execution/
│       ├── executor.ts         # Server-side execution runner
│       ├── state-machine.ts    # Execution state transitions
│       ├── recovery.ts         # Startup recovery for stale executions
│       └── heartbeat.ts        # Heartbeat monitor
```

### Specifications

**Stream Events** (from BaleyBots):
```typescript
type StreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'structured_output_delta'; content: string }
  | { type: 'tool_call_stream_start'; id: string; toolName: string }
  | { type: 'tool_call_arguments_delta'; id: string; argumentsDelta: string }
  | { type: 'tool_execution_start'; id: string }
  | { type: 'tool_execution_output'; id: string; result: unknown }
  | { type: 'done'; reason: string };
```

**useBlockStream Hook**:
```typescript
const {
  state,      // StreamState
  execute,    // (input: unknown) => Promise<void>
  reset,      // () => void
} = useBlockStream(blockId);
```

### Acceptance Criteria

**Streaming UI**
- [ ] Streaming text appears token-by-token
- [ ] Tool calls show in real-time during execution
- [ ] TTFT (time to first token) is displayed
- [ ] Stream can be cancelled
- [ ] Errors are handled gracefully

**Server Independence (CRITICAL)**
- [ ] Execution continues when user navigates away
- [ ] User can return to page and see execution results
- [ ] All events stored in `execution_events` table

**Reconnection**
- [ ] Client automatically reconnects on visibility change
- [ ] Reconnection replays missed events from last index
- [ ] Multiple reconnections work correctly
- [ ] Exponential backoff on connection failures

**Recovery**
- [ ] Server startup detects stale (orphaned) executions
- [ ] Stale executions are retried or marked failed
- [ ] Heartbeat timeout properly detected (30s default)

---

## Task 1.8: Testing Interface

**Status**: [ ] Not Started
**Dependencies**: Task 1.7
**Estimated Scope**: ~10 files

### Objective
Build the live chat test interface for blocks.

### Deliverables

```
apps/web/src/components/testing/
├── LiveChat.tsx                # Multi-turn chat interface
├── SingleTest.tsx              # Single input/output test
├── BatchTest.tsx               # Multiple test cases
├── TestInput.tsx               # JSON input editor
├── TestOutput.tsx              # Output display
└── TestHistory.tsx             # Past test runs
```

### Specifications

**Live Chat**:
- Multi-turn conversation
- Shows streaming in real-time
- Tool calls visible during execution
- Can clear history

**Single Test**:
- JSON input editor
- Execute button
- Streaming output
- View raw events

### Acceptance Criteria

- [ ] Can test AI block with live chat
- [ ] Can test with single JSON input
- [ ] Streaming shows all event types
- [ ] Past executions are saved
- [ ] Can replay past executions

---

## Task 1.9: Design System

**Status**: [ ] Not Started
**Dependencies**: Task 1.1 (can be done in parallel with others)
**Estimated Scope**: ~10 files

### Objective
Implement design tokens and streaming-specific components.

### Deliverables

```
apps/web/src/
├── app/globals.css             # CSS variables + Tailwind
├── components/ui/              # Extended shadcn components
│   ├── badge.tsx               # With block-type variants
│   ├── status-indicator.tsx    # Connection status
│   └── loading-dots.tsx        # Streaming indicator
```

### Specifications

**CSS Variables** (add to globals.css):
```css
:root {
  /* Block type colors */
  --color-block-ai: 271 91% 65%;
  --color-block-function: 199 89% 48%;
  --color-block-router: 38 92% 50%;

  /* Provider colors */
  --color-provider-openai: 160 84% 39%;
  --color-provider-anthropic: 24 95% 53%;
  --color-provider-ollama: 210 100% 50%;

  /* Streaming states */
  --color-stream-active: 142 76% 36%;
  --color-stream-tool: 38 92% 50%;
  --color-stream-error: 0 84% 60%;
}
```

### Acceptance Criteria

- [ ] Block types have distinct colors
- [ ] Provider icons/colors are consistent
- [ ] Streaming states are visually clear
- [ ] Dark mode works correctly

---

## Task 1.10: Data Integrity Layer

**Status**: [ ] Not Started
**Dependencies**: Task 1.2, Task 1.4
**Estimated Scope**: ~10 files

### Objective
Implement the data integrity layer ensuring all operations maintain consistent state. This is a foundational requirement from "Resilience by Design" - no tech debt, production-ready from day 1.

### Key Principles
- All multi-table operations wrapped in transactions
- Optimistic locking prevents concurrent update conflicts
- Soft deletes enable data recovery
- Full audit trail for compliance and debugging
- API keys encrypted at rest

### Deliverables

```
packages/db/src/
├── transactions.ts             # withTransaction helper
├── soft-delete.ts              # Soft delete helpers
└── optimistic-lock.ts          # Version checking

apps/web/src/lib/
├── audit/
│   ├── index.ts                # Audit logging functions
│   └── middleware.ts           # tRPC audit middleware
├── encryption/
│   └── index.ts                # AES-256-GCM encrypt/decrypt
```

### Specifications

**Transaction Helper**:
```typescript
// packages/db/src/transactions.ts
export async function withTransaction<T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    return await fn(tx);
  });
}

// Usage
const result = await withTransaction(async (tx) => {
  const block = await tx.insert(blocks).values(data).returning();
  await tx.insert(blockTools).values(tools);
  await tx.insert(auditLogs).values({ action: 'create', ... });
  return block;
});
```

**Optimistic Locking**:
```typescript
// packages/db/src/optimistic-lock.ts
export async function updateWithLock<T>(
  table: any,
  id: string,
  expectedVersion: number,
  updates: Partial<T>
): Promise<T> {
  const result = await db.update(table)
    .set({ ...updates, version: expectedVersion + 1 })
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning();

  if (result.length === 0) {
    throw new OptimisticLockError(table.name, id);
  }
  return result[0];
}
```

**Soft Delete**:
```typescript
// packages/db/src/soft-delete.ts
export function notDeleted<T extends { deletedAt: any }>(table: T) {
  return isNull(table.deletedAt);
}

export async function softDelete(table: any, id: string, userId: string) {
  return await withTransaction(async (tx) => {
    const [deleted] = await tx.update(table)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(eq(table.id, id))
      .returning();

    await tx.insert(auditLogs).values({
      entityType: table.name,
      entityId: id,
      action: 'delete',
      userId,
    });
    return deleted;
  });
}

export async function restore(table: any, id: string, userId: string) {
  // Similar pattern with audit logging
}
```

**Encryption**:
```typescript
// apps/web/src/lib/encryption/index.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const key = scryptSync(process.env.ENCRYPTION_KEY!, 'baleyui-salt', 32);

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  // ... decryption logic
}
```

**Audit Middleware** (for tRPC):
```typescript
// apps/web/src/lib/audit/middleware.ts
export const auditMiddleware = t.middleware(async ({ ctx, next, path }) => {
  const requestId = crypto.randomUUID();

  return next({
    ctx: {
      ...ctx,
      audit: {
        requestId,
        log: async (entityType, entityId, action, changes) => {
          await db.insert(auditLogs).values({
            entityType, entityId, action, changes,
            userId: ctx.userId,
            workspaceId: ctx.workspace?.id,
            requestId,
          });
        },
      },
    },
  });
});
```

### Acceptance Criteria

**Transactions**
- [ ] `withTransaction` helper works correctly
- [ ] Rollback on error works
- [ ] Nested transactions work (savepoints)

**Optimistic Locking**
- [ ] Concurrent updates fail with clear error
- [ ] Version increments on successful update
- [ ] Error message indicates conflict

**Soft Deletes**
- [ ] `softDelete` sets deletedAt and deletedBy
- [ ] `notDeleted` filter works in queries
- [ ] `restore` clears delete fields
- [ ] All queries by default exclude deleted

**Audit Logging**
- [ ] All create/update/delete operations logged
- [ ] Audit log includes userId, workspaceId
- [ ] Changes (diff) captured for updates
- [ ] Request context (IP, user agent) captured

**Encryption**
- [ ] API keys encrypted before database storage
- [ ] Decryption works correctly on read
- [ ] Error if ENCRYPTION_KEY not set
- [ ] Uses AES-256-GCM (authenticated encryption)

---

## Task Completion Checklist

When completing a task:

1. **Run checks**:
   ```bash
   pnpm type-check  # No TypeScript errors
   pnpm lint        # No ESLint errors
   pnpm dev         # App runs without errors
   ```

2. **Test functionality**:
   - Verify all acceptance criteria
   - Test happy path and error cases
   - Check responsive design

3. **Update this document**:
   - Mark task checkbox as complete
   - Note any deviations or decisions

4. **Commit with clear message**:
   ```bash
   git add .
   git commit -m "feat(task-1.X): <description>

   - Implemented X
   - Added Y
   - Updated Z

   Closes #<issue-number-if-applicable>"
   ```

---

## Questions & Decisions

If you encounter a decision point not covered in this document:

1. Check [PLAN.md](./PLAN.md) for architectural guidance
2. Check [CODING_GUIDELINES.md](./CODING_GUIDELINES.md) for patterns
3. If still unclear, document your decision and rationale here:

### Decisions Log

| Date | Task | Decision | Rationale |
|------|------|----------|-----------|
| | | | |

---

## Resources

- [PLAN.md](./PLAN.md) - Full project plan and architecture
- [CODING_GUIDELINES.md](./CODING_GUIDELINES.md) - Development patterns
- [BaleyBots Docs](https://github.com/cbethin/baleybots) - AI runtime
- [Next.js 15 Docs](https://nextjs.org/docs) - Framework
- [Drizzle Docs](https://orm.drizzle.team) - Database ORM
- [tRPC Docs](https://trpc.io/docs) - API layer
- [Clerk Docs](https://clerk.com/docs) - Authentication
- [shadcn/ui](https://ui.shadcn.com) - Component library
- [@xyflow/react](https://reactflow.dev) - Flow canvas (Phase 2)
