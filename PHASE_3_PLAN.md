# Phase 3: Execution Engine & Real-time Observability

## Overview

Phase 3 focuses on making the visual flows executable and providing real-time observability into executions. This connects the UI layer built in Phases 1-2 with actual BaleyBots runtime execution.

---

## 3.1 Flow Execution Engine

### Goal
Convert compiled flow graphs into executable BaleyBots compositions that run with full streaming support.

### Tasks

1. **BaleyBots Runtime Integration**
   - Create execution service (`lib/execution/flow-executor.ts`)
   - Implement node-to-processable mapping:
     - `ai-block` → `Baleybot.create()`
     - `function-block` → `Deterministic.create()`
     - `router` → `BaleybotRouter.create()`
     - `parallel` → `ParallelMerge`
     - `loop` → Custom loop handler
   - Add connection/credential injection at runtime
   - Handle nested bot execution (tools that spawn sub-bots)

2. **Execution State Machine**
   - States: `pending` → `running` → `completed/failed/cancelled`
   - Track per-node execution state
   - Handle partial failures (some nodes succeed, some fail)
   - Implement execution resumption for failed flows

3. **Execution API Routes**
   - `POST /api/flows/[id]/execute` - Start execution
   - `GET /api/executions/[id]/stream` - SSE stream for execution events
   - `POST /api/executions/[id]/cancel` - Cancel running execution
   - `GET /api/executions/[id]/replay` - Replay completed execution

### Files to Create
```
apps/web/src/lib/execution/
├── flow-executor.ts       # Main execution engine
├── node-executors/
│   ├── ai-block.ts        # AI block executor
│   ├── function-block.ts  # Function block executor
│   ├── router.ts          # Router executor
│   ├── parallel.ts        # Parallel merge executor
│   └── loop.ts            # Loop executor
├── state-machine.ts       # Execution state management
└── credential-injector.ts # Runtime credential injection

apps/web/src/app/api/flows/[id]/execute/route.ts
apps/web/src/app/api/executions/[id]/stream/route.ts
apps/web/src/app/api/executions/[id]/cancel/route.ts
```

---

## 3.2 Execution Timeline

### Goal
Real-time visualization of flow executions with per-node status, timing, and outputs.

### Tasks

1. **Timeline Components**
   - `ExecutionTimeline` - Main timeline view
   - `NodeExecutionCard` - Individual node status card
   - `ExecutionStepper` - Step-by-step progress indicator
   - `LiveStreamViewer` - Real-time output viewer

2. **Real-time Updates**
   - SSE subscription hook (`useExecutionStream`)
   - Optimistic UI updates during execution
   - Auto-scroll to active node
   - Toast notifications for completion/failure

3. **Execution Detail View**
   - Input/output inspection per node
   - Token usage and cost tracking
   - Latency breakdown by node
   - Error stack traces with context

### Files to Create
```
apps/web/src/components/executions/
├── ExecutionTimeline.tsx
├── NodeExecutionCard.tsx
├── ExecutionStepper.tsx
├── LiveStreamViewer.tsx
├── ExecutionDetail.tsx
└── ExecutionList.tsx

apps/web/src/app/(dashboard)/executions/
├── page.tsx               # Executions list
└── [id]/page.tsx          # Execution detail
```

---

## 3.3 Block Testing Interface Enhancement

### Goal
Improve the existing block testing interface with streaming output and better UX.

### Tasks

1. **Streaming Test Output**
   - Real-time text streaming display
   - Tool call visualization with arguments
   - Structured output preview
   - Reasoning/thinking display (for models that support it)

2. **Test History**
   - Store test runs per block
   - Compare outputs between runs
   - Replay previous inputs
   - Export test cases

3. **Input Builder**
   - JSON schema-aware input form generator
   - Sample data generation
   - Input validation with error messages

### Files to Modify/Create
```
apps/web/src/components/blocks/
├── BlockTestPanel.tsx     # Enhanced test panel
├── StreamingOutput.tsx    # Real-time output display
├── InputBuilder.tsx       # Schema-aware input form
└── TestHistory.tsx        # Test run history
```

---

## 3.4 Webhook Triggers

### Goal
Enable flows to be triggered by external webhooks.

### Tasks

1. **Webhook Management**
   - Generate unique webhook URLs per flow
   - Secret-based authentication
   - Request validation (schema, headers, etc.)
   - Webhook logs and debugging

2. **Webhook API**
   - `POST /api/webhooks/[flowId]/[secret]` - Trigger endpoint
   - Request body → flow input mapping
   - Response formatting options

3. **UI Components**
   - Webhook configuration panel
   - URL copy/share functionality
   - Recent invocations log
   - Test webhook button

### Files to Create
```
apps/web/src/app/api/webhooks/[flowId]/[secret]/route.ts
apps/web/src/components/flows/WebhookConfig.tsx
apps/web/src/lib/trpc/routers/webhooks.ts
```

---

## 3.5 Pattern Detection (Foundation)

### Goal
Lay groundwork for automatic pattern extraction from decision feedback.

### Tasks

1. **Feedback Collection**
   - Enhanced feedback UI (beyond correct/incorrect)
   - Category tagging for decisions
   - Batch feedback operations

2. **Pattern Schema**
   - Define pattern data model (already in schema)
   - Pattern CRUD operations
   - Pattern-to-block association

3. **Basic Analytics**
   - Decision accuracy by block
   - Common failure patterns
   - Cost analysis by block/model

### Files to Create
```
apps/web/src/lib/trpc/routers/patterns.ts
apps/web/src/components/decisions/FeedbackForm.tsx
apps/web/src/components/analytics/BlockAnalytics.tsx
```

---

## 3.6 Error Handling & Resilience

### Goal
Production-grade error handling and recovery.

### Tasks

1. **Graceful Degradation**
   - Retry logic for transient failures
   - Fallback models when primary fails
   - Circuit breaker for external APIs

2. **Error Reporting**
   - Structured error logging
   - Error aggregation by type
   - Alerting hooks (for future integration)

3. **User-Facing Errors**
   - Clear error messages
   - Suggested remediation actions
   - Debug mode with full stack traces

---

## Implementation Order

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | 3.1 | Flow executor, state machine, basic API routes |
| 2 | 3.2 | Execution timeline UI, SSE streaming |
| 3 | 3.3 | Block testing enhancements |
| 4 | 3.4 | Webhook triggers |
| 5 | 3.5-3.6 | Pattern foundation, error handling |

---

## Dependencies

- BaleyBots SDK (assumed available)
- OpenAI/Anthropic API keys for testing
- PostgreSQL with existing schema

---

## Success Criteria

1. **Flow Execution**: Can execute a multi-node flow end-to-end
2. **Real-time Updates**: Execution progress visible in <100ms
3. **Error Recovery**: Graceful handling of API failures
4. **Webhook Triggers**: External systems can trigger flows
5. **Decision Tracking**: All AI decisions logged with feedback capability
