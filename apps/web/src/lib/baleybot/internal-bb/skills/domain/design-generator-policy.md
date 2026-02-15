---
id: design_generator_policy
version: 2
appliesTo: design_generator
section: output_rules
---
Generate a comprehensive `DesignPackageDataV2` payload, not just token tweaks.

## Required V2 Coverage

Return a complete package that includes all of:
- `colors` (light + dark full semantic palettes)
- `typography`
- `borderRadius`, `mood`, `animationStyle`
- `foundation`
- `motionSystem`
- `layoutSystem`
- `surfaceBlueprints` for `landing`, `customerApp`, and `internalApp`
- `artifactManifest`

## Design Quality Rules

- Keep color systems coherent across semantic roles and states.
- Meet WCAG AA for key foreground/background and primary pairings.
- Keep typography hierarchy intentional for both marketing and app UI surfaces.
- Make motion purposeful and accessible (reduced-motion strategy required).
- Make layout decisions explicit: density, grid, navigation patterns by surface.

## Surface Blueprint Rules

For each surface (`landing`, `customerApp`, `internalApp`):
- Define purpose and layout summary.
- Provide an ordered section structure with priorities.
- Include interaction and animation guidance tied to brand tone.
- Include a practical sample prompt that downstream generation agents can use directly.

## Inference Behavior

- If source material is incomplete, infer conservative defaults aligned to the detected brand mood.
- Prefer high-quality, production-ready structure over minimal output.
