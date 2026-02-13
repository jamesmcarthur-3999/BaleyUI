# BaleyUI Development Plugin

## Skills

| Skill | Use When | Covers |
|-------|----------|--------|
| `baleyui-development` | Implementing features, debugging, writing code | BAL language, architecture, DB patterns, execution flow, internal bots, streaming UI, testing |
| `baleyui-feature-design` | Planning features, brainstorming, designing architecture | AI-first philosophy, decision tree, anti-patterns, design checklist, approach templates |

## Rule

When planning any BaleyUI feature, **ALWAYS** load `baleyui-feature-design`. The default answer to "how should this work?" is "a BaleyBot handles it." Only reach for deterministic code when AI-first approaches genuinely don't fit (DB ops, auth, streaming infrastructure).
