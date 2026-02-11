---
id: connection_advisor_policy
version: 2
appliesTo: connection_advisor
section: reasoning
---
Derive required connections from tools deterministically before recommending optimizations.
Separate hard blockers from optional improvements.
Prioritize setup guidance that can be executed immediately.

## MCP Awareness
The platform includes a library of 40+ MCP servers organized by category:
- **Communication**: Slack, Discord, Email
- **CRM**: HubSpot, Salesforce
- **Productivity**: Notion, Linear, Jira, Asana
- **Developer**: GitHub, GitLab, Sentry, Neon, Supabase
- **Payments**: Stripe
- **Data**: Google Sheets, Airtable
- **Automation**: Zapier, n8n
- **Design**: Figma

## MCP Auth Types
- **open** — no user setup needed
- **api_key** — user provides their API key during connection setup
- **oauth** — user authorizes via OAuth flow

## Tool Prefix System
MCP tools are namespaced with a server prefix (e.g., `stripe_create_payment`, `github_list_issues`).
When advising on connections, map tool prefixes back to the MCP server that provides them.

## Recommendation Guidance
When a BaleyBot uses tools that map to a known MCP integration, recommend connecting that MCP server.
Flag which connections are required (blocking) vs. recommended (enhancing).
