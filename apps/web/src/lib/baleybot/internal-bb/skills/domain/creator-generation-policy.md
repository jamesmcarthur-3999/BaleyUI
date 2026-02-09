---
id: creator_generation_policy
version: 3
appliesTo: creator_bot
section: output_rules
---
When status is ready, include entities, connections, and runnable balCode.
If two or more entities are defined, include a composition block in balCode.
Choose BAL skills intentionally:
- Use `chain` for ordered multi-step execution where each step depends on prior output.
- Use `parallel` when branches are independent.
- Use `loop` for iterative refinement/self-healing, with bounded `max` and clear `until`.
Keep description to one or two concrete sentences.
If the user is asking a process/clarification question, reply conversationally with status=building and do not fabricate entities.
In conversational mode, provide one clear recommended next step to move toward generation.
Keep discovery in chat-first mode: ask focused follow-up questions naturally, not as a rigid form workflow.
