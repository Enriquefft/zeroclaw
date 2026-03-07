---
phase: 07-orchestration-engine-and-agent-cron-support
plan: 01
subsystem: database
tags: [sqlite, bun, schema-migration, orchestration, tdd]

# Dependency graph
requires:
  - phase: 06-foundation-fixes-and-shared-infrastructure
    provides: init-state-db.ts with v2 schema and PRAGMA user_version versioning pattern
provides:
  - v3 schema for orchestration_tasks with parent_id, step_index, step_output, parent_goal, yaml_source
  - v2→v3 migration that preserves existing data
  - probe-claude-p.sh for manual cron compatibility validation
affects: [07-02-orchestrate-ts, 07-03-agent-cron-support]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema version bumped per migration (PRAGMA user_version), not migration table"
    - "Each ALTER TABLE in separate db.exec() call — SQLite does not support multi-column ALTER TABLE"
    - "BEGIN/COMMIT wraps migration blocks for atomicity"
    - "Fresh v0 databases create at latest version directly via SCHEMA_V1_DDL"

key-files:
  created:
    - bin/probe-claude-p.sh
  modified:
    - bin/init-state-db.ts
    - bin/init-state-db.test.ts

key-decisions:
  - "SCHEMA_VERSION bumped from 2 to 3 — orchestration_tasks gains 5 subtask tracking columns"
  - "v1→v3 migration chains through v2 steps rather than jumping directly — preserves upgrade path symmetry"
  - "probe-claude-p.sh is a manual smoke test only — cannot be run from inside Claude Code sessions (CLAUDECODE guard)"
  - "step_index uses INTEGER NOT NULL DEFAULT 0 rather than nullable — subtask ordering always has a value"

patterns-established:
  - "Each migration block wrapped in BEGIN/COMMIT for atomicity"
  - "Fresh database path (v0) always creates schema at latest version"

requirements-completed: [ORCH-03]

# Metrics
duration: 2min
completed: 2026-03-07
---

# Phase 7 Plan 01: State DB Schema v3 Migration Summary

**SQLite schema migrated to v3 with 5 orchestration subtask columns (parent_id, step_index, step_output, parent_goal, yaml_source), v2→v3 migration preserves existing data, and probe-claude-p.sh validates cron compatibility**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-07T08:05:08Z
- **Completed:** 2026-03-07T08:07:20Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Schema v3 with full orchestration subtask column set added to `orchestration_tasks` table
- v2→v3 and v1→v3 migration paths both working; existing rows preserved after ALTER TABLE
- Fresh v0 databases initialize directly at v3 via updated SCHEMA_V1_DDL
- `idx_orch_parent` index added for parent_id lookups
- `probe-claude-p.sh` created as manual smoke test for `claude -p` outside Claude Code sessions

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema v2 to v3 migration with orchestration subtask columns** - `a20ffb8` (feat)
2. **Task 2: Create claude -p probe script** - `43ab1c6` (feat)

**Plan metadata:** (docs commit — see below)

_Note: Task 1 used TDD — tests written first (RED), then implementation (GREEN). 16 tests pass._

## Files Created/Modified
- `bin/init-state-db.ts` - SCHEMA_VERSION bumped to 3, SCHEMA_V1_DDL updated, v2→v3 migration block added
- `bin/init-state-db.test.ts` - 8 new v3 migration tests added (total: 16 tests)
- `bin/probe-claude-p.sh` - New executable probe script for cron compatibility validation

## Decisions Made
- `step_index` uses `INTEGER NOT NULL DEFAULT 0` not nullable — ordering always has a value, simpler queries
- v1→v3 chains through v2 steps (not a direct jump) — preserves upgrade path symmetry and makes the code's intent clear
- `probe-claude-p.sh` is documented as manual-only — it cannot auto-pass from inside Claude Code (CLAUDECODE env var)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- v3 schema ready — Plan 02 (orchestrate.ts TDD) can proceed immediately
- `probe-claude-p.sh` available for manual validation of `claude -p` in cron context — user should run it from a plain terminal before wiring up agent cron jobs

---
*Phase: 07-orchestration-engine-and-agent-cron-support*
*Completed: 2026-03-07*
