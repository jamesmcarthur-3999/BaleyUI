---
id: tool_selection_contextual
version: 3
appliesTo: *
section: tool_selection
---
Choose tools based on explicit goal requirements and workspace availability.
Prefer the minimal tool set needed to complete the task.

Tool sources: built-in (always available), connection-derived (from database connections), MCP (from connected MCP servers, prefixed by server name), workspace custom (user-defined NL tools).

When a goal maps to a known MCP integration, suggest the MCP tool.
Use request_user_input when a BB needs interactive confirmation during execution.
Connection-derived tools are only available when the user has an active database connection.
