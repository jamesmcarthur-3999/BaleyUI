# BaleyBot Tool Ecosystem - Complete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Complete the BaleyBot tool ecosystem with all 8 phases fully implemented.

**Architecture:** Built-in tools with dependency injection, connection-derived tools auto-generated from workspace connections, event-driven triggers via Vercel Cron, analytics tracking, visual editing, cost control, and dynamic tool creation.

**Tech Stack:** TypeScript, Next.js, Drizzle ORM, PostgreSQL, Vercel Cron, Tavily API, tRPC

---

## Overview

This plan implements ALL features from the BaleyBot Tool Ecosystem design document across 8 phases. Each phase builds on the previous. Tasks are ordered for minimal dependencies and maximum parallelism where possible.

**Current State:**
- Phase 1: ~70% complete (tools defined, some implementations placeholder)
- Phase 2: ~60% complete (introspection done, wiring missing)
- Phase 3-8: 0-20% complete

**Target State:**
- All 8 phases fully functional
- All built-in tools working
- Database connections generate working tools
- Scheduled tasks execute via Vercel Cron
- Analytics tracked and visualized
- Visual editor for BAL
- Cost anomaly detection
- Dynamic tool creation and promotion

---

## Phase 1: Built-in Tools Completion

### Task 1.1: Implement Tavily Web Search with AI Fallback

**Files:**
- Modify: `apps/web/src/lib/baleybot/tools/built-in/implementations.ts`
- Create: `apps/web/src/lib/baleybot/services/web-search-service.ts`
- Modify: `packages/db/src/schema.ts` (workspace settings for Tavily key)

**Expected Outcome:**
- `web_search` tool returns real search results
- If Tavily API key exists in workspace settings, use Tavily
- If no Tavily key, fall back to AI model's built-in search capability
- Results include title, URL, snippet for each result

**Implementation Details:**

1. Create `web-search-service.ts`:
```typescript
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchService {
  search(query: string, numResults: number): Promise<SearchResult[]>;
}

// Tavily implementation
async function searchWithTavily(apiKey: string, query: string, numResults: number): Promise<SearchResult[]>

// AI fallback implementation (uses generateText with web search tool)
async function searchWithAI(query: string, numResults: number): Promise<SearchResult[]>

// Factory that picks implementation based on config
function createWebSearchService(tavilyApiKey?: string): WebSearchService
```

2. Update `implementations.ts` to inject the service
3. Add `tavilyApiKey` field to workspace settings in schema

**Verification:**
- Test with Tavily key: returns real web results
- Test without Tavily key: falls back to AI search
- Test with invalid Tavily key: graceful error handling

---

### Task 1.2: Implement Full spawn_baleybot Execution

**Files:**
- Modify: `apps/web/src/lib/baleybot/services/spawn-executor.ts`
- Modify: `apps/web/src/lib/baleybot/executor.ts` (export needed functions)

**Expected Outcome:**
- `spawn_baleybot` tool actually executes the target BB
- Creates execution record in database
- Returns the BB's actual output
- Respects workspace policies and tool permissions

**Implementation Details:**

1. Update `spawn-executor.ts`:
```typescript
async function spawnBaleybot(
  baleybotIdOrName: string,
  input: unknown,
  ctx: BuiltInToolContext
): Promise<SpawnBaleybotResult> {
  // 1. Look up target BB (existing code)
  // 2. Create baleybotExecutions record
  // 3. Get runtime tools for the workspace
  // 4. Call executeBaleybot with proper context
  // 5. Update execution record with result
  // 6. Return actual output
}
```

2. Handle nested spawns (BB spawning BB spawning BB) with depth limit
3. Pass parent execution ID for tracing

**Verification:**
- Create two BBs: "Greeter" and "Caller"
- Caller uses spawn_baleybot to call Greeter
- Verify Greeter's output is returned to Caller
- Verify execution records created for both

---

### Task 1.3: Implement create_agent Tool

**Files:**
- Modify: `apps/web/src/lib/baleybot/tools/built-in/implementations.ts`
- Create: `apps/web/src/lib/baleybot/services/ephemeral-agent-service.ts`

**Expected Outcome:**
- `create_agent` creates a temporary Baleybot instance
- Agent executes with specified goal, model, and tools
- Agent exists only for current execution (ephemeral by default)
- Returns agent's output

**Implementation Details:**

1. Create `ephemeral-agent-service.ts`:
```typescript
interface EphemeralAgentConfig {
  name: string;
  goal: string;
  model?: string;
  tools?: string[];
}

async function createAndExecuteAgent(
  config: EphemeralAgentConfig,
  input: unknown,
  ctx: BuiltInToolContext
): Promise<{ output: unknown; agentName: string }>
```

2. Generate BAL code dynamically from config
3. Execute using existing executor
4. Don't persist to database (ephemeral)

**Verification:**
- BB creates agent with goal "summarize this text"
- Agent executes and returns summary
- No database record created for ephemeral agent

