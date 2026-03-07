---
phase: 09-opportunity-scanning-and-system-health
plan: "02"
subsystem: infra
tags: [bun, sqlite, typescript, cron, drift-detection, symlinks, whatsapp]

requires:
  - phase: 09-01
    provides: job-scanner and freelance-scanner cron YAMLs defining Phase 9 cron job set
  - phase: 06-03
    provides: notify.ts WhatsApp notification module imported by self-audit
  - phase: 06-01
    provides: state.db for notify logging

provides:
  - Deployment drift detector (bin/self-audit.ts) checking symlinks, cron DB, skills, config
  - Unit tests for all 4 check functions (bin/self-audit.test.ts)
  - Weekly self-audit cron job (cron/jobs/self-audit.yaml) running Mondays 08:00 Lima
  - All 3 Phase 9 cron jobs registered and active via NixOS rebuild

affects:
  - phase-10
  - ops

tech-stack:
  added: []
  patterns:
    - "Exported check functions pattern: each audit concern is an independently testable exported function"
    - "Drift item type string: distinguishes missing_symlink, wrong_target, not_a_symlink, extra_in_db, missing_in_db, skill_not_deployed, skill_extra_deployed, config_missing, config_empty"
    - "lstatSync for symlink detection: must use lstat not stat to detect symlinks without following them"
    - "readFileSync for YAML name extraction: sync consistent with non-async check functions"

key-files:
  created:
    - bin/self-audit.ts
    - bin/self-audit.test.ts
    - cron/jobs/self-audit.yaml
  modified: []

key-decisions:
  - "self-audit.ts check functions are synchronous — no async needed for fs checks, simplifies testability"
  - "lstatSync used to detect symlinks before realpathSync — only way to check if path IS a symlink vs follows one"
  - "checkCronDrift opens DB read-only — audit must never mutate what it inspects"
  - "Shell cron job (command: field) not agent type — deterministic program needs no LLM"

patterns-established:
  - "Drift detector pattern: check functions return DriftItem[] arrays, empty means clean, aggregated in main"
  - "Testability via params: all check functions accept explicit path parameters, overridable for isolated tests"

requirements-completed:
  - HEALTH-01
  - HEALTH-02

duration: 15min
completed: "2026-03-07"
---

# Phase 9 Plan 02: Self-Audit Drift Detector Summary

**Deployment drift detector using fs/sqlite/yaml comparison across symlinks, cron DB, skills, and config with WhatsApp alerts on drift, wired as weekly Monday cron job**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-07T21:59:12Z
- **Completed:** 2026-03-07T22:14:00Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments

- Built self-audit.ts with 4 exported check functions covering all deployment drift vectors
- 20 unit tests covering all check functions, edge cases, and integration assertions — all pass
- Weekly shell cron job registered and active, runs every Monday 08:00 Lima time
- NixOS rebuild activated all 3 Phase 9 cron jobs (job-scanner, freelance-scanner, self-audit)
- Clean audit on live system: all symlinks, cron registrations, skills, and config in sync

## Task Commits

Each task was committed atomically:

1. **Task 1: Build self-audit.ts with TDD** - `4203893` (feat)
2. **Task 2: Create self-audit cron YAML, run cron-sync, and NixOS rebuild** - `b922b47` (feat)

## Files Created/Modified

- `bin/self-audit.ts` — Deployment drift detector; exports checkSymlinks, checkCronDrift, checkSkills, checkConfig; structured JSON to stdout; WhatsApp alert on drift
- `bin/self-audit.test.ts` — 20 unit tests using bun:test with mkdtempSync isolation and in-memory SQLite mocks
- `cron/jobs/self-audit.yaml` — Weekly shell cron, Mondays 08:00 Lima, passes --notify phone flag

## Decisions Made

- Check functions are synchronous — no async needed for fs/sqlite operations; simplifies testability
- `lstatSync` used before `realpathSync` to detect symlink type without following the link
- Cron DB opened read-only — audit program must never mutate what it inspects
- Shell cron job type (not agent) — deterministic program, no LLM reasoning needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all checks, tests, cron-sync, and NixOS rebuild completed without errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 9 complete: all cron jobs registered and active (sentinel, morning briefing, EOD summary, follow-up enforcer, content scout, job scanner, freelance scanner, self-audit)
- Self-audit will alert via WhatsApp if deployment state drifts from git source
- Phase 10 (cost tracking and limits) can proceed independently

---
*Phase: 09-opportunity-scanning-and-system-health*
*Completed: 2026-03-07*
