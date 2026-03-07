---
plan: 06-04
status: complete
started: 2026-03-07
completed: 2026-03-07
tasks_completed: 2
tasks_total: 2
deviations: 1
---

# Plan 06-04 Summary

## What Was Built

Sentinel refactored to use shared notify module, resolve_command() extended for claude binary, and NixOS rebuild applied.

**Major deviation:** FIX-08 (NOTIFY_TARGET sops secret) was superseded mid-execution. User decided notify() should take recipient as a parameter instead of reading from an env var. This enables per-cron-job recipient targeting (different jobs can notify different people).

## Changes Made

### Task 1: Sentinel refactor + resolve_command (agent)
- `sentinel-scan.ts`: replaced inline `kapso-whatsapp-cli` with `import { notify } from "./notify.ts"`
- `module.nix`: added `claude` to `resolve_command()` mapping `$HOME/.local/bin/claude`
- Commit: `b482c8d`

### Task 2: Recipient refactor + rebuild (orchestrator, manual)
- `notify.ts`: signature changed to `notify(msg, recipient, priority)` — no env var
- `notify.test.ts`: all 12 tests updated to pass recipient directly
- `init-state-db.ts`: schema v2 — notify_log gains `recipient TEXT NOT NULL` column, v1→v2 migration
- `sentinel-scan.ts`: accepts `--notify <phone>` CLI flag
- `sentinel.yaml`: command now passes `--notify +51926689401`
- FIX-08 superseded — no sops changes needed
- NixOS rebuild applied successfully
- Commit: `0cda512`

## Deviations

1. **FIX-08 superseded** — User decided caller-specifies-recipient pattern instead of NOTIFY_TARGET env var. This is a design improvement: enables multi-recipient scenarios where different cron jobs notify different people. Schema bumped to v2.

## Self-Check

- [x] sentinel-scan.ts has no inline kapso-whatsapp-cli calls
- [x] sentinel-scan.ts has no hardcoded phone numbers
- [x] resolve_command() includes claude mapping
- [x] NixOS rebuild applied successfully
- [x] All 21 tests pass (9 init-state-db + 12 notify)

## Self-Check: PASSED

## Key Files

### Created
(none — all modifications to existing files)

### Modified
- `bin/notify.ts` — recipient parameter added
- `bin/notify.test.ts` — tests use recipient param
- `bin/init-state-db.ts` — schema v2, recipient column
- `bin/init-state-db.test.ts` — v2 schema tests
- `bin/sentinel-scan.ts` — --notify flag, notify() import
- `cron/jobs/sentinel.yaml` — --notify +51926689401
- `module.nix` — resolve_command() claude entry

## Requirements Completed

- INFRA-05: resolve_command() extended for claude
- INFRA-06: Sentinel uses notify module
- FIX-08: Superseded (caller passes recipient)
- FIX-01: NixOS rebuild applied
