# BAL-First Architecture Migration

**Date:** February 1, 2026
**Status:** Draft - Pending Review
**Author:** James McArthur + Claude

---

## Executive Summary

This document outlines the migration from BaleyUI's current visual-flow-first architecture to a BAL-first (Baleybots Assembly Language) architecture. This change:

1. **Simplifies execution** - Replace ~3,400 lines of custom execution code with `Pipeline.from()`
2. **Prioritizes jobs** - Users describe what they need, AI generates BAL
3. **Enables refinement loops** - AI reviews results and suggests improvements
4. **Future-proofs** - Visual editor can be added later for enterprise without architectural changes

---

## Architecture Overview

### Before (Current)

```
User ──► Visual Flow Canvas ──► compileFlow() ──► FlowExecutor ──► Results
              │                      │                  │
              ▼                      ▼                  ▼
         nodes/edges            ExecutionGraph     node-executors/
         in database            validation         (ai-block, parallel,
                                                    router, loop, etc.)
```

**Problems:**
- Complex custom execution layer (~3,400 lines)
- Visual canvas is overkill for "get jobs done" use case
- Execution logic duplicates what BaleyBots DSL already provides

### After (BAL-First)

```
User ──► AI Companion ──► BAL Code ──► Pipeline.from() ──► StreamSegments ──► UI
              │               │              │                   │
              ▼               ▼              ▼                   ▼
         Understands      Stored as      BaleyBots           Rich display
         intent           source of      handles all         with Timeline,
                          truth          execution           Outputs, etc.
                              │
                              ▼
                        Review Agent ──► Suggestions ──► User accepts/modifies
```

**Benefits:**
- Execution handled entirely by BaleyBots (`Pipeline.from()`)
- BAL is readable, versionable, diffable
- AI can generate and refine BAL
- Visual representation derived from `Pipeline.getStructure()`

---

## New BaleyBots Features to Leverage

### 1. Pipeline API

```typescript
import { Pipeline } from '@baleybots/tools';

// Create from BAL code
const pipeline = Pipeline.from(`
  categorizer {
    "goal": "Categorize support ticket by urgency (low/medium/high/critical)",
    "output": { "urgency": "string", "reason": "string" }
  }

  router {
    "goal": "Route to appropriate team based on category"
  }

  chain { categorizer router }
`);

// Execute with streaming
const result = await pipeline.process(ticketContent, {
  onToken: (botName, event) => {
    // StreamSegments for UI
  }
});

// Inspect structure for visualization
const structure = pipeline.getStructure();
// { type: 'chain', steps: [{ type: 'entity', name: 'categorizer' }, ...] }
```

### 2. StreamSegments (Canonical UI Representation)

From `@baleybots/core`:

```typescript
type StreamSegment =
  | TextSegment              // Streaming text
  | ToolCallSegment          // Tool execution with lifecycle
  | ReasoningSegment         // Extended thinking
  | StructuredOutputSegment  // Schema-based outputs
  | ErrorSegment             // Inline errors
  | SpawnAgentSegment        // Child agent execution
  | SequentialThinkingSegment // Thought chains
  | DSLPipelineSegment       // DSL pipeline state
  | DoneSegment              // Completion marker
```

Replaces custom streaming types in BaleyUI.

### 3. Per-Entity History Control

```bal
// Analyzer gets fresh context each time
analyzer {
  "goal": "Analyze sentiment objectively",
  "history": "none"
}

// Chatbot continues conversation
chatbot {
  "goal": "Respond helpfully",
  "history": "inherit"
}
```

### 4. New Tools

| Tool | Purpose |
|------|---------|
| `webSearchTool` | Tavily-powered web search |
| `sequentialThinkTool` | Step-by-step reasoning with branches |
| `spawnBaleybotTool` | Hierarchical agent delegation |

---

## Components to Remove

### Execution Layer (apps/web/src/lib/execution/)

| File | Lines | Reason for Removal |
|------|-------|-------------------|
| `flow-executor.ts` | ~627 | Replaced by `Pipeline.from().process()` |
| `state-machine.ts` | ~150 | Pipeline handles state internally |
| `node-executors/ai-block.ts` | ~296 | Replaced by DSL entity |
| `node-executors/parallel.ts` | ~148 | Replaced by `parallel { }` block |
| `node-executors/router.ts` | ~100 | Replaced by `if/else` blocks |
| `node-executors/loop.ts` | ~120 | Replaced by `loop { }` block |
| `node-executors/function-block.ts` | ~80 | Can still use `Deterministic` directly if needed |
| `node-executors/source.ts` | ~40 | Not needed - input passed to `process()` |
| `node-executors/sink.ts` | ~40 | Not needed - output returned from `process()` |

