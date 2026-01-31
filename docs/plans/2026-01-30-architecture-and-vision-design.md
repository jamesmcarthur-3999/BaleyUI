# BaleyUI Architecture and Vision Design

**Date:** January 30, 2026
**Status:** Validated through brainstorming session
**Author:** James McArthur + Claude

---

## Executive Summary

This document captures the foundational architecture and design vision for BaleyUI. It establishes the core principles that will guide all implementation decisions, from data infrastructure to UI design.

**The Core Thesis:** BaleyUI makes AI adoption frictionless for SMBs. It's not a chatbot builder—it's the "easy button" for implementing AI across an organization's stack.

---

## Table of Contents

1. [Target Customer](#1-target-customer)
2. [Jobs to Be Done](#2-jobs-to-be-done)
3. [Architecture Decisions](#3-architecture-decisions)
4. [UI Philosophy](#4-ui-philosophy)
5. [Core Interfaces](#5-core-interfaces)
6. [The AI Companion](#6-the-ai-companion)
7. [Onboarding Experience](#7-onboarding-experience)
8. [Multi-Tier UI Strategy](#8-multi-tier-ui-strategy)
9. [Implementation Priorities](#9-implementation-priorities)

---

## 1. Target Customer

### Primary ICP

**SMBs adopting AI** — Solopreneurs to mid-sized organizations (up to 1,000 employees) who want to implement AI across their stack rapidly without heavy engineering investment.

### Example Customer: ReliaQuest

A company with multiple teams who need AI for different purposes:

| Team | Need | Technical Level |
|------|------|-----------------|
| Marketing Ops | AI agents to analyze website activity, generate conversion reports | Low technical skill |
| Data Analytics | Real-time AI support agents, DB integration, proactive customer engagement | Technical, but not AI experts |

**Key Insight:** Same organization, same data layer, but different UI needs based on role and technical comfort.

### What They're NOT

- AI/ML experts building custom models
- Enterprises with dedicated AI teams
- Developers who want to write everything from scratch

### What They ARE

- Teams being told to "figure out AI" by leadership
- People with ideas for how AI could help, but no path to implement
- Technical enough to connect systems, not technical enough to build from scratch

---

## 2. Jobs to Be Done

### Primary Jobs by Persona

#### GTM User (Marketing, Sales, RevOps)

| Priority | Job | What It Means |
|----------|-----|---------------|
| **Primary** | "Help me understand what's happening" | AI analyzes data and surfaces insights I wouldn't find myself |
| **Primary** | "Help me prototype AI ideas fast" | Test AI ideas quickly without waiting for engineering |
| Secondary | "Automate a response" | When X happens, do Y automatically |
| Edge case | "Build something that talks to customers" | Chat, email, proactive agents |

**Note on chatbots:** We support chat/automation because it's easy, but it's not the differentiator. Chatbot builders are commoditized. We're not competing there.

#### Technical User (Data, Analytics, Engineering-adjacent)

| Priority | Job | What It Means |
|----------|-----|---------------|
| **Primary** | "Connect AI to our systems without writing glue code" | Plug into DB, APIs, tools easily. MCP creation without heavy coding. |
| Secondary | "Give me a control plane for AI agents" | Observability, decision tracking, tuning |
| Secondary | "Go from prototype to production" | Harden what GTM built, add guardrails |

### The Common Thread

**Friction removal.** Both personas need to adopt AI without massive effort. BaleyUI is the bridge between "we should use AI" and "AI is working for us."

---

## 3. Architecture Decisions

### 3.1 Data-Contract-First

**Decision:** The API is the product. UIs are consumers.

**Why:** Enables multiple UI tiers (GTM simple, Technical advanced) on the same data. Enables future clients (mobile, CLI, third-party integrations). Allows subscription-gated feature unlocks without data migration.

### 3.2 Full Event-Sourcing

**Decision:** Every change is an immutable event. State is derived from replaying events.

**Why:**
- "Watch AI build" is native — AI actions emit events, UI updates in real-time
- Universal undo/redo — Replay events to any point
- Complete audit trail — Every change logged, queryable
- Time-travel — Reconstruct state at any historical moment
- BaleyBots alignment — Execution already streams events; extend pattern to building

**Architecture Diagram:**

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENTS                                │
│  (GTM UI)        (Technical UI)        (SDK)        (AI)    │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│    COMMANDS     │         │     EVENTS      │
│    (tRPC)       │         │   (Subscribe)   │
│                 │         │                 │
│ blocks.create() │         │ BlockCreated    │
│ flows.update()  │         │ FlowUpdated     │
│ agents.run()    │         │ AgentExecuted   │
└────────┬────────┘         └────────▲────────┘
         │                           │
         ▼                           │
┌─────────────────────────────────────────────────────────────┐
│                       SERVER                                │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │    tRPC      │───▶│    Event     │───▶│    Event     │  │
│  │   Routers    │    │   Emitter    │    │    Store     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                       │           │
│         ▼                                       ▼           │
│  ┌──────────────┐                       ┌──────────────┐   │
│  │   Database   │                       │ Subscribers  │   │
│  │   (state)    │                       │  (all UIs)   │   │
│  └──────────────┘                       └──────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Event Types (Builder Domain):**

```typescript
type BuilderEvent =
  | { type: 'BlockCreated'; blockId: string; name: string; actor: ActorType; timestamp: Date }
  | { type: 'BlockUpdated'; blockId: string; changes: Partial<Block>; actor: ActorType; timestamp: Date }
  | { type: 'BlockDeleted'; blockId: string; actor: ActorType; timestamp: Date }
  | { type: 'FlowCreated'; flowId: string; name: string; actor: ActorType; timestamp: Date }
  | { type: 'FlowNodeAdded'; flowId: string; nodeId: string; nodeType: string; actor: ActorType; timestamp: Date }
  | { type: 'FlowEdgeAdded'; flowId: string; edgeId: string; source: string; target: string; actor: ActorType; timestamp: Date }
  | { type: 'ConnectionConfigured'; connectionId: string; provider: string; actor: ActorType; timestamp: Date }
  // ... etc

type ActorType =
  | { type: 'user'; userId: string }
  | { type: 'ai-agent'; agentId: string; agentName: string }
  | { type: 'system'; reason: string }
```

**What This Enables:**

| Capability | How |
|------------|-----|
| Watch AI build in real-time | AI commands → events → UI subscribes and updates |
| Undo any action | Store inverse events or replay to previous state |
| "Who changed this?" | Every event has actor attribution |
| Time-travel debugging | Replay events to any timestamp |
| Multiple UI tiers | All subscribe to same events, render differently |
| Offline/sync | Events can be queued and replayed |

### 3.3 Dual-Path Interaction

**Decision:** Every job can be done via AI-guided or manual path.

**Why:** AI chat fatigue is real. Users get frustrated when AI doesn't get it right and they can't just fix it themselves. Both paths must be first-class.

```
┌─────────────────────────────────────────────────────────────┐
│                     DUAL-PATH MODEL                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PATH A: AI-Driven                PATH B: Manual            │
│  ─────────────────                ──────────────            │
│                                                             │
│  "Build me a conversion          Click "New Agent"         │
│   analyzer"                      Fill in goal, tools       │
│       │                          Configure output          │
│       ▼                              │                      │
│  AI builds in real-time              │                      │
│  User watches UI update              │                      │
│  User can intervene anytime          │                      │
│       │                              │                      │
│       └──────────┬───────────────────┘                      │
│                  ▼                                          │
│           Same result                                       │
│           Same data model                                   │
│           Same events emitted                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** The AI manipulates the same UI elements a user would. When AI builds, users see real UI components appearing—not chat messages describing what happened.

---

## 4. UI Philosophy

### Core Principle: Invisible UI

> "The best button is one that isn't there."

The UI should disappear. Users focus on their work, not the tool.

**What This Means:**

| Do | Don't |
|----|-------|
| Direct manipulation | Wizards that force steps |
| Contextual controls | Toolbars with every option |
| Keyboard-first | Mouse-required |
| Content fills the screen | Chrome fills the screen |
| AI appears when useful | AI is a modal you must dismiss |

### Design Characteristics

- **Utilitarian, not decorative** — Every element earns its place
- **Content-first** — The output (reports, dashboards, agents) is the hero
- **Calm** — No notifications fighting for attention
- **Fast** — Instant response, no loading spinners for common actions
- **Consistent** — Same patterns everywhere, learn once

### Job-Oriented Navigation

Users don't come to "use BaleyUI." They come to do jobs:

- Experiment with an AI idea
- Analyze what's happening in their data
- Build a flow that connects systems
- Implement AI across their stack

Navigation should reflect jobs, not features.

---

## 5. Core Interfaces

### 5.1 Two Primary Surfaces

```
┌─────────────────────────────────────────────────────────────┐
│                    USER'S EXPERIENCE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  BUILDER                             │   │
│  │                  (Backstage)                         │   │
│  │                                                      │   │
│  │  Where you construct agents, flows, connections      │   │
│  │  Configure the infrastructure                        │   │
│  │  Technical users spend more time here                │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  OUTPUT                              │   │
│  │                  (The Show)                          │   │
│  │                                                      │   │
│  │  The artifacts agents produce                        │   │
│  │  Reports, dashboards, heatmaps, widgets              │   │
│  │  GTM users spend more time here                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Builder Interface: Hybrid Views

**Decision:** Different views for different complexities. Not one-size-fits-all.

#### View 1: Agent Profile (Default for Single Agents)

For a single AI agent, don't show a flow. Show a character sheet:

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 Conversion Analyzer                              [Run]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GOAL                                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Analyze user sessions and identify conversion       │   │
│  │ opportunities. Focus on drop-off points and         │   │
│  │ high-value user behaviors.                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  TOOLS                                              [Edit]  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ▢ query_sessions      Query analytics database      │   │
│  │ ▢ generate_heatmap    Create activity heatmap       │   │
│  │ ▢ calculate_dropoff   Compute funnel metrics        │   │
│  │ ▢ write_report        Generate markdown report      │   │
│  │                                        [+ Add Tool] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  CONSTRAINTS                                        [Edit]  │
│  • Max 1000 sessions per analysis                          │
│  • Don't access PII fields                                 │
│  • Complete within 60 seconds                              │
│                                                             │
│  OUTPUT SCHEMA                                      [Edit]  │
│  → ConversionReport { insights, recommendations, data }    │
│                                                             │
│  MODEL                                                      │
│  claude-3-5-sonnet ▼                    [Test] [Compare]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why:** Single agents don't need flow diagrams. They have a goal and tools—the AI figures out how to use them. A flow would misrepresent the non-deterministic nature of AI.

#### View 2: Flow Canvas (For Compositions)

When orchestrating multiple agents or explicit control flow:

```
┌─────────────────────────────────────────────────────────────┐
│  Conversion Analysis Pipeline                    [Run Flow] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌──────────────┐     ┌──────────────┐                   │
│    │   Session    │────▶│   Pattern    │──┐                │
│    │   Collector  │     │   Analyzer   │  │                │
│    │   (agent)    │     │   (agent)    │  │                │
│    └──────────────┘     └──────────────┘  │                │
│                                           │                 │
│                              ┌────────────┘                 │
│                              ▼                              │
│                        ┌──────────────┐                     │
│                        │    Report    │                     │
│                        │   Generator  │                     │
│                        │   (agent)    │                     │
│                        └──────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why:** Compositions have explicit structure—pipeline, routing, parallel execution. A visual representation is accurate and helpful here.

#### View 3: Behavior Timeline (Observability)

Show what happened during execution:

```
┌─────────────────────────────────────────────────────────────┐
│  Last Run: 2 hours ago                          [Replay]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ● Started                                           0.0s   │
│  │                                                          │
│  ├─ 🔧 query_sessions({ days: 7 })                  1.2s   │
│  │   └─ Retrieved 847 sessions                             │
│  │                                                          │
│  ├─ 🧠 Analyzing patterns...                         3.4s   │
│  │   └─ "High drop-off detected on /pricing"               │
│  │                                                          │
│  ├─ 🔧 generate_heatmap({ page: '/pricing' })       2.1s   │
│  │   └─ Artifact: heatmap-pricing-001.png                  │
│  │                                                          │
│  ├─ 🔧 calculate_dropoff({ funnel: 'checkout' })    1.8s   │
│  │   └─ Drop-off rate: 67% at step 3                       │
│  │                                                          │
│  ├─ 🔧 write_report()                                4.2s   │
│  │   └─ Generated: conversion-report-2026-01-30.md         │
│  │                                                          │
│  ● Complete                                         12.7s   │
│                                                             │
│  Tokens: 2,847 in / 1,203 out    Cost: $0.023              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why:** Shows actual behavior, not prescriptive structure. Users learn what their agents do by watching them work. Essential for debugging and trust-building.

#### View Switching

Users can switch between views freely:

| View | When to Use |
|------|-------------|
| Profile | Configuring a single agent |
| Flow | Building multi-agent compositions |
| Timeline | Understanding behavior, debugging |

Default view is determined by complexity:
- Single agent → Profile
- Composition → Flow
- After execution → Timeline

### 5.3 Output Interface

**Decision:** Hybrid template + AI-generated approach.

```
┌─────────────────────────────────────────────────────────────┐
│                     OUTPUT SYSTEM                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              TEMPLATE LIBRARY                        │   │
│  │                                                      │   │
│  │  Pre-built layouts for common outputs:               │   │
│  │  • Report (text + charts + recommendations)         │   │
│  │  • Dashboard (live metrics + alerts)                │   │
│  │  • Heatmap (visual overlay)                         │   │
│  │  • Data Table (drill-down capable)                  │   │
│  │  • Chat Interface (embedded widget)                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              AI GENERATION                           │   │
│  │                                                      │   │
│  │  When templates don't fit, AI generates:            │   │
│  │  • Custom layouts                                   │   │
│  │  • Novel visualizations                             │   │
│  │  • Composite views                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              COMPONENT KIT                           │   │
│  │                                                      │   │
│  │  Building blocks for fine-tuning:                   │   │
│  │  • Charts (line, bar, pie, funnel)                  │   │
│  │  • Tables (sortable, filterable)                    │   │
│  │  • Cards (stat, insight, action)                    │   │
│  │  • Text blocks (markdown, rich text)                │   │
│  │  • Interactive widgets (drilldown, filter)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**AI Output Tools:**

The AI has tools to generate output artifacts:

| Tool Category | Capabilities |
|---------------|--------------|
| **Content** | Reports, summaries, insights, recommendations |
| **Visualizations** | Charts, heatmaps, graphs, timelines, funnels |
| **Files** | PDFs, CSVs, exports, shareable links |
| **Interactive** | Drilldowns, filters, live data views |
| **Embeddables** | Components for user's own apps |

**User Interaction with Outputs:**

Users can request modifications via multiple modes:
- **Cmd+K** — Quick command: "Add a chart showing mobile vs desktop"
- **Inline** — Click section, type change: "Make this a bar chart instead"
- **AI Companion** — Conversational: "Can you break this down by region?"

---

## 6. The AI Companion

### Not a Chatbox — A Presence

**Decision:** The AI assistant is ambient, transformable, and never in the way.

```
┌─────────────────────────────────────────────────────────────┐
│                   AI COMPANION MODES                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  MODE 1: Floating Panel                                     │
│  ┌─────────────────┐                                       │
│  │ 🤖 Assistant    │  • Drag anywhere on screen            │
│  │                 │  • Resize as needed                   │
│  │ How can I help? │  • Snap to edges                      │
│  │                 │  • Full conversation view             │
│  │ [───────────]   │                                       │
│  └─────────────────┘                                       │
│                                                             │
│  MODE 2: Minimized Orb                                      │
│       ◉            • Small, ambient presence               │
│                    • Glows when AI has suggestions          │
│                    • Expands on hover/click                │
│                    • Stays out of the way                  │
│                                                             │
│  MODE 3: Voice Mode                                         │
│       ◉            • Just the orb, listening               │
│      ~~~           • Speaks responses                      │
│                    • Uses BaleyBots Live APIs              │
│                    • Hands-free operation                  │
│                                                             │
│  MODE 4: Full Takeover                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │  Building your conversion analyzer...               │   │
│  │                                                      │   │
│  │  [████████████░░░░░░░░]  Creating tools...          │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                    • Expands when doing complex work       │
│                    • Shows what AI is building             │
│                    • User can intervene anytime            │
│                                                             │
│  MODE 5: Dismissed                                          │
│       (nothing)    • Completely hidden                     │
│                    • Cmd+K to summon                       │
│                    • User in full control                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Interaction Methods

| Method | When to Use | Experience |
|--------|-------------|------------|
| **Cmd+K** | Know what you want | Type command, AI executes |
| **Inline prompt** | Specific element | Click, type, modify that element |
| **Chat panel** | Exploration, multi-turn | Conversational, AI companion |
| **Voice** | Hands busy, accessibility | Speak, listen, hands-free |

### Ambient Intelligence

The AI companion can proactively offer help without interrupting:

- Orb glows subtly when it notices something
- Hover to see suggestion, ignore to dismiss
- Never blocks workflow
- Never modal unless user initiated

---

## 7. Onboarding Experience

### AI-Powered, Adaptive Onboarding

**Decision:** Onboarding IS a BaleyBot. Dogfooding from moment one.

```
┌─────────────────────────────────────────────────────────────┐
│                  ONBOARDING AGENT                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GOAL                                                       │
│  Guide new users to their first successful AI               │
│  implementation. Adapt to their technical level,            │
│  available integrations, and immediate goals.               │
│                                                             │
│  TOOLS                                                      │
│  • assess_technical_level    Gauge user's comfort          │
│  • list_integrations         What can they connect?        │
│  • test_connection           Verify DB/API access          │
│  • introspect_schema         Analyze database structure    │
│  • scaffold_agent            Create starter agent          │
│  • create_team_task          Assign work to teammates      │
│  • explain_concept           Contextual education          │
│                                                             │
│  BEHAVIORS                                                  │
│  • Adapts to user's stated goal                            │
│  • Adjusts complexity based on responses                   │
│  • Creates tasks for team when user is blocked             │
│  • Offers playground if no integrations ready              │
│  • Celebrates first successful run                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Onboarding Paths

```
User arrives
     │
     ▼
"What do you want to accomplish?"
     │
     ├─────────────────────────────────────────┐
     │                                         │
     ▼                                         ▼
"Connect to my data"                    "Just explore"
     │                                         │
     ▼                                         ▼
Guide through connection              Playground with
DB introspection                      sample data
Schema analysis                       Pre-built examples
Suggest first agent                   Interactive tutorial
     │                                         │
     └─────────────────┬───────────────────────┘
                       ▼
              First successful run
                       │
                       ▼
              "What's next?" options
```

### Task Creation for Blockers

When the user can't complete a step (e.g., needs API access they don't have):

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 I see you need API credentials for Stripe.             │
│                                                             │
│  Would you like me to create a task for your team?         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Task: Provide Stripe API credentials for BaleyUI    │   │
│  │ Assignee: [Select team member ▼]                    │   │
│  │ Context: Setting up payment analytics agent         │   │
│  │                                                      │   │
│  │ [Create Task]  [I'll handle it myself]              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  In the meantime, want to try with sample data?            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Technical Users: Direct Path

Technical users can skip the guided experience:

- "Skip tour" always available
- Direct access to connections, agents, flows
- Documentation and API reference accessible
- AI companion available but not required

---

## 8. Multi-Tier UI Strategy

### Subscription-Gated UI Tiers

**Decision:** Same data layer, different UI complexity based on subscription.

```
┌─────────────────────────────────────────────────────────────┐
│                    UI TIER STRATEGY                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TIER 1: GTM (Starter/Growth)                               │
│  ─────────────────────────────                              │
│  • Simplified agent builder                                │
│  • Template-based outputs                                   │
│  • Guided workflows                                         │
│  • Basic analytics                                          │
│  • Core integrations                                        │
│                                                             │
│  TIER 2: Technical (Pro)                                    │
│  ────────────────────────                                   │
│  • Full agent profile editor                               │
│  • Flow composition canvas                                  │
│  • Custom output layouts                                    │
│  • Advanced analytics                                       │
│  • All integrations + MCP builder                          │
│  • API access                                               │
│                                                             │
│  TIER 3: Enterprise                                         │
│  ──────────────────                                         │
│  • Everything in Pro                                        │
│  • Team workspaces                                          │
│  • Role-based access control                                │
│  • Audit logs                                               │
│  • SSO integration                                          │
│  • Custom deployment options                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Upgrade = Unlock, Not Migrate

Because of event-sourcing and data-contract-first architecture:

- Upgrading unlocks new UI capabilities
- No data migration required
- Historical events accessible to new views
- Downgrading hides but doesn't delete

---

## 9. Implementation Priorities

### Immediate: Fix Type Safety

Before any new architecture work, fix the critical type safety issues identified in the audit:

1. Fix `CompiledNode` type mismatch
2. Replace `any` types in critical paths
3. Add stricter ESLint rules

### Phase 1: Event Infrastructure

Build the event-sourcing foundation:

1. Define event schema for builder domain
2. Implement event store (append-only log)
3. Add event emission to existing tRPC routers
4. Build subscription system for clients
5. Update UI to consume events for real-time updates

### Phase 2: Builder Views

Implement the hybrid view system:

1. Agent Profile view (single agent configuration)
2. Enhance existing Flow Canvas (for compositions)
3. Behavior Timeline view (execution observability)
4. View switching logic

### Phase 3: Output System

Build the output generation infrastructure:

1. Template library (Report, Dashboard, Heatmap, Table)
2. Component kit (charts, cards, text blocks)
3. AI output tools (generate content, visualizations, files)
4. Output modification interface (Cmd+K, inline, chat)

### Phase 4: AI Companion

Implement the ambient AI interface:

1. Floating, draggable panel
2. Minimize to orb
3. Cmd+K command palette
4. Inline prompts
5. Voice mode (BaleyBots Live integration)

### Phase 5: Onboarding

Build the onboarding BaleyBot:

1. Onboarding agent with adaptive tools
2. Playground environment with sample data
3. Task creation system for team blockers
4. First-run celebration and next-steps

---

## Appendix A: Key Principles Summary

| Principle | Implication |
|-----------|-------------|
| Data-contract-first | API is the product, UIs are consumers |
| Full event-sourcing | Every change is an event, enables time-travel |
| Dual-path interaction | AI-driven and manual paths to every outcome |
| Invisible UI | Best button is one that isn't there |
| Content-first | Outputs are the hero, not the tool |
| Job-oriented | Navigation reflects jobs, not features |
| Ambient AI | Present when needed, invisible when not |
| Dogfooding | BaleyUI is powered by BaleyBots |

---

## Appendix B: Open Questions

1. **Event store implementation** — Use existing PostgreSQL? Dedicated event store (EventStoreDB)? Hybrid?

2. **Voice mode technology** — BaleyBots Live API readiness? WebRTC requirements?

3. **Playground data** — What sample datasets ship by default? Industry-specific?

4. **MCP builder UX** — How do we make MCP creation accessible to "technical but not developer" users?

5. **Component kit scope** — Build custom? Use existing charting library? What's the minimum viable set?

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Agent** | A single BaleyBot with goal, tools, and output schema |
| **Flow** | A composition of multiple agents/functions with explicit structure |
| **Output** | The artifact an agent produces (report, dashboard, etc.) |
| **Event** | An immutable record of something that happened |
| **Builder** | The interface for constructing agents and flows |
| **GTM User** | Non-technical user (marketing, sales, revops) |
| **Technical User** | Data/analytics team member, not necessarily a developer |
| **AI Companion** | The ambient AI assistant interface |
| **Job** | A task the user is trying to accomplish |

---

*Document generated from brainstorming session on January 30, 2026.*
