# BaleyUI - Project Plan

> A visual platform for building, composing, and evolving AI-powered workflows using the BaleyBots framework.

**Repository**: https://github.com/jamesmcarthur-3999/BaleyUI

---

## Table of Contents

1. [Vision & Philosophy](#vision--philosophy)
2. [Guiding Principles](#guiding-principles)
3. [Core Concepts](#core-concepts)
4. [The Three Phases](#the-three-phases)
   - [Phase 1: Foundation & Core Engine](#phase-1-foundation--core-engine)
   - [Phase 2: Composition & Observability](#phase-2-composition--observability)
   - [Phase 3: Intelligence & Evolution](#phase-3-intelligence--evolution)
5. [Design System](#design-system)
6. [Architecture](#architecture)
7. [Tech Stack](#tech-stack)
8. [Database Schema](#database-schema)
9. [File Structure](#file-structure)
10. [Success Metrics](#success-metrics)

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

### The AI → Code Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE EVOLUTION CYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PROTOTYPE               OBSERVE                 CODIFY         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ Create AI Block │    │ View decisions  │    │ Extract     │ │
│  │ with natural    │ →  │ Identify patterns│ →  │ patterns    │ │
│  │ language goal   │    │ Mark correct/   │    │ Generate    │ │
│  │                 │    │ incorrect       │    │ code        │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│         ↑                                              │        │
│         │              OPTIMIZE                        │        │
│         │         ┌─────────────────┐                 │        │
│         └─────────│ Hybrid: Code for│←────────────────┘        │
│                   │ common cases,   │                          │
│                   │ AI for edge     │                          │
│                   └─────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Guiding Principles

These principles guide every decision we make:

### 1. Functionality First
Build working features before polishing UI. "Make it work, make it right, make it beautiful" - in that order.

### 2. Design System from Day One
All visual decisions flow through tokens and primitives. Change once, apply everywhere. No hardcoded colors, spacing, or typography.

### 3. Modularity Over Monolith
Every piece is replaceable and testable in isolation. Components know nothing about each other. Compose small pieces into larger systems.

### 4. Type Safety End-to-End
Database → API → Frontend fully typed. If it compiles, it works. Use Zod for runtime validation, TypeScript for compile-time safety.

### 5. No Shortcuts
Unlimited time means no technical debt. Build it right the first time. Every decision should optimize for long-term maintainability.

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

### 4. Patterns

**Patterns** are rules extracted from AI decision history:

```typescript
interface Pattern {
  id: string;
  blockId: string;
  rule: string;           // Human-readable: "If new customer AND amount > 1000"
  condition: JsonLogic;   // Machine-parseable condition
  outputTemplate: any;    // What to output when condition matches
  confidence: number;     // 0.0 to 1.0
  supportCount: number;   // How many decisions support this pattern
}
```

---

## The Three Phases

### Phase 1: Foundation & Core Engine

**Goal**: Build the core engine that powers everything: blocks, execution, decisions. Establish the design system and data layer that all future work builds upon.

**Why This First**: Everything else depends on these primitives. Design system ensures rapid iteration later. Data model must be solid before adding features.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PHASE 1                                        │
│                     Foundation & Core Engine                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        DESIGN SYSTEM                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│  │  │  Tokens  │  │Primitives│  │ Patterns │  │ Layouts  │           │   │
│  │  │(colors,  │  │(buttons, │  │(cards,   │  │(page,    │           │   │
│  │  │ spacing, │  │ inputs,  │  │ forms,   │  │ sidebar, │           │   │
│  │  │ typography│ │ badges)  │  │ tables)  │  │ panels)  │           │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        DATA LAYER                                   │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │ Database Schema (Drizzle)                                      │ │   │
│  │  │ • workspaces, connections, blocks, flows                       │ │   │
│  │  │ • executions, block_executions, decisions                      │ │   │
│  │  │ • patterns (for Phase 3)                                       │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │ API Layer (tRPC)                                               │ │   │
│  │  │ • Type-safe routers for all entities                          │ │   │
│  │  │ • Validation with Zod schemas                                  │ │   │
│  │  │ • Reusable procedures                                          │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CORE ENGINE                                  │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │   │
│  │  │   Block        │  │   Execution    │  │   Decision     │       │   │
│  │  │   Runtime      │  │   Engine       │  │   Logger       │       │   │
│  │  │                │  │                │  │                │       │   │
│  │  │ • Compile AI   │  │ • Run blocks   │  │ • Capture I/O  │       │   │
│  │  │   blocks to    │  │ • Handle tools │  │ • Store reason │       │   │
│  │  │   Baleybot     │  │ • Stream events│  │ • Track meta   │       │   │
│  │  │ • Compile Fn   │  │ • Error handle │  │ • Enable query │       │   │
│  │  │   blocks to    │  │ • Timeout mgmt │  │                │       │   │
│  │  │   Deterministic│  │                │  │                │       │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        MINIMAL UI                                   │   │
│  │  (Functional, not polished - using design system primitives)        │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │   │
│  │  │  Connection    │  │   Block        │  │   Block        │       │   │
│  │  │  Manager       │  │   Editor       │  │   Test Runner  │       │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Deliverables

| Category | Deliverable | Description |
|----------|-------------|-------------|
| **Design System** | Token definitions | Colors, typography, spacing, shadows, radii |
| | Primitive components | Button, Input, Select, Badge, Card, Table |
| | Layout components | Page, Sidebar, Panel, Modal, Sheet |
| | Component documentation | Storybook or similar for component catalog |
| **Data Layer** | Database schema | All tables with proper indexes and constraints |
| | Drizzle models | Type-safe ORM with relations |
| | tRPC routers | CRUD for all entities + test endpoint |
| | Zod schemas | Validation for all inputs |
| **Core Engine** | Block compiler | Convert block config → BaleyBots runtime |
| | Execution engine | Run single blocks, capture results |
| | Decision logger | Store AI decisions with full context |
| | Provider manager | Manage LLM connections, test connectivity |
| **Minimal UI** | Connection page | Add/edit/test LLM providers |
| | Block library page | List all blocks |
| | Block editor | Create/edit AI and Function blocks |
| | Block test runner | Run block with JSON input, see output |

#### Success Criteria

- [ ] Can add OpenAI/Anthropic connection and verify it works
- [ ] Can create an AI block with goal, model, and output schema
- [ ] Can create a Function block with TypeScript code
- [ ] Can test any block with sample input and see structured output
- [ ] AI block decisions are stored in database with full context
- [ ] All UI uses design system tokens (no hardcoded colors/spacing)
- [ ] Changing a token value updates entire application

---

### Phase 2: Composition & Observability

**Goal**: Enable visual composition of blocks into flows, and provide deep visibility into what the AI decides.

**Why This Second**: Composition is the core value proposition (visual flow building). Observability enables the AI → Code evolution cycle. Both require the solid foundation from Phase 1.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PHASE 2                                        │
│                    Composition & Observability                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     FLOW COMPOSITION                                │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐│   │
│  │  │                    Visual Flow Canvas                           ││   │
│  │  │                                                                 ││   │
│  │  │   ┌─────────┐     ┌─────────┐     ┌─────────┐                  ││   │
│  │  │   │ Source  │────▶│ Block A │────▶│ Block B │────▶ ...        ││   │
│  │  │   └─────────┘     └─────────┘     └─────────┘                  ││   │
│  │  │        │                │                                       ││   │
│  │  │        │          ┌─────┴─────┐                                ││   │
│  │  │        │          ▼           ▼                                ││   │
│  │  │        │    ┌─────────┐ ┌─────────┐                            ││   │
│  │  │        └───▶│ Block C │ │ Block D │  (parallel/branch)         ││   │
│  │  │             └─────────┘ └─────────┘                            ││   │
│  │  └─────────────────────────────────────────────────────────────────┘│   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│  │  │  Block Palette │  │  Connection    │  │  Composition   │        │   │
│  │  │  (drag & drop) │  │  Validation    │  │  Patterns      │        │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     FLOW EXECUTION                                  │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│  │  │   Triggers     │  │   Compiler     │  │   Runtime      │        │   │
│  │  │ • Manual       │  │ Flow graph →   │  │ Execute flow   │        │   │
│  │  │ • Webhook      │  │ BaleyBots code │  │ Track progress │        │   │
│  │  │ • Schedule     │  │                │  │ Stream events  │        │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     OBSERVABILITY                                   │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐│   │
│  │  │                  Decision Inspector                             ││   │
│  │  │  • Filter by block, date, output                                ││   │
│  │  │  • View full input/output/reasoning                             ││   │
│  │  │  • Mark correct/incorrect                                       ││   │
│  │  │  • Find similar decisions                                       ││   │
│  │  └─────────────────────────────────────────────────────────────────┘│   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│  │  │ Decision Detail│  │ Execution      │  │ Feedback       │        │   │
│  │  │ (full I/O)     │  │ Timeline       │  │ System         │        │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Deliverables

| Category | Deliverable | Description |
|----------|-------------|-------------|
| **Flow Canvas** | React Flow integration | Custom canvas with zoom, pan, selection |
| | Custom node types | AI Block, Function Block, Source, Sink |
| | Block palette | Draggable block library sidebar |
| | Edge connections | Schema-validated connections between blocks |
| | Composition patterns | Visual representation of pipeline, parallel, route, loop |
| **Flow Execution** | Flow compiler | Convert visual graph → BaleyBots code |
| | Manual trigger | "Run" button with JSON input editor |
| | Webhook trigger | Auto-generated URLs per flow |
| | Schedule trigger | Cron expression support |
| | Execution engine | Run flows, track per-block status |
| | Real-time monitor | SSE/WebSocket for live execution updates |
| **Observability** | Decision table | Paginated, sortable, filterable list |
| | Decision detail view | Full input/output/reasoning display |
| | Execution timeline | Visual timeline of flow execution |
| | Feedback system | Like/dislike, notes, corrections |
| | Export functionality | Export decisions as JSON/CSV |

#### Success Criteria

- [ ] Can drag blocks onto canvas and connect them
- [ ] Connections validate schema compatibility
- [ ] Can run a flow manually with test input
- [ ] Can see real-time execution progress
- [ ] Can inspect any AI decision with full context
- [ ] Can mark decisions as correct/incorrect
- [ ] Webhook URL triggers flow execution
- [ ] All new UI continues using design system

---

### Phase 3: Intelligence & Evolution

**Goal**: Enable the AI → Code evolution cycle: extract patterns from AI decisions, generate code, and enable hybrid operation.

**Why This Last**: Requires substantial decision data (from Phase 2). Most advanced/complex features. Core value already delivered in Phases 1-2.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PHASE 3                                        │
│                      Intelligence & Evolution                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     PATTERN EXTRACTION                              │   │
│  │                                                                      │   │
│  │  Analyze Decision History                                            │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │ 1,234 decisions for "fraud-scorer"                            │  │   │
│  │  │ ├── 847 → "approve" (69%)                                     │  │   │
│  │  │ ├── 312 → "review" (25%)                                      │  │   │
│  │  │ └──  75 → "reject" (6%)                                       │  │   │
│  │  │                                                                │  │   │
│  │  │ Detected Patterns:                                             │  │   │
│  │  │ ✓ IF customer.isNew AND amount > 1000 → review (94% conf)     │  │   │
│  │  │ ✓ IF email.domain IN tempDomains → +30 score (89% conf)       │  │   │
│  │  │ ✓ IF amount > 5000 → review (87% conf)                        │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     CODE GENERATION                                 │   │
│  │                                                                      │   │
│  │  Generated Function Block:                                           │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │ // Auto-generated from 1,234 AI decisions                     │  │   │
│  │  │ // Coverage: 87% of historical cases                          │  │   │
│  │  │                                                                │  │   │
│  │  │ export const fraudScorer = Deterministic.create({             │  │   │
│  │  │   name: 'fraud-scorer',                                       │  │   │
│  │  │   processFn: (order) => {                                     │  │   │
│  │  │     let score = 0;                                            │  │   │
│  │  │     const reasons = [];                                       │  │   │
│  │  │     if (order.customer.isNew && order.amount > 1000) {        │  │   │
│  │  │       score += 40;                                            │  │   │
│  │  │       reasons.push('New customer with high-value order');     │  │   │
│  │  │     }                                                         │  │   │
│  │  │     // ... more patterns                                      │  │   │
│  │  │     return { riskScore: score, action: ..., reasons };        │  │   │
│  │  │   }                                                           │  │   │
│  │  │ });                                                           │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  │                                                                      │   │
│  │  [Preview Code] [Test Against History] [Deploy as Function Block]  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     HYBRID & A/B TESTING                            │   │
│  │                                                                      │   │
│  │  Execution Modes:                                                    │   │
│  │  ○ AI Only        - All decisions by AI                             │   │
│  │  ○ Code Only      - All decisions by generated code                 │   │
│  │  ● Hybrid Mode    - Code for known patterns, AI for edge cases      │   │
│  │  ○ A/B Test       - 50/50 split, compare results                    │   │
│  │                                                                      │   │
│  │  Block Swap: Replace AI block with Function block                   │   │
│  │  (Flow continues working - same interface!)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     ADVANCED FEATURES                               │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│  │  │ Version        │  │ Analytics      │  │ Training       │        │   │
│  │  │ Control        │  │ Dashboard      │  │ Data Export    │        │   │
│  │  └────────────────┘  └────────────────┘  └────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Deliverables

| Category | Deliverable | Description |
|----------|-------------|-------------|
| **Pattern Extraction** | Pattern analyzer | Identify rules from decision history |
| | Confidence scoring | Statistical confidence for each pattern |
| | Pattern visualization | Show patterns with supporting decisions |
| | Manual pattern creation | User-defined rules |
| **Code Generation** | Code generator | Convert patterns → Deterministic block |
| | Code preview | Editable generated code |
| | Historical testing | Test generated code against past decisions |
| | Accuracy metrics | Show coverage percentage |
| **Hybrid Mode** | Mode selector | AI only, Code only, Hybrid, A/B test |
| | Routing logic | Route to code or AI based on pattern match |
| | Fallback tracking | Log when AI fallback occurs |
| **Block Swap** | Swap UI | Replace AI block with Function block |
| | Schema validation | Ensure interfaces match |
| | Flow preservation | No changes to flow connections |
| **Advanced** | Version control | Block and flow versioning |
| | Analytics dashboard | Decisions, costs, latency |
| | Training export | Export for fine-tuning |

#### Success Criteria

- [ ] Can analyze decisions and see extracted patterns
- [ ] Can generate Function block code from patterns
- [ ] Generated code achieves 80%+ accuracy on historical data
- [ ] Can run in Hybrid mode (code + AI fallback)
- [ ] Can swap AI block for Function block without breaking flow
- [ ] Can A/B test AI vs Code with metrics
- [ ] Can export training data in JSONL format

---

## Design System

A centralized design system ensures we can change the entire look and feel by modifying tokens, not hunting through components.

### Layer 1: Tokens (CSS Variables)

Semantic tokens that define the design language:

```css
/* src/styles/tokens.css */
:root {
  /* Colors - Semantic */
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(0 0% 9%);
  --color-primary: hsl(221 83% 53%);
  --color-primary-foreground: hsl(0 0% 100%);
  --color-muted: hsl(0 0% 96%);
  --color-muted-foreground: hsl(0 0% 45%);
  --color-border: hsl(0 0% 90%);
  --color-success: hsl(142 76% 36%);
  --color-warning: hsl(38 92% 50%);
  --color-error: hsl(0 84% 60%);

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Radii */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
}

.dark {
  --color-background: hsl(0 0% 9%);
  --color-foreground: hsl(0 0% 95%);
  /* ... dark mode overrides */
}
```

### Layer 2: Primitives (Base Components)

Atomic components that ONLY use tokens:

```
src/components/ui/
├── button.tsx        # Variants: default, outline, ghost, link
├── input.tsx         # Text, password, with icon slots
├── select.tsx        # Dropdown with search
├── badge.tsx         # Status indicators
├── card.tsx          # Container with header/body/footer
├── table.tsx         # Data table with sorting
├── tabs.tsx          # Tab navigation
├── dialog.tsx        # Modal dialogs
├── sheet.tsx         # Slide-out panels
├── toast.tsx         # Notifications
└── ...               # All shadcn/ui components
```

### Layer 3: Patterns (Composed Components)

Business logic components built from primitives:

```
src/components/
├── forms/
│   ├── FormField.tsx       # Label + Input + Error
│   ├── SchemaForm.tsx      # Form from JSON Schema
│   └── JsonEditor.tsx      # Monaco for JSON editing
├── data-display/
│   ├── DataTable.tsx       # Sortable, filterable table
│   ├── JsonViewer.tsx      # Pretty JSON display
│   └── CodeBlock.tsx       # Syntax highlighted code
└── feedback/
    ├── LoadingState.tsx    # Skeleton loaders
    ├── EmptyState.tsx      # "No data" displays
    └── ErrorState.tsx      # Error with retry
```

### Layer 4: Layouts (Page Structures)

Page-level layout components:

```
src/components/layout/
├── AppShell.tsx            # Sidebar + main content
├── PageHeader.tsx          # Title + actions
├── PageContent.tsx         # Padded content area
├── SplitPane.tsx           # Resizable split view
└── Panel.tsx               # Collapsible panel
```

### Design System Rules

1. **Tokens are the source of truth** - No hardcoded colors, spacing, or typography
2. **Primitives only use tokens** - Button, Input, etc. reference CSS variables
3. **Patterns compose primitives** - Never write raw HTML in patterns
4. **Layouts are content-agnostic** - They provide structure, not styling
5. **Dark mode via token swap** - Just change the CSS variables

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
  triggered_by JSONB NOT NULL,
  status VARCHAR(50) NOT NULL,
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
  node_id VARCHAR(255) NOT NULL,
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
  model VARCHAR(255),
  tokens_input INTEGER,
  tokens_output INTEGER,
  latency_ms INTEGER,
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
  rule TEXT NOT NULL,
  condition JSONB NOT NULL,
  output_template JSONB,
  confidence DECIMAL(5,4),
  support_count INTEGER,
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
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── blocks/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── decisions/page.tsx
│   │   │   ├── flows/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── runs/page.tsx
│   │   │   ├── decisions/
│   │   │   │   └── page.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx
│   │   │       └── connections/page.tsx
│   │   └── api/
│   │       └── trpc/[trpc]/route.ts
│   ├── components/
│   │   ├── ui/                        # shadcn/ui primitives
│   │   ├── forms/                     # Form patterns
│   │   ├── data-display/              # Data display patterns
│   │   ├── feedback/                  # Loading/error/empty states
│   │   ├── blocks/                    # Block-specific components
│   │   ├── flows/                     # Flow-specific components
│   │   ├── decisions/                 # Decision-specific components
│   │   ├── connections/               # Connection-specific components
│   │   └── layout/                    # Layout components
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── schema.ts
│   │   │   └── migrations/
│   │   ├── baleybots/
│   │   │   ├── compiler.ts            # Flow → BaleyBots code
│   │   │   ├── executor.ts            # Run compiled flows
│   │   │   └── providers.ts           # Provider management
│   │   ├── trpc/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── routers/
│   │   │       ├── index.ts
│   │   │       ├── workspace.ts
│   │   │       ├── connection.ts
│   │   │       ├── block.ts
│   │   │       ├── flow.ts
│   │   │       ├── execution.ts
│   │   │       ├── decision.ts
│   │   │       └── pattern.ts
│   │   ├── patterns/
│   │   │   ├── extractor.ts           # Extract patterns from decisions
│   │   │   └── generator.ts           # Generate code from patterns
│   │   └── utils/
│   │       ├── schema.ts              # JSON Schema helpers
│   │       └── crypto.ts              # Encrypt/decrypt API keys
│   ├── hooks/
│   │   ├── useBlock.ts
│   │   ├── useFlow.ts
│   │   ├── useDecisions.ts
│   │   └── useConnection.ts
│   ├── stores/
│   │   ├── flowStore.ts               # React Flow state
│   │   └── uiStore.ts                 # UI state
│   ├── styles/
│   │   └── tokens.css                 # Design system tokens
│   └── types/
│       ├── block.ts
│       ├── flow.ts
│       ├── decision.ts
│       └── pattern.ts
├── public/
├── drizzle.config.ts
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── PLAN.md
├── README.md
├── CHANGELOG.md
└── LICENSE
```

---

## Success Metrics

### Phase 1 Success

- [ ] Design system tokens defined and documented
- [ ] All primitive components use only tokens
- [ ] Database schema implemented with all indexes
- [ ] tRPC API fully typed end-to-end
- [ ] Can CRUD blocks and connections
- [ ] Can test blocks and see decisions logged

### Phase 2 Success

- [ ] Visual flow canvas fully functional
- [ ] Flows compile to valid BaleyBots code
- [ ] Flows execute with real-time progress
- [ ] Decisions filterable and inspectable
- [ ] Webhook triggers work

### Phase 3 Success

- [ ] Patterns extracted from decision history
- [ ] Code generated with 80%+ accuracy
- [ ] Hybrid mode operational
- [ ] Block swap preserves flow functionality
- [ ] Training data exportable

### Long-term Success

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
