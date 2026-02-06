# Unified BaleyBot Implementation Plan

> **For Claude Code Agent:** This is your implementation mandate. Execute ALL phases in order. Do not skip steps. Commit after each task. Request code review before claiming completion.

**Date:** February 2, 2026
**Status:** Ready for Implementation
**Authors:** James McArthur + Claude (Architecture) + Claude (UX)

---

## Executive Summary

Transform BaleyUI from a technical block/flow builder into a **task-focused BaleyBot platform** where:

1. Users describe what they need in natural language
2. AI generates the configuration (stored as BAL code)
3. BaleyBots execute and stream results
4. AI reviews results and suggests improvements
5. Users refine until the job is done

**Key Architectural Decision:** BAL (Baleybots Assembly Language) is the source of truth. The visual UI is a projection of BAL, not the other way around.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Technical Architecture](#2-technical-architecture)
3. [UI/UX Specification](#3-uiux-specification)
4. [Implementation Phases](#4-implementation-phases)
5. [Detailed Task Specifications](#5-detailed-task-specifications)
6. [Quality Standards](#6-quality-standards)
7. [Code Review Checklist](#7-code-review-checklist)
8. [Success Criteria](#8-success-criteria)

---

## 1. Core Concepts

### 1.1 What is a BaleyBot (BB)?

A BaleyBot is a **task-focused intelligent agent** that:
- Has a clear purpose ("monitor user activity", "suggest actions")
- Is configured by AI based on user's natural language description
- Connects to data sources and external systems
- Can work alone or collaborate with other BBs
- Produces insights, actions, and analytics

**A BB is NOT:**
- A technical building block the user assembles manually
- A flow chart the user draws
- A configuration form the user fills out

### 1.2 BAL (Baleybots Assembly Language)

BAL is the internal representation of a BaleyBot. Users never write BAL directly (unless they're power users). AI generates it.

```bal
// Example: Activity Monitor BB
activity_poller {
  "goal": "Poll database for new user events every 5 minutes",
  "model": "openai:gpt-4o-mini",
  "tools": ["query_database"],
  "history": "none"
}

trend_analyzer {
  "goal": "Analyze event patterns and identify trends",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": ["query_database"],
  "can_request": ["send_notification"],
  "output": {
    "trends": "array",
    "anomalies": "array"
  }
}

reporter {
  "goal": "Generate human-readable insights report",
  "history": "inherit"
}

chain {
  activity_poller
  trend_analyzer
  reporter
}
```

### 1.3 BB Relationships

BBs can use other BBs via `spawnBaleybotTool`:

```bal
smart_suggester {
  "goal": "Suggest actions to users based on their activity patterns",
  "tools": ["spawn_baleybot"],  // Can call Activity Monitor BB
  "can_request": ["push_to_app_ui"]
}
```

---

## 2. Technical Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Home:     │  │   Create:   │  │   Detail:   │             │
│  │ My BaleyBots│  │ AI-Guided   │  │  BB View    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER (tRPC)                         │
│  baleybots.list    baleybots.create    baleybots.execute        │
│  baleybots.get     baleybots.update    baleybots.stream         │
└─────────────────────────────────────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  BAL Generator  │  │  BAL Executor   │  │  Review Agent   │ │
│  │  (AI writes BAL)│  │ Pipeline.from() │  │ (suggests fixes)│ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   TOOL CURATION LAYER                        ││
│  │  Workspace Policies → Context → AI Inference → Approval     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  baleybots   │  │  executions  │  │  approvals   │          │
│  │  (BAL code)  │  │  (history)   │  │  (patterns)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Models

#### baleybots table
```typescript
export const baleybots = pgTable('baleybots', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),

  // User-facing
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),  // emoji or icon name
  status: text('status').notNull().default('draft'),  // draft, active, paused, error

  // BAL source of truth
  balCode: text('bal_code').notNull(),

  // Cached structure for visualization (from Pipeline.getStructure())
  structure: jsonb('structure'),

  // Entity names in this BB (for quick lookup)
  entityNames: jsonb('entity_names').$type<string[]>(),

  // BB dependencies (other BBs this one can call)
  dependencies: jsonb('dependencies').$type<string[]>(),

  // Metadata
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: text('created_by').references(() => users.id),

  // Soft delete
  deletedAt: timestamp('deleted_at'),
});
```

#### baleybot_executions table
```typescript
export const baleybotExecutions = pgTable('baleybot_executions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  baleybotId: text('baleybot_id').notNull().references(() => baleybots.id),

  status: text('status').notNull().default('pending'),  // pending, running, completed, failed, cancelled

  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),

  // StreamSegments stored for replay
  segments: jsonb('segments').$type<StreamSegment[]>(),

  // Metrics
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),
  tokenCount: integer('token_count'),

  // Trigger info
  triggeredBy: text('triggered_by'),  // 'manual', 'schedule', 'webhook', 'other_bb'
  triggerSource: text('trigger_source'),  // e.g., BB ID if triggered by another BB
});
```

#### approval_patterns table
```typescript
export const approvalPatterns = pgTable('approval_patterns', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),

  // Pattern definition
  tool: text('tool').notNull(),
  actionPattern: jsonb('action_pattern').notNull(),  // e.g., { action: "refund", amount: "<=100" }
  entityGoalPattern: text('entity_goal_pattern'),    // regex for matching entity goals

  // Trust level
  trustLevel: text('trust_level').notNull().default('provisional'),  // provisional, trusted, permanent
  timesUsed: integer('times_used').notNull().default(0),

  // Audit
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  expiresAt: timestamp('expires_at'),

  // Can be revoked
  revokedAt: timestamp('revoked_at'),
  revokedBy: text('revoked_by'),
  revokeReason: text('revoke_reason'),
});
```

#### workspace_policies table
```typescript
export const workspacePolicies = pgTable('workspace_policies', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id).unique(),

  // Tool policies
  allowedTools: jsonb('allowed_tools').$type<string[]>(),
  forbiddenTools: jsonb('forbidden_tools').$type<string[]>(),
  requiresApprovalTools: jsonb('requires_approval_tools').$type<string[]>(),

  // Global limits
  maxAutoApproveAmount: integer('max_auto_approve_amount'),
  reapprovalIntervalDays: integer('reapproval_interval_days').default(90),
  maxAutoFiresBeforeReview: integer('max_auto_fires_before_review').default(100),

  // Pattern learning manual (natural language guidelines for AI)
  learningManual: text('learning_manual'),

  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### 2.3 Key Services

#### BAL Generator Service
```typescript
// apps/web/src/lib/baleybot/generator.ts
interface GeneratorContext {
  workspaceId: string;
  availableTools: ToolDefinition[];
  workspacePolicies: WorkspacePolicies;
  connections: Connection[];
  existingBaleybots: BaleybotSummary[];  // For spawn_baleybot awareness
}

interface GenerateResult {
  balCode: string;
  explanation: string;
  entities: Array<{
    name: string;
    goal: string;
    tools: string[];
    canRequest: string[];
  }>;
  toolRationale: Record<string, string>;
  suggestedName: string;
  suggestedIcon: string;
}

export function createBalGenerator(ctx: GeneratorContext): Baleybot;
export async function generateBal(
  ctx: GeneratorContext,
  userDescription: string,
  conversationHistory?: Message[]
): Promise<GenerateResult>;
```

#### BAL Executor Service
```typescript
// apps/web/src/lib/baleybot/executor.ts
interface ExecuteOptions {
  onSegment?: (segment: StreamSegment) => void;
  onApprovalNeeded?: (request: ApprovalRequest) => Promise<ApprovalResponse>;
  signal?: AbortSignal;
}

export async function executeBaleybot(
  baleybotId: string,
  input: unknown,
  options?: ExecuteOptions
): Promise<ExecutionResult>;
```

#### Review Agent Service
```typescript
// apps/web/src/lib/baleybot/reviewer.ts
interface ReviewResult {
  meetsIntent: boolean;
  qualityScore: number;
  issues: Array<{
    type: 'incomplete' | 'inaccurate' | 'missing' | 'format' | 'other';
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  suggestions: Array<{
    change: string;
    reason: string;
    balDiff?: string;
  }>;
}

export async function reviewExecution(
  baleybot: Baleybot,
  execution: BaleybotExecution,
  originalIntent: string
): Promise<ReviewResult>;
```

### 2.4 Tool Curation Layers

```
Layer 1: WORKSPACE POLICIES (hard boundaries)
    │ Admin configures allowed/forbidden tools
    ▼
Layer 2: CONTEXT (from BAL generator)
    │ Generator assigns tools based on entity goal
    │ tools: [...] = immediate access
    │ can_request: [...] = needs approval
    ▼
Layer 3: RUNTIME APPROVAL
    │ If tool is in can_request, prompt user
    │ If pattern matches learned approval, auto-approve
    ▼
Layer 4: LEARNING
    │ "Approve & Remember" extracts patterns
    │ AI proposes pattern, user confirms
    │ Pattern stored with trust level
```

---

## 3. UI/UX Specification

### 3.1 Navigation Structure

**Before (7 items):**
```
Dashboard | Blocks | Flows | Executions | Decisions | Analytics | Settings
```

**After (3 items):**
```
BaleyBots | Activity | Settings
```

### 3.2 Page Specifications

#### 3.2.1 Home: My BaleyBots (`/dashboard`)

```
┌─────────────────────────────────────────────────────────────────┐
│  BaleyUI                                        [Search] [?] [⚙]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Welcome back, {firstName}                                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  + Create a new BaleyBot                                    ││
│  │  Tell me what you need done, and I'll help build it         ││
│  │                                                              ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │ I need to...                                        │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Your BaleyBots ({count})                              [View All]│
│                                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │ {icon} {name}            │  │ {icon} {name}            │    │
│  │ {description}            │  │ {description}            │    │
│  │ {status} · {metric}      │  │ {status} · {metric}      │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│                                                                  │
│  ┌─ How they connect ───────────────────────────────────────┐   │
│  │  {BB1} ──feeds──▶ {BB2}                                   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Recent Activity                                       [View All]│
│  • {BB name} completed · {time ago} · {brief result}            │
│  • {BB name} running · {progress}                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Components needed:**
- `BaleybotCard` - Shows BB with icon, name, status, key metric
- `CreateBaleybotPrompt` - Prominent input with suggestions
- `BaleybotRelationshipGraph` - Simple diagram of BB connections
- `RecentActivityFeed` - Latest executions across all BBs

#### 3.2.2 Create BaleyBot Flow (`/dashboard/baleybots/new`)

**Step 1: Describe**
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                              Step 1 of 4: Describe      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  What should this BaleyBot do?                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │ {user types here}                                           ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  💡 Examples:                                                    │
│  • "Monitor my database for new signups and alert me"           │
│  • "Analyze support tickets and categorize by urgency"          │
│  • "Suggest actions to users based on their behavior"           │
│                                                                  │
│                                              [Continue →]        │
└─────────────────────────────────────────────────────────────────┘
```

**Step 2: AI Proposes**
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                              Step 2 of 4: Review Plan   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🤖 Here's what I'm thinking...                        [Refine] │
│                                                                  │
│  {icon} {suggested_name}                                        │
│                                                                  │
│  {explanation of what the BB will do}                           │
│                                                                  │
│  ┌─ What it will do ────────────────────────────────────────┐   │
│  │ • {capability 1}                                          │   │
│  │ • {capability 2}                                          │   │
│  │ • {capability 3}                                          │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Tools it needs ─────────────────────────────────────────┐   │
│  │ ✓ {tool1} - {why}                                        │   │
│  │ ✓ {tool2} - {why}                                        │   │
│  │ ⚠ {tool3} - {why} (will ask before using)                │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ "Does this look right? Tell me if you want changes..."     ││
│  │ ┌───────────────────────────────────────────────────────┐  ││
│  │ │ {user can refine here}                                │  ││
│  │ └───────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│                              [← Back]  [Looks Good →]            │
└─────────────────────────────────────────────────────────────────┘
```

**Step 3: Connect**
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                              Step 3 of 4: Connect       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  How will this BaleyBot get data?                               │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │ 🗄️ Database        │  │ 🔌 API             │                 │
│  │ Connect directly   │  │ REST/GraphQL       │                 │
│  └────────────────────┘  └────────────────────┘                 │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │ 📡 Webhook         │  │ 🤖 Other BaleyBot  │                 │
│  │ Receive events     │  │ Use existing BB    │                 │
│  └────────────────────┘  └────────────────────┘                 │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  {Connection-specific setup UI appears here after selection}    │
│                                                                  │
│                              [← Back]  [Continue →]              │
└─────────────────────────────────────────────────────────────────┘
```

**Step 4: Activate**
```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                              Step 4 of 4: Activate      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✓ Your BaleyBot is ready!                                      │
│                                                                  │
│  {icon} {name}                                                  │
│                                                                  │
│  ┌─ Summary ────────────────────────────────────────────────┐   │
│  │ ✓ {capability 1}                                          │   │
│  │ ✓ {capability 2}                                          │   │
│  │ ✓ Connected to {data source}                              │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Preview ────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │  {Sample output/dashboard with mock data}                │   │
│  │                                                           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────────────────────┐    │
│  │ [View BAL Code]  │  │ [Activate BaleyBot →]            │    │
│  └──────────────────┘  └──────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Components needed:**
- `CreateBaleybotWizard` - Multi-step container
- `DescribeStep` - Text input with examples
- `ReviewPlanStep` - Shows AI proposal with refine option
- `ConnectStep` - Data source selection and configuration
- `ActivateStep` - Summary and preview
- `BalCodeViewer` - Syntax-highlighted BAL display (optional view)

#### 3.2.3 BaleyBot Detail (`/dashboard/baleybots/[id]`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back    {icon} {name}                    [Run] [Edit] [···]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Overview]  [Activity]  [Analytics]  [Configuration]           │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  {Tab content - see below}                                      │
│                                                                  │
│  ┌─ Ask this BaleyBot ──────────────────────────────────────┐   │
│  │ ┌───────────────────────────────────────────────────────┐│   │
│  │ │ {type a question}                                     ││   │
│  │ └───────────────────────────────────────────────────────┘│   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Overview Tab:**
- Status indicator (Active/Paused/Error)
- Key metrics cards (events, users, actions, etc.)
- "Uses" section (other BBs this one calls)
- "Used by" section (BBs that call this one)
- Last activity summary

**Activity Tab:**
- Live stream of executions using StreamSegments
- Filterable by date, status, trigger
- Expandable execution details
- Approval requests inline

**Analytics Tab:**
- Execution count over time
- Success/failure rate
- Average duration
- Token usage
- Cost breakdown

**Configuration Tab:**
- BAL code viewer/editor (power users)
- "How it works" visualization from Pipeline.getStructure()
- Connected data sources
- Tool permissions
- Schedule/trigger configuration

**Components needed:**
- `BaleybotDetailPage` - Container with tabs
- `BaleybotOverview` - Status, metrics, relationships
- `BaleybotActivity` - StreamSegment-based activity log
- `BaleybotAnalytics` - Charts and metrics
- `BaleybotConfiguration` - BAL view, structure, settings
- `AskBaleybotInput` - Conversational interface
- `StreamSegmentRenderer` - Renders all segment types
- `PipelineStructureVisualization` - From getStructure()

#### 3.2.4 Activity Page (`/dashboard/activity`)

Global activity feed across all BaleyBots:

```
┌─────────────────────────────────────────────────────────────────┐
│  Activity                                      [Filter] [Search]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Filters ────────────────────────────────────────────────┐   │
│  │ BaleyBot: [All ▼]  Status: [All ▼]  Date: [Last 7 days ▼]│   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ {BB name} · {status} · {time} ──────────────────────────┐   │
│  │ {StreamSegment summary}                          [Expand] │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ {BB name} · {status} · {time} ──────────────────────────┐   │
│  │ {StreamSegment summary}                          [Expand] │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ APPROVAL NEEDED ────────────────────────────────────────┐   │
│  │ {BB name} wants to {action}                              │   │
│  │ [Approve] [Deny] [Approve & Remember]                    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.2.5 Settings Pages

**Settings > Connections** (`/dashboard/settings/connections`)
- AI Providers (OpenAI, Anthropic, Ollama)
- Data Sources (databases, APIs)
- MCP Servers (new)

**Settings > Policies** (`/dashboard/settings/policies`) - NEW
- Tool allowlists/denylists
- Approval requirements
- Global limits
- Learning manual

**Settings > Approvals** (`/dashboard/settings/approvals`) - NEW
- Learned approval patterns
- Trust levels
- Revoke/modify patterns

### 3.3 StreamSegment Rendering

Each segment type has a dedicated renderer:

| Segment Type | Component | Display |
|--------------|-----------|---------|
| `TextSegment` | `StreamingText` | Typewriter effect text |
| `ToolCallSegment` | `ToolCallCard` | Collapsible card with params/result |
| `ReasoningSegment` | `ReasoningPanel` | Expandable "Thinking..." |
| `SpawnAgentSegment` | `NestedExecution` | Indented child execution |
| `StructuredOutputSegment` | `OutputCard` | Formatted JSON/data |
| `ErrorSegment` | `ErrorCard` | Red error display |
| `SequentialThinkingSegment` | `ThinkingSteps` | Numbered reasoning steps |
| `DSLPipelineSegment` | `PipelineProgress` | Progress through BAL stages |
| `DoneSegment` | `CompletionMarker` | Checkmark with summary |

### 3.4 Approval UI

Inline approval prompt:
```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ {entity_name} wants to use {tool_name}                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  {tool_name}({                                                  │
│    {param1}: {value1},                                          │
│    {param2}: {value2}                                           │
│  })                                                              │
│                                                                  │
│  Reason: "{AI's explanation for why it needs this}"             │
│                                                                  │
│  ┌─────────┐  ┌─────────┐  ┌──────────────────────┐            │
│  │ Approve │  │  Deny   │  │ Approve & Remember   │            │
│  └─────────┘  └─────────┘  └──────────────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

"Approve & Remember" follow-up:
```
┌─────────────────────────────────────────────────────────────────┐
│  💡 Learn from this approval?                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  I can auto-approve similar requests in the future:             │
│                                                                  │
│  "{AI-proposed pattern description}"                            │
│  e.g., "Refunds up to $100 for billing support"                │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ Sounds Good    │  │ Adjust Limit   │  │ Just This Once │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Phases

### Phase Overview

| Phase | Focus | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 1** | Database & Core Services | 1-2 weeks | None |
| **Phase 2** | BAL Generator & Executor | 1-2 weeks | Phase 1 |
| **Phase 3** | UI - Home & List | 1 week | Phase 1 |
| **Phase 4** | UI - Create Flow | 1-2 weeks | Phase 2, 3 |
| **Phase 5** | UI - Detail & Activity | 1-2 weeks | Phase 2, 3 |
| **Phase 6** | Approval System | 1 week | Phase 2, 5 |
| **Phase 7** | Review Agent & Refinement | 1 week | Phase 2, 5 |
| **Phase 8** | Remove Legacy & Polish | 1-2 weeks | All |

---

## 5. Detailed Task Specifications

### Phase 1: Database & Core Services

#### Task 1.1: Add Database Tables

**Files to create/modify:**
- `packages/db/src/schema.ts` - Add new tables

**Steps:**
1. Add `baleybots` table as specified in Section 2.2
2. Add `baleybotExecutions` table
3. Add `approvalPatterns` table
4. Add `workspacePolicies` table
5. Add relations between tables
6. Generate migration: `pnpm drizzle-kit generate`
7. Apply migration: `pnpm drizzle-kit push`

**Verification:**
```bash
# Tables exist and have correct columns
psql -c "\d baleybots"
psql -c "\d baleybot_executions"
psql -c "\d approval_patterns"
psql -c "\d workspace_policies"
```

**Commit message:** `feat(db): add baleybot tables for BAL-first architecture`

---

#### Task 1.2: Create tRPC Router for BaleyBots

**Files to create:**
- `apps/web/src/lib/trpc/routers/baleybots.ts`

**Procedures to implement:**
```typescript
export const baleybotsRouter = router({
  // List all baleybots for workspace
  list: protectedProcedure.query(async ({ ctx }) => { ... }),

  // Get single baleybot by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => { ... }),

  // Create new baleybot (from BAL code)
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),
      balCode: z.string(),
    }))
    .mutation(async ({ ctx, input }) => { ... }),

  // Update baleybot
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      balCode: z.string().optional(),
      status: z.enum(['draft', 'active', 'paused']).optional(),
    }))
    .mutation(async ({ ctx, input }) => { ... }),

  // Delete baleybot (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => { ... }),

  // Execute baleybot
  execute: protectedProcedure
    .input(z.object({
      id: z.string(),
      input: z.unknown().optional(),
    }))
    .mutation(async ({ ctx, input }) => { ... }),

  // Get executions for a baleybot
  listExecutions: protectedProcedure
    .input(z.object({
      baleybotId: z.string(),
      limit: z.number().optional().default(20),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => { ... }),

  // Get single execution
  getExecution: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => { ... }),
});
```

**Add to main router:**
- Modify `apps/web/src/lib/trpc/routers/index.ts`

**Commit message:** `feat(api): add baleybots tRPC router`

---

#### Task 1.3: Create Workspace Policies Router

**Files to create:**
- `apps/web/src/lib/trpc/routers/policies.ts`

**Procedures:**
- `get` - Get policies for workspace
- `update` - Update policies
- `listApprovalPatterns` - List learned patterns
- `revokePattern` - Revoke a learned pattern

**Commit message:** `feat(api): add workspace policies tRPC router`

---

### Phase 2: BAL Generator & Executor

#### Task 2.1: Create BAL Generator Service

**Files to create:**
- `apps/web/src/lib/baleybot/generator.ts`
- `apps/web/src/lib/baleybot/tool-catalog.ts`

**Implementation:**
1. Create `buildToolCatalog` function that categorizes tools based on workspace policies
2. Create `createBalGenerator` function that returns a configured Baleybot
3. The generator's system prompt must include:
   - BAL syntax reference
   - Tool assignment rules (tools vs can_request)
   - Available tools from catalog
   - Existing BaleyBots (for spawn_baleybot awareness)
4. Output schema must include: balCode, explanation, entities, toolRationale, suggestedName, suggestedIcon

**Test:**
```typescript
describe('BAL Generator', () => {
  it('generates valid BAL for simple task', async () => {
    const result = await generateBal(ctx, "Monitor my database for new users");
    expect(result.balCode).toContain('goal');
    expect(Pipeline.from(result.balCode)).toBeDefined();
  });

  it('assigns appropriate tools based on goal', async () => {
    const result = await generateBal(ctx, "Query my PostgreSQL database");
    expect(result.entities[0].tools).toContain('query_database');
  });

  it('puts dangerous tools in can_request', async () => {
    const result = await generateBal(ctx, "Delete old records from database");
    expect(result.entities[0].canRequest).toContain('delete_records');
  });
});
```

**Commit message:** `feat(baleybot): implement BAL generator service`

---

#### Task 2.2: Create BAL Executor Service

**Files to create:**
- `apps/web/src/lib/baleybot/executor.ts`
- `apps/web/src/lib/baleybot/approval-checker.ts`

**Implementation:**
1. Load baleybot from database
2. Create Pipeline from BAL code: `Pipeline.from(baleybot.balCode)`
3. Create execution record
4. Execute with streaming:
   ```typescript
   const result = await pipeline.process(input, {
     onToken: (botName, event) => {
       options?.onSegment?.(event);
       // Store segment for replay
     },
     signal: options?.signal,
   });
   ```
5. Handle approval requests via `onApprovalNeeded` callback
6. Update execution record with result/error
7. Return result

**Commit message:** `feat(baleybot): implement BAL executor service`

---

#### Task 2.3: Create Approval Checker

**Files to create:**
- `apps/web/src/lib/baleybot/approval-checker.ts`

**Implementation:**
1. `checkApproval(tool, params, entityGoal)` function
2. Checks against learned patterns in approval_patterns table
3. Returns `{ approved: boolean, patternId?: string }` if auto-approved
4. Returns `{ approved: false, needsPrompt: true }` if needs user approval

**Commit message:** `feat(baleybot): implement approval pattern checker`

---

#### Task 2.4: Create Pattern Learning Service

**Files to create:**
- `apps/web/src/lib/baleybot/pattern-learner.ts`

**Implementation:**
1. `proposePattern(tool, params, entityGoal)` - AI proposes a pattern
2. `savePattern(pattern, userId)` - Store with provisional trust
3. `upgradePattern(patternId)` - Move to trusted after N uses
4. `revokePattern(patternId, reason)` - Revoke a pattern

**Commit message:** `feat(baleybot): implement approval pattern learning`

---

### Phase 3: UI - Home & List

#### Task 3.1: Update Navigation

**Files to modify:**
- `apps/web/src/app/dashboard/layout.tsx`

**Changes:**
```typescript
const navLinks = [
  { href: ROUTES.dashboard, label: 'BaleyBots' },
  { href: ROUTES.activity, label: 'Activity' },
  { href: ROUTES.settings.root, label: 'Settings' },
];
```

**Commit message:** `refactor(ui): simplify navigation to 3 items`

---

#### Task 3.2: Create BaleybotCard Component

**Files to create:**
- `apps/web/src/components/baleybots/BaleybotCard.tsx`

**Props:**
```typescript
interface BaleybotCardProps {
  baleybot: {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    status: 'draft' | 'active' | 'paused' | 'error';
    lastExecutedAt?: Date;
    executionCount?: number;
    // Key metric (customizable)
    metric?: { label: string; value: string | number };
  };
  onEdit?: () => void;
  onRun?: () => void;
}
```

**Commit message:** `feat(ui): add BaleybotCard component`

---

#### Task 3.3: Create New Dashboard Page

**Files to modify:**
- `apps/web/src/app/dashboard/page.tsx`

**Implementation:**
- Replace current dashboard with BaleyBot-centric home
- Show CreateBaleybotPrompt at top
- Grid of BaleybotCards
- BaleybotRelationshipGraph (simple version)
- RecentActivityFeed

**Commit message:** `feat(ui): redesign dashboard as BaleyBot home`

---

#### Task 3.4: Create Relationship Graph Component

**Files to create:**
- `apps/web/src/components/baleybots/BaleybotRelationshipGraph.tsx`

**Simple implementation:**
- Show BBs that have dependencies on each other
- Use simple CSS/SVG arrows, not a complex graph library
- Can enhance later

**Commit message:** `feat(ui): add BB relationship graph component`

---

### Phase 4: UI - Create Flow

#### Task 4.1: Create Wizard Container

**Files to create:**
- `apps/web/src/app/dashboard/baleybots/new/page.tsx`
- `apps/web/src/components/baleybots/create/CreateBaleybotWizard.tsx`

**Implementation:**
- Multi-step wizard with progress indicator
- State management for wizard data
- Navigation between steps
- Handles conversation history with BAL generator

**Commit message:** `feat(ui): add create baleybot wizard container`

---

#### Task 4.2: Implement Describe Step

**Files to create:**
- `apps/web/src/components/baleybots/create/DescribeStep.tsx`

**Implementation:**
- Large text input
- Example suggestions (clickable)
- Continue button calls BAL generator

**Commit message:** `feat(ui): add describe step for BB creation`

---

#### Task 4.3: Implement Review Plan Step

**Files to create:**
- `apps/web/src/components/baleybots/create/ReviewPlanStep.tsx`

**Implementation:**
- Display AI's proposed configuration
- Show tools with rationale
- Show can_request tools with warning icon
- Refinement input for adjustments
- Refine button re-calls generator with feedback

**Commit message:** `feat(ui): add review plan step for BB creation`

---

#### Task 4.4: Implement Connect Step

**Files to create:**
- `apps/web/src/components/baleybots/create/ConnectStep.tsx`
- `apps/web/src/components/baleybots/create/connections/DatabaseConnect.tsx`
- `apps/web/src/components/baleybots/create/connections/WebhookConnect.tsx`
- `apps/web/src/components/baleybots/create/connections/OtherBaleybotConnect.tsx`

**Implementation:**
- Data source selection cards
- Dynamic form based on selection
- Connection testing
- "I'll do this later" option

**Commit message:** `feat(ui): add connect step for BB creation`

---

#### Task 4.5: Implement Activate Step

**Files to create:**
- `apps/web/src/components/baleybots/create/ActivateStep.tsx`

**Implementation:**
- Summary of configuration
- Preview with mock data (optional)
- "View BAL Code" button (opens modal)
- "Activate" button creates the BB

**Commit message:** `feat(ui): add activate step for BB creation`

---

#### Task 4.6: Create BAL Code Viewer

**Files to create:**
- `apps/web/src/components/baleybots/BalCodeViewer.tsx`

**Implementation:**
- Syntax highlighted BAL display
- Read-only by default
- "Edit" mode for power users (optional)
- Copy button

**Commit message:** `feat(ui): add BAL code viewer component`

---

### Phase 5: UI - Detail & Activity

#### Task 5.1: Create BaleyBot Detail Page

**Files to create:**
- `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`
- `apps/web/src/components/baleybots/detail/BaleybotDetailPage.tsx`

**Implementation:**
- Header with name, icon, status, actions
- Tab navigation
- "Ask this BaleyBot" input at bottom

**Commit message:** `feat(ui): add baleybot detail page`

---

#### Task 5.2: Implement Overview Tab

**Files to create:**
- `apps/web/src/components/baleybots/detail/OverviewTab.tsx`

**Implementation:**
- Status indicator
- Metric cards
- Dependencies section
- Last activity

**Commit message:** `feat(ui): add baleybot overview tab`

---

#### Task 5.3: Implement Activity Tab with StreamSegments

**Files to create:**
- `apps/web/src/components/baleybots/detail/ActivityTab.tsx`
- `apps/web/src/components/streaming/SegmentRenderer.tsx`
- `apps/web/src/components/streaming/segments/TextSegment.tsx`
- `apps/web/src/components/streaming/segments/ToolCallSegment.tsx`
- `apps/web/src/components/streaming/segments/ReasoningSegment.tsx`
- `apps/web/src/components/streaming/segments/SpawnAgentSegment.tsx`
- `apps/web/src/components/streaming/segments/ErrorSegment.tsx`
- `apps/web/src/components/streaming/segments/StructuredOutputSegment.tsx`

**Implementation:**
- List of executions
- Expandable execution detail
- Real-time streaming for running executions
- Each segment type has dedicated renderer

**Commit message:** `feat(ui): add activity tab with StreamSegment rendering`

---

#### Task 5.4: Implement Analytics Tab

**Files to create:**
- `apps/web/src/components/baleybots/detail/AnalyticsTab.tsx`

**Implementation:**
- Execution count chart
- Success rate
- Duration histogram
- Token usage
- Simple charts (can use existing chart components)

**Commit message:** `feat(ui): add baleybot analytics tab`

---

#### Task 5.5: Implement Configuration Tab

**Files to create:**
- `apps/web/src/components/baleybots/detail/ConfigurationTab.tsx`
- `apps/web/src/components/baleybots/PipelineStructureVisualization.tsx`

**Implementation:**
- BAL code viewer (editable for power users)
- Pipeline structure visualization from `Pipeline.getStructure()`
- Data source configuration
- Trigger configuration

**Commit message:** `feat(ui): add baleybot configuration tab`

---

#### Task 5.6: Create Global Activity Page

**Files to create:**
- `apps/web/src/app/dashboard/activity/page.tsx`

**Implementation:**
- Aggregate activity across all BBs
- Filters (BB, status, date)
- Uses same StreamSegment rendering

**Commit message:** `feat(ui): add global activity page`

---

### Phase 6: Approval System

#### Task 6.1: Create Approval Prompt Component

**Files to create:**
- `apps/web/src/components/approvals/ApprovalPrompt.tsx`
- `apps/web/src/components/approvals/ApproveAndRememberDialog.tsx`

**Implementation:**
- Shows tool call details
- Three buttons: Approve, Deny, Approve & Remember
- Approve & Remember opens pattern dialog

**Commit message:** `feat(ui): add approval prompt component`

---

#### Task 6.2: Integrate Approvals into Activity Stream

**Files to modify:**
- `apps/web/src/components/baleybots/detail/ActivityTab.tsx`
- `apps/web/src/components/streaming/SegmentRenderer.tsx`

**Implementation:**
- When execution is waiting for approval, show prompt inline
- Handle approval via tRPC mutation
- Resume execution after approval

**Commit message:** `feat(ui): integrate approvals into activity stream`

---

#### Task 6.3: Create Approvals Settings Page

**Files to create:**
- `apps/web/src/app/dashboard/settings/approvals/page.tsx`

**Implementation:**
- List learned patterns
- Trust level indicator
- Usage count
- Revoke button

**Commit message:** `feat(ui): add approvals settings page`

---

### Phase 7: Review Agent & Refinement

#### Task 7.1: Create Review Agent Service

**Files to create:**
- `apps/web/src/lib/baleybot/reviewer.ts`

**Implementation:**
- Takes execution result and original intent
- Analyzes quality and accuracy
- Proposes improvements
- Returns structured suggestions

**Commit message:** `feat(baleybot): implement review agent service`

---

#### Task 7.2: Create Suggestions UI

**Files to create:**
- `apps/web/src/components/baleybots/SuggestionsPanel.tsx`

**Implementation:**
- Shows after execution completes
- Lists issues with severity
- Shows suggestions with "Accept" buttons
- Accept applies BAL change

**Commit message:** `feat(ui): add suggestions panel for refinement`

---

#### Task 7.3: Integrate Review into Execution Flow

**Files to modify:**
- `apps/web/src/lib/baleybot/executor.ts`
- `apps/web/src/components/baleybots/detail/ActivityTab.tsx`

**Implementation:**
- After execution completes, trigger review
- Show suggestions in activity stream
- Handle accept/dismiss actions

**Commit message:** `feat: integrate review agent into execution flow`

---

### Phase 8: Remove Legacy & Polish

#### Task 8.1: Remove Legacy Blocks/Flows Code

**Files to remove/deprecate:**
- `apps/web/src/app/dashboard/blocks/` - Remove or redirect
- `apps/web/src/app/dashboard/flows/` - Remove or redirect
- `apps/web/src/lib/execution/flow-executor.ts` - Remove
- `apps/web/src/lib/execution/node-executors/` - Remove
- `apps/web/src/lib/baleybots/compiler.ts` - Remove
- `apps/web/src/components/blocks/` - Remove unused
- `apps/web/src/components/flow/` - Remove unused

**Keep:**
- Streaming components (refactor to new location)
- UI primitives

**Migration:**
- Create redirect from `/dashboard/blocks` → `/dashboard`
- Create redirect from `/dashboard/flows` → `/dashboard`

**Commit message:** `refactor: remove legacy blocks/flows architecture`

---

#### Task 8.2: Update Routes Configuration

**Files to modify:**
- `apps/web/src/lib/routes.ts`

**New routes:**
```typescript
export const ROUTES = {
  dashboard: '/dashboard',
  baleybots: {
    list: '/dashboard',
    new: '/dashboard/baleybots/new',
    detail: (id: string) => `/dashboard/baleybots/${id}`,
  },
  activity: '/dashboard/activity',
  settings: {
    root: '/dashboard/settings',
    connections: '/dashboard/settings/connections',
    policies: '/dashboard/settings/policies',
    approvals: '/dashboard/settings/approvals',
    workspace: '/dashboard/settings/workspace',
    apiKeys: '/dashboard/settings/api-keys',
  },
};
```

**Commit message:** `refactor: update routes for new architecture`

---

#### Task 8.3: Polish & Accessibility

**Tasks:**
- Add ARIA labels to all interactive elements
- Ensure keyboard navigation works throughout
- Add loading states everywhere
- Add error states everywhere
- Ensure responsive design (mobile-friendly)
- Add tooltips where helpful
- Consistent spacing and typography

**Commit message:** `chore: polish UI and accessibility`

---

#### Task 8.4: Add Comprehensive Error Handling

**Implementation:**
- Error boundaries at page level
- Graceful degradation for API failures
- Helpful error messages (not technical jargon)
- Retry mechanisms where appropriate

**Commit message:** `feat: add comprehensive error handling`

---

#### Task 8.5: Performance Optimization

**Tasks:**
- Virtualize long lists (executions, activity)
- Debounce search inputs
- Optimize re-renders with React.memo
- Add Suspense boundaries
- Lazy load heavy components

**Commit message:** `perf: optimize rendering and loading`

---

## 6. Quality Standards

### Code Standards

1. **TypeScript Strict Mode** - No `any` types, no `@ts-ignore`
2. **Component Structure:**
   ```typescript
   // Good
   interface Props {
     value: string;
     onChange: (value: string) => void;
   }

   export function MyComponent({ value, onChange }: Props) { ... }
   ```
3. **No inline styles** - Use Tailwind classes only
4. **Descriptive names** - `handleSubmitBaleybotForm` not `handleSubmit`
5. **Small components** - Under 200 lines per file
6. **Co-located tests** - `MyComponent.test.tsx` next to `MyComponent.tsx`

### Testing Standards

1. **Unit tests for services** - All functions in `lib/baleybot/*`
2. **Component tests for UI** - Key user flows
3. **Integration tests for tRPC** - Router procedures
4. **No mocking of BaleyBots SDK** - Use actual Pipeline.from() in tests

### Commit Standards

1. **Conventional commits** - `feat:`, `fix:`, `refactor:`, `chore:`, `perf:`, `test:`
2. **One logical change per commit**
3. **Commit message format:**
   ```
   feat(scope): short description

   Longer description if needed.

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```

---

## 7. Code Review Checklist

**Before claiming completion, verify ALL items:**

### Functionality
- [ ] All tRPC procedures work correctly
- [ ] BAL generator produces valid BAL code
- [ ] BAL executor runs pipelines successfully
- [ ] StreamSegments render correctly for all types
- [ ] Approval flow works end-to-end
- [ ] Review agent provides useful suggestions
- [ ] BB relationships (spawn_baleybot) work

### UI/UX
- [ ] Navigation has only 3 items: BaleyBots, Activity, Settings
- [ ] Home page shows BBs, not blocks/flows
- [ ] Create flow is conversational (4 steps)
- [ ] Detail page has all 4 tabs working
- [ ] Activity page shows global feed
- [ ] Approval prompts appear inline
- [ ] "Approve & Remember" learning works

### Code Quality
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] All tests pass
- [ ] No `any` types
- [ ] No unused imports/variables
- [ ] Consistent code style

### Performance
- [ ] Pages load in under 2 seconds
- [ ] Long lists are virtualized
- [ ] No unnecessary re-renders
- [ ] Images optimized (if any)

### Accessibility
- [ ] All buttons/links have accessible labels
- [ ] Keyboard navigation works
- [ ] Color contrast sufficient
- [ ] Screen reader friendly

### Documentation
- [ ] README updated if needed
- [ ] Complex functions have JSDoc comments
- [ ] API changes documented

### Cleanup
- [ ] Legacy blocks/flows code removed
- [ ] No dead code
- [ ] No console.log statements
- [ ] No TODO comments left unaddressed

---

## 8. Success Criteria

The implementation is complete when:

### User Can:
1. ✅ Describe a task in natural language and get a working BaleyBot
2. ✅ See their BaleyBots on the home page
3. ✅ Create a new BB through the 4-step wizard
4. ✅ View BB details with Overview, Activity, Analytics, Configuration tabs
5. ✅ Watch real-time execution with rich streaming display
6. ✅ Approve tool usage and teach the system patterns
7. ✅ Receive and act on AI suggestions for improvement
8. ✅ Have BBs call other BBs via spawn_baleybot

### Technical:
1. ✅ BAL is the source of truth (no blocks/flows tables used)
2. ✅ Pipeline.from() is the only execution engine
3. ✅ StreamSegments are the only streaming format
4. ✅ Legacy code is removed
5. ✅ All tests pass
6. ✅ No TypeScript errors

### Quality:
1. ✅ Code review checklist 100% complete
2. ✅ Accessibility audit passed
3. ✅ Performance benchmarks met
4. ✅ Error handling comprehensive

---

## Appendix A: File Structure After Implementation

```
apps/web/src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                    # Home: My BaleyBots
│   │   ├── layout.tsx                  # 3-item navigation
│   │   ├── activity/
│   │   │   └── page.tsx                # Global activity feed
│   │   ├── baleybots/
│   │   │   ├── new/
│   │   │   │   └── page.tsx            # Create wizard
│   │   │   └── [id]/
│   │   │       └── page.tsx            # BB detail
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── connections/
│   │       ├── policies/
│   │       ├── approvals/
│   │       └── ...
├── components/
│   ├── baleybots/
│   │   ├── BaleybotCard.tsx
│   │   ├── BaleybotRelationshipGraph.tsx
│   │   ├── BalCodeViewer.tsx
│   │   ├── SuggestionsPanel.tsx
│   │   ├── create/
│   │   │   ├── CreateBaleybotWizard.tsx
│   │   │   ├── DescribeStep.tsx
│   │   │   ├── ReviewPlanStep.tsx
│   │   │   ├── ConnectStep.tsx
│   │   │   ├── ActivateStep.tsx
│   │   │   └── connections/
│   │   └── detail/
│   │       ├── BaleybotDetailPage.tsx
│   │       ├── OverviewTab.tsx
│   │       ├── ActivityTab.tsx
│   │       ├── AnalyticsTab.tsx
│   │       ├── ConfigurationTab.tsx
│   │       └── PipelineStructureVisualization.tsx
│   ├── streaming/
│   │   ├── SegmentRenderer.tsx
│   │   └── segments/
│   │       ├── TextSegment.tsx
│   │       ├── ToolCallSegment.tsx
│   │       ├── ReasoningSegment.tsx
│   │       ├── SpawnAgentSegment.tsx
│   │       ├── ErrorSegment.tsx
│   │       └── StructuredOutputSegment.tsx
│   ├── approvals/
│   │   ├── ApprovalPrompt.tsx
│   │   └── ApproveAndRememberDialog.tsx
│   └── ui/
│       └── ... (existing primitives)
├── lib/
│   ├── baleybot/
│   │   ├── generator.ts
│   │   ├── executor.ts
│   │   ├── reviewer.ts
│   │   ├── tool-catalog.ts
│   │   ├── approval-checker.ts
│   │   └── pattern-learner.ts
│   └── trpc/
│       └── routers/
│           ├── baleybots.ts
│           ├── policies.ts
│           └── ... (others)
└── ...

packages/db/src/
├── schema.ts                           # Includes new tables
└── ...
```

---

## Appendix B: Key Dependencies

Ensure these are installed/updated:

```json
{
  "@baleybots/core": "link:../../../baleybots/typescript/packages/core",
  "@baleybots/tools": "link:../../../baleybots/typescript/packages/tools",
  "@baleybots/react": "link:../../../baleybots/typescript/packages/react",
  "@baleybots/chat": "link:../../../baleybots/typescript/packages/chat"
}
```

Before starting, rebuild BaleyBots:
```bash
cd /Users/jamesmcarthur/Documents/GitHub/baleybots/typescript
bun install && bun run build
```

---

*Plan finalized February 2, 2026*
