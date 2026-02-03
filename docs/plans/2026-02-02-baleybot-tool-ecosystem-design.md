# BaleyBot Tool Ecosystem Design

> **Date:** 2026-02-02
> **Status:** Approved Design
> **Author:** James McArthur + Claude

---

## For Implementing Agents

**REQUIRED SUB-SKILL:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this design.

**Context:**
- This is a comprehensive design for BaleyUI's tool ecosystem
- BaleyUI is an AI workflow builder using BAL (Baleybots Assembly Language)
- The `@baleybots/core` package provides the agent runtime
- Current state: `availableTools: []` is empty - this design fills that gap

**Key Files to Understand First:**
- `apps/web/src/lib/baleybot/creator-bot.ts` - The AI that helps users create BBs
- `apps/web/src/lib/baleybot/tool-catalog.ts` - Tool categorization system
- `apps/web/src/lib/baleybot/executor.ts` - BAL execution engine
- `apps/web/src/lib/baleybot/types.ts` - Type definitions
- `packages/db/src/schema.ts` - Database schema

**Implementation Order:** Follow the 8 phases in Section 10. Each phase builds on the previous.

**Start with Phase 1:** Built-in tools + tool catalog service. This unblocks everything else.

---

## Executive Summary

This document defines the complete tool ecosystem for BaleyBots, including built-in tools, auto-generated connection tools, dynamic tool creation, and the supporting infrastructure for triggers, data flow, analytics, cost control, and error handling.

**Core Principles:**
1. AI does the thinking, user stays in control
2. Simple things should be simple, complex things should be possible
3. Customer data stays in customer's DB when possible
4. Smart defaults that self-heal, configuration buried for power users

---

## 1. Tool Architecture

### 1.1 Three Layers of Tools

| Layer | Source | When Available |
|-------|--------|----------------|
| **Built-in** | Hardcoded in system | Always |
| **Connection-derived** | Auto-generated from connections | When connection added |
| **Dynamic** | Created by BBs at runtime | During execution, can be promoted |

### 1.2 Built-in Tools (Always Available)

| Tool | Purpose | Approval Required |
|------|---------|-------------------|
| `web_search` | Search the web via Tavily/similar | No |
| `fetch_url` | Get content from any URL | No |
| `spawn_baleybot` | Call another BaleyBot by ID/name | No |
| `send_notification` | Notify user in-app | No |
| `schedule_task` | Schedule BB to run later | Yes |
| `store_memory` | Persist key-value data across runs | No |
| `create_agent` | Spawn temporary specialized agent | Yes |
| `create_tool` | Define a tool inline for this run | Yes |

**Implementation Notes:**
- `web_search`: Integrate Tavily API (or similar). Requires API key in workspace settings.
- `spawn_baleybot`: Lookup by ID or name within workspace. Pass input, return output.
- `create_agent`: Creates ephemeral Baleybot with specified model/goal. Exists only for current execution unless promoted.
- `create_tool`: Defines tool with name, description, input schema, and inline function. Same ephemeral/promotion rules.

### 1.3 Connection-Derived Tools

When a user connects a data source, the system auto-generates smart tools.

#### Database Connections (Postgres, MySQL, etc.)

**Generated Tool:** `database`

**Behavior:**
- Accepts natural language queries: "find users who signed up this week"
- Schema-aware: knows tables, columns, relationships, types
- AI translates intent to SQL using schema context
- Returns structured results

**Safety - Intent-Based Detection:**
- Read operations (SELECT) → Immediate execution
- Write operations (INSERT, UPDATE, DELETE) → Requires approval
- Uncertain intent → Defaults to requires approval

**Schema Introspection Flow:**
```
User connects database
    ↓
System introspects: tables, columns, foreign keys, types
    ↓
Schema stored with connection metadata
    ↓
When BB uses `database` tool:
    - Schema injected into tool's AI context
    - AI writes correct SQL referencing real tables/columns
    - Query executed against customer's DB
    - Results returned to BB
```

#### Other Connection Types