---

### Task 1.4: Implement create_tool Tool

**Files:**
- Modify: `apps/web/src/lib/baleybot/tools/built-in/implementations.ts`
- Create: `apps/web/src/lib/baleybot/services/ephemeral-tool-service.ts`

**Expected Outcome:**
- `create_tool` defines a custom tool for current execution
- Tool's implementation is natural language (AI-interpreted)
- Tool available to subsequent tool calls in same execution
- Ephemeral by default (not persisted)

**Implementation Details:**

1. Create `ephemeral-tool-service.ts`:
```typescript
interface EphemeralToolConfig {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  implementation: string; // Natural language
}

function createEphemeralTool(
  config: EphemeralToolConfig,
  ctx: BuiltInToolContext
): RuntimeToolDefinition
```

2. Tool function uses AI to interpret the natural language implementation
3. Track ephemeral tools in execution context

**Verification:**
- BB creates tool "calculate_tip" with NL implementation
- BB then uses calculate_tip tool
- Tool executes correctly based on NL description

---

## Phase 2: Connection-Derived Tools

### Task 2.1: Create PostgreSQL Connection Form

**Files:**
- Create: `apps/web/src/components/connections/PostgresForm.tsx`
- Modify: `apps/web/src/components/connections/AddConnectionDialog.tsx`
- Modify: `apps/web/src/lib/connections/providers.ts`

**Expected Outcome:**
- Users can add PostgreSQL connections via UI
- Form fields: host, port, database, username, password (or connection string)
- Connection tested before saving
- Credentials encrypted in database

**Implementation Details:**

1. Create `PostgresForm.tsx` following pattern from `OpenAIForm.tsx`:
```tsx
interface PostgresFormProps {
  onSubmit: (config: PostgresConfig) => void;
  initialValues?: Partial<PostgresConfig>;
}

interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}
```

2. Add postgres to provider definitions in `providers.ts`
3. Update `AddConnectionDialog.tsx` to show postgres option

**Verification:**
- Can add a PostgreSQL connection via settings UI
- Connection test validates credentials
- Connection appears in connections list

---

### Task 2.2: Create MySQL Connection Form

**Files:**
- Create: `apps/web/src/components/connections/MySQLForm.tsx`
- Modify: `apps/web/src/components/connections/AddConnectionDialog.tsx`
- Modify: `apps/web/src/lib/connections/providers.ts`

**Expected Outcome:**
- Users can add MySQL connections via UI
- Same fields as PostgreSQL
- Connection tested before saving

**Implementation Details:**
- Mirror PostgreSQL form structure
- Add mysql to provider definitions

**Verification:**
- Can add a MySQL connection via settings UI
- Connection test validates credentials

---

### Task 2.3: Complete MySQL Introspection (PK/FK Detection)

**Files:**
- Modify: `apps/web/src/lib/baleybot/tools/connection-derived/schema-introspection.ts`

**Expected Outcome:**
- MySQL introspection detects primary keys
- MySQL introspection detects foreign keys
- Schema information matches PostgreSQL quality

**Implementation Details:**

Add MySQL PK/FK queries:
```typescript
const MYSQL_PRIMARY_KEYS_QUERY = `
SELECT
  TABLE_NAME as table_name,
  COLUMN_NAME as column_name
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME = 'PRIMARY'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
`;

const MYSQL_FOREIGN_KEYS_QUERY = `
SELECT
  TABLE_NAME as table_name,
  COLUMN_NAME as column_name,
  REFERENCED_TABLE_NAME as foreign_table,
  REFERENCED_COLUMN_NAME as foreign_column
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IS NOT NULL;
`;
```

**Verification:**
- Introspect MySQL database with foreign keys
- Verify PK and FK information is captured

---

### Task 2.4: Implement Database Query Execution Layer

**Files:**
- Create: `apps/web/src/lib/baleybot/services/database-executor.ts`
- Modify: `apps/web/src/lib/connections/test.ts` (add query execution)

**Expected Outcome:**
- Can execute SQL queries against connected databases
- Connection pooling for efficiency
- Proper error handling and timeouts
- Query results returned as JSON

**Implementation Details:**

1. Create `database-executor.ts`:
```typescript
import { Pool } from 'pg';
import mysql from 'mysql2/promise';

interface QueryExecutor {
  execute(sql: string): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

function createPostgresExecutor(config: PostgresConfig): QueryExecutor
function createMySQLExecutor(config: MySQLConfig): QueryExecutor

// Factory based on connection type
function createQueryExecutor(connection: Connection): QueryExecutor
```

2. Add connection pooling with reasonable defaults
3. Add query timeout (30 seconds default)

**Verification:**
- Execute SELECT query against PostgreSQL
- Execute SELECT query against MySQL
- Verify proper error on invalid SQL

---

### Task 2.5: Wire Database Tools to Catalog Service

