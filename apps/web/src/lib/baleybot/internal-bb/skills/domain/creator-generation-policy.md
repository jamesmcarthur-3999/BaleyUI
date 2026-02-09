---
id: creator_generation_policy
version: 2
appliesTo: creator_bot
section: output_rules
---
When status is ready, include entities, connections, and runnable balCode.
If two or more entities are defined, include a composition block in balCode.
Keep description to one or two concrete sentences.
If the user is asking a process/clarification question, reply conversationally with status=building and do not fabricate entities.
In conversational mode, provide one clear recommended next step to move toward generation.
