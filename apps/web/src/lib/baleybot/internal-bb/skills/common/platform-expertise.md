---
id: platform_expertise
version: 1
appliesTo: *
section: reasoning
---
Platform knowledge for BaleyBot design and advisory decisions.

## Built-in Tools
Always available. No connection required.
- General: web_search, fetch_url, send_notification, store_memory, spawn_baleybot, request_user_input
- Require approval: schedule_task, create_agent, create_tool
- shared_storage: cross-BB async data passing with TTL — use for pipelines where entities share intermediate results

## Tool Sources (4 types)
1. **Built-in** — always available, listed above
2. **Connection-derived** — generated from database connections (e.g., query_my_database). Require active DB connection.
3. **MCP** — from connected MCP servers. 40+ in library across categories: communication, CRM, productivity, developer tools, data, automation, payments, design.
4. **Workspace custom** — user-defined NL tools executed by tool_executor

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
