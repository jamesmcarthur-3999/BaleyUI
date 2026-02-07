# BaleyBot Creation Lifecycle Redesign

> **Date:** 2026-02-06
> **Status:** Design — In Progress (brainstorming session)
> **Goal:** Transform BB creation from "generate BAL and done" into a full lifecycle that guides users from idea through to production use
> **Principle:** A BaleyBot isn't done until it's live — connected to real data, tested against real scenarios, and being monitored.

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The Lifecycle Model](#2-the-lifecycle-model)
3. [The Adaptive Right Panel](#3-the-adaptive-right-panel)
4. [Guided Phase Intelligence](#4-guided-phase-intelligence)
5. [Internal BB Orchestration Model](#5-internal-bb-orchestration-model)
6. [The Hub Topology](#6-the-hub-topology)
7. [Connections + Tools Panel](#7-connections--tools-panel)
8. [In-Context Everything](#8-in-context-everything)
9. [Consultative Intelligence](#9-consultative-intelligence)
10. [Testing Panel](#10-testing-panel)
11. [Rich Chat Interaction Components](#11-rich-chat-interaction-components)
12. [Internal BB Reasoning Model](#12-internal-bb-reasoning-model)
13. [Activation](#13-activation)
14. [Monitoring](#14-monitoring)
15. [Implementation Phases](#15-implementation-phases)

---

## 1. The Problem

### Current State

The BB creation flow currently treats "done" as "BAL code generated." The creator bot produces entities, connections, and BAL code, then the user sees it in the visual editor and code editor. There's a basic run/test button (ActionBar) that accepts text or JSON input and shows output.

**What's missing:**

- **No lifecycle awareness.** The system doesn't know or care whether the bot has connections configured, has been tested, or has triggers set up. It generates code and stops.
- **Testing is generic.** The ActionBar shows a text input and a run button regardless of whether the bot is a chat agent, a data processor, or a multi-bot chain. There's no guidance on *what* to test or *how* to know it's working.
- **Connections are disconnected.** The user has to navigate away to settings to configure API keys, database connections, etc. There's no integration between what the bot *needs* and what's *available*.
- **No production path.** There's no concept of "launching" a bot — setting up triggers, webhooks, monitoring. The bot just exists in a draft state.
- **Tools are static.** If a bot needs something that isn't a built-in tool, the user is stuck. There's no way to create custom tools during the creation process.
- **Multi-bot flows are opaque.** BB clusters with chains, parallel execution, and hub patterns exist in BAL but the creation and testing experience doesn't account for them.

### Target State

A BB setup isn't done until it's in-use in production. The creation experience guides users through the full lifecycle: design, connect, test, activate, and monitor. The UI adapts to each phase. The creator bot acts as a consultative advisor — not just a code generator — understanding the user's job-to-be-done and helping them achieve it through whatever path makes sense.

---

## 2. The Lifecycle Model

### Readiness State Machine

The core concept is a **Readiness State Machine** that tracks what a BaleyBot needs before it's production-ready. This isn't a rigid wizard — it's a living checklist that the UI adapts around.

**Five readiness dimensions** (not sequential, not all required for every bot):

| Dimension | What it means | How it's checked |
|-----------|--------------|-----------------|
| **Designed** | BAL code exists, entities defined, valid syntax | Auto-detected from canvas state |
| **Connected** | Required tools have their dependencies met (API keys, data sources) | Scan BAL for tools, check if connections exist |
| **Tested** | At least one successful test run with relevant scenarios | Track test executions per bot |
| **Activated** | Triggers configured (if applicable) — or explicitly marked as manual-only | Check trigger config exists OR user opted out |
| **Monitored** | At least one alert or monitoring rule set (optional but recommended) | Check if alert conditions exist |

Each dimension has three states: **incomplete** (gray), **in-progress** (amber), **complete** (green).

### Adaptive Applicability

Not all dimensions apply to every bot. The system auto-detects which are relevant:

- A simple chat bot doesn't need "Activated" (no triggers)
- A webhook processor definitely needs "Activated" but testing means something different
- A scheduled bot needs "Activated" with a cron trigger
- A multi-bot chain needs all entities tested individually AND end-to-end

The creator bot analyzes the BAL and determines which dimensions are relevant. The checklist adapts — irrelevant dimensions are hidden or marked as "not applicable."

### Key Design Decisions

- **Flexible ordering:** Users can tackle dimensions in any order. The creator bot suggests what to do next, but doesn't enforce sequence.
- **Auto-detection:** The system detects completion automatically where possible. Users don't manually check boxes.
- **Conversation continuity:** The full conversation history is maintained across all phases. No context loss when switching between dimensions.
- **Fluid phase movement:** The creator bot can move the UI back to any phase if needed. Discovering a connection issue during testing? The bot can surface the Connections panel automatically.

---

## 3. The Adaptive Right Panel

### Tab Bar Transformation

The current static tab bar (`Visual | Code | Schema | Triggers | Analytics`) becomes **context-aware** — it shows what's relevant based on readiness state and what the user is actively working on.

The tab bar always shows a compact **readiness indicator** at the right edge (5 small dots/pills showing dimension status). The tabs themselves shift based on what matters now.

### Phase Progression

**During Design phase** (no BAL yet, or actively editing):
```
[ Visual | Code | Schema ]                    * o o o o
```
These are the creation tools. Readiness dots show progress.

**After first successful generation** (BAL exists, entities defined):
```
[ Visual | Code | Connections | Test ]        * o o o o
```
Schema and Triggers get tucked into overflow. **Connections** and **Test** surface because they're the next meaningful actions. "Designed" readiness dot turns green.

**When connections are wired and tests pass:**
```
[ Visual | Code | Test | Triggers | Monitor ] * * * o o
```
Full set. Triggers and Monitor appear because the bot is close to production-ready.

**When everything is green:**
```
[ Visual | Code | Test | Triggers | Monitor ] * * * * *
                                               "Ready to launch"
```

### Navigation Rules

- Tabs **never disappear** once shown — they only get added. No disorientation.
- The user can always access any tab via the creator chat ("show me the connections panel").
- Readiness dots are **clickable** — tapping one jumps to the relevant tab and the creator bot explains what's needed.
- Tabs can be accessed in any order — the suggested progression is just that, a suggestion.

---

## 4. Guided Phase Intelligence

### Conversation-First, Not Form-First

Every phase starts with a conversation, not a form. When a user lands on a new tab for the first time, they don't see a blank configuration panel. They see the creator bot (or a specialist BB) asking the right questions in the chat, with the right panel showing contextual UI that updates as the conversation progresses.

### Example: Connections Tab First Visit

The user created a weather bot that uses `web_search` and `fetch_url`. They click the Connections tab:

```
Creator: "Your bot needs web search and URL fetching. Both of these
         work out of the box — no API key needed.

         But I notice your bot also returns structured data. How do
         you want to use it?"

         [On my website]  [In another app via API]
         [Just manually for now]  [Triggered by a schedule]
```

User picks "On my website":

```
Creator: "Great — for website integration you'll need a webhook
         endpoint. I can set that up.

         What platform is your site on?"

         [React/Next.js]  [WordPress]  [Webflow]  [Other]  [Not sure]
```

If they say "Not sure," the bot doesn't dead-end. It explains the options, gives a recommendation, and offers to generate embed code for the simplest path.

### How Context Drives Guidance

The creator bot carries the **full conversation context** — it knows what the bot does, what tools it uses, what the user's goal is. Questions are never generic. They're specific to this bot and this user's situation.

For technical phases, the creator bot **spawns specialist internal BBs** behind the scenes:

- User's bot needs a Postgres connection -> creator hands off to `nl_to_sql_postgres` to help write query patterns
- User wants to test a multi-bot chain -> creator spawns `execution_reviewer` to analyze the flow and suggest test scenarios
- User wants to embed on their site -> creator generates the integration code itself

### Panel as Mirror

The right panel updates in real-time as the conversation progresses. If the user is setting up a database connection:

```
+-------------------------------------------+
|  Connections                              |
|                                           |
|  Y Web Search        Built-in             |
|  Y URL Fetch         Built-in             |
|  ~ PostgreSQL        Configuring...       |
|    +-------------------------------+      |
|    | Host: [____________]          |      |
|    | Port: [5432________]          |      |
|    | Database: [________]          |      |
|    |                               |      |
|    | [Test Connection]             |      |
|    +-------------------------------+      |
|  o Webhook           Not configured       |
|                                           |
+-------------------------------------------+
```

The user doesn't have to fill this form manually. The chat drives it — when they paste a connection string, the form auto-fills.

**The panel is the mirror.** It reflects what the conversation has accomplished. Power users can edit the panel directly. Guided users stay in chat. Both paths converge on the same result.

---

## 5. Internal BB Orchestration Model

### Current Internal BBs

| Bot | Current Role |
|-----|-------------|
| `creator_bot` | Generates BAL from descriptions |
| `bal_generator` | Converts descriptions to BAL code |
| `pattern_learner` | Analyzes approvals, suggests patterns |
| `execution_reviewer` | Reviews executions, suggests improvements |
| `nl_to_sql_postgres` | Translates NL to PostgreSQL |
| `nl_to_sql_mysql` | Translates NL to MySQL |
| `web_search_fallback` | AI fallback when no Tavily key |

**The problem:** They don't talk to each other. The creator bot generates BAL and walks away. Nobody checks if connections work, generates tests, or helps with deployment.

### The Redesign: Creator as Session Orchestrator

The `creator_bot` becomes a **session orchestrator**. It doesn't do everything itself — it maintains the conversation, tracks readiness state, and knows when to bring in specialists. Think of it as a project manager that delegates to experts but keeps the thread coherent.

### New Internal BBs Needed

| Bot | Role | When Invoked |
|-----|------|-------------|
| `connection_advisor` | Analyzes what connections a bot needs, helps configure them, tests them | Connections phase |
| `test_generator` | Analyzes BAL + entity goals + connections to generate context-aware test scenarios | Testing phase |
| `deployment_advisor` | Generates webhook configs, embed code, API docs, cron expressions | Activation phase |
| `integration_builder` | Creates ephemeral tools on the fly when a bot needs something custom | Any phase — when built-in tools aren't enough |

### Session Context Bundle

Every internal BB invocation gets a shared context bundle so there's no cold-start:

```typescript
interface SessionContext {
  // Full conversation history — no context loss
  conversationHistory: CreatorMessage[];
  // Current BAL code and parsed entities
  balCode: string;
  entities: VisualEntity[];
  // Readiness state — what's done, what's pending
  readiness: ReadinessState;
  // Active connections and their status
  connections: ConnectionStatus[];
  // Test results so far
  testResults: TestExecution[];
  // What the user's goal is (extracted from initial prompt)
  userGoal: string;
}
```

When `test_generator` is invoked, it doesn't start cold. It knows: "This is a 2-entity chain that monitors Postgres orders and sends Slack notifications. The Postgres connection is live with tables [orders, customers, products]. The user wants morning summaries." It generates tests that make sense for *this* bot.

### Example Flow

```
User: "Create a bot that monitors our Postgres database for new
       orders and sends a Slack summary every morning"

creator_bot: [analyzes intent]
  -> Needs: schedule trigger, postgres connection, notification tool
  -> Generates BAL with 2 entities: order_monitor + summary_sender
  -> Chain composition
  -> Readiness: Designed Y, Connected X, Tested X, Activated X

creator_bot: "I've created Order Monitor with 2 entities..."
  -> [entity cards render, visual editor updates]

creator_bot: "This bot needs a few things before it's live:
  a Postgres connection for your orders database, and a way to
  send notifications. Let's set those up."
  -> [Connections tab surfaces in tab bar]

User: clicks Connections tab

creator_bot: "What's your Postgres connection info?"

User: pastes connection string

creator_bot: [parses, fills form, tests connection]
  -> Spawns nl_to_sql_postgres: "Generate a query to fetch new
     orders since last check"
  -> nl_to_sql_postgres returns the query
  -> creator_bot updates the BAL with the query pattern

creator_bot: "Connected! I can see your orders table. I've
  configured the monitor to check for new orders using
  created_at. Let's test it."
  -> [Test tab surfaces, Connections shows Y]
```

The user never saw a handoff to `nl_to_sql_postgres`. The conversation was seamless.

---

## 6. The Hub Topology

### Beyond Linear Flows

Current BAL compositions assume **flow** — data moves through chains, parallel branches, conditionals. The creator system isn't a pipeline. It's a **brain with hands.**

The `creator_bot` doesn't pass data through specialists sequentially. It **consults** them. It maintains the state, decides who to ask, gets an answer, synthesizes, and decides what to do next. The specialists don't know about each other.

This is a **hub-and-spoke** topology:

```
                 +----------------+
                 |  test_         |
                 |  generator     |
                 +-------+--------+
                         |
  +----------------+     |     +----------------+
  | connection_   -+-----+-----+- deployment_  |
  | advisor        |     |     |  advisor      |
  +----------------+     |     +----------------+
                    +----+----+
                    | creator |
                    |  _bot   |
                    | (hub)   |
                    +----+----+
                         |
  +----------------+     |     +----------------+
  | nl_to_sql_    -+-----+-----+- integration_ |
  | postgres       |     |     |  builder      |
  +----------------+     |     +----------------+
                         |
                  +------+--------+
                  | execution_    |
                  | reviewer      |
                  +---------------+
```

### How It Maps to BAL

The hub pattern emerges naturally from `spawn_baleybot` — no new keyword needed. A hub is a single entity with `spawn_baleybot` in its tools list that dynamically invokes specialists based on context.

The **visual editor** detects this pattern and renders it appropriately: central node with orbiting specialists, dotted lines (on-demand invocation) rather than solid lines (data flow). When a specialist is actively being consulted, its line becomes solid and pulses.

### Hub vs Chain

| Aspect | Chain | Hub |
|--------|-------|-----|
| Data flow | Linear, output -> input | On-demand, hub frames each request |
| State | Passed along, no central memory | Hub holds session state |
| Specialist awareness | Each node knows its predecessor | Specialists are stateless, hub provides context |
| Visualization | Left-to-right pipeline | Central node with orbiting specialists |
| Invocation | All run (sequentially or parallel) | Only invoked when needed |

### User-Facing Pattern

This isn't just for the internal creator system. Users building their own BBs will want this pattern too — a customer support hub that consults a billing specialist, a product specialist, an escalation handler. Not a chain. A brain with hands. The visual editor renders it beautifully and users can build hub-topology bots through the same creation flow.

---

## 7. Connections + Tools Panel

### Three-Section Layout

The Connections panel has three sections:

**1. Requirements Map** (top)
Auto-derived from the BAL. Scans entities for tools and determines dependencies:

```
+---------------------------------------------------+
|  What your bot needs                              |
|                                                   |
|  order_monitor entity:                            |
|    Y web_search ---- Built-in, ready              |
|    ~ postgres_query -- Needs database connection  |
|                                                   |
|  summary_sender entity:                           |
|    o send_notification -- Needs notification setup|
|                                                   |
|  2 of 3 requirements met                          |
+---------------------------------------------------+
```

**2. Active Connections** (middle)
Shows what's configured with live status. Forms are driven by the chat conversation and auto-fill when the user provides information.

**3. On-the-fly Tool Creation** (bottom, contextual)
When a bot needs something that doesn't exist as a built-in tool, `integration_builder` creates an ephemeral tool inline. The tool shows up in the entity's tool list in the visual editor. If the user later wants to reuse it in another bot, it's available in the centralized tools catalog.

---

## 8. In-Context Everything

### Never Leave the Builder

When the user needs to add a connection, create a tool, or configure a trigger — it all happens inside the BB detail page. The right panel morphs to show what's needed. When it's done, the panel morphs back.

- "Add a Postgres connection" renders an inline connection form, not a navigation to `/settings/connections`
- Custom tool creation happens inline via `integration_builder`
- Trigger configuration happens in the Triggers tab
- Webhook setup happens in the Activation phase

**The mental model:** the BB builder is a workbench. Everything you need is within arm's reach. You pick up tools, plug in connections, test, and launch — all from the same seat.

**Centralized management still exists.** The connections settings page, tools catalog, etc. are there for global management. But during creation, you never need them.

---

## 9. Consultative Intelligence

### Advisor, Not Order-Taker

When a user hits a dead end, the creator bot reasons about the goal and offers alternatives. It's the difference between a form (shows an error) and an advisor (finds another way).

### Example: Missing Integration

```
User: "Connect it to our Salesforce CRM"

Creator: [checks available connections — no Salesforce integration]

         "We don't have a native Salesforce connector yet. But let
         me think about what you actually need..."

         "You want order data from Salesforce. There are a few
         ways to get there:"

         +-------------------------------------------+
         |  Salesforce REST API                       |
         |  I can create a custom tool that calls     |
         |  Salesforce's REST API directly. You'll    |
         |  need an API token.                        |
         |  [Set this up]                             |
         +-------------------------------------------+
         |  Sync to Postgres first                    |
         |  If you already sync Salesforce data to    |
         |  a database (via Fivetran, Airbyte, etc)   |
         |  we can query that directly.               |
         |  [Use database instead]                    |
         +-------------------------------------------+
         |  CSV Upload                                |
         |  For a quick test, export your data as     |
         |  CSV and I'll work with that. You can      |
         |  wire up the live connection later.         |
         |  [Start with CSV]                          |
         +-------------------------------------------+
```

### Example: User Stuck on Technical Details

```
User: "I don't know how to get a Salesforce API token"

Creator: "No problem. Here's what you need:"
         -> [Step-by-step inline guide]

         "If that feels like too much right now, we can start
         with the CSV approach to get your bot working today,
         and circle back to the live API connection later.
         Your bot will work either way — just with manual
         data updates until the API is connected."

         [Start with CSV for now]  [I'll get the token]
```

### Behavioral Rules

| Situation | Bad response | Good response |
|-----------|-------------|---------------|
| Missing integration | "Not supported" | "Here are 3 ways to achieve what you need" |
| User doesn't know technical details | Show empty form | Ask what they're trying to accomplish, then fill the form for them |
| Connection fails | "Connection error" | "Failed because [reason]. Try [fix], or use [alternative]" |
| User asks for something impossible | "Can't do that" | "That won't work because [reason], but here's what will get the same result" |
| User is overwhelmed | Show all options | "Let's start simple. We can make this more sophisticated later." |

**Core principle:** The creator bot always maintains a mental model of what the user is trying to accomplish and what's the simplest path to get them there right now. It's not about completing every checkbox — it's about getting to a working bot as fast as possible, with a clear upgrade path.

---

## 10. Testing Panel

### Conversation-Driven Test Generation

When the user first opens the Test tab, the `test_generator` BB (spawned by the creator) analyzes the BAL, entity goals, and connected data sources, then proposes a test plan in the chat:

```
Creator: "Let's make sure your Order Monitor works before we go live.
         Based on what this bot does, I'd suggest testing three things:"

         1. Connection test
            "Can the bot reach your database and read orders?"

         2. Logic test
            "Given sample order data, does it produce the right summary?"

         3. End-to-end test
            "Run the full chain: fetch -> analyze -> send notification.
             I'll use a test notification channel so nothing goes to production."

         [Run all three]  [Let me pick which ones]
```

### Test Plan Panel

The right panel shows the test plan as a structured, live-updating view:

```
+---------------------------------------------------+
|  Test Plan                                        |
|                                                   |
|  1. Connection: Postgres read          o Pending  |
|     Query: SELECT * FROM orders                   |
|     WHERE created_at > now() - interval '1 day'   |
|                                                   |
|  2. Logic: Summary generation          o Pending  |
|     Input: 3 sample orders (auto-generated)       |
|     Expected: Structured summary with totals      |
|                                                   |
|  3. End-to-end: Full chain             o Pending  |
|     order_monitor -> summary_sender               |
|     Notification: test channel                    |
|                                                   |
|  [Run All]                    [Add Custom Test]   |
+---------------------------------------------------+
```

### Real-Time Execution Visibility

When tests run, the panel updates in real-time using the streaming events already captured. The user can see: which entity is executing, what tools are being called, what data is flowing between entities, and where a failure happened.

### Diagnostic Failure Handling

When a test fails, the creator bot diagnoses — not just reports:

```
Creator: "Test 2 failed — the summary generator produced output but
         it didn't match the expected schema. The 'total' field came
         back as a string ('$1,234') instead of a number (1234).

         This is because the Postgres query returns formatted currency.
         I can fix this two ways:"

         [Fix the query to return raw numbers]
         [Add a transform step in the entity's goal]
```

The fix happens in-context — the creator bot updates the BAL, the visual editor refreshes, and the user can re-run the test immediately.

### Custom Tests

Users can add their own test cases. "Add Custom Test" lets them define input and expected behavior in natural language:

```
User: "Test that it handles an empty database gracefully"

Creator: "Good edge case. I'll add a test that runs with no orders
         in the last 24 hours. The expected behavior should be..."

         [Send 'No new orders' notification]
         [Skip notification entirely]
         [Send summary with zero totals]
```

The creator bot asks what the correct behavior should be — it helps users think through edge cases they might not have considered.

### Goal-Derived Adaptive Test Generation

No fixed test templates. The `test_generator` reads the BAL goals, connections, and entity topology, then generates bespoke scenarios every time. A weather bot gets different tests than an order monitor. The test plan is unique to *this* bot.

### Multi-BB Integration Testing

For BB clusters, testing happens at three levels:

**Level 1: Unit** — Each entity runs in isolation with mock inputs. Does the monitor query work? Does the sender format correctly?

**Level 2: Integration** — The handoff points between entities are tested. This is where most multi-bot bugs live. The `test_generator` specifically looks for schema mismatches between connected entities (e.g., output field `orderCount` vs expected `order_count`) and generates tests that exercise those boundaries.

**Level 3: End-to-end** — The full cluster runs with real connections but safe outputs (test notification channel, dry-run mode). Verifies the complete flow including triggers, timing, and error propagation.

```
+---------------------------------------------------+
|  Test Plan: Order Monitor Cluster                 |
|                                                   |
|  UNIT TESTS (per entity)                          |
|  1. order_monitor: Database read       * Passed   |
|  2. summary_sender: Notification send  * Passed   |
|                                                   |
|  INTEGRATION TESTS (between entities)             |
|  3. Data handoff: monitor -> sender    o Pending  |
|     "Does the monitor's output format match       |
|      what the sender expects?"                    |
|                                                   |
|  END-TO-END TEST (full cluster)                   |
|  4. Full run: trigger -> monitor ->    o Pending  |
|     sender -> notification delivered              |
|                                                   |
+---------------------------------------------------+
```

For **hub topologies**, integration testing verifies that the hub correctly frames context when spawning specialists, and that specialist responses are properly synthesized.

### Guided Walk-Through Mode

```
Creator: "Your cluster has 2 entities in a chain. I've generated
         4 tests: 2 check each entity individually, 1 checks the
         data handoff between them, and 1 runs the full flow.

         Want me to run them all, or walk through one at a time?"

         [Run all]  [Walk me through it]
```

"Walk me through it" runs each test, explains what's happening, and pauses after each for the user to ask questions or adjust.

---

## 11. Rich Chat Interaction Components

### Structured Message Types

The chat needs a proper component vocabulary for interactive elements the creator bot can surface:

| Component | Purpose | Example |
|-----------|---------|---------|
| **Option cards** | Multiple-choice with descriptions | "How do you want to deploy?" with 3 cards |
| **Test plan card** | Shows test suite with run controls | Checklist with status indicators and Run button |
| **Connection card** | Inline connection status + quick action | "PostgreSQL: Connected" with [Test] [Edit] |
| **Entity card** | Already built — shows entity with tools | Mini-cards from the activity feed |
| **Code block** | SQL, BAL, or API snippets | Generated query with copy button |
| **Progress card** | Real-time execution progress | Streaming test execution with entity visibility |
| **Diagnostic card** | Failure analysis with fix options | "Test failed because X. Fix with [A] or [B]" |

### Extended MessageMetadata

These are structured message types emitted by the creator bot, extending the `MessageMetadata` system already built for entity cards:

```typescript
interface MessageMetadata {
  entities?: EntityMeta[];
  isInitialCreation?: boolean;
  isError?: boolean;
  // Rich interactive components
  options?: Array<{
    id: string;
    label: string;
    description: string;
    icon?: string;
  }>;
  testPlan?: Array<{
    id: string;
    name: string;
    description: string;
    status: 'pending' | 'running' | 'passed' | 'failed';
  }>;
  connectionStatus?: Array<{
    name: string;
    status: 'ready' | 'configuring' | 'missing';
    type: string;
  }>;
}
```

The `AssistantMessage` component renders these as interactive cards. When the user clicks an option card, it sends a message on their behalf or triggers the relevant action. The chat feels like a conversation, but interactions are structured and trackable.

---

## 12. Internal BB Reasoning Model

### Chain-of-Thought Execution

Specialist BBs aren't simple prompt-in/answer-out calls. They need explicit chain-of-thought reasoning to produce quality results. A `test_generator` analyzing a complex BB cluster needs to reason through the topology, consider edge cases, check schema compatibility, and validate its own test plan before presenting it.

### Three Requirements for Quality Specialist Output

**1. Structured thinking before output**

Specialist BB goals include explicit reasoning processes:

```
test_generator goal:
  "You are a QA engineer analyzing a BaleyBot cluster.

   THINK THROUGH THIS PROCESS:
   1. Read the BAL code and identify every entity and its goal
   2. For each entity, identify: inputs, tools, outputs, error modes
   3. Map connections — what flows between entities?
      Check for schema mismatches at every boundary
   4. Consider the user's stated goal — what would 'working correctly'
      look like from their perspective?
   5. Generate test cases at three levels: unit, integration, end-to-end
   6. For each test: input data, expected behavior, what failure means

   VALIDATE YOUR WORK:
   - Does every entity have at least one test?
   - Does every connection have a handoff test?
   - Are there edge cases (empty data, errors, timeouts)?
   - Would a non-technical user understand each test?"
```

Thinking is captured in streaming events. The creator bot receives the full output including reasoning, strips out internal process, and presents clean results. Reasoning is available via "Show reasoning" for users who want transparency.

**2. Self-validation loops**

For critical operations, specialist BBs check their own work:

```
connection_advisor process:
  1. Parse user's connection info
  2. Build connection config
  3. Test the connection (actually run a query)
  4. If it fails: diagnose why, adjust, retry
  5. Only report success when verified
```

This means specialist BBs need access to real tools — `connection_advisor` needs a tool that can test database connections. `test_generator` needs a tool that can execute test runs and inspect results. They're not just generating text — they're doing work and validating it.

**3. Context-aware depth of reasoning**

Not every invocation needs deep reasoning. The creator bot controls depth by framing its spawn request:

```
Simple case:
  spawn connection_advisor with:
    "User wants to add their Anthropic API key.
     Straightforward credential setup."

Complex case:
  spawn connection_advisor with:
    "User needs two Postgres databases — analytics replica for reads,
     production for writes. Think carefully about connection isolation
     and permissions."
```

The specialist BB scales its reasoning to match task complexity.

### What the User Sees vs What Happens

```
Chat (what user sees):
  Creator: "Testing your database connection..."
           [progress indicator]
  Creator: "Connected! I can see 3 tables. Here's what I found:"
           [connection card with table list]

Behind the scenes (what happened):
  1. creator_bot spawns connection_advisor
  2. connection_advisor thinks: "Postgres connection string provided.
     Parse... host=db.example.com, port=5432, db=orders.
     Test SELECT 1... success.
     Inspect schema... 3 tables found.
     Check orders table columns... id, customer, total, created_at.
     Matches entity goal of 'monitor new orders'.
     Test real query... returns 7 rows.
     Connection verified and compatible."
  3. connection_advisor returns structured result
  4. creator_bot presents clean summary
```

The user gets confidence. The system gets reliability. "Show reasoning" reveals the full chain of thought — building trust.

---

## 13. Activation

Activation answers: *How does this bot get triggered in production?*

### Trigger Selection

The creator bot already knows what triggers make sense based on the BAL:

```
Creator: "Your Order Monitor is ready to go live. How should it run?"

         +-------------------------------------------+
         |  Schedule (recommended)                    |
         |  Run every morning at 8am. Best for your  |
         |  daily summary use case.                   |
         |  [Set up schedule]                         |
         +-------------------------------------------+
         |  Webhook                                   |
         |  Trigger via HTTP call. Good if another    |
         |  system should kick this off.              |
         |  [Set up webhook]                          |
         +-------------------------------------------+
         |  Manual only                               |
         |  Run it yourself when needed. You can      |
         |  always add a trigger later.               |
         |  [Keep manual]                             |
         +-------------------------------------------+
```

### Schedule Configuration (Conversational)

```
Creator: "What time should it run, and in what timezone?"
User: "8am EST, weekdays only"
Creator: "Got it — Monday through Friday at 8:00 AM Eastern.
         That's cron: 0 8 * * 1-5 (America/New_York)

         First run will be tomorrow morning. I'll send you a
         notification when it completes so you can verify."

         [Activate]  [Test one run first]
```

"Test one run first" is critical — it runs the full flow as if the trigger fired, but doesn't enable the schedule yet. The user sees real output, confirms it's correct, then activates.

### Webhook Configuration

For webhook activation, the creator generates the endpoint and shows integration code:

```
Creator: "Your webhook is ready:"

         Endpoint: https://app.baleyui.com/api/webhooks/bb-abc123
         Method: POST

         [Copy URL]  [Show integration code]

         "I can also generate the code to call this from your app."

         [JavaScript/fetch]  [Python/requests]  [cURL]
```

### BB Completion Triggers

For BB clusters where one bot triggers another:

```
Creator: "Your analyzer finishes, then the reporter should run
         automatically. I've wired that up as a completion trigger.

         Should the reporter run even if the analyzer fails?"

         [Only on success]  [Always run]  [Run on failure too (for error reports)]
```

---

## 14. Monitoring

Monitoring answers: *How do I know it's working in production?*

### Setup (Conversational)

```
Creator: "Last thing — let's set up monitoring so you know if
         anything goes wrong."

         "For a scheduled bot like this, I'd recommend:"

         1. Failure alerts — Get notified if a run fails
            [Email]  [Slack]  [Both]

         2. Performance baseline — Track run duration. If it starts
            taking significantly longer, that usually means the query
            is scanning more data than expected.

         3. Output validation — Check that every run produces a valid
            summary. If the output schema changes, you'll know.

         [Set up all three]  [Just failure alerts]  [Skip for now]
```

### Monitor Panel (Live Dashboard)

Once the bot is running, the Monitor tab shows:

```
+---------------------------------------------------+
|  Monitor: Order Monitor                           |
|                                                   |
|  Status: Active - Schedule (weekdays 8am EST)     |
|  Last run: Today 8:00 AM - Passed (1.2s)         |
|  Next run: Tomorrow 8:00 AM                       |
|                                                   |
|  Last 7 days:  * * * * X * *                      |
|                M T W T F S S                       |
|                        ^ Failed - timeout          |
|                                                   |
|  Alerts:                                          |
|    ! Friday run timed out (>60s)                  |
|      "Database was under heavy load. Resolved     |
|       itself on Monday's run."                    |
|                                                   |
|  [View all runs]  [Edit alerts]  [Pause bot]      |
+---------------------------------------------------+
```

### Completion Celebration

When the last readiness dot turns green:

```
Creator: "Your Order Monitor is live! Here's what's set up:"

         * Design: 2 entities in a chain
         * Connected: Postgres (orders db) + Slack notifications
         * Tested: 4/4 tests passing
         * Activated: Weekdays at 8am EST
         * Monitored: Failure alerts via Slack

         "I'll be here if you need to make changes. You can also
         ask me to add new entities, change the schedule, or
         adjust the notification format anytime."
```

The bot is now production-ready. The creator bot remains available for ongoing modifications — the conversation never ends, it just shifts from setup mode to maintenance mode.

---

## 15. Implementation Phases

### Phase 1: Foundation — Readiness Model + Adaptive UI

**Goal:** The UI knows where the bot is in its lifecycle and adapts accordingly.

| Task | What | Files |
|------|------|-------|
| Readiness state type | `ReadinessState` with 5 dimensions, auto-detection logic | `creator-types.ts`, new `readiness.ts` |
| Readiness computation | Scan BAL for tools, check connections, track test runs | New service: `readiness-service.ts` |
| Adaptive tab bar | Phase-aware tabs with readiness dots | `page.tsx` tab bar section |
| Extended MessageMetadata | Options, test plans, connection cards in chat | `creator-types.ts`, `ConversationThread.tsx` |
| Rich chat components | Option cards, connection cards, progress cards | New components in `ConversationThread.tsx` |

### Phase 2: Connections Panel + In-Context Setup

**Goal:** Users wire up data sources and tools without leaving the builder.

| Task | What | Files |
|------|------|-------|
| Connections panel component | Requirements map, active connections, inline forms | New: `ConnectionsPanel.tsx` |
| In-context connection creation | Inline connection form that saves to workspace | Extend existing connections lib |
| Tool requirements scanning | Parse BAL to determine what tools need | New utility in `tools/` |
| On-the-fly tool creation UI | `integration_builder` creates ephemeral tools inline | New internal BB + UI |
| Creator bot connection guidance | Update creator bot prompt to guide connections phase | `internal-baleybots.ts` |

### Phase 3: Testing Panel + Test Generation

**Goal:** Context-aware test suites that exercise real connections.

| Task | What | Files |
|------|------|-------|
| Test panel component | Test plan view with run controls, live status | New: `TestPanel.tsx` |
| `test_generator` internal BB | Goal-derived adaptive test generation with chain-of-thought | `internal-baleybots.ts` |
| Multi-level test execution | Unit, integration, end-to-end test runners | New: `test-runner-service.ts` |
| Diagnostic failure handling | Creator bot diagnoses failures and suggests fixes | Creator bot prompt updates |
| Custom test support | NL test case definition with behavior clarification | Test panel UI + test_generator |

### Phase 4: Internal BB Orchestration

**Goal:** Creator bot orchestrates specialist BBs with shared session context.

| Task | What | Files |
|------|------|-------|
| Session context bundle | `SessionContext` type passed to all specialist BBs | New: `session-context.ts` |
| `connection_advisor` BB | Analyzes requirements, configures connections, tests them | `internal-baleybots.ts` |
| `deployment_advisor` BB | Generates webhook configs, embed code, cron expressions | `internal-baleybots.ts` |
| `integration_builder` BB | Creates ephemeral tools when built-ins aren't enough | `internal-baleybots.ts` |
| Creator bot as orchestrator | Update creator bot to delegate to specialists, maintain coherent conversation | `internal-baleybots.ts` |
| Chain-of-thought reasoning | Structured thinking in specialist BB goals with self-validation | BB goal definitions |

### Phase 5: Activation + Monitoring

**Goal:** Bots go live with triggers, webhooks, and monitoring.

| Task | What | Files |
|------|------|-------|
| Activation panel component | Trigger selection, schedule config, webhook setup | New: `ActivationPanel.tsx` |
| Conversational trigger setup | Creator bot guides trigger configuration | Creator bot prompt |
| Webhook code generation | Generate integration code (JS, Python, cURL) | `deployment_advisor` BB |
| Monitor panel component | Live dashboard with run history, alerts, performance | New: `MonitorPanel.tsx` |
| Alert configuration | Failure alerts, performance baselines, output validation | Extend analytics system |
| Readiness celebration | Completion state with summary of everything configured | Creator bot + UI |

### Phase 6: Visual Editor — Hub Topology

**Goal:** Visual editor detects and renders hub-and-spoke patterns.

| Task | What | Files |
|------|------|-------|
| Hub detection in parser | Detect spawn_baleybot patterns and flag as hub topology | BAL parser/compiler |
| Hub layout algorithm | Central node + orbiting specialists layout | Visual editor layout |
| Active spawn visualization | Dotted lines that pulse when specialist is invoked | Visual editor components |
| Hub node component | Larger node with session state indicator | New: `HubNode.tsx` |

### Dependency Order

```
Phase 1 (Foundation) ─── must complete first
    │
    ├── Phase 2 (Connections) ─── needs adaptive UI
    │       │
    │       └── Phase 3 (Testing) ─── needs connections to test against
    │               │
    │               └── Phase 5 (Activation + Monitor) ─── needs tests passing
    │
    └── Phase 4 (BB Orchestration) ─── can parallel with 2/3, enhances all phases
            │
            └── Phase 6 (Hub Topology) ─── needs orchestration model defined
```

Phases 2+3 and Phase 4 can run in parallel. Phase 5 depends on 2+3. Phase 6 depends on 4.

---

## Appendix A: Current System Analysis

### What Exists and Works Well

1. **Core BAL compilation & execution** — Reliable
2. **Tool infrastructure** — Built-in + connection-derived tools functional
3. **Internal BaleyBots** — 7 defined and operational
4. **Database schema** — Robust with soft-delete, optimistic locking
5. **API layer** — tRPC with auth, rate limiting, error handling
6. **Streaming events** — Full event capture during execution
7. **Visual editor** — React Flow rendering with worker-offloaded parsing
8. **Chat UI** — Activity feed with entity cards, markdown, quick actions (just redesigned)
9. **Trigger system** — BB completion triggers exist in schema and executor

### What Needs Fixing/Building

1. **Readiness state machine** — New concept, needs schema + UI
2. **Adaptive tab bar** — Transform static tabs to phase-aware
3. **Connections panel** — Inline connection setup with chat-driven flow
4. **Test panel** — Context-aware test generation and execution
5. **Internal BB orchestration** — Session context bundle, new specialist BBs (4 new)
6. **Hub topology detection** — Visual editor renders spawn patterns as hubs
7. **In-context tool creation** — `integration_builder` BB + inline UI
8. **Consultative dead-end handling** — Alternative path suggestions
9. **Activation panel** — Trigger setup, webhook config, launch flow
10. **Monitoring panel** — Alert rules, execution dashboard
11. **Rich chat components** — Option cards, test plan cards, connection cards, diagnostic cards
12. **Chain-of-thought reasoning** — Structured thinking in specialist BB goals

---

## Appendix B: New Internal BaleyBots

| Bot | Goal Summary | Tools Needed | Reasoning Depth |
|-----|-------------|--------------|----------------|
| `connection_advisor` | Analyze what connections a bot needs, help configure them, verify they work | `test_connection`, `inspect_schema`, `store_memory` | Medium-High: must validate connections work |
| `test_generator` | Analyze BAL + goals + connections to generate bespoke test scenarios at unit/integration/e2e levels | `execute_test`, `inspect_output`, `store_memory` | High: must reason about topology, schemas, edge cases |
| `deployment_advisor` | Generate webhook configs, embed code, API docs, cron expressions for production deployment | `fetch_url`, `store_memory` | Medium: generates code artifacts |
| `integration_builder` | Create ephemeral tools on the fly when built-in tools aren't enough for a user's needs | `create_tool`, `fetch_url`, `store_memory` | High: must understand API schemas and generate working tool definitions |

---

## Appendix C: Design Principles

1. **Never leave the builder** — Everything happens in-context. No navigation to settings pages during creation.
2. **Conversation-first, not form-first** — Every phase starts with the creator bot asking the right questions. Panels are mirrors of conversation progress.
3. **Consultative, not order-taking** — When the user hits a dead end, reason about their JTBD and offer alternatives. Don't just fail.
4. **Progressive disclosure** — Start simple, add complexity as needed. "Let's start with CSV, wire up the API later."
5. **Shared context, no cold starts** — Every specialist BB receives the full session context. No re-explaining.
6. **Chain-of-thought for reliability** — Specialist BBs think through their process, validate their own work, and only present verified results.
7. **The bot isn't done until it's live** — Readiness tracks the full lifecycle: designed, connected, tested, activated, monitored.