**Files:**
- Modify: `apps/web/src/lib/baleybot/tools/catalog-service.ts`
- Create: `apps/web/src/lib/baleybot/tools/connection-tools-generator.ts`

**Expected Outcome:**
- When workspace has database connection, tool catalog includes database tool
- Tool is schema-aware (knows tables, columns, relationships)
- Tool uses natural language → SQL translation

**Implementation Details:**

1. Create `connection-tools-generator.ts`:
```typescript
async function generateConnectionTools(
  workspaceId: string
): Promise<ToolDefinition[]> {
  // 1. Get all database connections for workspace
  // 2. For each connection:
  //    a. Get cached schema (or introspect if stale)
  //    b. Generate tool definition with schema context
  // 3. Return array of tools
}

async function generateConnectionRuntimeTools(
  workspaceId: string,
  ctx: BuiltInToolContext
): Promise<Map<string, RuntimeToolDefinition>> {
  // 1. Get connections
  // 2. For each, create runtime tool with:
  //    - Schema context for AI
  //    - Query executor bound to connection
  //    - SQL validation
}
```

2. Update `catalog-service.ts` to call generator
3. Cache introspected schemas (refresh on demand or after 24h)

**Verification:**
- Add PostgreSQL connection to workspace
- Tool catalog includes `database_<connection_id>` tool
- Tool description includes table names

---

### Task 2.6: Implement Natural Language to SQL Translation

**Files:**
- Create: `apps/web/src/lib/baleybot/services/nl-to-sql-service.ts`

**Expected Outcome:**
- Given natural language query + schema context, generates SQL
- Uses AI model (configurable, defaults to fast model)
- Returns both SQL and explanation

**Implementation Details:**

1. Create `nl-to-sql-service.ts`:
```typescript
interface NLToSQLResult {
  sql: string;
  explanation: string;
  operationType: 'read' | 'write';
}

async function translateToSQL(
  naturalLanguage: string,
  schemaContext: string,
  dbType: 'postgres' | 'mysql'
): Promise<NLToSQLResult>
```

2. System prompt includes:
   - Schema information
   - Database type (for syntax differences)
   - Safety guidelines (parameterized queries, etc.)

**Verification:**
- "Show me all users" → `SELECT * FROM users`
- "Count orders by status" → `SELECT status, COUNT(*) FROM orders GROUP BY status`
- Verify correct dialect for PostgreSQL vs MySQL

---

## Phase 3: Triggers & Scheduling

### Task 3.1: Create Vercel Cron Endpoint for Scheduled Tasks

**Files:**
- Create: `apps/web/src/app/api/cron/process-scheduled-tasks/route.ts`
- Create: `vercel.json` (or update if exists)

**Expected Outcome:**
- Vercel calls endpoint every minute
- Endpoint queries due scheduled tasks
- Executes each due task
- Updates task status (completed, failed, next run for cron)

**Implementation Details:**

1. Create cron endpoint:
```typescript
// apps/web/src/app/api/cron/process-scheduled-tasks/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Verify cron secret (Vercel adds this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Query due tasks
  const dueTasks = await db.query.scheduledTasks.findMany({
    where: and(
      eq(scheduledTasks.status, 'pending'),
      lte(scheduledTasks.runAt, new Date())
    ),
    limit: 10, // Process in batches
  });

  // Execute each task
  for (const task of dueTasks) {
    await processScheduledTask(task);
  }

  return NextResponse.json({ processed: dueTasks.length });
}
```

2. Create/update `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/process-scheduled-tasks",
      "schedule": "* * * * *"
    }
  ]
}
```

3. Add `CRON_SECRET` to environment variables

**Verification:**
- Deploy to Vercel
- Create scheduled task for 1 minute in future
- Verify task executes at scheduled time
- Verify cron tasks reschedule correctly

---

### Task 3.2: Implement Webhook Trigger Endpoint

**Files:**
- Create: `apps/web/src/app/api/webhooks/[workspaceId]/[baleybotId]/route.ts`
- Modify: `packages/db/src/schema.ts` (add webhook_secret to baleybots)

**Expected Outcome:**
- Each BB can have a unique webhook URL
- Webhook receives POST with JSON body
- Body passed as input to BB execution
- Optional signature verification for security

**Implementation Details:**

1. Create webhook endpoint:
```typescript
// Dynamic route: /api/webhooks/[workspaceId]/[baleybotId]
export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string; baleybotId: string } }
) {
  // 1. Validate workspace and BB exist
  // 2. Verify webhook signature (if configured)
  // 3. Parse request body as input
  // 4. Create execution record
  // 5. Execute BB with triggeredBy: 'webhook'
  // 6. Return execution ID and status
}
```

2. Add `webhookSecret` column to baleybots table
3. Add UI to view/regenerate webhook URL

**Verification:**
- Create BB with webhook trigger
- POST to webhook URL with JSON body
- Verify BB executes with body as input

