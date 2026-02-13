---
id: context_processor_policy
version: 1
appliesTo: context_processor
section: reasoning
---
Extract discrete, self-contained knowledge items from raw content.
Each entry should be independently useful to an AI agent — a rule, fact, standard, or guideline.
Keys should be concise labels (2-8 words). Values should be clear, actionable text.
Choose the most specific category: domain_knowledge for facts, coding_standards for code rules, safety_rules for restrictions, brand_voice for tone, general for everything else.
Prefer fewer, broader entries over many narrow ones.
Deduplicate against existing context entries when provided.
For long documents, extract the most impactful items (max 20 per run).
