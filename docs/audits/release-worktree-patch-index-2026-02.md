# Release Worktree Patch Index (2026-02)

- Generated: 2026-02-09T19:03:41.598257Z
- Purpose: preserve all non-baseline local deltas before aggressive cleanup.

| Branch | Staged Patch | Unstaged Patch | Untracked Archive |
|---|---|---|---|
| `main` | `/docs/audits/patches/main--staged.patch` (0 bytes) | `/docs/audits/patches/main--unstaged.patch` (1912 bytes) | none |
| `codex/perf-merge-check` | `/docs/audits/patches/codex__perf-merge-check--staged.patch` (13233 bytes) | `/docs/audits/patches/codex__perf-merge-check--unstaged.patch` (5656 bytes) | none |
| `codex/perf-merge-main` | `/docs/audits/patches/codex__perf-merge-main--staged.patch` (0 bytes) | `/docs/audits/patches/codex__perf-merge-main--unstaged.patch` (265 bytes) | `/docs/audits/patches/codex__perf-merge-main--untracked.tar.gz` (1 files) |
| `codex/perf-investigation` | `/docs/audits/patches/codex__perf-investigation--staged.patch` (0 bytes) | `/docs/audits/patches/codex__perf-investigation--unstaged.patch` (3915 bytes) | `/docs/audits/patches/codex__perf-investigation--untracked.tar.gz` (4 files) |
| `codex/perf-validate` | `/docs/audits/patches/codex__perf-validate--staged.patch` (19386 bytes) | `/docs/audits/patches/codex__perf-validate--unstaged.patch` (265 bytes) | `/docs/audits/patches/codex__perf-validate--untracked.tar.gz` (2 files) |
| `codex/perf-patch` | `/docs/audits/patches/codex__perf-patch--staged.patch` (501267 bytes) | `/docs/audits/patches/codex__perf-patch--unstaged.patch` (18509 bytes) | `/docs/audits/patches/codex__perf-patch--untracked.tar.gz` (2 files) |

## Reconstructability Dry-Run

- Verified one representative dry-run apply command works format-wise:

```bash
git apply --check docs/audits/patches/codex__perf-merge-main--unstaged.patch
```

- Note: some patches are intended to fail cleanly on current baseline when they depend on stale branch context; they are preserved for forensic recovery, not blind re-apply.
