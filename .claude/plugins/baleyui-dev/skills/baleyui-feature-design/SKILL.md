---
name: baleyui-feature-design
description: AI-first design philosophy for BaleyUI features. Use when planning a new feature, designing a system component, brainstorming architecture, or proposing approaches. Use alongside brainstorming and writing-plans skills.
---

# BaleyUI Feature Design — AI-First

Every BaleyUI feature should default to BaleyBot intelligence over deterministic code. This skill ensures your designs follow the AI-first philosophy.

## When This Skill Applies

- Planning a new feature or system component
- Brainstorming architecture or proposing approaches
- Reviewing whether a design is "BaleyUI-native"
- Any time you're about to write business logic — ask "should a BaleyBot do this instead?"

## How This Works With Other Skills

- **brainstorming** drives the process (phases, structure) → this skill shapes the **content** of each phase
- During "Propose approaches" → ensure at least one approach is fully AI-first
- During "Present design" → run the design checklist below
- **writing-plans** defines task breakdown → this skill ensures tasks specify which BaleyBot handles logic
- **feature-dev** Phase 4 (architecture) → use the approach template below

---

## 1. AI-First Decision Tree

For every piece of functionality, walk this tree top-to-bottom. Stop at the first level that works.

### Level 1: Existing Internal BaleyBot

Check if an internal BB already handles this. Internal bots cover:

| Category | Bots |
|----------|------|
| **Creation** | `baley`, `creator_action_advisor`, `bal_generator` |
| **Testing** | `test_orchestrator`, `test_generator`, `test_validator`, `test_results_analyzer`, `test_interface_designer` |
| **Deployment** | `deployment_advisor`, `connection_advisor`, `integration_builder` |
| **Intelligence** | `pattern_learner`, `execution_reviewer`, `context_processor` |
| **Data** | `nl_to_sql_postgres`, `nl_to_sql_mysql` |
| **Utility** | `web_search_fallback`, `tool_executor` |

If an existing bot can do it → use `executeInternalBaleybot()`. Done.

### Level 2: New BaleyBot via BAL Composition

If no existing bot fits, can you compose a new one? BAL compositions:

| Composition | Use When |
|-------------|----------|
| `chain { a b }` | Steps must happen in sequence |
| `parallel { a b }` | Independent analyses can run concurrently |
| `if/else` | Binary branching on a condition |
| `loop` | Iterative refinement until quality threshold |
| `try/catch` | Graceful error handling with retry or fallback |
| `route(classifier)` | Multi-way dispatch based on AI classification |
| `gate(condition)` | Conditional execution (skip if not needed) |
| `filter(predicate)` | Process only items matching criteria |
| `processor(transform)` | Data extraction or transformation |
| `map` | Apply a bot to each item in an array |

Compose entities into a BAL program → save as a new internal or user BaleyBot.

### Level 3: Built-in Tool

Can a built-in tool empower a BaleyBot to do it? Available tools:

| Tool | Enables |
|------|---------|
| `web_search` | Real-time information gathering |
| `fetch_url` | Reading external content |
| `spawn_baleybot` | Orchestrating other BBs |
| `send_notification` | User communication |
| `store_memory` | Persistent cross-execution state |
| `shared_storage` | Cross-BB workspace data |
| `request_user_input` | Mid-execution user interaction |
| `schedule_task` | Temporal automation |
| `create_agent` | Runtime agent creation |
| `create_tool` | Runtime tool creation |

If a BB + tool combination solves it → define the BB with the tool in its tools list. Done.

### Level 4: New Tool for BaleyBots

Does this need a new capability that BaleyBots can use? Examples:
- A new connection-derived tool (e.g., `query_redis` from a Redis connection)
- A new workspace tool (user-defined via `create_tool`)
- A new built-in tool (rare — requires core changes)

Build the tool → give it to BaleyBots. The **logic** still lives in the BB.

### Level 5: Deterministic Code (Last Resort)

Only write traditional code for:
- Database operations (schema, migrations, queries)
- Authentication and authorization
- Streaming infrastructure (SSE, WebSockets)
- HTTP routing and API endpoints
- UI components (rendering, layout, interaction)
- Encryption and security primitives

Even at this level, the UI should serve as a **workspace for AI**, not a manual control panel.

---

## 2. Design Checklist

Before finalizing any feature design, verify each item:

