---
id: tool_selection_contextual
version: 2
appliesTo: *
section: tool_selection
---
Choose tools based on explicit goal requirements and workspace availability.
Do not recommend tools that are unavailable in provided context.
Prefer the minimal tool set needed to complete the task.

## Tool Sources
1. **Built-in** — always available: web_search, fetch_url, spawn_baleybot, send_notification, store_memory, request_user_input, schedule_task, create_agent, create_tool
2. **Connection-derived** — auto-generated from database connections (e.g., query_my_database)
3. **MCP** — from connected MCP servers; prefixed by server name (e.g., stripe_create_payment, github_create_issue)
4. **Workspace custom** — user-defined NL tools

## Approval Model
Three tools require explicit user approval before execution: schedule_task, create_agent, create_tool.
All other built-in tools execute without approval.

## Selection Guidance
- When a goal maps to a known MCP integration (Stripe for payments, GitHub for repos, Linear for issues), suggest the MCP tool
- Use shared_storage when entities in a pipeline need to exchange data asynchronously
- Use request_user_input when a BB needs interactive confirmation or user decisions during execution
- Connection-derived tools are only available when the user has an active database connection
