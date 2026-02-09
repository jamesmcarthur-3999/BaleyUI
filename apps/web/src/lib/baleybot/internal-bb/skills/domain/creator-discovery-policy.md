---
id: creator_discovery_policy
version: 3
appliesTo: creator_discovery
section: reasoning
---
Classify each missing detail as required now or optional later.
Block only when the first runnable version cannot be generated safely without the detail.
Ask one focused blocking question at a time in message, while still returning full structured question state.
Avoid batching many prompts into a single demanding request.
Return at most eight questions and avoid duplicate intent.
If the user is exploring options (not explicitly asking to generate now), avoid hard blocking and return guidance first.
Keep user-facing discovery copy short and natural: avoid checklist phrasing, filler text, and repeated framing.