- [ ] **User-facing decisions** are made by BaleyBots, not hard-coded logic
- [ ] **Workflows** are adaptive (BB-driven), not rigid (step-by-step wizard)
- [ ] **UI** provides a workspace for AI to operate, not a manual control panel
- [ ] **Manual processes** are replaced by BB intelligence where possible
- [ ] **Error handling** uses self-healing (execution_reviewer, try/catch compositions) not just error displays
- [ ] **Routing/classification** uses `route()` or BB classifiers, not if/else trees
- [ ] **Data enrichment** uses BB chains, not hardcoded transformations
- [ ] **Scheduling/triggers** use `schedule_task` tool, not custom cron implementations
- [ ] **Cross-BB coordination** uses `spawn_baleybot` or `shared_storage`, not shared global state
- [ ] **Learning from usage** uses `pattern_learner` or similar BB, not static config

---

## 3. Anti-Pattern Recognition

| Traditional Approach | AI-First Alternative |
|---------------------|---------------------|
| Hard-coded review form for BB outputs | `execution_reviewer` bot + `bb_fn_show_diff` UI |
| Multi-step onboarding wizard | `baley` converses adaptively based on user responses |
| Preference page + cron job for notifications | BaleyBot + `schedule_task` + `pattern_learner` to learn timing |
| Error list with manual resolution forms | `execution_reviewer` analyzes errors + Actions Hub for one-click fixes |
| Rule-based content scanner | BAL `chain` with `route()` classification and `gate()` conditions |
| Dashboard with static metrics | BaleyBot that queries data (`nl_to_sql_*`) and generates insights |
| Manual template library | `bal_generator` creates BBs from natural language descriptions |
| Hard-coded API routing table | `route(classifier)` composition that dispatches to handler BBs |
| Static recommendation engine | `pattern_learner` that adapts recommendations from real usage |
| Manual test creation form | `test_orchestrator` + `test_generator` create tests from BB goal |
| Fixed deployment checklist | `deployment_advisor` evaluates readiness contextually |
| Rigid data pipeline | BAL `chain` with `try/catch` for self-healing and `loop` for refinement |

---

## 4. Approach Template

When proposing a feature design, structure it as:

```markdown
### Feature: [Name]

**BaleyBots involved:**
- [Which internal/new BBs handle the intelligence]

**BAL composition:**
- [How BBs are composed — chain, route, parallel, etc.]

**Tools needed:**
- [Which built-in or new tools BBs use]

**UI role:**
- [What the UI provides — workspace, display, interaction points]
- [NOT: what decisions the UI makes]

**User role:**
- [What the user does — initiate, review, approve]
- [NOT: manual multi-step processes]

**Deterministic code (infrastructure only):**
- [DB operations, API routes, streaming — the plumbing]
```

### Example: Smart Error Resolution

**BaleyBots involved:**
- `execution_reviewer` — analyzes failed executions, identifies root cause
- `pattern_learner` — recognizes recurring failure patterns
- New `error_resolver` BB — proposes and applies fixes

**BAL composition:**
```bal
chain {
  execution_reviewer => analysis
  route(analysis.errorType) {
    "bal_syntax": bal_generator with { fix: $analysis.suggestion },
    "missing_tool": connection_advisor with { needed: $analysis.missingTool },
    "model_error": error_resolver with { context: $analysis }
  }
}
```

**Tools needed:**
- `spawn_baleybot` (for delegation)
- `store_memory` (remember fixes for pattern learning)

**UI role:**
- Show error analysis from execution_reviewer
- Display proposed fix with diff view
- One-click "Apply fix" button

**User role:**
- Review proposed fix
- Approve or modify before applying

**Deterministic code:**
- tRPC endpoint to trigger error analysis
- DB update to apply the fix to BB definition

---

## 5. Integration Points

### With brainstorming skill

During **"Propose approaches"** phase:
- Generate at least one fully AI-first approach using this decision tree
- For each approach, identify which level of the decision tree it operates at
- Flag any approach that defaults to Level 5 (deterministic code) for logic that could be at Levels 1-4

During **"Present design"** phase:
- Run the design checklist
- Include the approach template structure
- Reference specific bots/tools/compositions from the capability map

### With writing-plans skill

During **task breakdown**:
- Each task should specify which BaleyBot handles the intelligence
- Separate "infrastructure tasks" (DB, API, UI scaffolding) from "intelligence tasks" (BB definition, BAL composition)
- Intelligence tasks come first — they define what the infrastructure needs to support

### With feature-dev skill

During **Phase 4 (Architecture)**:
- Use the approach template as the architecture specification
- Map each component to a level in the decision tree
- Verify no business logic lives in deterministic code

---

## References

- `references/patterns.md` — Detailed before/after examples from real BaleyUI patterns
- `references/capability-map.md` — Lookup tables by feature category, bot, and composition type
