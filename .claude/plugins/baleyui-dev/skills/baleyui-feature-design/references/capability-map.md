# BaleyUI Capability Map

Structured lookup tables for mapping features to existing BaleyUI capabilities.

> **Note:** Bot and tool lists may grow over time. Check `internal-bb/source/specs.json` and `tools/built-in/index.ts` for the current canonical lists.

---

## By Feature Category

| Category | Internal Bots | Tools | Compositions |
|----------|---------------|-------|-------------|
| **Content generation** | `bal_generator`, `baley` | `web_search`, `fetch_url` | `chain`, `loop` (iterative refinement) |
| **Quality / improvement** | `execution_reviewer`, `pattern_learner` | `store_memory`, `spawn_baleybot` | `chain`, `route` (by error type) |
| **Testing** | `test_orchestrator`, `test_generator`, `test_validator`, `test_results_analyzer`, `test_interface_designer` | `spawn_baleybot` | `chain`, `parallel` (run tests concurrently) |
| **Deployment / ops** | `deployment_advisor`, `connection_advisor`, `integration_builder` | `schedule_task`, `send_notification` | `gate` (readiness checks) |
| **Data / queries** | `nl_to_sql_postgres`, `nl_to_sql_mysql` | `web_search`, `fetch_url` | `chain` (query → analyze) |
| **Orchestration** | `baley`, `creator_action_advisor` | `spawn_baleybot`, `create_agent` | `route`, `parallel`, `chain` |
| **User interaction** | `baley`, `context_processor` | `request_user_input`, `send_notification` | `gate` (ask only when needed) |
| **Error handling** | `execution_reviewer`, `tool_executor` | `store_memory` (remember fixes) | `try/catch`, `route` |
| **Learning / adaptation** | `pattern_learner`, `context_processor` | `store_memory`, `shared_storage` | `chain`, `loop` |

---

## By Internal Bot (Reverse Index)

| Bot | Best For | Typical Compositions |
|-----|----------|---------------------|
| `baley` | Conversational BB creation, understanding user intent | Entry point — delegates via `spawn_baleybot` |
| `creator_action_advisor` | Suggesting next steps in creator flow | Called by `baley` mid-conversation |
| `bal_generator` | Producing BAL code from descriptions | `chain` after baley analysis |
| `pattern_learner` | Mining approval/feedback data for rules | `chain` after execution_reviewer |
| `execution_reviewer` | Analyzing execution quality, suggesting fixes | `chain` → `route` (by issue type) |
| `nl_to_sql_postgres` | PostgreSQL query generation from natural language | `chain` (NL → SQL → execute → analyze) |
| `nl_to_sql_mysql` | MySQL query generation from natural language | `chain` (NL → SQL → execute → analyze) |
| `web_search_fallback` | Web search when no Tavily API key | Standalone or in `chain` |
| `connection_advisor` | Checking connection requirements for a BB | `gate` (only when BB needs connections) |
| `test_orchestrator` | Designing topology-aware test plans | `chain` with `test_generator` |
| `test_generator` | Creating test cases from BB goal | `parallel` (generate multiple test types) |
| `test_validator` | Semantically validating test results | `chain` after test execution |
| `test_results_analyzer` | Summarizing test run outcomes | `chain` after `test_validator` |
| `deployment_advisor` | Evaluating launch readiness | `gate` (check readiness dimensions) |
| `integration_builder` | Guiding integration setup | Conversational — delegates as needed |
| `test_interface_designer` | Designing optimal test UI per BB | Called during test setup |
| `tool_executor` | Running NL-defined workspace tools | Standalone execution |
| `context_processor` | Enriching and processing context | `chain` (preprocess → main bot) |

---

## By Composition Type

| Composition | When to Use | Example |
|-------------|-------------|---------|
| `chain { a b }` | Sequential processing where each step builds on the previous | Research → Write → Edit |
| `parallel { a b }` | Independent analyses that can run concurrently | Sentiment + Keywords + Topics |
| `if/else` | Binary decision between two paths | Quality > threshold? publish : revise |
| `loop ("until", "max")` | Iterative refinement toward a quality target | Edit → Review → Edit (until score > 8) |
| `loop + fallback branch` | Self-healing retries with explicit fallback | Retry refiner up to N times, then fallback |
| `classifier + nested if/else` | Multi-way dispatch based on classification | Classify ticket type, then branch to specialist |
| `if (condition)` | Skip a step if condition isn't met | Only review if flagged as sensitive |
| `map result.items { ... }` | Process each item from an array | Enrich each result item independently |
| `select { ... }` | Extract or reshape data between steps | Pull `data.results` for next step |
| `map` | Apply same bot to each item in array | Process each document independently |

### Composition Combinations

Common multi-level patterns:

```bal
# Research → Multi-analysis → Conditional routing
chain {
  researcher => data
  parallel {
    analyzer_a
    analyzer_b
  }
  if ("$combined_analysis.category == 'urgent'") {
    fast_handler
  } else {
    if ("$combined_analysis.category == 'normal'") {
      standard_handler
    } else {
      if ("batch_ready") { batch_processor }
    }
  }
}
```

```bal
# Self-healing pipeline
chain {
  processor
  validator
}

if ("$validator.hasIssues") {
  loop ("until": "result.quality > 0.8", "max": 3) {
    fixer
    validator
  }
} else {
  fallback_handler
}
```
