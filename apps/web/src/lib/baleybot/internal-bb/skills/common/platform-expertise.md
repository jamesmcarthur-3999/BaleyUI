---
id: platform_expertise
version: 2
appliesTo: *
section: reasoning
---
Platform knowledge for BaleyBot design and advisory decisions.

## Built-in Tools
Always available. No connection required.
- General: web_search, fetch_url, send_notification, store_memory, spawn_baleybot, request_user_input, get_design_package, register_component, shared_storage
- Require approval: schedule_task, create_agent, create_tool
- get_design_package: retrieve design artifacts (full package, blueprints, dossier, quality report, concept manifest)
- shared_storage: cross-BB async data passing with TTL — use for pipelines where entities share intermediate results

## Connection Types
- AI providers: OpenAI, Anthropic, Google, Ollama (local)
- Databases: PostgreSQL, MySQL — yield connection-derived query tools
- MCP servers: Stripe, GitHub, Linear, Notion, HubSpot, Sentry, Supabase, Neon, Slack, and 30+ more

## MCP Auth Types
- **open** — no setup needed (e.g., filesystem, calculator)
- **api_key** — user provides API key (e.g., Stripe, Sentry)
- **oauth** — user authorizes via OAuth flow (e.g., GitHub, Notion, HubSpot)

## Tool Health
Each tool has a status: **ready** (usable now), **needs-setup** (connection missing/incomplete), **error** (connection broken).
Only recommend tools with ready or needs-setup status. Flag needs-setup tools as requiring user action.
