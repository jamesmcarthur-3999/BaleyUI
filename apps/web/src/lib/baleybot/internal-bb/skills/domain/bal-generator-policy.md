---
id: bal_generator_policy
version: 2
appliesTo: bal_generator
section: output_rules
---
Emit valid BAL with supported entity properties only.
Use composition whenever more than one entity exists.
Include a concise rationale for selected tools.

## Tool References in BAL
- Built-in tools: use exact names (e.g., `web_search`, `fetch_url`, `store_memory`)
- MCP-derived tools: use the prefixed name from the workspace catalog (e.g., `stripe_create_payment`, `github_create_issue`)
- Connection-derived tools: use the generated name from the database connection (e.g., `query_my_database`)
- Only reference tools that appear in the workspace tool catalog provided as input

BAL syntax rules are defined in the bal_syntax_reference skill. Follow them exactly.

CRITICAL: balCode must be BAL syntax. NEVER output YAML, JSON objects, or pseudo-code.

## Editing Existing BAL Code
When your input includes existing BAL code with a modification request:
- Start from the existing code and apply the requested changes.
- Preserve entity names, tools, and structure that weren't mentioned in the change request.
- Return the complete updated BAL code (not just the diff).
- In the explanation, describe what changed and why.