---

### Task 3.3: Implement BB Completion Trigger

**Files:**
- Modify: `apps/web/src/lib/baleybot/executor.ts`
- Create: `apps/web/src/lib/baleybot/services/trigger-service.ts`

**Expected Outcome:**
- When BB completes, check for BBs waiting on its completion
- Trigger downstream BBs with completed BB's output
- Support `trigger: "bb_completion:<bb_name>"` in BAL

**Implementation Details:**

1. Create `trigger-service.ts`:
```typescript
interface Trigger {
  type: 'manual' | 'schedule' | 'webhook' | 'bb_completion';
  config?: {
    cron?: string;
    webhookSecret?: string;
    sourceBaleybot?: string;
  };
}

async function processCompletionTriggers(
  completedBaleybotId: string,
  workspaceId: string,
  output: unknown
): Promise<void> {
  // 1. Find BBs with trigger: bb_completion:<completed_bb_name>
  // 2. For each, create execution with completed BB's output as input
}
```

2. Update executor to call trigger service on completion

**Verification:**
- Create BB "analyzer" and BB "reporter"
- Reporter has trigger: `bb_completion:analyzer`
- Run analyzer → reporter automatically runs with analyzer's output

---

### Task 3.4: Add Trigger Configuration to BAL and UI

**Files:**
- Modify: `apps/web/src/lib/baleybot/generator.ts` (parse trigger config)
- Modify: `apps/web/src/lib/baleybot/types.ts` (add Trigger type)
- Create: `apps/web/src/components/baleybots/TriggerConfig.tsx`

**Expected Outcome:**
- BAL supports `"trigger": "schedule:0 9 * * *"` syntax
- UI shows current trigger and allows editing
- Visual indicator of trigger type on BB cards

**Implementation Details:**

1. Update BAL parser to extract trigger config:
```typescript
// In generator.ts
interface ParsedEntity {
  // ... existing fields
  trigger?: {
    type: 'manual' | 'schedule' | 'webhook' | 'bb_completion';
    value?: string; // cron expression, webhook id, or bb name
  };
}
```

2. Create `TriggerConfig.tsx`:
```tsx
interface TriggerConfigProps {
  baleybotId: string;
  currentTrigger: Trigger;
  onUpdate: (trigger: Trigger) => void;
}
```

**Verification:**
- BAL with `"trigger": "schedule:0 9 * * *"` parses correctly
- UI shows "Daily at 9am" for the BB
- Can change trigger via UI

---

## Phase 4: Data Flow & Storage

### Task 4.1: Implement Pipeline Execution for Sync Chains

**Files:**
- Modify: `apps/web/src/lib/baleybot/executor.ts`

**Expected Outcome:**
- `chain { bb1 bb2 bb3 }` executes synchronously
- Output of bb1 becomes input of bb2
- All BBs in chain share execution context
- If any BB fails, chain stops

**Implementation Details:**

The `composePipeline` function already handles basic chains. Enhance it:

1. Ensure output transformation between BBs
2. Add proper error propagation
3. Track individual BB statuses within chain

**Verification:**
- Create chain of 3 BBs
- Verify output flows correctly through chain
- Verify failure in middle BB stops chain

---

### Task 4.2: Implement Shared Storage for Async BBs

**Files:**
- Create: `apps/web/src/lib/baleybot/services/shared-storage-service.ts`
- Modify: `packages/db/src/schema.ts` (add shared_storage table)

**Expected Outcome:**
- BBs can write to shared storage location
- Downstream BBs can read from shared storage
- Storage scoped to workspace
- Supports JSON data

**Implementation Details:**

1. Add `baleybotSharedStorage` table:
```typescript
export const baleybotSharedStorage = pgTable('baleybot_shared_storage', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  key: varchar('key', { length: 255 }).notNull(),
  value: jsonb('value'),
  producerId: uuid('producer_id').references(() => baleybots.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

2. Create service for read/write operations
3. Add `shared_storage` built-in tool

**Verification:**
- BB1 writes `{ "summary": "..." }` to shared storage
- BB2 (different trigger) reads summary from shared storage

---

### Task 4.3: Implement Customer DB Integration for Operational Data

**Files:**
- Create: `apps/web/src/lib/baleybot/services/operational-storage-service.ts`
- Modify: `apps/web/src/lib/baleybot/tools/built-in/implementations.ts`

**Expected Outcome:**
- If workspace has connected DB marked as "operational", use it for BB data
- Execution results, analytics stored in customer's DB
- Fallback to BaleyUI DB if no operational DB configured

**Implementation Details:**

1. Add `isOperational` flag to connections:
```typescript
// In schema.ts, add to connections table
isOperational: boolean('is_operational').default(false)
```

2. Create operational storage service:
```typescript
interface OperationalStorage {
  storeExecutionResult(execution: ExecutionResult): Promise<void>;
  storeAnalytics(metrics: AnalyticsData): Promise<void>;
}