**Total: ~1,600 lines removed**

### Flow Compilation (apps/web/src/lib/baleybots/)

| File | Lines | Reason for Removal |
|------|-------|-------------------|
| `compiler.ts` | ~200 | Not needed - BAL is source of truth |

### Visual Flow Canvas (partial removal)

The visual flow canvas (`FlowCanvas.tsx`, etc.) can be:
- **Removed entirely** for MVP
- **Kept as read-only visualization** using `Pipeline.getStructure()`
- **Enhanced later** for enterprise visual editing

---

## Components to Add

### 1. BAL Storage Schema

```typescript
// In packages/db/src/schema.ts
export const pipelines = pgTable('pipelines', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  description: text('description'),

  // BAL code is the source of truth
  balCode: text('bal_code').notNull(),

  // Cached structure for quick visualization (regenerated on save)
  structure: jsonb('structure'),

  // Metadata
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: text('created_by').references(() => users.id),

  // Versioning
  version: integer('version').notNull().default(1),

  // Soft delete
  deletedAt: timestamp('deleted_at'),
});
```

### 2. BAL Generation Service

The BAL generator is context-aware - it understands available tools, workspace policies, and curates tool access per entity at design time.

```typescript
// apps/web/src/lib/bal/generator.ts
import { Baleybot } from '@baleybots/core';

interface GeneratorContext {
  workspaceId: string;
  availableTools: ToolDefinition[];
  workspacePolicies: WorkspacePolicies;
  connections: Connection[];
}

export function createBalGenerator(ctx: GeneratorContext) {
  // Build tool catalog for the generator
  const toolCatalog = buildToolCatalog(ctx);

  return Baleybot.create({
    name: 'bal-generator',
    goal: `Generate BAL (Baleybots Assembly Language) code based on user's job description.

BAL Syntax Reference:
- Entities: name { "goal": "...", "tools": [...], "can_request": [...] }
- Sequential: chain { a b c }
- Parallel: parallel { a b c }
- Conditional: if ("condition") { a } else { b }
- Loop: loop ("until": "condition", "max": N) { a }

TOOL ASSIGNMENT RULES:
- "tools": Tools the entity can use immediately (safe for goal)
- "can_request": Tools that require user approval before use
- Only assign tools that are necessary for the entity's specific goal
- Prefer minimal tool sets - less is more
- Never assign tools forbidden by workspace policy

AVAILABLE TOOLS:
${toolCatalog.safe.map(t => `- ${t.name}: ${t.description} [SAFE]`).join('\n')}
${toolCatalog.requiresApproval.map(t => `- ${t.name}: ${t.description} [NEEDS APPROVAL]`).join('\n')}

FORBIDDEN (never assign):
${toolCatalog.forbidden.map(t => `- ${t.name}`).join('\n')}

Generate clean, focused pipelines with appropriate tool assignments.`,

    model: anthropic('claude-sonnet-4-20250514'),

    outputSchema: z.object({
      balCode: z.string().describe('The generated BAL code with tool assignments'),
      explanation: z.string().describe('Brief explanation of what the pipeline does'),
      entities: z.array(z.object({
        name: z.string(),
        goal: z.string(),
        tools: z.array(z.string()),
        canRequest: z.array(z.string()),
      })),
      toolRationale: z.record(z.string()).describe('Why each tool was assigned'),
    }),
  });
}

function buildToolCatalog(ctx: GeneratorContext): ToolCatalog {
  const { availableTools, workspacePolicies } = ctx;

  return {
    safe: availableTools.filter(t =>
      !workspacePolicies.forbidden.includes(t.name) &&
      !workspacePolicies.requiresApproval.includes(t.name)
    ),
    requiresApproval: availableTools.filter(t =>
      workspacePolicies.requiresApproval.includes(t.name)
    ),
    forbidden: availableTools.filter(t =>
      workspacePolicies.forbidden.includes(t.name)
    ),
  };
}
```

**Generated BAL example:**

```bal
// User asked: "Help customers with billing questions"

support_agent {
  "goal": "Answer customer billing questions accurately and helpfully",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": ["query_customer_data", "knowledge_base_search"],
  "can_request": ["modify_subscription", "escalate_to_human"],
  "output": {
    "response": "string",
    "resolved": "boolean",
    "escalation_needed": "boolean"
  }
}

chain { support_agent }
```

The generator's `toolRationale` output provides audit trail:

