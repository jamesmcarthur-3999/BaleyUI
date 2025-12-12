# BaleyUI - Project Plan

> A visual platform for building, composing, and evolving AI-powered workflows using the BaleyBots framework.

## Table of Contents

1. [Vision & Philosophy](#vision--philosophy)
2. [Core Concepts](#core-concepts)
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [Database Schema](#database-schema)
6. [Feature Roadmap](#feature-roadmap)
7. [Component Structure](#component-structure)
8. [API Design](#api-design)
9. [Implementation Phases](#implementation-phases)
10. [File Structure](#file-structure)

---

## Vision & Philosophy

### The Problem

Building AI-powered workflows today requires:
- Writing code for every decision point
- No visibility into what AI actually decides
- Difficulty transitioning from AI prototypes to production code
- Complex orchestration of multiple AI calls

### The Solution

BaleyUI provides a visual platform where:
- **Everything is a Block** - AI decisions, functions, and compositions share the same interface
- **AI is a Prototyping Tool** - Use natural language to define logic, then codify patterns
- **Decisions are Observable** - Every AI decision is logged, analyzable, and actionable
- **Blocks are Interchangeable** - Swap AI ↔ Code without changing the flow

### Core Insight

BaleyBots' `Processable` interface enables universal composability:

```typescript
// AI-powered decision
const fraudScorer = new Baleybot({
  name: 'fraud-scorer',
  goal: 'Assess fraud risk',
  outputSchema: z.object({ riskScore: z.number(), action: z.enum([...]) })
});

// Later, replace with coded logic - SAME INTERFACE
const fraudScorer = Deterministic.create({
  name: 'fraud-scorer',
  processFn: (order) => ({ riskScore: calculateScore(order), action: ... })
});

// Pipeline doesn't change!
const flow = pipeline(validateOrder, fraudScorer, routeByAction);
```

The GUI makes this lifecycle **visible and actionable**.

---

## Core Concepts

### 1. Blocks

A **Block** is any unit of processing that takes input and produces output.

| Block Type | Description | BaleyBots Class |
|------------|-------------|-----------------|
| **AI Block** | Natural language goal, LLM-powered decisions | `Baleybot` |
| **Function Block** | Coded logic, deterministic | `Deterministic` |
| **Pattern Block** | Composition of other blocks | `Pipeline`, `Loop`, `Parallel`, etc. |
| **Source Block** | Entry point (webhook, schedule, etc.) | Custom triggers |
| **Sink Block** | Output destination (DB, API, notification) | Custom actions |

All blocks implement the same contract:
```typescript
interface Block {
  id: string;
  name: string;
  type: 'ai' | 'function' | 'pattern' | 'source' | 'sink';
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  config: BlockConfig;
}
```

### 2. Flows

A **Flow** is a directed graph of connected blocks:

```
[Source] → [Block A] → [Block B] → [Sink]
                ↓
           [Block C]
```

Flows compile to BaleyBots composition patterns:
- Sequential connections → `pipeline()`
- Branches → `route()`
- Parallel paths → `parallel()`
- Loops → `loop()`

### 3. Decisions

For AI Blocks, every execution is logged as a **Decision**:

```typescript
interface Decision {
  id: string;
  blockId: string;
  flowExecutionId: string;
  input: any;
  output: any;
  reasoning?: string;
  metadata: {
    model: string;
    tokens: number;
    latencyMs: number;
  };
  feedback?: {
    correct: boolean;
    correctedOutput?: any;
    notes?: string;
  };
  createdAt: Date;
}
```

Decisions enable:
- Debugging what AI decided
- Training data export
- Pattern extraction
- A/B testing AI vs Code

### 4. The AI → Code Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE EVOLUTION CYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: PROTOTYPE          PHASE 2: OBSERVE                  │
│  ┌─────────────────────┐    ┌─────────────────────┐           │
│  │ Create AI Block     │    │ View decisions      │           │
│  │ with natural        │ →  │ Identify patterns   │           │
│  │ language goal       │    │ Mark correct/wrong  │           │
│  └─────────────────────┘    └─────────────────────┘           │
│                                       ↓                        │
│  PHASE 4: OPTIMIZE           PHASE 3: CODIFY                  │
│  ┌─────────────────────┐    ┌─────────────────────┐           │
│  │ Hybrid: Code for    │    │ Extract rules       │           │
│  │ common cases, AI    │ ←  │ Generate Function   │           │
│  │ for edge cases      │    │ block from patterns │           │
│  └─────────────────────┘    └─────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BALEYUI                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         FRONTEND (Next.js)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │   Block     │  │    Flow     │  │  Decision   │  │  Settings │  │   │
│  │  │   Editor    │  │   Composer  │  │  Inspector  │  │   Panel   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         BACKEND (Next.js API / tRPC)                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │   Block     │  │    Flow     │  │  Execution  │  │  Provider │  │   │
│  │  │   Service   │  │   Service   │  │   Service   │  │  Service  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                 ┌──────────────────┼──────────────────┐                    │
│                 ▼                  ▼                  ▼                    │
│  ┌─────────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │
│  │     PostgreSQL      │  │      Redis      │  │    BaleyBots        │   │
│  │  (Blocks, Flows,    │  │  (Queue, Cache, │  │    Runtime          │   │
│  │   Decisions, etc.)  │  │   Pub/Sub)      │  │  (Execution)        │   │
│  └─────────────────────┘  └─────────────────┘  └─────────────────────┘   │
│                                                         │                  │
│                                                         ▼                  │
│                                               ┌─────────────────────┐     │
│                                               │   LLM Providers     │     │
│                                               │ OpenAI / Anthropic  │     │
│                                               │ / Ollama / Custom   │     │
│                                               └─────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| **Block Editor** | Create/edit AI and Function blocks with schema validation |
| **Flow Composer** | Visual canvas for connecting blocks into flows |
| **Decision Inspector** | View, filter, analyze AI decisions |
| **Execution Monitor** | Real-time flow execution visualization |
| **Code Generator** | Extract patterns from decisions, generate code |
| **Provider Manager** | Configure LLM providers (API keys, models) |

---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **Next.js 14** | App Router, Server Components, API Routes |
| **React 18** | UI components |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Styling |
| **shadcn/ui** | UI component library |
| **React Flow** | Visual flow canvas |
| **Monaco Editor** | Code editing (for Function blocks) |
| **Zustand** | Client state management |
| **React Query** | Server state management |
| **React Hook Form + Zod** | Form handling and validation |

### Backend

| Technology | Purpose |
|------------|---------|
| **Next.js API Routes** | REST/tRPC endpoints |
| **tRPC** | Type-safe API layer |
| **Drizzle ORM** | Database access |
| **PostgreSQL** | Primary database |
| **Redis** | Queue, caching, pub/sub |
| **BullMQ** | Job queue for scheduled flows |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **Vercel** | Frontend hosting |
| **Railway / Fly.io** | Backend services |
| **Neon** | Serverless PostgreSQL |
| **Upstash** | Serverless Redis |

### BaleyBots Integration

| Package | Purpose |
|---------|---------|
| **@baleybots/core** | Baleybot, Deterministic, Pipeline, etc. |
| **@baleybots/chat** | History, spawn agents |

---

## Database Schema

### Core Tables

```sql
-- Workspaces (multi-tenancy)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider Connections (LLM providers)
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'ollama', 'custom'
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL, -- encrypted API keys, base URLs, etc.
  is_default BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'unconfigured',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blocks (AI, Function, Pattern, Source, Sink)
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'ai', 'function', 'pattern', 'source', 'sink'
  subtype VARCHAR(50), -- 'webhook', 'schedule', 'database', etc.
  name VARCHAR(255) NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL DEFAULT '{}',
  output_schema JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  -- AI block specific
  connection_id UUID REFERENCES connections(id),
  model VARCHAR(255),
  goal TEXT,
  system_prompt TEXT,
  temperature DECIMAL(3,2),
  max_tokens INTEGER,
  -- Function block specific
  code TEXT,
  -- Metrics
  execution_count INTEGER DEFAULT 0,
  avg_latency_ms INTEGER,
  last_executed_at TIMESTAMPTZ,
  -- Versioning
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flows (composed of blocks)
CREATE TABLE flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- Graph definition (React Flow format)
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  -- Trigger configuration
  triggers JSONB NOT NULL DEFAULT '[]',
  -- Settings
  settings JSONB NOT NULL DEFAULT '{}',
  -- State
  enabled BOOLEAN DEFAULT FALSE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flow Executions
CREATE TABLE flow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES flows(id) ON DELETE CASCADE,
  flow_version INTEGER NOT NULL,
  triggered_by JSONB NOT NULL, -- { type: 'webhook' | 'schedule' | 'manual', ... }
  status VARCHAR(50) NOT NULL, -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  input JSONB,
  output JSONB,
  error JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Block Executions (within a flow execution)
CREATE TABLE block_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_execution_id UUID REFERENCES flow_executions(id) ON DELETE CASCADE,
  block_id UUID REFERENCES blocks(id),
  node_id VARCHAR(255) NOT NULL, -- React Flow node ID
  status VARCHAR(50) NOT NULL,
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Decisions (for AI blocks only)
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  block_execution_id UUID REFERENCES block_executions(id) ON DELETE CASCADE,
  input JSONB NOT NULL,
  output JSONB NOT NULL,
  reasoning TEXT,
  -- Metadata
  model VARCHAR(255),
  tokens_input INTEGER,
  tokens_output INTEGER,
  latency_ms INTEGER,
  -- Feedback
  feedback_correct BOOLEAN,
  feedback_notes TEXT,
  feedback_corrected_output JSONB,
  feedback_by UUID,
  feedback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracted Patterns (from decisions)
CREATE TABLE patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  rule TEXT NOT NULL, -- Human-readable rule
  condition JSONB NOT NULL, -- Machine-parseable condition
  output_template JSONB, -- What to output when condition matches
  confidence DECIMAL(5,4), -- 0.0000 to 1.0000
  support_count INTEGER, -- How many decisions support this pattern
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_blocks_workspace ON blocks(workspace_id);
CREATE INDEX idx_blocks_type ON blocks(type);
CREATE INDEX idx_flows_workspace ON flows(workspace_id);
CREATE INDEX idx_flow_executions_flow ON flow_executions(flow_id);
CREATE INDEX idx_flow_executions_status ON flow_executions(status);
CREATE INDEX idx_block_executions_flow_execution ON block_executions(flow_execution_id);
CREATE INDEX idx_decisions_block ON decisions(block_id);
CREATE INDEX idx_decisions_created ON decisions(created_at);
CREATE INDEX idx_patterns_block ON patterns(block_id);
```

### Drizzle Schema (TypeScript)

```typescript
// src/db/schema.ts
import { pgTable, uuid, varchar, text, jsonb, boolean, integer, decimal, timestamp } from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  config: jsonb('config').notNull(),
  isDefault: boolean('is_default').default(false),
  status: varchar('status', { length: 50 }).default('unconfigured'),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  subtype: varchar('subtype', { length: 50 }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  inputSchema: jsonb('input_schema').notNull().default({}),
  outputSchema: jsonb('output_schema').notNull().default({}),
  config: jsonb('config').notNull().default({}),
  connectionId: uuid('connection_id').references(() => connections.id),
  model: varchar('model', { length: 255 }),
  goal: text('goal'),
  systemPrompt: text('system_prompt'),
  temperature: decimal('temperature', { precision: 3, scale: 2 }),
  maxTokens: integer('max_tokens'),
  code: text('code'),
  executionCount: integer('execution_count').default(0),
  avgLatencyMs: integer('avg_latency_ms'),
  lastExecutedAt: timestamp('last_executed_at'),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ... more tables
```

---

## Feature Roadmap

### Phase 1: Foundation (MVP)

**Goal**: Basic block creation and testing

| Feature | Priority | Description |
|---------|----------|-------------|
| Workspace setup | P0 | Create workspace, basic auth |
| Connection manager | P0 | Add OpenAI/Anthropic connections |
| AI Block editor | P0 | Create Baleybot blocks with goal, schema |
| Function Block editor | P0 | Create Deterministic blocks with code |
| Block test runner | P0 | Run blocks with sample input |
| Schema builder | P1 | Visual JSON Schema editor |

**Deliverables**:
- Users can create AI and Function blocks
- Users can test blocks with sample data
- Decisions are logged for AI blocks

### Phase 2: Composition

**Goal**: Connect blocks into flows

| Feature | Priority | Description |
|---------|----------|-------------|
| Flow canvas | P0 | React Flow based visual editor |
| Block palette | P0 | Drag blocks onto canvas |
| Connection validation | P1 | Validate schema compatibility |
| Pattern blocks | P1 | Pipeline, parallel, route, loop |
| Manual trigger | P0 | Run flows with test input |
| Webhook trigger | P1 | HTTP endpoint to trigger flows |

**Deliverables**:
- Users can compose blocks visually
- Users can run flows manually or via webhook

### Phase 3: Observability

**Goal**: Understand what AI decides

| Feature | Priority | Description |
|---------|----------|-------------|
| Decision log | P0 | View all AI decisions |
| Decision detail | P0 | Input, output, reasoning view |
| Filters & search | P1 | Filter by block, date, output |
| Execution replay | P1 | Re-run with same input |
| Feedback system | P1 | Mark decisions correct/incorrect |

**Deliverables**:
- Users can inspect every AI decision
- Users can provide feedback on decisions

### Phase 4: Evolution

**Goal**: Turn AI patterns into code

| Feature | Priority | Description |
|---------|----------|-------------|
| Pattern extraction | P0 | Identify rules from decisions |
| Code generation | P0 | Generate Function block from patterns |
| A/B testing | P1 | Run AI vs Code side-by-side |
| Hybrid mode | P1 | Code for common, AI for edge cases |
| Block swap | P1 | Replace AI block with Function block |

**Deliverables**:
- Users can generate code from AI behavior
- Users can gradually replace AI with code

### Phase 5: Production

**Goal**: Run flows reliably at scale

| Feature | Priority | Description |
|---------|----------|-------------|
| Schedule trigger | P0 | Cron-based flow execution |
| DB trigger | P1 | Run on database changes |
| Error handling | P0 | Retry, fallback, alerting |
| Monitoring dashboard | P1 | Execution metrics, health |
| Version control | P1 | Flow versioning, rollback |
| Team collaboration | P2 | Invite members, roles |

---

## Component Structure

### Page Layout

```
src/
├── app/
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Landing/redirect
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Dashboard layout with sidebar
│   │   ├── page.tsx               # Dashboard home
│   │   ├── blocks/
│   │   │   ├── page.tsx           # Block library
│   │   │   ├── new/page.tsx       # Create block
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # Block detail/editor
│   │   │       └── decisions/page.tsx  # Block decisions
│   │   ├── flows/
│   │   │   ├── page.tsx           # Flow list
│   │   │   ├── new/page.tsx       # Create flow
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # Flow editor (canvas)
│   │   │       └── runs/page.tsx  # Execution history
│   │   ├── decisions/
│   │   │   └── page.tsx           # Global decision inspector
│   │   └── settings/
│   │       ├── page.tsx           # General settings
│   │       └── connections/page.tsx  # Provider connections
```

### Key Components

```
src/
├── components/
│   ├── ui/                        # shadcn/ui components
│   ├── blocks/
│   │   ├── BlockCard.tsx          # Block preview card
│   │   ├── BlockEditor.tsx        # Full block editor
│   │   ├── AIBlockConfig.tsx      # AI-specific config
│   │   ├── FunctionBlockConfig.tsx # Code editor
│   │   ├── SchemaEditor.tsx       # JSON Schema builder
│   │   └── BlockTestRunner.tsx    # Test with sample input
│   ├── flows/
│   │   ├── FlowCanvas.tsx         # React Flow canvas
│   │   ├── BlockPalette.tsx       # Draggable blocks
│   │   ├── NodeTypes/             # Custom React Flow nodes
│   │   │   ├── AIBlockNode.tsx
│   │   │   ├── FunctionBlockNode.tsx
│   │   │   ├── SourceNode.tsx
│   │   │   └── SinkNode.tsx
│   │   ├── EdgeTypes/             # Custom edges
│   │   └── FlowToolbar.tsx        # Run, save, settings
│   ├── decisions/
│   │   ├── DecisionTable.tsx      # Decision list
│   │   ├── DecisionDetail.tsx     # Full decision view
│   │   ├── DecisionFilters.tsx    # Filter controls
│   │   └── FeedbackForm.tsx       # Mark correct/incorrect
│   ├── connections/
│   │   ├── ConnectionCard.tsx
│   │   ├── ConnectionForm.tsx
│   │   └── ProviderSelector.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       └── WorkspaceSwitcher.tsx
```

---

## API Design

### tRPC Routers

```typescript
// src/server/routers/index.ts
export const appRouter = router({
  workspace: workspaceRouter,
  connection: connectionRouter,
  block: blockRouter,
  flow: flowRouter,
  execution: executionRouter,
  decision: decisionRouter,
  pattern: patternRouter,
});

// Block Router
export const blockRouter = router({
  list: publicProcedure
    .input(z.object({ workspaceId: z.string(), type: z.string().optional() }))
    .query(async ({ input }) => { /* ... */ }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => { /* ... */ }),

  create: publicProcedure
    .input(createBlockSchema)
    .mutation(async ({ input }) => { /* ... */ }),

  update: publicProcedure
    .input(updateBlockSchema)
    .mutation(async ({ input }) => { /* ... */ }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => { /* ... */ }),

  test: publicProcedure
    .input(z.object({ id: z.string(), input: z.any() }))
    .mutation(async ({ input }) => { /* ... */ }),
});

// Decision Router
export const decisionRouter = router({
  list: publicProcedure
    .input(z.object({
      blockId: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      output: z.any().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => { /* ... */ }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => { /* ... */ }),

  feedback: publicProcedure
    .input(z.object({
      id: z.string(),
      correct: z.boolean(),
      notes: z.string().optional(),
      correctedOutput: z.any().optional(),
    }))
    .mutation(async ({ input }) => { /* ... */ }),

  extractPatterns: publicProcedure
    .input(z.object({ blockId: z.string() }))
    .mutation(async ({ input }) => { /* ... */ }),
});
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Week 1: Setup & Core**
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up Tailwind CSS and shadcn/ui
- [ ] Configure Drizzle ORM with PostgreSQL
- [ ] Create database schema and migrations
- [ ] Set up tRPC with basic routers
- [ ] Implement workspace and connection models

**Week 2: Block Editor**
- [ ] Create Block CRUD API
- [ ] Build BlockEditor component
- [ ] Implement AIBlockConfig (goal, model, schema)
- [ ] Implement FunctionBlockConfig (Monaco editor)
- [ ] Build SchemaEditor component
- [ ] Create BlockTestRunner

### Phase 2: Composition (Weeks 3-4)

**Week 3: Flow Canvas**
- [ ] Integrate React Flow
- [ ] Create custom node types
- [ ] Build BlockPalette with drag-drop
- [ ] Implement connection validation
- [ ] Create Flow CRUD API

**Week 4: Execution**
- [ ] Build flow compiler (visual → BaleyBots code)
- [ ] Implement execution engine
- [ ] Create manual trigger UI
- [ ] Add webhook trigger endpoint
- [ ] Build execution monitor

### Phase 3: Observability (Weeks 5-6)

**Week 5: Decision Logging**
- [ ] Implement decision logging in execution engine
- [ ] Create DecisionTable component
- [ ] Build DecisionDetail view
- [ ] Add filter and search

**Week 6: Feedback & Analysis**
- [ ] Implement feedback system
- [ ] Create decision analytics dashboard
- [ ] Build pattern extraction algorithm
- [ ] Add decision export

### Phase 4: Evolution (Weeks 7-8)

**Week 7: Code Generation**
- [ ] Build pattern-to-code generator
- [ ] Create code preview UI
- [ ] Implement "Convert to Function" flow
- [ ] Add block swap functionality

**Week 8: Advanced Features**
- [ ] Implement A/B testing
- [ ] Build hybrid mode
- [ ] Add version control for blocks/flows
- [ ] Polish and bug fixes

---

## File Structure

```
BaleyUI/
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   └── api/
│   │       └── trpc/[trpc]/route.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── blocks/
│   │   ├── flows/
│   │   ├── decisions/
│   │   ├── connections/
│   │   └── layout/
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── schema.ts
│   │   │   └── migrations/
│   │   ├── baleybots/
│   │   │   ├── compiler.ts       # Flow → BaleyBots code
│   │   │   ├── executor.ts       # Run compiled flows
│   │   │   └── providers.ts      # Provider management
│   │   ├── trpc/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── routers/
│   │   ├── patterns/
│   │   │   ├── extractor.ts      # Extract patterns from decisions
│   │   │   └── generator.ts      # Generate code from patterns
│   │   └── utils/
│   │       ├── schema.ts         # JSON Schema helpers
│   │       └── crypto.ts         # Encrypt/decrypt API keys
│   ├── hooks/
│   │   ├── useBlock.ts
│   │   ├── useFlow.ts
│   │   └── useDecisions.ts
│   ├── stores/
│   │   ├── flowStore.ts          # React Flow state
│   │   └── uiStore.ts            # UI state
│   └── types/
│       ├── block.ts
│       ├── flow.ts
│       └── decision.ts
├── public/
├── drizzle.config.ts
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── PLAN.md                       # This file
├── README.md
└── CHANGELOG.md
```

---

## Success Metrics

### MVP Success Criteria

- [ ] User can create an AI block with goal and schema
- [ ] User can create a Function block with code
- [ ] User can test blocks with sample input
- [ ] User can compose blocks into a flow
- [ ] User can run a flow and see results
- [ ] AI decisions are logged and viewable
- [ ] User can provide feedback on decisions

### Long-term Success Criteria

- [ ] 50%+ of AI blocks eventually converted to code
- [ ] Average decision inspection time < 30 seconds
- [ ] Flow execution success rate > 99%
- [ ] Pattern extraction accuracy > 80%

---

## Open Questions

1. **Authentication**: Use NextAuth.js, Clerk, or custom?
2. **Multi-tenancy**: Workspace isolation strategy?
3. **Code execution**: Sandboxed VM for Function blocks?
4. **Versioning**: Git-like or simpler versioning?
5. **Pricing model**: Usage-based, seat-based, or hybrid?

---

## References

- [BaleyBots Repository](https://github.com/cbethin/baleybots)
- [React Flow Documentation](https://reactflow.dev/)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [tRPC](https://trpc.io/)

---

*Last updated: December 2024*
