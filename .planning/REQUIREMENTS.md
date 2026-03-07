# Requirements: ZeroClaw v2.0 Heartbeat

**Defined:** 2026-03-07
**Core Value:** A robust, extensible foundation that enables Kiro to grow and self-modify without friction — editing identity, creating skills, adding cron jobs, and refining config — all version-controlled, all without unnecessary rebuilds.

## v2.0 Requirements

Requirements for the Heartbeat milestone. Each maps to roadmap phases.

### Foundation Fixes

- [ ] **FIX-01**: NixOS rebuild applied to activate resolve_command() and skills-sync cleanup
- [ ] **FIX-02**: All cron YAMLs include `tz: America/Lima`
- [ ] **FIX-03**: `bin/repair-loop.sh` removed (orphaned after skill refactor)
- [ ] **FIX-04**: Stale workspace state cleaned (`memory_hygiene_state.json`, `runtime-trace.jsonl`)
- [ ] **FIX-05**: Stale `.planning/phases/` directory cleaned
- [ ] **FIX-06**: `ORCHESTRATION.md` consumed into planning docs and removed from repo root
- [ ] **FIX-07**: `max_cost_per_day_cents` raised to calibrated value after measuring agent cron costs
- [ ] **FIX-08**: `NOTIFY_TARGET` env var added to sops secrets and `zeroclaw.env` rendering

### Infrastructure

- [ ] **INFRA-01**: Shared SQLite state database at `~/.zeroclaw/workspace/state.db` with WAL mode, busy_timeout, and schema versioning
- [ ] **INFRA-02**: Centralized notification module (`bin/notify.ts`) with WhatsApp retry (3 attempts, exponential backoff) and rate limiting (5-min gap)
- [ ] **INFRA-03**: Notification target phone number read from `NOTIFY_TARGET` environment variable
- [ ] **INFRA-04**: Cron-sync supports `type: agent` YAML field and registers agent jobs via daemon REST API or SQLite fallback
- [ ] **INFRA-05**: `resolve_command()` extended to cover `claude` binary path
- [ ] **INFRA-06**: Sentinel scan refactored to use notify module instead of inline WhatsApp logic
- [ ] **INFRA-07**: Cron execution logging (what ran, duration, success/fail) to state.db

### Orchestration

- [ ] **ORCH-01**: Orchestration engine (`bin/orchestrate.ts`) decomposes tasks via `claude -p` into a subtask graph
- [ ] **ORCH-02**: Orchestration engine executes subtasks in parallel with dependency ordering
- [ ] **ORCH-03**: Orchestration engine checkpoints progress to state.db (resumable on failure)
- [ ] **ORCH-04**: Orchestration skill (`skills/orchestrate/`) wraps the engine for agent invocation

### Daily Automation

- [ ] **DAILY-01**: Morning briefing cron sends daily agenda (calendar + email + pending follow-ups) via WhatsApp at 07:30 Lima time (uses orchestrate.ts for multi-source synthesis)
- [ ] **DAILY-02**: EOD summary cron sends day recap (what moved, unanswered threads, tomorrow priorities) via WhatsApp at 20:00 (uses orchestrate.ts)
- [ ] **DAILY-03**: Follow-up enforcer cron detects stale commitments and nudges at 10:00, 14:00, 17:00
- [ ] **DAILY-04**: Content scout cron delivers daily digest of trending topics + RSS feeds relevant to content pillars

### Opportunity Scanning

- [ ] **SCAN-01**: Job scanner cron searches job boards daily, filters by target roles/criteria from LORE.md, deduplicates via state.db
- [ ] **SCAN-02**: Freelance scanner cron searches gig platforms, shares infrastructure with job scanner, higher cadence
- [ ] **SCAN-03**: Job and freelance leads persisted to state.db with status tracking (new/applied/interview/offer/rejected)

### Research & Distribution

- [ ] **DIST-01**: Build-in-public drafter cron generates draft posts from git activity for human approval
- [ ] **DIST-02**: Engagement scout cron finds relevant threads/discussions to respond to
- [ ] **DIST-03**: Paper scout cron delivers weekly arXiv digest filtered by research interests
- [ ] **DIST-04**: Weekly company refresh cron updates target company watch-list with recent news (uses orchestrate.ts)

### System Health

- [ ] **HEALTH-01**: Self-audit program detects config/doc drift between git source and deployed state
- [ ] **HEALTH-02**: Self-audit runs weekly as a shell cron job

### Documentation

- [ ] **DOCS-01**: LORE.md updated to reference state.db instead of `~/zeroclaw-data/` JSON trackers
- [ ] **DOCS-02**: cron/README.md updated with agent job type YAML schema and removed stale references
- [ ] **DOCS-03**: ORCHESTRATION.md status updated to reflect implementation
- [ ] **DOCS-04**: AGENTS.md updated with heartbeat cron references
- [ ] **DOCS-05**: bin/README.md updated with all new programs

## Future Requirements

Deferred to v2.1+. Tracked but not in current roadmap.

### Observability

- **OBS-01**: Dashboard or reporting for cron job health across all heartbeat jobs
- **OBS-02**: Token cost tracking per cron job per day

### Advanced Automation

- **ADV-01**: Auto-apply to high-confidence job matches (with approval gate)
- **ADV-02**: Smart scheduling — dynamically adjust cron frequency based on signal density

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-posting to social media | Approval gate required — never bypass human review |
| Auto-applying to jobs | Too risky for v2.0 — requires high-confidence filtering first |
| Sub-minute real-time polling | Overkill for daily/weekly cadence needs |
| Auto-sending follow-up emails | Approval gate required — enforcer nudges Enrique, doesn't act |
| Inline LLM prompts in cron YAML | Architecture violation — prompts belong in skills or agent job definitions |
| Anthropic API key / direct Anthropic access | Not available — orchestration uses `claude -p` (Claude Code headless) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | TBD | Pending |
| FIX-02 | TBD | Pending |
| FIX-03 | TBD | Pending |
| FIX-04 | TBD | Pending |
| FIX-05 | TBD | Pending |
| FIX-06 | TBD | Pending |
| FIX-07 | TBD | Pending |
| FIX-08 | TBD | Pending |
| INFRA-01 | TBD | Pending |
| INFRA-02 | TBD | Pending |
| INFRA-03 | TBD | Pending |
| INFRA-04 | TBD | Pending |
| INFRA-05 | TBD | Pending |
| INFRA-06 | TBD | Pending |
| INFRA-07 | TBD | Pending |
| ORCH-01 | TBD | Pending |
| ORCH-02 | TBD | Pending |
| ORCH-03 | TBD | Pending |
| ORCH-04 | TBD | Pending |
| DAILY-01 | TBD | Pending |
| DAILY-02 | TBD | Pending |
| DAILY-03 | TBD | Pending |
| DAILY-04 | TBD | Pending |
| SCAN-01 | TBD | Pending |
| SCAN-02 | TBD | Pending |
| SCAN-03 | TBD | Pending |
| DIST-01 | TBD | Pending |
| DIST-02 | TBD | Pending |
| DIST-03 | TBD | Pending |
| DIST-04 | TBD | Pending |
| HEALTH-01 | TBD | Pending |
| HEALTH-02 | TBD | Pending |
| DOCS-01 | TBD | Pending |
| DOCS-02 | TBD | Pending |
| DOCS-03 | TBD | Pending |
| DOCS-04 | TBD | Pending |
| DOCS-05 | TBD | Pending |

**Coverage:**
- v2.0 requirements: 37 total
- Mapped to phases: 0
- Unmapped: 37 ⚠️

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after initial definition*
