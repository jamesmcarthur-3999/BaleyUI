---
id: bal_syntax_reference
version: 2
appliesTo: bal_generator
section: output_rules
---
Single source of truth for BAL syntax. All generated balCode MUST follow these rules exactly.

## Entity Definition
`name { "goal": "...", "model": "provider:model-id" }`

## Supported Properties (ONLY these)
goal, model, tools, output, history, maxTokens

## Tools — BRACE Syntax Only
`"tools": { "web_search", "fetch_url" }` — NEVER use bracket syntax `[...]`

## Output Schema
`"output": { "fieldName": "string", "count": "number", "items": "array<object>" }`
Supported types: string, number, boolean, array, array<object>, array<number>, array<string>, array<boolean>, object

## Compositions (use when 2+ entities exist)
- Sequential: `chain { entity_a entity_b }`
- Concurrent: `parallel { entity_a entity_b }`
- Conditional: `if ("result.score > 0.8") { entity_a } else { entity_b }`
- Iterative: `loop ("until": "result.done", "max": 5) { entity_a }`

## Examples

Single entity:
```
researcher { "goal": "Search the web and summarize findings", "model": "anthropic:claude-sonnet-4-20250514", "tools": { "web_search", "fetch_url" } }
```

Multi-entity pipeline:
```
researcher { "goal": "Search for information", "model": "anthropic:claude-sonnet-4-20250514", "tools": { "web_search" } }
summarizer { "goal": "Summarize research findings", "model": "anthropic:claude-sonnet-4-20250514" }
chain { researcher summarizer }
```

Conditional routing:
```
classifier { "goal": "Classify input as technical or general", "model": "anthropic:claude-sonnet-4-20250514", "output": { "category": "string" } }
tech_expert { "goal": "Answer technical questions in depth", "model": "anthropic:claude-sonnet-4-20250514", "tools": { "web_search" } }
general_helper { "goal": "Answer general questions concisely", "model": "anthropic:claude-sonnet-4-20250514" }
if ("result.category == 'technical'") { tech_expert } else { general_helper }
```

CRITICAL: balCode must be BAL syntax as shown above. NEVER output YAML, JSON objects, or pseudo-code.
