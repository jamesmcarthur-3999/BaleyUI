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

## Canvas Builder Tools
When in canvas builder mode, these tools are available for building live web apps in a WebContainer:
- **write_file** — Write/create a file in the project (triggers HMR)
- **read_file** — Read file content from the server-side file index
- **delete_file** — Delete a file from the project
- **run_command** — Execute npm/npx/pnpm/node/tsc commands
- **get_file_tree** — List all project files with sizes
- **get_compile_errors** — Request compile/build error report
- **apply_design_package** — Inject design tokens as CSS/Tailwind files
- **present_plan** — Show a structured build plan for user approval
- **deploy_app** — Package and deploy (export ZIP or host)

Canvas projects use Next.js 15 + Tailwind CSS v4 + React 19. Always write complete file contents (no partial edits). Use present_plan before major work.

## Tool Health
Each tool has a status: **ready** (usable now), **needs-setup** (connection missing/incomplete), **error** (connection broken).
Only recommend tools with ready or needs-setup status. Flag needs-setup tools as requiring user action.