| Connection | Generated Tool | Smart Behavior |
|------------|---------------|----------------|
| REST API | `api` | Endpoint-aware, knows available routes and parameters |
| Slack | `slack` | Channel-aware, workspace context, message formatting |
| Email (SMTP) | `email` | Always requires approval |
| Stripe | `payments` | Read immediate, writes require approval |

**Implementation Notes:**
- Each connection type has a tool generator function
- Tool generators produce: name, description, input schema, execution function
- Schema/context is refreshed periodically or on-demand

### 1.4 Dynamic Tools (Runtime Creation)

BBs can create tools and agents on-the-fly when no existing tool fits the job.

**Scope Options:**
- **Ephemeral (default):** Exists only for current execution
- **Promoted:** User can promote useful tools/agents to permanent workspace tools

**`create_agent` Input Schema:**
```json
{
  "name": "string - identifier for this agent",
  "goal": "string - what the agent should accomplish",
  "model": "string - optional, e.g., 'anthropic:claude-sonnet-4-20250514'",
  "tools": ["array of tool names this agent can use"]
}
```

**`create_tool` Input Schema:**
```json
{
  "name": "string - tool identifier",
  "description": "string - what the tool does",
  "input_schema": "object - JSON schema for inputs",
  "implementation": "string - natural language description of what to do"
}
```

**Note:** `create_tool` implementation is interpreted by AI, not executed as code. This keeps it safe while flexible.

---

## 2. BB Complexity: Single vs Cluster

### 2.1 AI Decides Complexity

When a user describes what they want:

**Simple request:** "Help customers answer questions about our product"
- AI creates: Single BB
- User sees: One card, clear purpose

**Complex request:** "Analyze user sessions and give me daily insights"
- AI creates: BB Cluster (2-3 BBs working together)
- User sees: Visual diagram of connected BBs

### 2.2 User Perception

- User always calls it a "BaleyBot" regardless of internal complexity
- Cluster internals hidden unless user wants to peek
- Future enterprise feature: "BaleyBot Cluster" as explicit concept