function createOperationalStorage(workspaceId: string): OperationalStorage {
  // Check for operational DB connection
  // If found, create tables if needed and use customer DB
  // If not, use BaleyUI DB
}
```

**Verification:**
- Mark a connected PostgreSQL as "operational"
- Run BB, verify execution result stored in customer's DB
- Remove operational flag, verify fallback to BaleyUI DB

---

## Phase 5: Analytics

### Task 5.1: Implement Analytics Schema Parser

**Files:**
- Create: `apps/web/src/lib/baleybot/analytics/schema-parser.ts`
- Modify: `apps/web/src/lib/baleybot/generator.ts`

**Expected Outcome:**
- BAL `"analytics"` block parsed correctly
- Supports: count, average, percentage, top_n, trend, distribution
- Validates metric definitions

**Implementation Details:**

1. Create `schema-parser.ts`:
```typescript
interface MetricDefinition {
  name: string;
  type: 'count' | 'average' | 'percentage' | 'top_n' | 'trend' | 'distribution';
  field?: string;
  condition?: string;
  n?: number;
}

interface AnalyticsSchema {
  track: MetricDefinition[];
  compare?: 'day_over_day' | 'week_over_week' | 'month_over_month';
  alertWhen?: string;
}

function parseAnalyticsSchema(config: unknown): AnalyticsSchema
function validateAnalyticsSchema(schema: AnalyticsSchema): ValidationResult
```

2. Update generator to extract analytics config from BAL

**Verification:**
- Parse BAL with analytics block from design doc example
- Verify all metric types parsed correctly
- Invalid schema returns validation errors

---

### Task 5.2: Implement Metric Storage and Aggregation

**Files:**
- Create: `apps/web/src/lib/baleybot/analytics/metrics-service.ts`
- Modify: `packages/db/src/schema.ts` (add metrics tables)

**Expected Outcome:**
- Metrics recorded on each BB execution
- Aggregations computed (hourly, daily, weekly)
- Historical data retained for trend analysis

**Implementation Details:**

1. Add metrics tables:
```typescript
export const baleybotMetrics = pgTable('baleybot_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  baleybotId: uuid('baleybot_id').references(() => baleybots.id),
  metricName: varchar('metric_name', { length: 255 }),
  metricType: varchar('metric_type', { length: 50 }),
  value: doublePrecision('value'),
  dimensions: jsonb('dimensions'), // For top_n, distribution
  timestamp: timestamp('timestamp').defaultNow(),
});

export const baleybotMetricAggregates = pgTable('baleybot_metric_aggregates', {
  id: uuid('id').primaryKey().defaultRandom(),
  baleybotId: uuid('baleybot_id').references(() => baleybots.id),
  metricName: varchar('metric_name', { length: 255 }),
  period: varchar('period', { length: 20 }), // 'hour', 'day', 'week'
  periodStart: timestamp('period_start'),
  value: doublePrecision('value'),
  sampleCount: integer('sample_count'),
});
```

2. Create metrics service with aggregation functions

**Verification:**
- Run BB 10 times
- Verify raw metrics recorded
- Verify daily aggregate computed

---

### Task 5.3: Create Analytics Dashboard Components

**Files:**
- Create: `apps/web/src/components/analytics/MetricCard.tsx`
- Create: `apps/web/src/components/analytics/TrendChart.tsx`
- Create: `apps/web/src/components/analytics/TopNList.tsx`
- Create: `apps/web/src/components/analytics/AnalyticsDashboard.tsx`

**Expected Outcome:**
- Dashboard shows quantitative metrics (charts, numbers)
- Supports all metric types with appropriate visualizations
- Shows trends and comparisons

**Implementation Details:**

1. `MetricCard.tsx`: Single metric with value and trend arrow
2. `TrendChart.tsx`: Line chart for time series (use recharts or similar)
3. `TopNList.tsx`: Ranked list for top_n metrics
4. `AnalyticsDashboard.tsx`: Grid layout combining all metric visualizations

**Verification:**
- View dashboard for BB with analytics config
- See metrics visualized appropriately
- Trend comparison shows week-over-week

---

### Task 5.4: Implement Alert System

**Files:**
- Create: `apps/web/src/lib/baleybot/analytics/alert-service.ts`
- Modify: `packages/db/src/schema.ts` (add alerts table)

**Expected Outcome:**
- Alerts triggered when `alert_when` conditions met
- Alerts create notifications for workspace users
- Alert history tracked

**Implementation Details:**

1. Add alerts table:
```typescript
export const baleybotAlerts = pgTable('baleybot_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  baleybotId: uuid('baleybot_id').references(() => baleybots.id),
  alertCondition: varchar('alert_condition', { length: 500 }),
  triggeredValue: doublePrecision('triggered_value'),
  status: varchar('status', { length: 20 }), // 'active', 'acknowledged', 'resolved'
  triggeredAt: timestamp('triggered_at').defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at'),
  acknowledgedBy: varchar('acknowledged_by', { length: 255 }),
});
```

2. Create alert evaluation service:
```typescript
async function evaluateAlerts(
  baleybotId: string,
  metrics: Map<string, number>
): Promise<void> {
  // Parse alert_when condition
  // Evaluate against current metrics
  // Create alert if triggered
  // Send notification
}
```

**Verification:**
- Create BB with `alert_when: "drop_off_rate > 40%"`
- Trigger condition artificially
- Verify notification sent and alert recorded

---

## Phase 6: Visual Editor

### Task 6.1: Implement BAL-to-Visual Renderer

**Files:**
- Create: `apps/web/src/lib/baleybot/visual/bal-to-nodes.ts`
- Create: `apps/web/src/components/visual-editor/ClusterDiagram.tsx`

**Expected Outcome:**
- BAL code rendered as visual node diagram
- Shows BBs as cards with connections
- Control flow (chain, when, parallel) visualized

**Implementation Details:**

1. Create `bal-to-nodes.ts`:
```typescript
interface VisualNode {
  id: string;
  type: 'baleybot' | 'trigger' | 'output';
  data: {
    name: string;
    goal: string;
    model?: string;
    trigger?: Trigger;
    tools: string[];
  };
  position: { x: number; y: number };
}

