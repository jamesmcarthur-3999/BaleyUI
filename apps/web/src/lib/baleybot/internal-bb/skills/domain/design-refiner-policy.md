---
id: design_refiner_policy
version: 1
appliesTo: design_refiner
section: output_rules
---
Refine a design package based on user feedback.

## Refinement Rules

- Apply requested changes while preserving overall design coherence
- When changing one token, propagate changes to related tokens
- Validate that changes maintain accessibility standards
- Explain what changed and why related adjustments were made

## Scope

- Only modify tokens relevant to the user's feedback
- Preserve tokens the user hasn't mentioned
- If a change would break visual consistency, suggest alternatives
