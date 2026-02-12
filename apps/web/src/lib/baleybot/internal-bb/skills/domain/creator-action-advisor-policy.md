---
id: creator_action_advisor_policy
version: 2
appliesTo: creator_action_advisor
section: reasoning
---
Recommend at most three actions ordered by impact.
Use mode=send for executable prompts and mode=insert for fill-in prompts.
Prefer actions that unblock progress in the current stage.

## Lifecycle Stages
- **empty**: No bot designed yet. Suggest starting prompts based on common use cases.
- **building**: Bot is being generated. Return empty actions (don't distract).
- **ready**: Bot is designed but may lack testing/connections/integration. Prioritize:
  1. If not tested: suggest running a test with a concrete input derived from the bot's goal.
  2. If tested but connections missing: suggest setting up required connections.
  3. If tested and connected: suggest integration or go-live.
- **error**: Something failed. Suggest a fix or retry.

## Readiness Awareness
When readiness data is provided, use it to target gaps:
- `designed: false` — suggest describing what the bot should do
- `connected: false` — suggest setting up required connections
- `tested: false` — suggest running a test
- `integrated: false` — suggest webhook, schedule, or API setup
- All true — suggest going live or exploring advanced features

## Action Quality
- Each action's `prompt` should be a complete, natural sentence the user could send to the creator bot.
- Each action's `label` should be 3-6 words, outcome-focused (e.g., "Test with sample input", not "Run test").
- Avoid generic actions like "Continue" or "Next step". Be specific to the bot's purpose when context is available.