interface VisualEdge {
  id: string;
  source: string;
  target: string;
  type: 'chain' | 'conditional' | 'parallel';
  label?: string;
}

function balToVisual(balCode: string): { nodes: VisualNode[]; edges: VisualEdge[] }
```

2. Create `ClusterDiagram.tsx` using React Flow:
```tsx
import ReactFlow from 'reactflow';

interface ClusterDiagramProps {
  balCode: string;
  onNodeClick?: (nodeId: string) => void;
}
```

**Verification:**
- Render single BB as single node
- Render cluster (3 BBs in chain) as connected diagram
- Click node shows BB details

---

### Task 6.2: Implement Light Editing UI

**Files:**
- Create: `apps/web/src/components/visual-editor/NodeEditor.tsx`
- Create: `apps/web/src/components/visual-editor/VisualEditor.tsx`

**Expected Outcome:**
- Click BB node to edit: goal, model, trigger, output destinations
- Changes reflected in diagram
- Validation on edit (no structural changes in V1)

**Implementation Details:**

1. `NodeEditor.tsx`: Panel with form fields for editable properties
2. `VisualEditor.tsx`: Combines diagram + editor panel
3. Read-only for structure (no add/remove nodes in V1)

**Verification:**
- Click node, edit goal
- See goal update in diagram
- Model dropdown changes model

---

### Task 6.3: Implement Bidirectional Sync

**Files:**
- Create: `apps/web/src/lib/baleybot/visual/visual-to-bal.ts`
- Modify: `apps/web/src/components/visual-editor/VisualEditor.tsx`

**Expected Outcome:**
- Visual changes update BAL code
- BAL changes update visual diagram
- Toggle between Visual and Code views
- Conflict resolution: BAL is truth

**Implementation Details:**

1. Create `visual-to-bal.ts`:
```typescript
function visualToBAL(nodes: VisualNode[], edges: VisualEdge[]): string {
  // Convert visual representation back to BAL code
  // Preserve formatting where possible
}

function syncVisualChanges(
  originalBAL: string,
  nodeId: string,
  changes: Partial<VisualNode['data']>
): string {
  // Apply changes to specific node in BAL
  // Return updated BAL
}
```

2. Update VisualEditor with:
   - Code/Visual toggle
   - onChange handler for both views
   - Conflict detection (if BAL edited while visual open)

**Verification:**
- Edit in visual, see BAL update
- Edit BAL, see visual update
- Toggle between views preserves changes

---

## Phase 7: Cost & Errors

### Task 7.1: Implement Usage Tracking per BB

**Files:**
- Create: `apps/web/src/lib/baleybot/cost/usage-tracker.ts`
- Modify: `packages/db/src/schema.ts` (add usage table)
- Modify: `apps/web/src/lib/baleybot/executor.ts`

**Expected Outcome:**
- Track: execution count, tokens used, API calls, duration
- Per-BB and per-workspace aggregation
- Historical tracking for trends

**Implementation Details:**

1. Add usage table:
```typescript
export const baleybotUsage = pgTable('baleybot_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  baleybotId: uuid('baleybot_id').references(() => baleybots.id),
  executionId: uuid('execution_id').references(() => baleybotExecutions.id),
  tokenInput: integer('token_input'),
  tokenOutput: integer('token_output'),
  apiCalls: integer('api_calls'),
  toolCalls: integer('tool_calls'),
  durationMs: integer('duration_ms'),
  estimatedCost: doublePrecision('estimated_cost'),
  timestamp: timestamp('timestamp').defaultNow(),
});
```

2. Create usage tracker that hooks into executor
3. Cost estimation based on model pricing

**Verification:**
- Run BB, verify usage recorded
- View usage summary for BB
- See token counts and estimated cost

---

### Task 7.2: Implement Anomaly Detection Service

**Files:**
- Create: `apps/web/src/lib/baleybot/cost/anomaly-detector.ts`

**Expected Outcome:**
- Detect: unusual execution frequency, cost spikes, long-running executions
- Compare against baseline (rolling average)
- Configurable variance threshold (default 20%)

**Implementation Details:**

1. Create `anomaly-detector.ts`:
```typescript
interface AnomalyConfig {
  varianceThreshold: number; // default 0.2 (20%)
  lookbackDays: number; // default 7
}

