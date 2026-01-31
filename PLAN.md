# BaleyUI - Project Plan

> The most intuitive platform for AI-first product development. Not just chatbots—actual intelligent systems.

**Repository**: https://github.com/jamesmcarthur-3999/BaleyUI

---

## Table of Contents

1. [Vision](#vision)
2. [What Makes This Different](#what-makes-this-different)
3. [Core Philosophy](#core-philosophy)
   - [Resilience by Design](#0-resilience-by-design) (Day 1 Infrastructure)
   - [We Eat Our Own Cooking](#6-we-eat-our-own-cooking) (Internal BaleyBots)
4. [The BaleyBots Foundation](#the-baleybots-foundation)
5. [Product Scope](#product-scope)
6. [The Four Pillars](#the-four-pillars)
7. [Phase 1: Foundation](#phase-1-foundation)
8. [Phase 2: Composition & Observability](#phase-2-composition--observability)
9. [Phase 3: Integration & Distribution](#phase-3-integration--distribution)
10. [Phase 4: Intelligence & Evolution](#phase-4-intelligence--evolution)
11. [Technical Architecture](#technical-architecture)
12. [Database Schema](#database-schema)
13. [Design System](#design-system)
14. [Success Metrics](#success-metrics)

---

## Vision

**The Problem**: Today's AI integration is shallow. Teams slap a chatbot on their product and call it "AI-powered." Real AI integration—where intelligence is woven into every decision, every workflow, every edge case—requires:

- Complex orchestration code
- No visibility into AI decisions
- Difficult debugging
- No path from prototype to production
- Expensive cloud models for simple decisions

**Our Solution**: BaleyUI makes it **so fucking easy** to build genuinely intelligent systems that AI-first thinking becomes the default, not the exception.

We provide:
1. **Visual creation** of AI agents, tools, and workflows
2. **Real-time observability** into every decision
3. **Embeddable components** that drop into any application
4. **Local model support** for fast, cheap, private decisions
5. **Database integration** for AI that understands your data
6. **Evolution tools** to turn AI prototypes into production code

---

## What Makes This Different

### Not Another Chatbot Builder

| Other Platforms | BaleyUI |
|-----------------|---------|
| Build chatbots | Build **intelligent systems** |
| Single model selection | **Tiered model routing** (local → fast → powerful) |
| API key + prompt | **Full tool integration** (database, APIs, MCP) |
| Chat interface only | **Any interface** (API, webhook, scheduled, embedded) |
| Black box decisions | **Complete observability** |
| Cloud-only | **Local-first option** (Ollama) |
| Standalone product | **Embeddable components** for your app |

### The AI-First Stack

```
Traditional:                    AI-First (with BaleyUI):
┌─────────────────┐            ┌─────────────────┐
│   Your App      │            │   Your App      │
├─────────────────┤            ├─────────────────┤
│   Business      │            │   BaleyUI       │
│   Logic         │            │   Components    │
├─────────────────┤            ├─────────────────┤
│   Database      │            │   BaleyBots     │
└─────────────────┘            │   Runtime       │
                               ├─────────────────┤
                               │   LLMs (Cloud   │
                               │   + Local)      │
                               └─────────────────┘
```

---

## Core Philosophy

### 0. Resilience by Design

> The system MUST run reliably, recover gracefully, and maintain data integrity from day 1.

**Three Guarantees:**

1. **Execution Independence**: AI execution MUST NOT depend on client connection. When a user triggers an execution, it runs server-side regardless of whether they stay on the page, navigate away, or close the browser. Results are always persisted and retrievable.

2. **Failure Recovery**: The system MUST recover gracefully from any failure point:
   - Server crash → Stale executions detected on restart → Automatic retry
   - Client disconnect → Execution continues → Client can reconnect and replay events
   - Network failure → Automatic reconnection with exponential backoff

3. **Data Integrity**: Every operation MUST maintain consistent state:
   - All multi-table operations wrapped in transactions
   - Optimistic locking prevents concurrent update conflicts
   - Soft deletes enable data recovery
   - Full audit trail for compliance and debugging

**No Tech Debt**: These are not Phase 2 concerns. They are foundational requirements built from the first line of code.

### 1. The Processable Interface is Everything

BaleyBots' `Processable<TInput, TOutput>` interface is the universal abstraction:

```typescript
interface Processable<TInput, TOutput> {
  process(input: TInput): Promise<TOutput>;
  subscribeToAll(handlers): Subscription;
  getId(): string;
  getName?(): string;
}
```

**Everything** implements this interface:
- AI agents (`Baleybot`)
- Coded functions (`Deterministic`)
- Compositions (`pipeline`, `Loop`, `BaleybotRouter`, `ParallelMerge`)

This means **AI and code are interchangeable**. Build with AI, replace with code, no refactoring.

### 2. Local Models Are First-Class

Not everything needs GPT-4. A tiny local model can:
- Route requests to specialists
- Validate input formats
- Make simple classifications
- Guard expensive operations

BaleyUI treats Ollama (and other local providers) as first-class citizens, not afterthoughts.

### 3. Streaming Is Infrastructure

Every AI operation streams. Period. This enables:
- Instant perceived responsiveness
- Live tool execution visibility
- Real-time debugging
- Concurrent operation monitoring

### 4. Embeddable by Design

BaleyUI isn't just a dashboard—it's a **component library** for AI-powered interfaces:

```tsx
// Drop AI into any React app
import { BaleyChatPanel, BaleyDecisionCard, BaleyToolApproval } from '@baleyui/react';

function MyApp() {
  return (
    <div>
      <BaleyChatPanel botId="support-agent" />
      <BaleyDecisionCard decisionId={lastDecision} />
      <BaleyToolApproval onApprove={handleApproval} />
    </div>
  );
}
```

### 5. Database-Native AI

AI that can't access your data is useless. BaleyUI provides:
- Schema introspection and visualization
- Auto-generated database tools
- Query building UI
- Permission-scoped access

### 6. We Eat Our Own Cooking

**BaleyUI is powered by BaleyBots.** We're not just building tools for others—we're our own first and best customer.

This means:
- The platform that helps you build AI systems is itself AI-powered
- Every feature we build, we use internally first
- We generate real training data from our own usage
- We prove the AI→Code evolution cycle works by doing it ourselves

#### Internal BaleyBots

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BALEYUI INTERNAL AGENTS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     OPTIMIZATION LAYER                              │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│  │  │ Model Advisor  │  │ Cost Optimizer │  │ Pattern        │        │   │
│  │  │                │  │                │  │ Detector       │        │   │
│  │  │ "Use llama3:1b │  │ "This block    │  │ "I found 3     │        │   │
│  │  │  for routing,  │  │  costs $12/day │  │  patterns in   │        │   │
│  │  │  it's 50x      │  │  - switch to   │  │  your fraud    │        │   │
│  │  │  cheaper"      │  │  local model?" │  │  scorer"       │        │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     ASSISTANCE LAYER                                │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│  │  │ Schema Helper  │  │ Debug Agent    │  │ Onboarding     │        │   │
│  │  │                │  │                │  │ Guide          │        │   │
│  │  │ "Your output   │  │ "The error is  │  │ "Let's create  │        │   │
│  │  │  schema should │  │  in tool args  │  │  your first    │        │   │
│  │  │  include..."   │  │  validation"   │  │  AI block"     │        │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     AUTOMATION LAYER                                │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│  │  │ Auto Schema    │  │ Test Case      │  │ Flow           │        │   │
│  │  │ Generator      │  │ Generator      │  │ Optimizer      │        │   │
│  │  │                │  │                │  │                │        │   │
│  │  │ Infer schemas  │  │ Generate tests │  │ Suggest flow   │        │   │
│  │  │ from examples  │  │ from decisions │  │ improvements   │        │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Architectural Implications

To make internal BaleyBots work seamlessly, the architecture must be:

1. **Modular Execution Context**
   ```typescript
   // Same executor, different context
   const userBlockExecutor = createExecutor({
     workspace: userWorkspace,
     connections: userConnections,
     databases: userDatabases
   });

   const internalExecutor = createExecutor({
     workspace: SYSTEM_WORKSPACE,
     connections: platformConnections,
     databases: [platformDb]  // Our own DB
   });
   ```

2. **Shared Streaming Infrastructure**
   - User bots and internal bots use the same streaming system
   - Internal bot suggestions appear as UI hints, not blocking modals
   - All internal decisions are logged (we analyze ourselves too)

3. **Permission Isolation**
   - Internal bots can read user metadata (block configs, decision patterns)
   - Internal bots CANNOT read user data (their database contents)
   - Clear boundaries between "platform intelligence" and "user intelligence"

4. **Progressive Enhancement**
   - App works without internal AI (offline, rate limited, etc.)
   - Internal bots enhance, never block
   - Suggestions are suggestions, not requirements

#### Example: Model Advisor Bot

```typescript
// Internal bot that suggests model optimizations
const modelAdvisor = Baleybot.create({
  name: 'model-advisor',
  goal: `Analyze user's block configuration and usage patterns.
         Suggest model changes that reduce cost or improve latency
         without sacrificing quality.`,
  model: ollama('llama3.2:3b'),  // Runs locally, no cost
  outputSchema: z.object({
    suggestions: z.array(z.object({
      blockId: z.string(),
      currentModel: z.string(),
      suggestedModel: z.string(),
      reason: z.string(),
      estimatedSavings: z.string(),
      confidenceLevel: z.enum(['high', 'medium', 'low'])
    })),
    summary: z.string()
  }),
  tools: {
    getBlockStats: defineZodTool({
      name: 'get_block_stats',
      description: 'Get usage statistics for a block',
      inputSchema: z.object({ blockId: z.string() }),
      function: async ({ blockId }) => {
        return await db.query.decisions.findMany({
          where: eq(decisions.blockId, blockId),
          columns: {
            model: true,
            tokensInput: true,
            tokensOutput: true,
            latencyMs: true,
            feedbackCorrect: true
          }
        });
      }
    }),
    getAvailableModels: defineZodTool({
      name: 'get_available_models',
      description: 'Get list of available models with capabilities',
      inputSchema: z.object({}),
      function: async () => {
        return await getAvailableModels(workspaceId);
      }
    })
  }
});

// Triggered periodically or on block edit
const suggestions = await modelAdvisor.process({
  blockId: block.id,
  currentConfig: block,
  recentDecisions: last100Decisions
});

// Show non-intrusively in UI
if (suggestions.suggestions.length > 0) {
  showOptimizationHint(suggestions);
}
```

#### Why This Matters

1. **We prove the product works** - If we can't use it ourselves, why should anyone else?

2. **Faster iteration** - We feel the pain points immediately

3. **Real training data** - Our internal bots generate patterns we can codify

4. **Compelling demo** - "This entire platform is AI-powered by the same system you're building with"

5. **Cost optimization** - We eat the cost of internal AI, so we're incentivized to make it efficient

---

## The BaleyBots Foundation

BaleyUI is built on BaleyBots. Understanding the runtime is essential.

### Core Primitives

| Primitive | Purpose | UI Representation |
|-----------|---------|-------------------|
| `Baleybot` | AI agent with goal, model, tools, schema | **AI Block** |
| `Deterministic` | Pure function wrapper | **Function Block** |
| `defineZodTool` | Type-safe tool definition | **Tool** |
| `pipeline()` | Sequential composition | **Pipeline Flow** |
| `BaleybotRouter` | Type-safe conditional routing | **Router Node** |
| `Loop` | Iterative processing with state | **Loop Node** |
| `ParallelMerge` | Fan-out/fan-in pattern | **Parallel Node** |
| `BaleybotFilter` | Array partitioning | **Filter Node** |
| `BaleybotGate` | Guard pattern | **Gate Node** |

### Streaming Events

BaleyBots emits typed events during processing:

```typescript
type BaleybotStreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'structured_output_delta'; content: string }
  | { type: 'tool_call_stream_start'; id: string; toolName: string }
  | { type: 'tool_call_arguments_delta'; id: string; argumentsDelta: string }
  | { type: 'tool_call_stream_complete'; id: string; toolName: string; arguments: unknown }
  | { type: 'tool_execution_start'; id: string; toolName: string; arguments: unknown }
  | { type: 'tool_execution_output'; id: string; toolName: string; result: unknown }
  | { type: 'tool_execution_stream'; nestedEvent: BaleybotStreamEvent }  // Nested bot events!
  | { type: 'reasoning'; content: string }  // For reasoning models
  | { type: 'error'; error: Error }
  | { type: 'done'; reason: DoneReason; agent_id: string };
```

The UI must handle ALL of these events in real-time.

### Provider Support

BaleyBots supports:
- **OpenAI**: gpt-4o, gpt-4o-mini, o1, o3
- **Anthropic**: claude-3-5-sonnet, claude-haiku-4-5
- **Ollama**: Any local model (llama3, mistral, phi, etc.)
- **Custom**: Via provider configuration

### Local Model Management (Ollama)

Ollama is a **first-class citizen** in BaleyUI, not an afterthought. Users can run models locally for:
- **Privacy**: Data never leaves their machine
- **Cost savings**: No per-token charges
- **Speed**: Low latency for simple tasks (routing, classification)
- **Offline use**: Works without internet

#### What BaleyBots Provides (Already Built)

```typescript
import { Baleybot, ollama } from '@baleybots/core';

// BaleyBots handles all the hard work:
const bot = Baleybot.create({
  model: ollama('llama3.2', { baseUrl: 'http://localhost:11434' }),
  tools: [myTool],  // Tool calling works
});

// Streaming, tool calls, reasoning extraction - all handled
await bot.process(input, { onToken: (name, event) => handleEvent(event) });
```

BaleyBots provides:
- `ollama()` provider factory with configurable `baseUrl`
- Full streaming support (same events as OpenAI/Anthropic)
- Tool calling support
- Vision/multimodal support
- Reasoning extraction (DeepSeek-R1, QwQ, Qwen3)
- No authentication required for local instances

#### What BaleyUI Must Build (UI Layer)

BaleyUI wraps Ollama's REST API to provide model management:

| Ollama API | BaleyUI Feature |
|------------|-----------------|
| `GET /` | Connection health check |
| `GET /api/tags` | List installed models |
| `POST /api/pull` | Download models with progress |
| `DELETE /api/delete` | Remove models |
| `POST /api/show` | View model details |
| `GET /api/ps` | Show loaded models (memory usage) |

#### Ollama UI Requirements

**1. Connection Setup**
- Base URL input (default: `http://localhost:11434`)
- Test connection button
- Show Ollama version on success
- Optional API key for remote/authenticated instances

**2. Model Browser**
- List all installed models with metadata
- Show: name, size, parameters, quantization level
- Badge for reasoning-capable models (DeepSeek-R1, QwQ)
- "Use in Block" quick action

**3. Model Pull Interface**
- Search/select from Ollama library
- Popular model suggestions (llama3.2, mistral, phi3, deepseek-r1)
- **Streaming progress** with:
  - Progress bar (bytes downloaded / total)
  - Download speed (MB/s)
  - ETA countdown
- Cancel button for in-progress downloads

**4. Model Management**
- Delete models with confirmation dialog
- Show currently loaded models with memory usage
- Model details modal (full modelfile, template, parameters)

**5. Block Integration**
- Model selector shows Ollama models alongside cloud models
- Visual distinction (icon/badge) for local vs cloud
- Tooltip showing model source and size

### Tool System

Tools are defined with full type safety:

```typescript
const searchTool = defineZodTool({
  name: 'search_database',
  description: 'Search for records in the database',
  inputSchema: z.object({
    table: z.string(),
    query: z.record(z.unknown()),
    limit: z.number().optional()
  }),
  function: async (params) => {
    // params is fully typed
    return db.query(params.table).where(params.query).limit(params.limit ?? 10);
  }
});
```

BaleyUI must enable **visual tool creation** with this power.

---

## Product Scope

### What We Build

1. **BaleyUI Dashboard** - Web application for creating and managing bots
2. **@baleyui/react** - Embeddable React components
3. **@baleyui/core** - Headless hooks and utilities
4. **Database Connectors** - PostgreSQL, MySQL, MongoDB integration
5. **Local Model Manager** - Full Ollama integration including:
   - Connection management (local and remote Ollama instances)
   - Model browser with installed model details
   - Model download with streaming progress
   - Model deletion and cleanup
   - Running model monitoring (memory usage)

### User Journeys

#### Journey 1: Create a Simple AI Agent
1. Open dashboard → New Block → AI Block
2. Enter name, goal, select model (including local options)
3. Define output schema (visual schema builder)
4. Test with Live Chat interface
5. Deploy → Get API endpoint or embed code

#### Journey 2: Build a Multi-Agent Workflow
1. Create individual blocks (AI + Function)
2. Open Flow Canvas → Drag blocks
3. Connect with composition patterns (pipeline, router, parallel)
4. Test entire flow with sample input
5. Deploy with webhook trigger or schedule

#### Journey 3: Add AI to Existing Product
1. Install `@baleyui/react`
2. Configure connection to BaleyUI backend
3. Drop `<BaleyChatPanel botId="..." />` into your app
4. Done—full AI chat with streaming, tools, history

#### Journey 4: Connect AI to Your Database
1. Settings → Database Connections → Add PostgreSQL
2. Schema browser shows tables/columns
3. Generate tools: "Create query tools for `orders` table"
4. AI block can now search, filter, aggregate your data

#### Journey 5: Use Local Models for Routing
1. Settings → Connections → Add Ollama → Test Connection
2. Browse installed models, or pull new ones (llama3.2, deepseek-r1)
3. See download progress streaming in real-time
4. Create router block with local model for classification
5. Route to specialist cloud models only when needed
6. 90% of requests handled locally → massive cost savings

#### Journey 6: Manage Local Model Library
1. Settings → Connections → Select Ollama connection
2. View all installed models with size and parameter counts
3. Pull a new model (e.g., `mistral:7b`) with progress bar
4. See which models are currently loaded in memory (RAM/VRAM)
5. Delete unused models to free up disk space
6. View model details (modelfile, system prompt template)

---

## The Four Pillars

### Pillar 1: Creation
Visual tools for building AI agents, tools, and workflows.

### Pillar 2: Observation
Real-time streaming, decision logging, debugging.

### Pillar 3: Integration
Embeddable components, database connectors, API generation.

### Pillar 4: Evolution
Pattern extraction, code generation, AI→Code lifecycle.

---

## Phase 1: Foundation

**Goal**: Build the core infrastructure that everything else depends on. Ship a working product that creates and tests AI blocks with real-time streaming.

### 1.1 Project Setup

```
BaleyUI/
├── apps/
│   └── web/                    # Next.js dashboard
├── packages/
│   ├── ui/                     # Shared UI components
│   ├── react/                  # @baleyui/react embeddable components
│   ├── core/                   # @baleyui/core hooks and utilities
│   └── db/                     # Database schema and queries
├── package.json                # Workspace root
└── turbo.json                  # Turborepo config
```

### 1.2 Design System

```css
/* packages/ui/src/tokens.css */
:root {
  /* Core palette */
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(222 47% 11%);
  --color-primary: hsl(221 83% 53%);
  --color-primary-foreground: hsl(0 0% 100%);

  /* Semantic colors */
  --color-success: hsl(142 76% 36%);
  --color-warning: hsl(38 92% 50%);
  --color-error: hsl(0 84% 60%);
  --color-ai: hsl(271 91% 65%);        /* Purple for AI indicators */
  --color-function: hsl(199 89% 48%);  /* Blue for function blocks */
  --color-local: hsl(142 76% 36%);     /* Green for local models */

  /* Block type colors */
  --color-block-ai: var(--color-ai);
  --color-block-function: var(--color-function);
  --color-block-router: hsl(38 92% 50%);
  --color-block-parallel: hsl(280 87% 65%);

  /* Streaming indicators */
  --color-stream-active: hsl(142 76% 36%);
  --color-stream-tool: hsl(38 92% 50%);
  --color-stream-error: hsl(0 84% 60%);
}
```

### 1.3 Database Schema (Drizzle)

```typescript
// packages/db/src/schema.ts
import { pgTable, uuid, varchar, text, jsonb, boolean, integer, timestamp, decimal } from 'drizzle-orm/pg-core';

// Workspaces
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Provider Connections (OpenAI, Anthropic, Ollama, Database)
export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // 'openai' | 'anthropic' | 'ollama' | 'postgres' | 'mysql' | 'mongodb'
  name: varchar('name', { length: 255 }).notNull(),
  config: jsonb('config').notNull(), // Encrypted credentials, base URLs, etc.
  isDefault: boolean('is_default').default(false),
  status: varchar('status', { length: 50 }).default('unconfigured'),
  // For Ollama
  availableModels: jsonb('available_models'), // Cached list of local models
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Tools (reusable across blocks)
export const tools = pgTable('tools', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  inputSchema: jsonb('input_schema').notNull(), // Zod schema as JSON
  code: text('code').notNull(), // TypeScript function body
  // For database tools
  connectionId: uuid('connection_id').references(() => connections.id),
  isGenerated: boolean('is_generated').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Blocks (AI, Function, Composition patterns)
export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // 'ai' | 'function' | 'router' | 'pipeline' | 'loop' | 'parallel'
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),

  // Schemas
  inputSchema: jsonb('input_schema').default({}),
  outputSchema: jsonb('output_schema').default({}),

  // AI Block fields
  connectionId: uuid('connection_id').references(() => connections.id),
  model: varchar('model', { length: 255 }),
  goal: text('goal'),
  systemPrompt: text('system_prompt'),
  temperature: decimal('temperature', { precision: 3, scale: 2 }),
  maxTokens: integer('max_tokens'),
  maxToolIterations: integer('max_tool_iterations').default(25),

  // Function Block fields
  code: text('code'),

  // Router Block fields (stores route configuration)
  routerConfig: jsonb('router_config'),

  // Loop Block fields
  loopConfig: jsonb('loop_config'),

  // Tools attached to this block
  toolIds: jsonb('tool_ids').default([]), // UUID[]

  // Metrics
  executionCount: integer('execution_count').default(0),
  avgLatencyMs: integer('avg_latency_ms'),
  lastExecutedAt: timestamp('last_executed_at'),

  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Flows (visual composition)
export const flows = pgTable('flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),

  // React Flow graph
  nodes: jsonb('nodes').default([]),
  edges: jsonb('edges').default([]),

  // Triggers
  triggers: jsonb('triggers').default([]), // webhook, schedule, manual

  enabled: boolean('enabled').default(false),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Flow Executions
export const flowExecutions = pgTable('flow_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  flowId: uuid('flow_id').references(() => flows.id, { onDelete: 'cascade' }),
  flowVersion: integer('flow_version').notNull(),
  triggeredBy: jsonb('triggered_by').notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  error: jsonb('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Block Executions (individual block runs, standalone or within flow)
export const blockExecutions = pgTable('block_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockId: uuid('block_id').references(() => blocks.id, { onDelete: 'cascade' }),
  flowExecutionId: uuid('flow_execution_id').references(() => flowExecutions.id, { onDelete: 'cascade' }),

  // BaleyBots runtime IDs
  baleybotId: varchar('baleybot_id', { length: 100 }), // e.g., 'baleybot-1-a3f891'
  parentBaleybotId: varchar('parent_baleybot_id', { length: 100 }),

  status: varchar('status', { length: 50 }).notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),

  // For AI blocks
  model: varchar('model', { length: 255 }),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  reasoning: text('reasoning'), // For reasoning models

  // Streaming events (for replay)
  streamEvents: jsonb('stream_events').default([]),

  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Tool Executions (within block execution)
export const toolExecutions = pgTable('tool_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockExecutionId: uuid('block_execution_id').references(() => blockExecutions.id, { onDelete: 'cascade' }),
  toolId: uuid('tool_id').references(() => tools.id),
  toolCallId: varchar('tool_call_id', { length: 100 }),
  toolName: varchar('tool_name', { length: 255 }).notNull(),
  arguments: jsonb('arguments'),
  result: jsonb('result'),
  error: text('error'),

  // Approval tracking
  requiresApproval: boolean('requires_approval').default(false),
  approvalStatus: varchar('approval_status', { length: 50 }), // 'pending' | 'approved' | 'rejected' | 'modified'
  approvalDecision: jsonb('approval_decision'),
  approvedAt: timestamp('approved_at'),

  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').defaultNow(),
});

// AI Decisions (derived from block executions, for observability)
export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockId: uuid('block_id').references(() => blocks.id, { onDelete: 'cascade' }),
  blockExecutionId: uuid('block_execution_id').references(() => blockExecutions.id, { onDelete: 'cascade' }),

  input: jsonb('input').notNull(),
  output: jsonb('output').notNull(),
  reasoning: text('reasoning'),

  model: varchar('model', { length: 255 }),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  latencyMs: integer('latency_ms'),
  cost: decimal('cost', { precision: 10, scale: 6 }), // Track cost per decision

  // Feedback
  feedbackCorrect: boolean('feedback_correct'),
  feedbackNotes: text('feedback_notes'),
  feedbackCorrectedOutput: jsonb('feedback_corrected_output'),
  feedbackAt: timestamp('feedback_at'),

  createdAt: timestamp('created_at').defaultNow(),
});

// Patterns (extracted rules from decisions)
export const patterns = pgTable('patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockId: uuid('block_id').references(() => blocks.id, { onDelete: 'cascade' }),
  rule: text('rule').notNull(), // Human-readable
  condition: jsonb('condition').notNull(), // Machine-parseable (JSON Logic)
  outputTemplate: jsonb('output_template'),
  confidence: decimal('confidence', { precision: 5, scale: 4 }),
  supportCount: integer('support_count'),
  generatedCode: text('generated_code'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Test Cases
export const testCases = pgTable('test_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockId: uuid('block_id').references(() => blocks.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  input: jsonb('input').notNull(),
  expectedOutput: jsonb('expected_output'),
  assertions: jsonb('assertions').default([]),
  tags: jsonb('tags').default([]),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ==========================================
// RESILIENCE INFRASTRUCTURE TABLES
// ==========================================

// Execution Events (for stream replay and recovery)
// Stores every stream event for any execution, enabling reconnection and replay
export const executionEvents = pgTable('execution_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  executionId: uuid('execution_id').references(() => blockExecutions.id, { onDelete: 'cascade' }),

  index: integer('index').notNull(),  // Sequential for ordering
  eventType: varchar('event_type', { length: 50 }).notNull(),
  eventData: jsonb('event_data').notNull(),

  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  executionEventIdx: uniqueIndex('execution_event_idx').on(table.executionId, table.index),
}));

// Audit Logs (for compliance and debugging)
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),

  // What changed
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  action: varchar('action', { length: 50 }).notNull(), // create, update, delete, restore

  // Who changed it
  userId: varchar('user_id', { length: 255 }),
  workspaceId: uuid('workspace_id'),

  // What the changes were
  changes: jsonb('changes'),
  previousValues: jsonb('previous_values'),

  // Context
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  requestId: varchar('request_id', { length: 100 }),

  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  entityIdx: index('audit_entity_idx').on(table.entityType, table.entityId),
  userIdx: index('audit_user_idx').on(table.userId),
  timeIdx: index('audit_time_idx').on(table.createdAt),
}));

// Background Jobs (for reliable async execution)
export const backgroundJobs = pgTable('background_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Job type and data
  type: varchar('type', { length: 100 }).notNull(),
  data: jsonb('data').notNull(),

  // Scheduling
  status: varchar('status', { length: 50 }).default('pending'),
  // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  priority: integer('priority').default(0),

  // Execution tracking
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(3),
  lastError: text('last_error'),

  // Locking
  lockedBy: varchar('locked_by', { length: 100 }),
  lockedAt: timestamp('locked_at'),

  // Timing
  scheduledFor: timestamp('scheduled_for').defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusPriorityIdx: index('job_status_priority_idx').on(table.status, table.priority),
  scheduledIdx: index('job_scheduled_idx').on(table.scheduledFor),
}));
```

**Required additions to existing tables for resilience:**

```typescript
// ADD to blockExecutions table:
export const blockExecutions = pgTable('block_executions', {
  // ... existing fields ...

  // Heartbeat for detecting stale executions
  heartbeatAt: timestamp('heartbeat_at'),
  heartbeatInterval: integer('heartbeat_interval_ms').default(5000),

  // Server instance tracking (for crash recovery)
  serverId: varchar('server_id', { length: 100 }),
  serverStartedAt: timestamp('server_started_at'),

  // Retry tracking
  attemptNumber: integer('attempt_number').default(1),
  maxAttempts: integer('max_attempts').default(3),

  // Event storage
  eventCount: integer('event_count').default(0),
  lastEventIndex: integer('last_event_index').default(-1),
});

// ADD to ALL major tables (blocks, flows, tools, connections, workspaces):
// Soft delete fields
deletedAt: timestamp('deleted_at'),
deletedBy: varchar('deleted_by', { length: 255 }),

// Optimistic locking (already present on most tables)
version: integer('version').default(1),
```

### 1.4 Streaming Infrastructure

> **Implementation Note**: We use the [Vercel AI SDK](https://ai-sdk.dev) (`@ai-sdk/react`) for React hooks and state management. Our adapter in `src/lib/streaming/adapter.ts` converts BaleyBots events to AI SDK format. This gives us battle-tested streaming UI with ~100 lines of adapter code instead of building from scratch. See `src/lib/streaming/` for the implementation.

The UI must handle all BaleyBots stream events:

```typescript
// packages/core/src/streaming/types.ts
import type { BaleybotStreamEvent } from '@baleybots/core';

export interface StreamState {
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';
  text: string;
  structuredOutput: unknown;
  toolCalls: ToolCallState[];
  reasoning: string;
  metrics: {
    ttft: number | null; // Time to first token
    tokensPerSecond: number | null;
    totalTokens: number;
  };
  error: Error | null;
}

export interface ToolCallState {
  id: string;
  toolName: string;
  status: 'streaming_args' | 'executing' | 'complete' | 'error';
  arguments: string; // Accumulated args
  parsedArguments?: unknown;
  result?: unknown;
  error?: string;
  nestedStream?: StreamState; // For spawned bots
}

// packages/core/src/streaming/useBlockStream.ts
export function useBlockStream(blockId: string) {
  const [state, setState] = useState<StreamState>(initialState);
  const eventBuffer = useRef<BaleybotStreamEvent[]>([]);

  const execute = useCallback(async (input: unknown) => {
    setState(s => ({ ...s, status: 'connecting' }));
    const startTime = Date.now();
    let firstTokenTime: number | null = null;

    const response = await fetch(`/api/blocks/${blockId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const events = parseSSEChunk(chunk);

      for (const event of events) {
        eventBuffer.current.push(event);

        if (!firstTokenTime && event.type === 'text_delta') {
          firstTokenTime = Date.now();
          setState(s => ({
            ...s,
            status: 'streaming',
            metrics: { ...s.metrics, ttft: firstTokenTime! - startTime }
          }));
        }

        // Handle each event type
        switch (event.type) {
          case 'text_delta':
            setState(s => ({ ...s, text: s.text + event.content }));
            break;

          case 'structured_output_delta':
            // Progressive JSON parsing
            setState(s => ({
              ...s,
              structuredOutput: parsePartialJSON(s.structuredOutput, event.content)
            }));
            break;

          case 'tool_call_stream_start':
            setState(s => ({
              ...s,
              toolCalls: [...s.toolCalls, {
                id: event.id,
                toolName: event.toolName,
                status: 'streaming_args',
                arguments: ''
              }]
            }));
            break;

          case 'tool_call_arguments_delta':
            setState(s => ({
              ...s,
              toolCalls: s.toolCalls.map(tc =>
                tc.id === event.id
                  ? { ...tc, arguments: tc.arguments + event.argumentsDelta }
                  : tc
              )
            }));
            break;

          case 'tool_execution_start':
            setState(s => ({
              ...s,
              toolCalls: s.toolCalls.map(tc =>
                tc.id === event.id
                  ? { ...tc, status: 'executing', parsedArguments: event.arguments }
                  : tc
              )
            }));
            break;

          case 'tool_execution_output':
            setState(s => ({
              ...s,
              toolCalls: s.toolCalls.map(tc =>
                tc.id === event.id
                  ? { ...tc, status: 'complete', result: event.result, error: event.error }
                  : tc
              )
            }));
            break;

          case 'tool_execution_stream':
            // Handle nested bot events (spawned agents)
            setState(s => ({
              ...s,
              toolCalls: s.toolCalls.map(tc =>
                tc.id === event.toolId
                  ? {
                      ...tc,
                      nestedStream: reduceStreamEvent(tc.nestedStream, event.nestedEvent)
                    }
                  : tc
              )
            }));
            break;

          case 'reasoning':
            setState(s => ({ ...s, reasoning: s.reasoning + event.content }));
            break;

          case 'error':
            setState(s => ({ ...s, status: 'error', error: event.error }));
            break;

          case 'done':
            setState(s => ({ ...s, status: 'complete' }));
            break;
        }
      }
    }

    return { state, events: eventBuffer.current };
  }, [blockId]);

  return { state, execute, reset };
}
```

#### Execution-First API (Server-Independent)

Executions run on the server independently of client connections. Users can navigate away and return to see results.

```typescript
// Start execution - returns immediately with executionId
POST /api/executions/start
Request: { blockId: string, input: unknown, options?: ExecutionOptions }
Response: {
  executionId: string,
  status: 'pending',
  subscribeUrl: string,   // SSE stream endpoint
  statusUrl: string       // Polling endpoint
}

// Subscribe to execution stream (supports reconnection)
GET /api/executions/{id}/stream?fromEvent={lastIndex}&replay={boolean}
Response: SSE stream with indexed events

// Check execution status (polling fallback)
GET /api/executions/{id}/status
Response: { status, progress, lastEventAt }

// Get final result after completion
GET /api/executions/{id}/result
Response: { output, metrics, events[] }

// Cancel execution
POST /api/executions/{id}/cancel
```

#### Execution State Machine

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ PENDING  │────►│ RUNNING  │────►│ COMPLETE │
└──────────┘     └──────────┘     └──────────┘
     │                │
     │                ├─► FAILED
     │                │
     │                ├─► CANCELLED
     │                │
     │                └─► STALE (server restart/crash)
     │                         │
     │                         ├─► RETRY (if attempts < max)
     │                         └─► ABANDON
```

#### Client Reconnection Hook

```typescript
// packages/core/src/streaming/useExecutionStream.ts
export function useExecutionStream(executionId: string) {
  const lastEventIndex = useRef(-1);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(async () => {
    const url = `/api/executions/${executionId}/stream`;
    const params = new URLSearchParams();

    // Resume from last received event
    if (lastEventIndex.current >= 0) {
      params.set('fromEvent', String(lastEventIndex.current + 1));
    } else {
      params.set('replay', 'true');  // First connection - get all events
    }

    // Connect and process events...
    // On disconnect: check status, reconnect with backoff if still running
  }, [executionId]);

  // Reconnect when tab becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        connect();  // Reconnect and replay missed events
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [connect]);

  return { connect, lastEventIndex: lastEventIndex.current };
}
```

#### Server Recovery on Startup

```typescript
// lib/execution/recovery.ts
export async function initializeExecutionRecovery() {
  // 1. Find all executions marked 'running' with stale heartbeats
  // 2. Mark as 'stale' and attempt retry or abandon
  // 3. Start heartbeat monitor for active executions
}
```

### 1.5 Phase 1 Deliverables

| Category | Deliverable | Description |
|----------|-------------|-------------|
| **Project** | Monorepo setup | Turborepo with apps/web, packages/ui, packages/core, packages/db, packages/internal-bots |
| **Design System** | Token definitions | Colors, typography, spacing, block-type colors |
| | Primitive components | Button, Input, Select, Badge, Card, Table (shadcn/ui) |
| | Streaming components | StreamingText, StreamingJSON, ToolCallCard |
| **Data Layer** | Database schema | All tables in Drizzle |
| | tRPC routers | Workspaces, connections, blocks, tools, executions |
| | Zod schemas | Full validation |
| **Execution Layer** | ExecutionContext | Context-aware execution for user vs internal bots |
| | Event bus | Platform event system for internal bot triggers |
| | Permission isolation | Separate user data from platform data access |
| **Streaming** | useBlockStream hook | Full event handling |
| | Server streaming endpoint | SSE with all event types |
| | Stream replay | Re-render from stored events |
| **Resilience** | Execution-first API | Server-independent execution, client can disconnect/reconnect |
| | Execution state machine | pending → running → complete/failed/stale with recovery |
| | Client reconnection | Automatic reconnection with event replay on visibility change |
| | Server startup recovery | Detect and handle stale executions on restart |
| **Data Integrity** | Transaction helpers | All multi-table operations wrapped in transactions |
| | Soft deletes | deletedAt/deletedBy on all major tables, restore capability |
| | Optimistic locking | Version field enforcement on concurrent updates |
| | Audit logging | Automatic logging of all create/update/delete operations |
| | Encryption layer | AES-256-GCM encryption for API keys and secrets |
| **Connections** | OpenAI integration | API key entry, model selection, connection test |
| | Anthropic integration | API key entry, model selection, connection test |
| | **Ollama integration** | Base URL config, health check, version display |
| | Ollama model browser | List installed models with size/params/quantization |
| | Ollama model pull | Download with streaming progress bar, cancel support |
| | Ollama model management | Delete with confirmation, view details modal |
| | Running models view | Show loaded models with RAM/VRAM usage |
| **Blocks** | AI Block editor | Goal, model, schema, tools, test |
| | Function Block editor | Monaco editor, schema, test |
| | Tool editor | Visual schema builder, code editor |
| **Testing** | Live Chat test | Multi-turn with streaming |
| | Structured test | JSON input/output |
| | Batch test | Multiple cases in parallel |

### 1.6 Phase 1 Success Criteria

**Connections**
- [ ] Can add OpenAI connection with API key and verify it works
- [ ] Can add Anthropic connection with API key and verify it works
- [ ] Can add Ollama connection with base URL and verify it works
- [ ] API keys are encrypted before storage

**Ollama Model Management**
- [ ] Can browse installed Ollama models with metadata (size, parameters, quantization)
- [ ] Can pull new models with real-time progress streaming
- [ ] Can cancel in-progress model downloads
- [ ] Can delete models with confirmation
- [ ] Can view model details (modelfile, template, parameters)
- [ ] Can see currently loaded models with memory usage

**Blocks**
- [ ] Can create an AI block with goal, model (including local), and output schema
- [ ] Model selector shows both cloud and local models with visual distinction
- [ ] Can create tools and attach them to blocks
- [ ] Can test blocks with live chat interface

**Streaming**
- [ ] **First token appears in <100ms** (local models)
- [ ] **First token appears in <500ms** (cloud models)
- [ ] Tool calls visible in real-time during execution
- [ ] All executions logged with full stream events
- [ ] Can replay any past execution

**Resilience & Recovery**
- [ ] **Executions continue when user navigates away**
- [ ] **User can return to page and see execution results**
- [ ] Client automatically reconnects on visibility change
- [ ] Missed events are replayed on reconnection
- [ ] Server detects stale executions on startup
- [ ] Stale executions are retried or marked failed

**Data Integrity**
- [ ] All multi-table operations use transactions
- [ ] Concurrent updates fail with clear conflict error
- [ ] Deleted items can be restored
- [ ] All changes logged in audit table
- [ ] API keys encrypted at rest

**Platform Infrastructure**
- [ ] **ExecutionContext layer supports both user and internal bot contexts**
- [ ] **Event bus fires on block creation/edit (ready for internal bots)**

---

## Phase 2: Composition & Observability

**Goal**: Enable visual composition of blocks into flows, and provide deep visibility into every AI decision.

### 2.1 Flow Canvas

Visual composition using React Flow with custom nodes:

```typescript
// Node types
type FlowNodeType =
  | 'ai-block'
  | 'function-block'
  | 'router'
  | 'parallel'
  | 'loop'
  | 'filter'
  | 'gate'
  | 'source'  // Trigger: webhook, schedule, manual
  | 'sink';   // Output: database, API, notification

// Each node includes:
interface FlowNode {
  id: string;
  type: FlowNodeType;
  data: {
    blockId?: string;      // Reference to blocks table
    config: NodeConfig;    // Node-specific configuration
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
  };
  position: { x: number; y: number };
}
```

### 2.2 Flow Compiler

Convert visual flow to BaleyBots runtime:

```typescript
// lib/baleybots/compiler.ts
import { pipeline, Baleybot, Deterministic, BaleybotRouter, Loop, ParallelMerge } from '@baleybots/core';

export function compileFlow(flow: Flow): Processable<unknown, unknown> {
  const nodes = new Map<string, Processable<any, any>>();

  // First pass: compile individual blocks
  for (const node of flow.nodes) {
    nodes.set(node.id, compileNode(node));
  }

  // Second pass: wire up connections based on edges
  // Identify patterns: sequential → pipeline, branches → router, etc.
  const composition = analyzeAndCompose(flow.nodes, flow.edges, nodes);

  return composition;
}

function compileNode(node: FlowNode): Processable<any, any> {
  switch (node.type) {
    case 'ai-block':
      const block = await getBlock(node.data.blockId);
      return Baleybot.create({
        name: block.name,
        goal: block.goal!,
        model: getModel(block.connectionId, block.model),
        outputSchema: block.outputSchema,
        tools: await getBlockTools(block.id),
      });

    case 'function-block':
      const fnBlock = await getBlock(node.data.blockId);
      return Deterministic.create({
        name: fnBlock.name,
        processFn: evalCode(fnBlock.code!),
        schema: fnBlock.outputSchema,
      });

    case 'router':
      return BaleybotRouter.create({
        classifier: nodes.get(node.data.config.classifierId),
        routes: node.data.config.routes,
        routeField: node.data.config.routeField,
        defaultRoute: node.data.config.defaultRoute,
      });

    case 'loop':
      return new Loop(nodes.get(node.data.config.bodyId), {
        condition: evalCondition(node.data.config.condition),
        maxIterations: node.data.config.maxIterations,
      });

    case 'parallel':
      return new ParallelMerge(
        nodes.get(node.data.config.splitterId),
        node.data.config.processorIds.map(id => nodes.get(id)),
        nodes.get(node.data.config.mergerId),
      );

    // ... other node types
  }
}
```

### 2.3 Decision Inspector

Deep observability into AI decisions:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DECISION INSPECTOR                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Filters: [Block: All ▾] [Model: All ▾] [Date: Last 7 days ▾] [Search...]  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ID          │ Block        │ Model      │ Latency │ Cost   │ Time   │   │
│  ├─────────────┼──────────────┼────────────┼─────────┼────────┼────────┤   │
│  │ dec_123...  │ fraud-scorer │ gpt-4o-mini│ 234ms   │ $0.002 │ 2m ago │   │
│  │ dec_124...  │ router       │ llama3:1b  │ 45ms    │ $0.000 │ 5m ago │   │
│  │ dec_125...  │ support-bot  │ claude-3.5 │ 1.2s    │ $0.015 │ 8m ago │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Decision Detail: dec_123                          │   │
│  │                                                                      │   │
│  │  INPUT                           OUTPUT                              │   │
│  │  ┌────────────────────────┐     ┌────────────────────────┐          │   │
│  │  │ {                      │     │ {                      │          │   │
│  │  │   "orderId": "ord_123",│     │   "riskScore": 87,     │          │   │
│  │  │   "amount": 4500,      │     │   "action": "review",  │          │   │
│  │  │   "customer": {        │     │   "reasons": [         │          │   │
│  │  │     "isNew": true,     │     │     "New customer",    │          │   │
│  │  │     "email": "temp@..."│     │     "High value",      │          │   │
│  │  │   }                    │     │     "Temp email"       │          │   │
│  │  │ }                      │     │   ]                    │          │   │
│  │  └────────────────────────┘     │ }                      │          │   │
│  │                                  └────────────────────────┘          │   │
│  │                                                                      │   │
│  │  TOOL CALLS                                                          │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │ 1. check_customer_history({ customerId: "cust_456" })          │ │   │
│  │  │    → { orderCount: 0, totalSpent: 0 }                          │ │   │
│  │  │                                                                 │ │   │
│  │  │ 2. check_email_reputation({ email: "temp@tempmail.com" })      │ │   │
│  │  │    → { isTemporary: true, reputation: "low" }                  │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  │  FEEDBACK                                                            │   │
│  │  Was this decision correct?  [👍 Yes] [👎 No] [✏️ Correct it]        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Phase 2 Deliverables

| Category | Deliverable | Description |
|----------|-------------|-------------|
| **Flow Canvas** | React Flow integration | Zoom, pan, selection, minimap |
| | Custom node types | All block types + composition patterns |
| | Block palette | Drag-and-drop from library |
| | Connection validation | Schema compatibility checking |
| | Live preview | See data flow during test |
| **Flow Execution** | Compiler | Visual graph → BaleyBots runtime |
| | Manual trigger | Test with JSON input |
| | Webhook trigger | Auto-generated URLs |
| | Schedule trigger | Cron expressions |
| | Real-time monitor | Per-block status during execution |
| **Observability** | Decision table | Filterable, sortable, paginated |
| | Decision detail | Full I/O, tool calls, stream replay |
| | Feedback system | Correct/incorrect/correction |
| | Cost tracking | Per-decision cost calculation |
| | Export | JSON/CSV export |

### 2.5 Phase 2 Success Criteria

- [ ] Can drag blocks onto canvas and connect them
- [ ] Connections validate schema compatibility
- [ ] Can create pipeline, router, loop, parallel patterns visually
- [ ] Can run flow manually and see real-time per-block progress
- [ ] Can inspect any AI decision with full context
- [ ] Can mark decisions as correct/incorrect
- [ ] Can see cost breakdown by model and block
- [ ] Webhook URL triggers flow execution

---

## Phase 3: Integration & Distribution

**Goal**: Make BaleyUI embeddable in any application. Add database integration for AI that understands your data.

### 3.1 Embeddable Component Library

```typescript
// packages/react/src/index.ts
export {
  // Chat interfaces
  BaleyChatPanel,
  BaleyChatBubble,
  BaleyChatInput,

  // Decision display
  BaleyDecisionCard,
  BaleyDecisionTimeline,

  // Tool interaction
  BaleyToolApproval,
  BaleyToolProgress,

  // Streaming components
  BaleyStreamingText,
  BaleyStreamingJSON,

  // Block embedding
  BaleyBlockRunner,

  // Provider
  BaleyProvider,
} from './components';

export {
  useBaleyChat,
  useBaleyBlock,
  useBaleyStream,
  useBaleyDecisions,
} from './hooks';
```

Usage in any React app:

```tsx
import { BaleyProvider, BaleyChatPanel, BaleyToolApproval } from '@baleyui/react';

function App() {
  return (
    <BaleyProvider
      apiUrl="https://your-baleyui-instance.com/api"
      workspaceId="ws_123"
    >
      <div className="flex">
        {/* AI chat panel */}
        <BaleyChatPanel
          botId="support-agent"
          className="w-96"
          onToolCall={(tool) => console.log('Tool called:', tool)}
        />

        {/* Tool approval modal */}
        <BaleyToolApproval
          onApprove={(toolCall) => ({ approved: true })}
          onReject={(toolCall, reason) => ({ approved: false, reason })}
        />
      </div>
    </BaleyProvider>
  );
}
```

### 3.2 Database Integration

Connect AI to your data:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE CONNECTIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Production PostgreSQL                              [Connected ✓]    │   │
│  │ postgresql://user:***@db.example.com:5432/prod                      │   │
│  │                                                                      │   │
│  │ SCHEMA BROWSER                                                       │   │
│  │ ├── users (125,432 rows)                                            │   │
│  │ │   ├── id: uuid [PK]                                               │   │
│  │ │   ├── email: varchar(255) [UNIQUE]                                │   │
│  │ │   ├── name: varchar(255)                                          │   │
│  │ │   ├── plan: enum('free', 'pro', 'enterprise')                     │   │
│  │ │   └── created_at: timestamp                                       │   │
│  │ │                                                                    │   │
│  │ ├── orders (1,234,567 rows)                                         │   │
│  │ │   ├── id: uuid [PK]                                               │   │
│  │ │   ├── user_id: uuid [FK → users.id]                               │   │
│  │ │   ├── total: decimal(10,2)                                        │   │
│  │ │   ├── status: enum('pending', 'paid', 'shipped', 'delivered')     │   │
│  │ │   └── created_at: timestamp                                       │   │
│  │ │                                                                    │   │
│  │ └── products (5,432 rows)                                           │   │
│  │     └── ...                                                          │   │
│  │                                                                      │   │
│  │ GENERATE TOOLS                                                       │   │
│  │ [Select tables: ☑ users ☑ orders ☐ products]                        │   │
│  │ [Operations: ☑ Read ☑ Search ☐ Write ☐ Delete]                      │   │
│  │ [Row limit: 100]                                                     │   │
│  │                                                                      │   │
│  │ [Generate Tools]                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  GENERATED TOOLS:                                                           │
│  • search_users - Search users by any field                                │
│  • get_user_by_id - Get a single user by ID                                │
│  • search_orders - Search orders with filters                              │
│  • get_user_orders - Get all orders for a user                             │
│  • get_order_stats - Aggregate order statistics                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Local Model Strategy

Cost optimization through intelligent routing:

```typescript
// Example: Tiered model routing
const router = BaleybotRouter.create({
  classifier: Baleybot.create({
    name: 'complexity-classifier',
    goal: 'Determine if this query is simple or complex',
    model: ollama('llama3.2:1b'),  // Tiny local model for routing
    outputSchema: z.object({
      complexity: z.enum(['simple', 'moderate', 'complex']),
      reason: z.string()
    })
  }),
  routes: {
    simple: Baleybot.create({
      name: 'simple-handler',
      model: ollama('mistral:7b'),  // Local for simple queries
      // ...
    }),
    moderate: Baleybot.create({
      name: 'moderate-handler',
      model: openai('gpt-4o-mini'),  // Fast cloud model
      // ...
    }),
    complex: Baleybot.create({
      name: 'complex-handler',
      model: anthropic('claude-3-5-sonnet'),  // Premium for complex
      // ...
    })
  },
  routeField: 'complexity'
});
```

### 3.4 Phase 3 Deliverables

| Category | Deliverable | Description |
|----------|-------------|-------------|
| **@baleyui/react** | Chat components | Panel, bubble, input with streaming |
| | Decision components | Card, timeline, feedback |
| | Tool components | Approval modal, progress indicator |
| | Stream components | Text, JSON with progressive rendering |
| | Provider | Context, hooks, configuration |
| **@baleyui/core** | Headless hooks | useBaleyChat, useBaleyBlock, etc. |
| | API client | Type-safe API access |
| **Database** | PostgreSQL connector | Schema introspection |
| | MySQL connector | Schema introspection |
| | MongoDB connector | Collection introspection |
| | Tool generator | Auto-generate CRUD tools from schema |
| | Permission scoping | Row-level access control |
| **Local Models** | Ollama manager | Model discovery, pull, health |
| | Model comparison | Side-by-side testing |
| | Cost calculator | Local vs cloud cost comparison |

### 3.5 Phase 3 Success Criteria

- [ ] Can `npm install @baleyui/react` and drop chat into any React app
- [ ] Embeddable components respect host app styling (CSS variables)
- [ ] Can connect PostgreSQL and browse schema
- [ ] Can auto-generate database tools from schema
- [ ] AI blocks can query user's database securely
- [ ] Can manage Ollama models from dashboard
- [ ] Can see cost comparison: local vs cloud

---

## Phase 4: Intelligence & Evolution

**Goal**: Enable the AI→Code evolution cycle. Extract patterns from decisions, generate code, enable hybrid operation.

### 4.1 Pattern Extraction

Analyze decision history to find rules:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PATTERN ANALYZER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Block: fraud-scorer                                                        │
│  Decisions analyzed: 12,345                                                 │
│                                                                             │
│  OUTPUT DISTRIBUTION                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ approve  ████████████████████████████████████████████  8,432 (68%)  │   │
│  │ review   ██████████████████                            3,012 (24%)  │   │
│  │ reject   ████                                            901 (8%)   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  DETECTED PATTERNS                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. IF customer.isNew AND amount > 1000 → review                     │   │
│  │    Confidence: 94.2%  |  Support: 2,845 decisions  |  [View samples]│   │
│  │                                                                      │   │
│  │ 2. IF email.domain IN ['tempmail', 'guerrilla', ...]  → +30 score   │   │
│  │    Confidence: 89.7%  |  Support: 1,234 decisions  |  [View samples]│   │
│  │                                                                      │   │
│  │ 3. IF amount > 5000 AND paymentMethod = 'new_card' → review         │   │
│  │    Confidence: 87.3%  |  Support: 892 decisions    |  [View samples]│   │
│  │                                                                      │   │
│  │ 4. IF customer.orderCount > 10 AND avgOrderValue > 100 → approve    │   │
│  │    Confidence: 96.1%  |  Support: 3,421 decisions  |  [View samples]│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Generate Code from Patterns]                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Code Generation

Convert patterns to Deterministic blocks:

```typescript
// Generated from 12,345 AI decisions
// Coverage: 87% of historical cases
// Patterns extracted: 12
// Fallback to AI for: edge cases, new patterns

import { Deterministic } from '@baleybots/core';
import { z } from 'zod';

const outputSchema = z.object({
  riskScore: z.number(),
  action: z.enum(['approve', 'review', 'reject']),
  reasons: z.array(z.string())
});

export const fraudScorer = Deterministic.create({
  name: 'fraud-scorer-v2',
  processFn: (order: OrderInput) => {
    let score = 0;
    const reasons: string[] = [];

    // Pattern 1: New customer high-value (94.2% confidence)
    if (order.customer.isNew && order.amount > 1000) {
      score += 40;
      reasons.push('New customer with high-value order');
    }

    // Pattern 2: Temporary email domain (89.7% confidence)
    const tempDomains = ['tempmail.com', 'guerrillamail.com', '10minutemail.com'];
    if (tempDomains.some(d => order.customer.email.includes(d))) {
      score += 30;
      reasons.push('Temporary email domain detected');
    }

    // Pattern 3: High amount + new payment (87.3% confidence)
    if (order.amount > 5000 && order.paymentMethod === 'new_card') {
      score += 25;
      reasons.push('High-value order with new payment method');
    }

    // Pattern 4: Trusted customer (96.1% confidence)
    if (order.customer.orderCount > 10 && order.customer.avgOrderValue > 100) {
      score -= 30;
      reasons.push('Trusted repeat customer');
    }

    // Determine action
    const action = score >= 70 ? 'reject' : score >= 40 ? 'review' : 'approve';

    return { riskScore: Math.min(100, Math.max(0, score)), action, reasons };
  },
  schema: outputSchema
});

// 13% of cases still need AI
export const fraudScorerWithFallback = pipeline(
  // Try code first
  when({
    condition: (order) => canHandleWithCode(order),
    onPass: fraudScorer,
    onFail: fraudScorerAI  // Original AI for edge cases
  })
);
```

### 4.3 Hybrid Mode

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION MODE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  fraud-scorer execution mode:                                               │
│                                                                             │
│  ○ AI Only          All decisions made by AI                               │
│                     Cost: ~$0.002/decision  |  Latency: ~800ms             │
│                                                                             │
│  ○ Code Only        All decisions made by generated code                   │
│                     Cost: $0.000/decision   |  Latency: ~5ms               │
│                     ⚠️ 13% of cases may be incorrect                        │
│                                                                             │
│  ● Hybrid Mode      Code for known patterns, AI for edge cases             │
│                     Est. Cost: ~$0.0003/decision  |  Avg Latency: ~110ms   │
│                     ✓ Best accuracy with cost savings                       │
│                                                                             │
│  ○ A/B Test         50/50 split between AI and Code                        │
│                     Compare accuracy metrics                                │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  HYBRID MODE SETTINGS                                                       │
│  Code handles: 87% of requests                                              │
│  AI fallback: 13% of requests                                              │
│                                                                             │
│  Fallback triggers:                                                         │
│  ☑ Unknown input patterns                                                   │
│  ☑ Confidence below threshold (< 80%)                                       │
│  ☑ Explicit edge case markers                                               │
│  ☐ Random sampling (for continuous learning)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Phase 4 Deliverables

| Category | Deliverable | Description |
|----------|-------------|-------------|
| **Pattern Extraction** | Decision analyzer | Statistical pattern detection |
| | Confidence scoring | Per-pattern confidence metrics |
| | Pattern visualization | Distribution charts, sample viewer |
| | Manual pattern creation | User-defined rules |
| **Code Generation** | Code generator | Patterns → TypeScript code |
| | Code preview | Editable with syntax highlighting |
| | Historical testing | Test against past decisions |
| | Accuracy metrics | Coverage percentage |
| **Hybrid Mode** | Mode selector | AI only, Code only, Hybrid, A/B |
| | Routing logic | Pattern match → code, else → AI |
| | Fallback tracking | Log when AI fallback occurs |
| | Continuous learning | Feed edge cases back to pattern extraction |
| **Block Swap** | Swap UI | One-click AI → Code replacement |
| | Schema validation | Ensure interfaces match |
| | Flow preservation | No changes to flow connections |
| **Analytics** | Cost dashboard | Per-block, per-model costs |
| | Latency dashboard | P50, P95, P99 latencies |
| | Training export | JSONL for fine-tuning |

### 4.5 Phase 4 Success Criteria

- [ ] Can analyze decisions and see extracted patterns with confidence scores
- [ ] Can generate Function block code from patterns
- [ ] Generated code achieves 80%+ accuracy on historical data
- [ ] Can run in Hybrid mode (code + AI fallback)
- [ ] Can swap AI block for Function block without breaking flow
- [ ] Can A/B test AI vs Code with live metrics
- [ ] Can export training data in JSONL format
- [ ] Cost savings visible in analytics dashboard

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BALEYUI ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USER APPLICATIONS                                                          │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│  │   Your Web App    │  │   Your Mobile App │  │   Your Backend    │       │
│  │   @baleyui/react  │  │   @baleyui/core   │  │   API calls       │       │
│  └─────────┬─────────┘  └─────────┬─────────┘  └─────────┬─────────┘       │
│            │                      │                      │                  │
│            └──────────────────────┼──────────────────────┘                  │
│                                   │                                         │
│                                   ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     BALEYUI BACKEND (Next.js)                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │   tRPC      │  │  Streaming  │  │   Block     │  │  Flow     │  │   │
│  │  │   Router    │  │  Endpoints  │  │  Compiler   │  │  Compiler │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                   │                                         │
│            ┌──────────────────────┼──────────────────────┐                  │
│            ▼                      ▼                      ▼                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐    │
│  │   PostgreSQL    │  │     Redis       │  │    BaleyBots Runtime    │    │
│  │   (Neon/Supabase)│  │   (Upstash)    │  │                         │    │
│  │                 │  │                 │  │  • Baleybot instances   │    │
│  │  • Blocks       │  │  • Stream cache │  │  • Deterministic fns    │    │
│  │  • Flows        │  │  • Rate limits  │  │  • Composition patterns │    │
│  │  • Decisions    │  │  • Pub/sub      │  │  • Tool execution       │    │
│  │  • Executions   │  │                 │  │  • Event streaming      │    │
│  └─────────────────┘  └─────────────────┘  └───────────┬─────────────┘    │
│                                                         │                   │
│                        ┌────────────────────────────────┼─────────────┐    │
│                        ▼                                ▼             ▼    │
│              ┌─────────────────┐              ┌─────────────┐  ┌─────────┐│
│              │     OpenAI      │              │  Anthropic  │  │ Ollama  ││
│              │  gpt-4o, o1, o3 │              │   Claude    │  │ (local) ││
│              └─────────────────┘              └─────────────┘  └─────────┘│
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  USER'S DATABASES (Connected via Database Integration)                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │   PostgreSQL    │  │     MySQL       │  │    MongoDB      │            │
│  │   (User's DB)   │  │   (User's DB)   │  │   (User's DB)   │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
BaleyUI/
├── apps/
│   └── web/                          # Next.js dashboard
│       ├── app/
│       │   ├── (dashboard)/
│       │   │   ├── blocks/
│       │   │   ├── flows/
│       │   │   ├── decisions/
│       │   │   ├── tools/
│       │   │   └── settings/
│       │   └── api/
│       │       ├── trpc/
│       │       └── stream/
│       ├── components/
│       │   ├── blocks/
│       │   ├── flows/
│       │   ├── decisions/
│       │   ├── tools/
│       │   └── streaming/
│       └── lib/
│           ├── baleybots/
│           │   ├── compiler.ts
│           │   ├── executor.ts
│           │   └── providers.ts
│           └── trpc/
│
├── packages/
│   ├── ui/                           # Shared UI components
│   │   ├── src/
│   │   │   ├── tokens.css
│   │   │   └── components/
│   │   └── package.json
│   │
│   ├── react/                        # @baleyui/react
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── BaleyChatPanel.tsx
│   │   │   │   ├── BaleyDecisionCard.tsx
│   │   │   │   ├── BaleyToolApproval.tsx
│   │   │   │   └── ...
│   │   │   ├── hooks/
│   │   │   │   ├── useBaleyChat.ts
│   │   │   │   ├── useBaleyBlock.ts
│   │   │   │   └── ...
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── core/                         # @baleyui/core
│   │   ├── src/
│   │   │   ├── streaming/
│   │   │   ├── execution/           # Context-aware execution layer
│   │   │   ├── client/
│   │   │   └── types/
│   │   └── package.json
│   │
│   ├── internal-bots/               # @baleyui/internal-bots (dogfooding)
│   │   ├── src/
│   │   │   ├── bots/                # Platform AI assistants
│   │   │   ├── tools/               # Internal bot tools
│   │   │   └── triggers/            # Event-based activation
│   │   └── package.json
│   │
│   └── db/                           # Database schema
│       ├── src/
│       │   ├── schema.ts
│       │   └── migrations/
│       └── package.json
│
├── package.json
├── turbo.json
├── PLAN.md
└── README.md
```

### Modular Execution Layer

The key to supporting both user bots and internal platform bots is a **context-aware execution layer**:

```typescript
// packages/core/src/execution/context.ts

interface ExecutionContext {
  // Identity
  workspaceId: string;
  userId?: string;
  isInternal: boolean;  // Platform bot vs user bot

  // Connections
  connections: ConnectionConfig[];
  defaultConnection?: ConnectionConfig;

  // Database access
  databases: DatabaseConnection[];

  // Permissions
  permissions: {
    canAccessUserData: boolean;
    canAccessPlatformData: boolean;
    maxCostPerExecution: number;
    allowedModels: string[];
  };

  // Telemetry
  onEvent: (event: ExecutionEvent) => void;
}

// Factory for user bot execution
export function createUserContext(
  workspaceId: string,
  userId: string
): ExecutionContext {
  return {
    workspaceId,
    userId,
    isInternal: false,
    connections: getUserConnections(workspaceId),
    databases: getUserDatabases(workspaceId),
    permissions: {
      canAccessUserData: true,
      canAccessPlatformData: false,
      maxCostPerExecution: getWorkspaceLimit(workspaceId),
      allowedModels: getWorkspaceModels(workspaceId)
    },
    onEvent: (event) => logUserEvent(workspaceId, event)
  };
}

// Factory for internal platform bot execution
export function createInternalContext(
  targetWorkspaceId?: string  // Which user's data to analyze (metadata only)
): ExecutionContext {
  return {
    workspaceId: SYSTEM_WORKSPACE_ID,
    isInternal: true,
    connections: getPlatformConnections(),
    databases: [platformDb],
    permissions: {
      canAccessUserData: false,  // NEVER
      canAccessPlatformData: true,
      maxCostPerExecution: 0.01,  // Keep internal costs low
      allowedModels: ['ollama/*', 'gpt-4o-mini']  // Prefer cheap models
    },
    onEvent: (event) => logInternalEvent(event)
  };
}
```

### Internal Bots Package

```
packages/
└── internal-bots/              # @baleyui/internal-bots
    ├── src/
    │   ├── bots/
    │   │   ├── model-advisor.ts
    │   │   ├── cost-optimizer.ts
    │   │   ├── pattern-detector.ts
    │   │   ├── schema-helper.ts
    │   │   ├── debug-agent.ts
    │   │   ├── onboarding-guide.ts
    │   │   ├── test-generator.ts
    │   │   └── flow-optimizer.ts
    │   │
    │   ├── tools/
    │   │   ├── analytics.ts      # Read user analytics (aggregated)
    │   │   ├── block-stats.ts    # Block performance stats
    │   │   ├── model-catalog.ts  # Available models + pricing
    │   │   └── pattern-db.ts     # Known patterns library
    │   │
    │   ├── triggers/
    │   │   ├── on-block-edit.ts     # Suggest improvements
    │   │   ├── on-high-cost.ts      # Cost alerts
    │   │   ├── on-error-spike.ts    # Debug assistance
    │   │   ├── periodic-analysis.ts # Background optimization
    │   │   └── on-first-block.ts    # Onboarding
    │   │
    │   └── index.ts
    │
    └── package.json
```

### Event System for Internal Bots

```typescript
// Internal bots respond to platform events
type InternalBotTrigger =
  | { type: 'block_created'; blockId: string; workspaceId: string }
  | { type: 'block_edited'; blockId: string; changes: BlockChanges }
  | { type: 'cost_threshold_exceeded'; workspaceId: string; dailyCost: number }
  | { type: 'error_rate_spike'; blockId: string; errorRate: number }
  | { type: 'execution_completed'; executionId: string; metrics: ExecutionMetrics }
  | { type: 'periodic'; interval: 'hourly' | 'daily' | 'weekly' }
  | { type: 'user_request'; request: string; context: UserContext };

// Event bus for internal bot coordination
const internalBotBus = createEventBus<InternalBotTrigger>();

// Register internal bots
internalBotBus.on('block_created', async (event) => {
  // Onboarding bot might offer help
  // Schema helper might suggest output schema
});

internalBotBus.on('cost_threshold_exceeded', async (event) => {
  // Cost optimizer suggests cheaper models
  // Model advisor analyzes usage patterns
});

internalBotBus.on('execution_completed', async (event) => {
  // Pattern detector looks for extractable rules
  // Only runs on sample of executions to keep costs low
});
```

---

## Design System

### Token Categories

```css
:root {
  /* Semantic Colors */
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(222 47% 11%);
  --color-muted: hsl(210 40% 96%);
  --color-muted-foreground: hsl(215 16% 47%);
  --color-border: hsl(214 32% 91%);

  /* Brand Colors */
  --color-primary: hsl(221 83% 53%);
  --color-primary-foreground: hsl(0 0% 100%);

  /* Status Colors */
  --color-success: hsl(142 76% 36%);
  --color-warning: hsl(38 92% 50%);
  --color-error: hsl(0 84% 60%);

  /* Block Type Colors */
  --color-block-ai: hsl(271 91% 65%);
  --color-block-function: hsl(199 89% 48%);
  --color-block-router: hsl(38 92% 50%);
  --color-block-loop: hsl(280 87% 65%);
  --color-block-parallel: hsl(142 76% 36%);

  /* Provider Colors */
  --color-provider-openai: hsl(160 84% 39%);
  --color-provider-anthropic: hsl(24 95% 53%);
  --color-provider-ollama: hsl(210 100% 50%);
  --color-provider-local: hsl(142 76% 36%);

  /* Streaming States */
  --color-stream-idle: var(--color-muted);
  --color-stream-active: hsl(142 76% 36%);
  --color-stream-tool: hsl(38 92% 50%);
  --color-stream-error: hsl(0 84% 60%);

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Animation */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
}

.dark {
  --color-background: hsl(222 47% 11%);
  --color-foreground: hsl(210 40% 98%);
  /* ... */
}
```

---

## Success Metrics

### Phase 1
- [ ] OpenAI, Anthropic, Ollama connections working
- [ ] Can create and test AI blocks with streaming
- [ ] First token < 100ms
- [ ] Tool calls visible in real-time

### Phase 2
- [ ] Visual flow canvas functional
- [ ] Flows compile to BaleyBots runtime
- [ ] Real-time execution monitoring
- [ ] Decision inspector with full context

### Phase 3
- [ ] @baleyui/react published to npm
- [ ] Embeddable components work in any React app
- [ ] Database schema introspection working
- [ ] Auto-generated database tools functional

### Phase 4
- [ ] Pattern extraction from decisions
- [ ] Code generation with 80%+ accuracy
- [ ] Hybrid mode operational
- [ ] 10x cost reduction demonstrated

### Long-term
- [ ] 50%+ of AI blocks converted to code
- [ ] < 30 second average decision inspection time
- [ ] > 99% flow execution success rate
- [ ] Adopted by 100+ teams

---

## Resolved Questions

1. **Authentication**: **Clerk** - Modern DX, built-in workspace/org support, edge-compatible
2. **Multi-tenancy**: **Single DB with workspace isolation** - All data scoped by `workspaceId`, RLS patterns for security
3. **Code sandbox**: **Deferred to Phase 2** - Initially trust user code, add sandboxing (isolated-vm or Cloudflare Workers) later
4. **MCP integration**: **Deferred** - BaleyBots will handle MCP when ready; BaleyUI will expose through tool builder UI
5. **Self-hosting**: **Docker Compose for MVP** - Add Kubernetes manifests for enterprise in Phase 3+

## Open Questions

1. **Tool execution permissions**: How granular should tool approval flows be?
2. **Collaborative editing**: Real-time collaboration on flows (Liveblocks vs custom)?
3. **Usage metering**: How to track and bill for AI usage across workspaces?

---

## References

- [BaleyBots Repository](https://github.com/cbethin/baleybots)
- [React Flow](https://reactflow.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [tRPC](https://trpc.io/)
- [Ollama](https://ollama.ai/)
- [Vercel AI SDK](https://sdk.vercel.ai/)

---

*Last updated: December 2024*