### 2.3 Visual Representation of Clusters

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Session      │ ───▶ │ Story        │ ───▶ │ Daily        │
│ Watcher      │      │ Compiler     │      │ Reporter     │
│              │      │              │      │              │
│ ⚡ Webhook   │      │ 🤖 GPT-4mini │      │ 🧠 Sonnet    │
│              │      │              │      │              │
│ → Next BB    │      │ → Storage    │      │ → Dashboard  │
│              │      │ → Next BB    │      │ → Email 9am  │
└──────────────┘      └──────────────┘      └──────────────┘
```

Each card shows:
- BB name and icon
- Trigger type
- Model (if relevant)
- Output destinations

---

## 3. Triggers

### 3.1 Supported Trigger Types

| Trigger | Description | Example |
|---------|-------------|---------|
| **Manual** | User clicks "Run" | Testing, one-off tasks |
| **Schedule** | Cron-like timing | "Every day at 9am" |
| **Webhook** | External HTTP POST | New event from customer's app |
| **DB Event** | Row inserted/updated/deleted | New user signup triggers welcome flow |
| **BB Completion** | Another BB finishes | `analyzer` done → `reporter` runs |
| **Real-time Stream** | Continuous processing | Process each event as it arrives |

### 3.2 Configuration Approach

**AI suggests triggers based on user description:**
- "Analyze sessions daily" → Schedule trigger (daily)
- "Whenever a new user signs up" → DB event or webhook
- "Help with support questions" → Manual (or webhook from chat widget)

**User can override:**
- AI suggestion shown clearly
- One-click to change trigger type
- Advanced options collapsed by default

### 3.3 Cluster Trigger Independence

Each BB in a cluster can have its own trigger:
- `session_watcher` → Webhook (new session event)
- `insights_builder` → Schedule (hourly)
- `report_generator` → Schedule (daily 9am) + Manual

---

## 4. Data Flow

### 4.1 Hybrid Approach

**Same trigger (synchronous chain):** Pipeline style
- Output of BB1 directly becomes input of BB2
- No intermediate storage needed
- Fast, simple

**Different triggers (async):** Shared storage
- BB1 writes results to storage
- BB2 reads from storage when triggered
- Decoupled, inspectable

### 4.2 Storage Auto-Configuration

When BBs need shared storage:
1. AI analyzes output schema of upstream BB
2. System auto-creates appropriate storage structure
3. Downstream BB knows where to read from

**Customer DB preferred:**
- If customer has connected a DB, use it for BB operational data
- Results, analytics, intermediate data all in customer's DB

**BaleyUI fallback:**
- If no customer DB connected, use BaleyUI storage
- No warnings or friction - just works
- Business model handles pricing for storage

### 4.3 What Lives Where

**Always in BaleyUI DB:**
- User accounts and auth
- BB definitions (BAL code)
- Workspace settings
- Execution metadata (when, duration, success/fail)

**In Customer DB (or BaleyUI fallback):**
- BB operational data
- Execution results/outputs
- Analytics metrics
- Business data

---

## 5. Output Destinations

### 5.1 Output Types

| Destination | Use Case |
|-------------|----------|
| **Storage** | Query later, historical analysis |
| **Dashboard** | View results in BaleyUI |
| **Notification** | Alert user of important results |
| **Webhook** | Push to external systems (Slack, Zapier) |
| **Email** | Scheduled digests |

### 5.2 Configuration in BAL

AI writes output destinations into BAL:

```bal
report_generator {
  "goal": "Generate daily insights report",
  "output_to": ["storage", "dashboard", "email:daily@9am"]
}
```

### 5.3 Defaults

- All BB outputs stored (always, for history)
- Final BB in cluster shows on dashboard
- Notifications/email/webhooks only when needed

---

## 6. Visual Editor

### 6.1 Principle

BAL is the source of truth. Visual editor is a bidirectional lens.

### 6.2 V1 Capabilities (Light Editing)

**Can do:**
- View cluster structure as diagram
- Click BB to edit: goal, model, trigger, output destinations
- Toggle between Visual and Code views
- Changes sync both directions

**Cannot do (V1):**
- Add/remove BBs visually (use AI conversation instead)
- Drag to reorder (use AI or edit BAL)
- Complex connection logic

### 6.3 Visual-to-BAL Sync

- User changes model dropdown → BAL updates
- User edits BAL → Visual re-renders
- Conflict resolution: BAL is truth

---

## 7. Analytics Schema

### 7.1 AI-Generated Analytics Config

When AI creates a BB, it generates an analytics block:

```bal
session_analyzer {
  "goal": "Analyze user sessions and identify friction points",

  "analytics": {
    "track": [
      { "name": "session_count", "type": "count" },
      { "name": "avg_duration", "type": "average", "field": "duration_ms" },
      { "name": "drop_off_rate", "type": "percentage", "condition": "completed = false" },
      { "name": "top_exit_pages", "type": "top_n", "field": "exit_page", "n": 5 }
    ],
    "compare": "week_over_week",
    "alert_when": "drop_off_rate > 40%"
  }
}
```

### 7.2 Supported Metric Types

| Type | Description | Example |
|------|-------------|---------|
| `count` | Count executions/events | Total sessions |
| `average` | Mean of numeric field | Avg duration |
| `percentage` | Ratio meeting condition | Drop-off rate |
| `top_n` | Most frequent values | Top exit pages |
| `trend` | Change over time | Week over week |
| `distribution` | Histogram/buckets | Session length distribution |

### 7.3 System Behavior

1. AI generates analytics schema based on BB purpose
2. System auto-creates storage for metrics
3. Metrics updated on each execution
4. Dashboard renders appropriate charts
5. Alerts triggered when thresholds hit

### 7.4 Quantitative + Qualitative Display

Dashboard shows both:
- **Quantitative:** Charts, numbers, trends (from analytics schema)
- **Qualitative:** AI-generated insights, summaries, stories

---

## 8. Cost Control

### 8.1 Philosophy

- Not front and center - lives in workspace settings
- Smart anomaly detection, not hard limits
- AI suggests optimizations
- User stays in control

### 8.2 Configuration (Workspace Settings)

- Monthly budget (optional)
- Expected volume per BB (AI can suggest)
- Acceptable variance threshold (default: 20%)
- Per-BB overrides (optional)

### 8.3 Anomaly Detection

System monitors for:
- BB running significantly more than usual
- Costs spiking unexpectedly
- Single execution taking unusually long

### 8.4 Notification Content

When anomaly detected:
```
📊 Session Analyzer - Unusual Activity