interface Anomaly {
  type: 'frequency' | 'cost' | 'duration';
  baleybotId: string;
  currentValue: number;
  expectedValue: number;
  variance: number;
  message: string;
}

async function detectAnomalies(
  workspaceId: string,
  config?: AnomalyConfig
): Promise<Anomaly[]>
```

2. Run detection on each execution completion
3. Create notification if anomaly detected

**Verification:**
- Establish baseline (run BB 10 times)
- Trigger anomaly (run 50 times in short period)
- Verify anomaly detected and notification sent

---

### Task 7.3: Implement AI Optimization Suggestions

**Files:**
- Create: `apps/web/src/lib/baleybot/cost/optimization-suggester.ts`
- Create: `apps/web/src/components/baleybots/OptimizationPanel.tsx`

**Expected Outcome:**
- AI analyzes BB usage and suggests optimizations
- Suggestions: model downgrades, condition filters, batching
- Estimated savings shown

**Implementation Details:**

1. Create `optimization-suggester.ts`:
```typescript
interface OptimizationSuggestion {
  type: 'model_change' | 'add_filter' | 'batch_processing';
  description: string;
  currentCost: number;
  projectedCost: number;
  savingsPercent: number;
  implementation: string; // How to apply the optimization
}

async function generateOptimizations(
  baleybotId: string
): Promise<OptimizationSuggestion[]>
```

2. Use AI to analyze BAL code and usage patterns
3. Create UI panel showing suggestions

**Verification:**
- BB using expensive model for simple task
- Suggestion: "Switch to GPT-4o-mini - saves 60%"
- Apply suggestion, verify cost reduction

---

### Task 7.4: Implement Self-Healing Error Handlers

**Files:**
- Create: `apps/web/src/lib/baleybot/errors/self-healing-service.ts`
- Modify: `apps/web/src/lib/baleybot/executor.ts`

**Expected Outcome:**
- Transient errors: auto-retry with exponential backoff
- Data errors: log, skip, continue
- Tool failures: pause, diagnose, notify with suggested actions
- AI errors: retry with fallback model

**Implementation Details:**

1. Create `self-healing-service.ts`:
```typescript
interface ErrorHandler {
  canHandle(error: Error): boolean;
  handle(error: Error, context: ExecutorContext): Promise<ErrorResolution>;
}

interface ErrorResolution {
  action: 'retry' | 'skip' | 'fallback' | 'pause' | 'fail';
  message?: string;
  modifiedContext?: Partial<ExecutorContext>;
}

const errorHandlers: ErrorHandler[] = [
  new TransientErrorHandler(),
  new DataErrorHandler(),
  new ToolFailureHandler(),
  new AIErrorHandler(),
];

async function handleError(
  error: Error,
  context: ExecutorContext
): Promise<ErrorResolution>
```

2. Integrate into executor's catch block
3. Track self-healing success rate

**Verification:**
- Simulate API timeout → auto-retry succeeds
- Simulate rate limit → backoff and retry
- Simulate tool failure → notification with diagnosis

---

## Phase 8: Dynamic Tools

### Task 8.1: Enhance create_agent with Full Execution

**Files:**
- Modify: `apps/web/src/lib/baleybot/services/ephemeral-agent-service.ts`
- Modify: `apps/web/src/lib/baleybot/tools/built-in/implementations.ts`

**Expected Outcome:**
- `create_agent` fully functional (not placeholder)
- Agent executes with real AI calls
- Agent can use tools from parent context
- Results returned to calling BB

**Implementation Details:**

Already planned in Task 1.3. Ensure full implementation.

**Verification:**
- Create agent that searches web and summarizes
- Verify real AI calls made
- Verify results returned correctly

---

### Task 8.2: Enhance create_tool with Full Execution

**Files:**
- Modify: `apps/web/src/lib/baleybot/services/ephemeral-tool-service.ts`
- Modify: `apps/web/src/lib/baleybot/tools/built-in/implementations.ts`

**Expected Outcome:**
- `create_tool` fully functional (not placeholder)
- NL implementation interpreted by AI
- Tool usable in subsequent calls

**Implementation Details:**

Already planned in Task 1.4. Ensure full implementation.

**Verification:**
- Create tool with NL implementation
- Use tool in same execution
- Verify correct behavior

---

### Task 8.3: Implement Promotion Flow (Ephemeral → Permanent)

**Files:**
- Create: `apps/web/src/lib/baleybot/services/promotion-service.ts`
- Modify: `packages/db/src/schema.ts` (add workspace_tools table if needed)
- Create: `apps/web/src/components/baleybots/PromotionDialog.tsx`

**Expected Outcome:**
- User can promote useful ephemeral agents/tools to permanent
- Promoted items saved to workspace
- Available to all BBs in workspace

**Implementation Details:**

1. Create `promotion-service.ts`:
```typescript
interface PromotableItem {
  type: 'agent' | 'tool';
  config: EphemeralAgentConfig | EphemeralToolConfig;
  executionId: string;
  usageCount: number;
}

