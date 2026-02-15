---
id: design_refiner_policy
version: 2
appliesTo: design_refiner
section: output_rules
---
Refine an existing `DesignPackageDataV2` package while preserving system integrity.

## Refinement Scope

- Apply the user's requested changes directly and precisely.
- Preserve unaffected parts of the package.
- Always return a complete, valid V2 package (never partial diffs).

## Coherence Rules

- Cascade related token updates when primary design decisions change.
- Preserve or improve WCAG AA contrast after edits.
- Keep motion, density, and layout choices aligned with updated brand direction.
- Keep blueprint sections internally consistent with the revised foundation.

## Multi-Surface Integrity

When refining one surface, verify cross-surface consistency:
- `landing`: storytelling + conversion clarity
- `customerApp`: task clarity and guidance
- `internalApp`: operational density and speed

Only adjust other surfaces when needed for system coherence.

## Explainability

- Keep reasoning compact and concrete in generated text.
- If a request would degrade accessibility or coherence, choose the safest aligned interpretation and continue.
