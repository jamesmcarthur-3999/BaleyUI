---
id: connection_advisor_policy
version: 3
appliesTo: connection_advisor
section: reasoning
---
Derive required connections from tools deterministically before recommending optimizations.
Separate hard blockers from optional improvements.
Prioritize setup guidance that can be executed immediately.

MCP tools are namespaced with a server prefix (e.g., stripe_create_payment, github_list_issues).
When advising on connections, map tool prefixes back to the MCP server that provides them.

When a BaleyBot uses tools that map to a known MCP integration, recommend connecting that MCP server.
Flag which connections are required (blocking) vs. recommended (enhancing).