What's happening:
  Ran 847 times today (normal: ~200)

Impact:
  Projected to exceed budget by $34 this month

Options:
  [Let it run]  [Pause BB]  [See AI suggestions]
```

### 8.5 AI Suggestions

- "Switch to GPT-4o-mini for the filter step - saves 60%"
- "Add condition to skip sessions under 10 seconds - reduces volume 40%"
- "Batch processing instead of real-time could save 50%"

---

## 9. Error Handling

### 9.1 Philosophy

- Smart defaults that self-heal
- AI diagnoses issues before user needs to intervene
- Configuration buried for advanced users

### 9.2 Failure Types and Responses

| Failure | Example | Default Response |
|---------|---------|------------------|
| **Transient** | API timeout, rate limit | Auto-retry 3x with backoff |
| **Data issue** | Malformed input | Log, skip item, continue |
| **Tool failure** | DB connection lost | Pause BB, notify user |
| **AI error** | Model refused/bad output | Retry with fallback model |
| **Budget exceeded** | Hit spend limit | Pause BB, notify user |

### 9.3 Cluster Error Behavior

- One BB fails → Downstream BBs wait
- Retry succeeds → Pipeline continues
- Permanent failure → Notify user, they decide

### 9.4 Self-Diagnosis

Before notifying user, system attempts:
1. Identify root cause
2. Try automatic fixes (retry, fallback model)
3. If unresolved, notify with diagnosis and suggested actions

---

## 10. Implementation Phases

### Phase 1: Foundation
- [ ] Built-in tools implementation (`web_search`, `fetch_url`, `spawn_baleybot`, `send_notification`, `store_memory`)
- [ ] Tool catalog service (provides tools to Creator Bot)
- [ ] Update Creator Bot system prompt with tool knowledge

### Phase 2: Connections
- [ ] Database connection tool generator
- [ ] Schema introspection service
- [ ] Intent-based safety detection for database queries

### Phase 3: Triggers & Scheduling
- [ ] Manual trigger (exists)
- [ ] Schedule trigger (cron service)
- [ ] Webhook trigger (endpoint generation)
- [ ] BB completion trigger (event system)

### Phase 4: Data Flow & Storage
- [ ] Pipeline execution for sync chains
- [ ] Shared storage for async BBs
- [ ] Customer DB integration for operational data

### Phase 5: Analytics
- [ ] Analytics schema parser
- [ ] Metric storage and aggregation
- [ ] Dashboard chart rendering
- [ ] Alert system

### Phase 6: Visual Editor
- [ ] BAL-to-visual renderer
- [ ] Light editing UI (settings, not structure)
- [ ] Bidirectional sync

### Phase 7: Cost & Errors
- [ ] Usage tracking per BB
- [ ] Anomaly detection service
- [ ] AI optimization suggestions
- [ ] Self-healing error handlers

### Phase 8: Dynamic Tools
- [ ] `create_agent` implementation
- [ ] `create_tool` implementation
- [ ] Promotion flow (ephemeral → permanent)
- [ ] `schedule_task` implementation

---

## 11. Open Questions for Future

1. **Real-time streams:** How do we handle true streaming triggers (Kafka, websockets)?
2. **Multi-workspace BBs:** Can a BB in one workspace call a BB in another?
3. **Marketplace:** Can users share/sell BB templates?
4. **Local execution:** How do we package BBs for on-prem deployment?
5. **Version control:** How do users manage BB versions and rollbacks?

---

## 12. Success Criteria

This design is successful when:

1. **User can describe a need in plain language** → AI creates working BB with appropriate tools
2. **Complex workflows** feel like single BBs to users
3. **Data stays secure** in customer's DB when connected
4. **Costs stay predictable** with smart anomaly detection
5. **Errors self-heal** without user intervention in 90%+ of cases
6. **Analytics just work** - AI configures, system renders

---

## Appendix A: Example BB - User Session Analytics

**User says:** "I want to analyze user sessions from my app and get daily reports on friction points"

**AI creates:**

```bal
# BaleyBot: Session Analytics
# Cluster of 3 BBs working together