```json
{
  "toolRationale": {
    "query_customer_data": "Needed to look up customer's billing history and current plan",
    "knowledge_base_search": "Find relevant help articles and policies",
    "modify_subscription": "May need to process refunds - requires approval",
    "escalate_to_human": "Complex issues may need human intervention - requires approval"
  }
}
```
```

### 3. Pipeline Execution Service

```typescript
// apps/web/src/lib/bal/executor.ts
import { Pipeline } from '@baleybots/tools';
import { db, pipelines, pipelineExecutions } from '@baleyui/db';

export async function executePipeline(
  pipelineId: string,
  input: unknown,
  options?: {
    onSegment?: (segment: StreamSegment) => void;
    signal?: AbortSignal;
  }
) {
  // Load pipeline
  const pipeline = await db.query.pipelines.findFirst({
    where: eq(pipelines.id, pipelineId),
  });

  if (!pipeline) throw new Error('Pipeline not found');

  // Create execution record
  const [execution] = await db.insert(pipelineExecutions).values({
    pipelineId,
    status: 'running',
    input,
    startedAt: new Date(),
  }).returning();

  try {
    // Execute via BaleyBots Pipeline
    const bal = Pipeline.from(pipeline.balCode, {
      model: 'anthropic:claude-sonnet-4-20250514', // or from connection
    });

    const result = await bal.process(input, {
      onToken: (botName, event) => {
        options?.onSegment?.(event);
      },
      signal: options?.signal,
    });

    // Update execution record
    await db.update(pipelineExecutions)
      .set({ status: 'completed', output: result, completedAt: new Date() })
      .where(eq(pipelineExecutions.id, execution.id));

    return result;
  } catch (error) {
    await db.update(pipelineExecutions)
      .set({ status: 'failed', error: error.message, completedAt: new Date() })
      .where(eq(pipelineExecutions.id, execution.id));
    throw error;
  }
}
```

### 4. Review Agent

```typescript
// apps/web/src/lib/agents/review-agent.ts
import { Baleybot } from '@baleybots/core';

export const reviewAgent = Baleybot.create({
  name: 'pipeline-reviewer',
  goal: `Review pipeline execution results against user intent.

  Analyze:
  1. Did the output match what the user asked for?
  2. Are there quality issues (incomplete, inaccurate, missing info)?
  3. Could the pipeline be improved?

  Provide specific, actionable suggestions for improvement.`,

  outputSchema: z.object({
    meetsIntent: z.boolean(),
    qualityScore: z.number().min(0).max(100),
    issues: z.array(z.object({
      type: z.enum(['incomplete', 'inaccurate', 'missing', 'format', 'other']),
      description: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
    })),
    suggestions: z.array(z.object({
      change: z.string().describe('What to change in the BAL code'),
      reason: z.string().describe('Why this would help'),
      balDiff: z.string().optional().describe('Suggested BAL code change'),
    })),
  }),
});
```

### 5. Results UI with Suggestions

```typescript
// apps/web/src/components/pipeline/PipelineResults.tsx
interface PipelineResultsProps {
  execution: PipelineExecution;
  segments: StreamSegment[];
  review?: ReviewResult;
}

