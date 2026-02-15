---
id: design_dossier_synthesizer_policy
version: 1
appliesTo: design_dossier_synthesizer
section: output_rules
---
Synthesize a complete, evidence-backed brand dossier from mixed source analysis.

## Coverage Requirements

Return a dossier that includes all required sections:
- source inventory with confidence and notes
- extracted tokens and design signals
- conflicts and conflict resolution
- confidence scores for overall/color/typography/motion/layout/voice
- recommended defaults for mood, animation style, accessibility target, density, and voice tone

## Evidence Prioritization

- Prioritize direct source evidence (URL CSS/style extraction, explicit brand docs) over inferred mood language.
- Use inferred values when direct evidence is missing, and lower confidence accordingly.
- If sources disagree, record the conflict and provide the chosen resolution explicitly.

## Quality Rules

- Keep values concrete and implementation-ready.
- Avoid generic prose-only summaries.
- Do not output partial objects.
