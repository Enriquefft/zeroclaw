# Phase 6: Foundation Fixes and Shared Infrastructure - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up all stale artifacts from v1.0/v1.1, establish shared SQLite state database, and build centralized notification module. Every future program depends on this foundation. No new cron jobs or automation — just the infrastructure they'll plug into.

Requirements: FIX-01 through FIX-06, FIX-08, INFRA-01 through INFRA-03, INFRA-05 through INFRA-07, DOCS-01

</domain>

<decisions>
## Implementation Decisions

### State DB Schema
- Rich tracking for job/freelance leads: title, company, url, status (new/applied/interview/offer/rejected), found_date, salary_range, location, match_score, source_platform, notes, applied_date, last_updated
- All 7 tables created upfront in Phase 6 (job_applications, freelance_leads, daily_state, content_log, orchestration_tasks, notify_log, cron_log) — downstream phases just INSERT
- Add a `kv_store` table (key/value/updated_at) for ad-hoc state that doesn't justify its own table
- No auto-pruning retention policy — keep everything. SQLite handles the volume fine (~50 entries/day). Prune manually if ever needed
- WAL mode enabled, busy_timeout set, schema versioning included

### Notify Module API
- Dual interface: primary is import function (`import { notify } from '../bin/notify.ts'`), also expose CLI wrapper for shell scripts or non-TS callers
- Two priority levels: **normal** (respects 5-min rate limit) and **urgent** (bypasses rate limit, e.g., sentinel alerts)
- Rate limiting uses per-process check against notify_log table — if another program sent within 5 min, current message queues/waits. DB is the coordination point
- Retry: 3 attempts with exponential backoff on failure
- Failure mode: log to notify_log AND write to stderr — callers can detect failure, cron output captures error, but calling program doesn't crash
- Phone number from `NOTIFY_TARGET` env var — no hardcoded numbers anywhere

### Sentinel Refactor
- Swap inline WhatsApp logic (`kapso-whatsapp-cli send --to ${ALERT_TO}`) for notify module import
- Remove hardcoded phone number `+51926689401`
- Sentinel alerts use **urgent** priority (bypass rate limit)

### Cleanup
- Delete stale files outright: `bin/repair-loop.sh`, `.planning/phases/` directory, `ORCHESTRATION.md` from repo root
- Consume ORCHESTRATION.md content into planning docs before removing
- Add `tz: America/Lima` to all cron YAMLs (currently only sentinel.yaml, missing tz)
- Apply NixOS rebuild to activate resolve_command() and skills-sync cleanup

### Claude's Discretion
- Exact column types and indexes for state.db tables
- Schema versioning mechanism (migration table vs pragma)
- Exponential backoff timing (initial delay, multiplier)
- notify.ts internal architecture (class vs functions)
- Cleanup verification approach

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sentinel-scan.ts`: Existing WhatsApp integration pattern via `kapso-whatsapp-cli` — refactor target for notify module
- `bun:sqlite` already used conceptually in project (sentinel reads from brain.db) — same import for state.db

### Established Patterns
- Programs are TypeScript (bun), output JSON to stdout, errors to stderr, exit 0/1
- Cron YAMLs in `cron/jobs/` with name, schedule, command fields
- `bin/README.md` documents all programs with their cron schedule

### Integration Points
- `config.toml` sops template needs `NOTIFY_TARGET` added to env rendering (FIX-08)
- `module.nix` home.activation needs to handle state.db initialization
- Sentinel cron (`sentinel.yaml`) is the first consumer of the refactored notify module
- `cron-sync` will need rebuild applied to pick up changes (FIX-01)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-foundation-fixes-and-shared-infrastructure*
*Context gathered: 2026-03-07*