export function PipelineResults({ execution, segments, review }: PipelineResultsProps) {
  return (
    <div className="space-y-4">
      {/* Execution Timeline */}
      <BehaviorTimeline segments={segments} />

      {/* Output Display */}
      <OutputDisplay output={execution.output} />

      {/* Review Suggestions */}
      {review && !review.meetsIntent && (
        <SuggestionsPanel
          suggestions={review.suggestions}
          onAccept={handleAcceptSuggestion}
          onModify={handleModifySuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}
    </div>
  );
}
```

---

## Migration Phases

### Phase 1: Add BAL Infrastructure (Week 1)

1. Add `pipelines` table to database schema
2. Create BAL generation service
3. Create pipeline execution service using `Pipeline.from()`
4. Add StreamSegment rendering components

**Deliverable:** Can create and execute pipelines via BAL code

### Phase 2: AI Generation Flow (Week 2)

1. Integrate BAL generator with AI Companion
2. Create "describe job → generate BAL → execute" flow
3. Add BAL code viewer (read-only initially)
4. Connect to existing event sourcing for audit

**Deliverable:** Users can describe jobs, AI generates and executes pipelines

### Phase 3: Review Loop (Week 3)

1. Implement review agent
2. Create suggestions UI
3. Add "accept suggestion" flow that modifies BAL
4. Store review history for learning

**Deliverable:** System suggests improvements, users can accept/modify

### Phase 4: Remove Old Execution Layer (Week 4)

1. Migrate any remaining flows to BAL format
2. Remove FlowExecutor and node executors
3. Remove or simplify visual flow canvas
4. Update tests

**Deliverable:** Clean codebase with BAL as only execution path

### Phase 5: Polish (Week 5)

1. Add BAL syntax highlighting in viewer
2. Add manual BAL editing for power users
3. Pipeline versioning and diff view
4. Performance optimization

**Deliverable:** Production-ready BAL-first system

---

## Updated Implementation Roadmap Impact

This replaces significant portions of the original roadmap:

| Original Phase | Status | Notes |
|----------------|--------|-------|
| Phase 0: Type Safety | **Keep** | Still needed |
| Phase 1: Event Sourcing | **Keep** | Still valuable for audit |
| Phase 2: Builder Views | **Modify** | Simplify to BAL editor + visualization |
| Phase 3: Output System | **Keep** | Still needed for result display |
| Phase 4: AI Companion | **Keep** | Primary interaction mode |
| Phase 5: Onboarding | **Keep** | Uses BAL generation |
| Phase 6: Polish | **Keep** | Adapt to new architecture |

**New work:**
- BAL infrastructure (replaces Phase 2 complexity)
- Review agent and suggestions loop

**Net effect:** Simpler architecture, faster to implement, more aligned with "jobs to be done" philosophy.

---

## Architectural Decisions

### 1. Model Selection: BAL-Driven

**Decision:** BAL code specifies models, with intelligent defaults.

**Rationale:**
- Agents may spawn sub-agents needing specific capabilities (vision, code execution, reasoning)
- Future local model support (Ollama) requires flexibility
- Different tasks have different cost/quality tradeoffs

```bal
// Explicit model for capability needs
vision_analyzer {
  "goal": "Analyze uploaded screenshots for UI issues",
  "model": "anthropic:claude-sonnet-4-20250514"  // Needs vision
}

// Fast model for simple classification
categorizer {
  "goal": "Classify as bug/feature/question",
  "model": "openai:gpt-4o-mini"  // Fast, cheap, sufficient
}

// Local model for sensitive data
pii_scanner {
  "goal": "Identify PII in documents",
  "model": "ollama:llama3.2"  // Stays on-premise
}

// No model specified = workspace default
summarizer {
  "goal": "Summarize the analysis"
}
```

**Implementation:** Model resolver checks:
1. Explicit model in BAL entity
2. Pipeline-level default
3. Workspace default connection
4. Environment auto-detection

### 2. Tool Provision: Context-Aware Curation

**Decision:** Tools are curated per-agent based on goal, context, and safety.

**Rationale:**
- Some tools are dangerous in wrong hands (file deletion, external API calls)
- Agent's goal determines what tools make sense
- Over-provisioning tools confuses agents and increases risk

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOOL CURATION LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Pipeline executes                                               │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Entity    │───▶│    Tool     │───▶│  Filtered   │         │
│  │   + Goal    │    │   Curator   │    │  Tool Set   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                            │                                     │
│                            ▼                                     │
│                     Considers:                                   │
│                     • Goal alignment                             │
│                     • Entity permissions                         │
│                     • Workspace policies                         │
│                     • Safety constraints                         │
│                     • Available connections                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Tool Categories:**

| Category | Examples | Access Level |
|----------|----------|--------------|
| **Safe** | text analysis, formatting, math | Always available |
| **Workspace** | database queries, API calls | Requires connection |
| **Privileged** | file system, code execution | Explicit grant |
| **Dangerous** | external requests, deletions | Admin approval + audit |

**Implementation Options:**

A. **Rules-based curator** - Static rules map goals to tool categories
B. **AI curator agent** - Lightweight agent decides tool access per-entity
C. **Hybrid** - Rules for common cases, AI for edge cases

*Recommendation: Start with rules-based, add AI curator for complex pipelines.*

### 3. Development Philosophy: Excellence Over Speed

**Decision:** No deadlines. Iterate until excellent.

**Implications:**
- Design decisions optimized for long-term quality
- Technical debt paid down immediately
- Architecture can evolve without "ship it" pressure
- Documentation and testing are first-class
- Each feature complete before moving to next

**Process:**
```
Design ──► Implement ──► Review ──► Refine ──► (repeat until excellent)
   ▲                                    │
   └────────────────────────────────────┘
```

### 4. Visual Editor: Future Enterprise Feature

When we add visual editing for enterprise:
- Generate BAL from visual changes
- Keep BAL as source of truth
- Visual is just a projection of `Pipeline.getStructure()`

---

## Success Criteria

1. **User can describe a job and get results in <60 seconds**
2. **BAL code is human-readable and editable**
3. **Review suggestions improve output quality over iterations**
4. **No custom execution code - all via BaleyBots Pipeline**
5. **Codebase is ~3,000 lines smaller**

---

*Document generated February 1, 2026*
