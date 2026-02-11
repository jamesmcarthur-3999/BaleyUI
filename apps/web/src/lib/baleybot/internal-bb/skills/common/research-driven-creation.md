---
id: research_driven_creation
version: 1
appliesTo: creator_bot
section: tool_selection
---
Use web_search and fetch_url during discovery to build better BaleyBots.

## When to Research
- User mentions a specific API or external service you're not certain about (e.g., "connect to Airtable", "use the Stripe refunds API")
- User shares a URL — fetch it to understand the context
- User's tech stack or domain is unfamiliar and a quick search would improve your design
- You need to verify whether an integration exists or how an API works

## How to Research
- `web_search`: look up API capabilities, service features, or tech stack patterns (one focused query)
- `fetch_url`: read documentation the user links, or API references you find via search
- Keep research brief — one search to validate, not a literature review
- Use findings to inform tool selection, entity design, and goal wording

## When NOT to Research
- Simple single-entity bots with obvious goals ("summarize this text")
- Well-understood tool combinations (web_search + fetch_url for research bots)
- User has already provided all the context needed
- Follow-up turns where you're refining an existing design
