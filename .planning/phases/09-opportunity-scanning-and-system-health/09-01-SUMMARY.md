---
phase: 09-opportunity-scanning-and-system-health
plan: "01"
subsystem: cron
tags: [agent-cron, yaml, job-scanner, freelance-scanner, state-db, whatsapp, orchestrate]

requires:
  - phase: 08-daily-automation-crons
    provides: orchestrate.ts agent cron pattern with type:agent YAML, parseYaml, cron-sync
  - phase: 06-foundation-fixes
    provides: state.db with job_applications and freelance_leads tables, notify.ts module

provides:
  - job-scanner agent cron YAML running daily at 09:00 Lima targeting job_applications table
  - freelance-scanner agent cron YAML running twice daily at 09:00 and 15:00 Lima targeting freelance_leads table
  - URL deduplication pattern via sqlite3 SELECT in agent step instructions
  - Lead scoring rubric (0-100) embedded in agent step instructions referencing LORE.md

affects:
  - 09-02 (self-audit cron, same phase)
  - Any phase building on job or freelance lead data from state.db

tech-stack:
  added: []
  patterns:
    - "type: agent YAML with 4-step scan-score-dedup-insert-notify pattern"
    - "Go YAML parser colon-space avoidance: use 'rubric -- X' not 'criteria: X' in step strings"
    - "sqlite3 CLI used inline in agent steps for deduplication and INSERT"
    - "Silent-by-default notification: send only when score >= 70, no message on zero qualifying leads"

key-files:
  created:
    - cron/jobs/job-scanner.yaml
    - cron/jobs/freelance-scanner.yaml
  modified: []

key-decisions:
  - "Step scoring rubric uses '--' separator instead of colon-space to avoid Go YAML parse error"
  - "INSERT OR IGNORE used instead of INSERT to handle re-discovery of same URL gracefully"
  - "Both scanners include notify field for orchestrate.ts failure alerts, distinct from in-step WhatsApp digests"

patterns-established:
  - "Scoring rubric: describe point breakdown with -- separator in YAML step strings (not colon-space)"
  - "Deduplication step: sqlite3 SELECT then in-prompt filter before scoring"

requirements-completed:
  - SCAN-01
  - SCAN-02
  - SCAN-03

duration: 8min
completed: "2026-03-07"
---

# Phase 9 Plan 01: Opportunity Scanner Agent Cron YAMLs Summary

**Two type:agent cron YAMLs wiring job board and freelance platform scanning to state.db with LORE.md-driven scoring, URL deduplication, and conditional WhatsApp digests for leads scoring 70+**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-07T21:55:00Z
- **Completed:** 2026-03-07T22:03:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created job-scanner.yaml: daily 09:00 Lima, 4-step agent that reads LORE.md, searches Wellfound/RemoteOK/WeWorkRemotely/HN/YC boards, deduplicates via state.db, scores leads, inserts all, notifies on score >= 70
- Created freelance-scanner.yaml: twice-daily 09:00 and 15:00 Lima, same 4-step pattern targeting Toptal/Upwork/Contra and inserting into freelance_leads table
- Both files validated by orchestrate.ts parseYaml (TypeScript) and Go YAML parser (cron-sync --dry-run)

## Task Commits

Each task was committed atomically:

1. **Tasks 1 and 2: Create and validate scanner YAMLs** - `526a439` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `cron/jobs/job-scanner.yaml` - Agent cron job for daily job board scanning with dedup, scoring, and digest
- `cron/jobs/freelance-scanner.yaml` - Agent cron job for twice-daily freelance platform scanning

## Decisions Made
- Step 3 scoring rubric uses `--` dash separator instead of `key: value` colon syntax to satisfy Go YAML parser — "scoring rubric -- role fit up to 50 points" rather than "criteria: role fit gets up to 50 points"
- Used `INSERT OR IGNORE` in step 4 instructions as defensive pattern for URL uniqueness even though deduplication already filters known URLs in step 3
- `notify:` field on both YAMLs enables orchestrate.ts failure alerts on WhatsApp independently of the in-step digest sending logic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Go YAML colon-space parse error in step 3 of both files**
- **Found during:** Task 2 (cron-sync --dry-run validation)
- **Issue:** Step 3 strings contained `criteria: role fit` and `criteria: skill fit` patterns — Go's YAML parser treats `word: value` as mapping keys within unquoted block scalars, causing "mapping values are not allowed in this context" at line 9
- **Fix:** Replaced `criteria: X gets up to N points` with `rubric -- X up to N points` phrasing in both files
- **Files modified:** cron/jobs/job-scanner.yaml, cron/jobs/freelance-scanner.yaml
- **Verification:** cron-sync --dry-run showed "ADD: Job Scanner" and "ADD: Freelance Scanner" with no errors; orchestrate.ts parseYaml confirmed 4 steps in each
- **Committed in:** 526a439 (task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in YAML formatting)
**Impact on plan:** Required fix for Go parser compatibility. Pattern consistent with Phase 8 precedent (Line N: content -> row N is content). No scope creep.

## Issues Encountered
- Go YAML parser stricter than TypeScript parseYaml about unquoted step strings containing `word: value` patterns — Go sees them as YAML mapping entries. TypeScript regex parsing ignores them. Fixed by rephrasing scoring rubric descriptions to use `--` dash separator instead of colons.

## User Setup Required
None - no external service configuration required. Both YAMLs are ready for `cron-sync` registration after this plan.

## Next Phase Readiness
- Both scanner YAMLs ready for `cron-sync` (will run automatically on next NixOS rebuild via `zeroclawCronSync`)
- Phase 9 Plan 02 (self-audit cron) can proceed — no dependency on these files
- LORE.md at `/etc/nixos/zeroclaw/documents/LORE.md` is the runtime source of truth for scoring criteria — no hardcoded values in YAMLs

---
*Phase: 09-opportunity-scanning-and-system-health*
*Completed: 2026-03-07*
