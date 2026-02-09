# Release Worktree Merge Audit (2026-02)

- Generated: 2026-02-09T19:03:41.598257Z
- Baseline branch: `codex/baleybots-command-center-overhaul`
- Baseline tag: `release-baseline-2026-02-09-command-center`
- Policy: local aggressive cleanup with patch preservation

## Baseline Validation

- `pnpm --filter @baleyui/web type-check` passed
- `pnpm --filter @baleyui/web lint` passed
- `pnpm --filter @baleyui/web test` passed (`62` files, `981` tests)
- `pnpm --filter @baleyui/web build` passed

## Non-Baseline Worktree Snapshot

| Branch | Worktree | Dirty Entries | Conflicts | Validation | Risk | Submodule |
|---|---|---:|---:|---|---|---|
| `main` | `/private/tmp/baleyui-main-deploy` | 1 | 0 | type-check: pass (2026-02-09); full test/build not primary release source | low | `f894164dee10091655d430f57b1750036212ce25 packages/baleybots (@baleybots/cli@0.0.1-alpha.110-1-gf894164)` |
| `codex/perf-merge-check` | `/private/tmp/BaleyUI-merge-check` | 9 | 2 | blocked: unresolved merge conflicts | critical | `-878f9c63d78bfcd1bbb26e7b2377a66001099b65 packages/baleybots` |
| `codex/perf-merge-main` | `/private/tmp/BaleyUI-merge-main` | 2 | 0 | not run; stale branch behind baseline | high | `+4a97247cded875c7fd85ac0d27f7e6efcb149bc3 packages/baleybots (@baleybots/tools@0.0.1-alpha.98-2-g4a97247)` |
| `codex/perf-investigation` | `/private/tmp/BaleyUI-perf` | 7 | 0 | type-check: fail (stale SDK/core exports) | high | `+4a97247cded875c7fd85ac0d27f7e6efcb149bc3 packages/baleybots (@baleybots/tools@0.0.1-alpha.98-2-g4a97247)` |
| `codex/perf-validate` | `/private/tmp/BaleyUI-perf-validate` | 12 | 0 | type-check: fail (stale SDK/core exports + visual type mismatch) | high | `+4a97247cded875c7fd85ac0d27f7e6efcb149bc3 packages/baleybots (@baleybots/tools@0.0.1-alpha.98-2-g4a97247)` |
| `codex/perf-patch` | `/Users/jamesmcarthur/.codex/worktrees/10c3/BaleyUI` | 103 | 0 | not run in worktree (node_modules missing); large staged deletion experiment | critical | `+4a97247cded875c7fd85ac0d27f7e6efcb149bc3 packages/baleybots (@baleybots/tools@0.0.1-alpha.98-2-g4a97247)` |

## Conflict Files

- `codex/perf-merge-check`
  - `apps/web/src/components/visual-editor/VisualEditor.tsx`
  - `apps/web/src/lib/trpc/routers/baleybots.ts`

## Integration Decision

- Approved release source: baseline branch `codex/baleybots-command-center-overhaul`.
- High-risk stale experiment worktrees were snapshotted and excluded from direct merge.
- Any future recovery/review of excluded work should use patch bundles in `docs/audits/patches/`.

## Post-Deploy Cleanup Targets

- Remove stale temporary worktrees after deploy verification.
- Remove stale local branches superseded by merged baseline.
- Keep only `main` (and any explicitly active support branch), plus this audit trail.