async function promoteToWorkspace(
  item: PromotableItem,
  workspaceId: string
): Promise<{ success: boolean; id: string }>
```

2. Track ephemeral item usage in execution
3. Show "Promote" button in execution details
4. Create dialog for naming/configuring promoted item

**Verification:**
- Create ephemeral tool during execution
- Click "Promote" in execution details
- Tool now appears in workspace tool catalog

---

### Task 8.4: Add Workspace Tools Management UI

**Files:**
- Create: `apps/web/src/components/workspace/WorkspaceToolsList.tsx`
- Create: `apps/web/src/components/workspace/ToolEditor.tsx`
- Create: `apps/web/src/app/dashboard/settings/tools/page.tsx`

**Expected Outcome:**
- Settings page shows all workspace tools
- Can edit/delete promoted tools
- Can manually create workspace tools

**Implementation Details:**

1. Create tools settings page
2. List all workspace tools (promoted + manually created)
3. Edit form for tool configuration
4. Delete with confirmation

**Verification:**
- View workspace tools in settings
- Edit a promoted tool's description
- Delete a tool, verify removed from catalog

---

## Integration & Polish

### Task 9.1: Creator Bot Tool Knowledge Update

**Files:**
- Modify: `apps/web/src/lib/baleybot/creator-bot.ts`

**Expected Outcome:**
- Creator Bot knows about all tools (built-in, connection-derived, workspace)
- Suggests appropriate tools based on user's goal
- Explains tool capabilities accurately

**Implementation Details:**

Update system prompt to include:
- Full tool catalog for workspace
- Tool selection guidelines
- Examples of tool usage in BAL

**Verification:**
- Ask Creator Bot to create BB that searches web
- Verify it uses `web_search` tool correctly
- Ask about database queries, verify it references connection tools

---

### Task 9.2: End-to-End Testing Suite

**Files:**
- Create: `apps/web/src/__tests__/e2e/tool-ecosystem.test.ts`

**Expected Outcome:**
- E2E tests for critical paths
- Tests run in CI/CD

**Test Cases:**
1. Create BB with web_search, execute, verify results
2. Add database connection, verify tool generated
3. Create scheduled task, verify execution via cron
4. Test BB chaining (spawn_baleybot)
5. Test analytics recording
6. Test cost tracking

**Verification:**
- All tests pass
- Tests run in CI

---

### Task 9.3: Documentation Update

**Files:**
- Create: `docs/tool-ecosystem-guide.md`
- Update: `README.md`

**Expected Outcome:**
- User-facing documentation for tools
- Developer guide for extending tools
- API reference for tool creation

**Verification:**
- Documentation reviewed and accurate
- Examples work as documented

---

## Summary

**Total Tasks:** 35 tasks across 8 phases + integration

**Phase Breakdown:**
- Phase 1: 4 tasks (built-in tools completion)
- Phase 2: 6 tasks (connection-derived tools)
- Phase 3: 4 tasks (triggers & scheduling)
- Phase 4: 3 tasks (data flow & storage)
- Phase 5: 4 tasks (analytics)
- Phase 6: 3 tasks (visual editor)
- Phase 7: 4 tasks (cost & errors)
- Phase 8: 4 tasks (dynamic tools)
- Integration: 3 tasks

**Dependencies:**
- Phase 1 unblocks everything
- Phase 2 depends on Phase 1
- Phase 3 can run parallel to Phase 2
- Phase 4-8 depend on Phases 1-3 basics
- Integration tasks are last

**Recommended Execution Order:**
1. Tasks 1.1-1.4 (complete built-in tools)
2. Tasks 3.1-3.2 (cron + webhooks)
3. Tasks 2.1-2.6 (database tools)
4. Tasks 3.3-3.4 (BB completion trigger)
5. Tasks 4.1-4.3 (data flow)
6. Tasks 5.1-5.4 (analytics)
7. Tasks 6.1-6.3 (visual editor)
8. Tasks 7.1-7.4 (cost & errors)
9. Tasks 8.1-8.4 (dynamic tools)
10. Tasks 9.1-9.3 (integration)
