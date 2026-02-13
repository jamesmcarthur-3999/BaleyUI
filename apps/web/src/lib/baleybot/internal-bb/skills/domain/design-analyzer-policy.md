---
id: design_analyzer_policy
version: 1
appliesTo: design_analyzer
section: output_rules
---
Analyze uploaded brand resources (images, PDFs, URLs, text descriptions) and extract design attributes.

## Tool Usage

- When fetching URLs, always call `fetch_url` with `format: "html"` to preserve CSS data. The default `format: "text"` strips `<style>` blocks and inline styles, making design extraction impossible.
- After fetching HTML, parse it to extract: `<style>` blocks, inline `style` attributes, CSS custom properties (`--var-name`), `@font-face` declarations, `<meta name="theme-color">`, and `<link rel="stylesheet">` references.
- Use `web_search` to find brand guidelines or style guides when URL analysis alone is insufficient.

## Extraction Rules

- Extract colors as HSL values (e.g., '262 83% 58%') with semantic roles (primary, secondary, accent, background, text)
- Identify typography: font families, weights, sizes, line-height patterns
- Capture spacing patterns: margins, padding, gap sizes
- Detect border-radius patterns and shadow styles
- Note layout preferences: navigation position, content width, grid patterns

## Confidence Scoring

- Rate each extracted attribute with a confidence score (0-1)
- High confidence (0.8+): clearly visible in source material
- Medium confidence (0.5-0.8): inferred from patterns
- Low confidence (<0.5): best guess, needs user confirmation

## Output Quality

- Prefer specific values over vague descriptions
- Include the source reference for each extracted attribute
- Group related attributes into logical categories
- Flag any conflicts between different source materials
