# Phase 9: Opportunity Scanning and System Health - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire job scanner and freelance scanner as agent-driven cron jobs that find, score, deduplicate, and persist leads to state.db. Build a self-audit program that detects drift between git source and deployed state, running weekly as a shell cron.

Requirements: SCAN-01, SCAN-02, SCAN-03, HEALTH-01, HEALTH-02

</domain>

<decisions>
## Implementation Decisions

### Data Sourcing
- Agent-driven search via orchestrate.ts — scanners are `type: agent` cron jobs, Claude searches the web and parses results
- No scraper libraries (no ts-jobspy) — avoids rate-limit risk and scraper maintenance
- Claude picks the optimal board set from LORE.md target paths and role priorities at runtime
- Cadence: job scanner runs once daily (09:00 Lima), freelance scanner runs 2x daily (09:00 and 15:00 Lima)

### Lead Filtering & Scoring
- LLM scoring 0-100 in-context — agent reads LORE.md criteria (target roles, positioning, paths) and scores each lead during the same claude -p call that discovered it
- Score >= 70 triggers WhatsApp notification; all leads saved to state.db regardless of score
- URL-based deduplication — same URL = duplicate, cross-board duplicates for same job are kept (gives options where to apply)
- No expiry on leads — consistent with Phase 6 "keep everything, no auto-pruning" policy

### Notification Format
- Digest summary: one WhatsApp message per scan listing all qualifying leads (title, company, score, URL)
- Silent on zero — no notification when no new qualifying leads found
- Separate messages for job leads vs freelance leads — distinct notifications with clear labels
- Leads scoring 90+ flagged with action hints (e.g., "Consider cold outreach to hiring manager") aligned with LORE.md application approach

### Self-Audit Scope
- Full deployment check: symlinked paths (documents/, skills/, bin/), config.toml rendering, and cron job registration vs YAML source
- Cron drift detection: compare registered cron jobs (zeroclaw cron list) against cron/jobs/*.yaml definitions
- Report only — generates a report listing drifted files/entries. No auto-fix; human decides what to act on
- WhatsApp notification only when drift is detected — silent on clean audits
- Weekly cadence as a shell cron job (not agent type)

### Claude's Discretion
- Scanner architecture (separate programs vs unified with flags)
- Board set selection logic and search query formulation
- Self-audit comparison method (checksums, diff, stat comparison)
- Exact notification message formatting and emoji usage
- Self-audit cron schedule (which day/time weekly)
- How orchestration YAML steps are structured for scanning tasks

</decisions>

<specifics>
## Specific Ideas

- LORE.md is the single source of truth for job criteria — scanners read it at runtime, no hardcoded filters
- LORE.md application approach should inform action hints: "Cold outreach > ATS", "Follow up after 5 days"
- Self-audit should detect if someone edited ~/.zeroclaw/ directly instead of going through git

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `initStateDb()` (`bin/init-state-db.ts`): Already has `job_applications` and `freelance_leads` tables with rich schema (title, company, url, status, match_score, source_platform, etc.)
- `notify()` (`bin/notify.ts`): Shared notification module with normal/urgent priority, rate limiting, retry
- `orchestrate.ts` (`bin/orchestrate.ts`): Orchestration engine for multi-step agent tasks — scanners will be orchestrated agent cron jobs
- `sentinel-scan.ts`: Pattern for programs that check state and conditionally notify — self-audit follows this model
- `LORE.md` (`documents/LORE.md`): Contains target roles, job boards, positioning, application approach — scanner reads this

### Established Patterns
- Programs are TypeScript (bun), output JSON to stdout, errors to stderr, exit 0/1
- Agent cron jobs use `type: agent` in YAML with `goal:` and optional `steps:` array
- Cron-sync auto-generates command field for agent jobs, passing YAML path to orchestrate.ts
- Notifications use `--notify <phone>` CLI flag pattern (established in sentinel)

### Integration Points
- `job_applications` and `freelance_leads` tables already exist in state.db — scanners INSERT into them
- `cron/jobs/` needs new YAML files for job-scanner, freelance-scanner, and self-audit
- `documents/LORE.md` is symlinked and live-editable — scanner reads it at runtime via the agent's file access
- Self-audit needs to know the mapping between git source paths and deployed paths (defined in module.nix activation scripts)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-opportunity-scanning-and-system-health*
*Context gathered: 2026-03-07*