session_watcher {
  "goal": "Receive user session events and store for analysis",
  "trigger": "webhook",
  "tools": ["database"],
  "output_to": ["storage"]
}

story_compiler {
  "goal": "Turn raw session events into a user journey story",
  "trigger": "bb_completion:session_watcher",
  "model": "openai:gpt-4o-mini",
  "tools": ["database"],
  "output_to": ["storage"],
  "analytics": {
    "track": [
      { "name": "sessions_processed", "type": "count" },
      { "name": "avg_session_duration", "type": "average", "field": "duration_ms" },
      { "name": "drop_off_rate", "type": "percentage", "condition": "completed = false" }
    ]
  }
}

daily_reporter {
  "goal": "Generate comprehensive daily report with friction points and recommendations",
  "trigger": "schedule:daily@9am",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": ["database", "web_search"],
  "output_to": ["dashboard", "email"],
  "analytics": {
    "compare": "week_over_week",
    "alert_when": "drop_off_rate > 40%"
  }
}

chain { session_watcher story_compiler }
# daily_reporter runs independently on schedule
```

**User sees:**
- One "Session Analytics" BaleyBot card
- Click to expand → sees 3-BB diagram
- Dashboard with quantitative metrics + qualitative AI insights
- Daily email with report

---

## Appendix B: Built-in Tool Specifications

### web_search

**Description:** Search the web for information

**Input Schema:**
```json
{
  "query": "string - search query",
  "num_results": "number - optional, default 5, max 20"
}
```

**Output:** Array of search results with title, url, snippet

**Approval:** Not required

---

### fetch_url

**Description:** Fetch content from a URL

**Input Schema:**
```json
{
  "url": "string - URL to fetch",
  "format": "string - optional: 'html', 'text', 'json', default 'text'"
}
```

**Output:** Content of the page in requested format

**Approval:** Not required

---

### spawn_baleybot

**Description:** Execute another BaleyBot and return its result

**Input Schema:**
```json
{
  "baleybot": "string - BB name or ID",
  "input": "any - input to pass to the BB"
}
```

**Output:** The spawned BB's output

**Approval:** Not required

---

### send_notification

**Description:** Send an in-app notification to the user

**Input Schema:**
```json
{
  "title": "string - notification title",
  "message": "string - notification body",
  "priority": "string - optional: 'low', 'normal', 'high', default 'normal'"
}
```

**Output:** `{ "sent": true, "notification_id": "..." }`

**Approval:** Not required

---

### schedule_task

**Description:** Schedule this or another BB to run at a future time

**Input Schema:**
```json
{
  "baleybot": "string - optional, defaults to current BB",
  "run_at": "string - ISO datetime or cron expression",
  "input": "any - optional input for the scheduled run"
}
```

**Output:** `{ "scheduled": true, "task_id": "...", "run_at": "..." }`

**Approval:** Required (scheduling has cost/resource implications)

---

### store_memory

**Description:** Persist key-value data that survives across BB executions

**Input Schema:**
```json
{
  "action": "string - 'get', 'set', 'delete', 'list'",
  "key": "string - memory key",
  "value": "any - value to store (for 'set' action)"
}
```

**Output:** Depends on action - value for 'get', confirmation for others

**Approval:** Not required

---

### create_agent

**Description:** Create a temporary specialized AI agent for a specific task

**Input Schema:**
```json
{
  "name": "string - agent identifier",
  "goal": "string - what the agent should accomplish",
  "model": "string - optional, e.g., 'anthropic:claude-sonnet-4-20250514'",
  "tools": "array - tool names this agent can use"
}
```

**Output:** Agent result after execution

**Approval:** Required (creates AI resources)

---

### create_tool

**Description:** Define a custom tool for the current execution

**Input Schema:**
```json
{
  "name": "string - tool identifier",
  "description": "string - what the tool does",
  "input_schema": "object - JSON schema for tool inputs",
  "implementation": "string - natural language description of behavior"
}
```

**Output:** `{ "created": true, "tool_name": "..." }`

**Approval:** Required (defines new capability)

**Note:** Implementation is interpreted by AI, not executed as code.
