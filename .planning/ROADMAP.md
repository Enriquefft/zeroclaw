# Roadmap: ZeroClaw Infrastructure

## Milestones

- ✅ **v1.0 Kiro MVP** — Phases 1-4 (shipped 2026-03-05)
- ✅ **v1.1 Public Release** — Phase 5 (shipped 2026-03-05)
- 🚧 **v2.0 Heartbeat** — Phases 6-10 (in progress)

## Phases

<details>
<summary>✅ v1.0 Kiro MVP (Phases 1-4) — SHIPPED 2026-03-05</summary>

- [x] Phase 1: Config Foundation (1/1 plans) — completed 2026-03-04
- [x] Phase 2: Scaffolding and Identity (3/3 plans) — completed 2026-03-04
- [x] Phase 3: Self-Modification and Resilience (4/4 plans) — completed 2026-03-05
- [x] Phase 4: Sentinel Verification and Cleanup (2/2 plans) — completed 2026-03-05

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 Public Release (Phase 5) — SHIPPED 2026-03-05</summary>

- [x] Phase 5: Publication and Release Readiness (2/2 plans) — completed 2026-03-05

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

### 🚧 v2.0 Heartbeat (In Progress)

**Milestone Goal:** Build the complete infrastructure layer (state, notifications, orchestration, cron overhaul) and wire all Heartbeat crons — making Kiro a fully proactive, scheduled assistant.

- [ ] **Phase 6: Foundation Fixes and Shared Infrastructure** — Clean up stale artifacts, establish shared state DB and notification module that all programs depend on
- [ ] **Phase 7: Orchestration Engine and Agent Cron Support** — Build task decomposition engine and extend cron-sync for agent-type jobs (requires NixOS rebuild)
- [ ] **Phase 8: Daily Automation Crons** — Wire morning briefing, EOD summary, follow-up enforcer, and content scout
- [ ] **Phase 9: Opportunity Scanning and System Health** — Wire job scanner, freelance scanner, and self-audit
- [ ] **Phase 10: Research, Distribution, and Cost Calibration** — Wire research/distribution crons, calibrate cost cap, finalize docs

## Phase Details

### Phase 6: Foundation Fixes and Shared Infrastructure
**Goal**: All stale artifacts cleaned, shared state database live, centralized notification module operational — every future program has a ready foundation to build on
**Depends on**: Phase 5
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, FIX-06, FIX-08, INFRA-01, INFRA-02, INFRA-03, INFRA-05, INFRA-06, INFRA-07, DOCS-01
**Success Criteria** (what must be TRUE):
  1. `bun run /etc/nixos/zeroclaw/bin/notify.ts` sends a WhatsApp message to the number in `NOTIFY_TARGET` with no hardcoded phone numbers in any source file
  2. `~/.zeroclaw/workspace/state.db` exists with WAL mode enabled and all v2.0 schema tables present (job_applications, freelance_leads, daily_state, content_log, orchestration_tasks, notify_log, cron_log)
  3. Sentinel scan sends notifications via the shared notify module — no inline WhatsApp logic remains in sentinel-scan.ts
  4. Running `ls /etc/nixos/zeroclaw/bin/` shows no `repair-loop.sh`; running `ls /etc/nixos/zeroclaw/.planning/` shows no `phases/` directory; repo root contains no `ORCHESTRATION.md`
  5. All existing cron YAML files include `tz: America/Lima` and a NixOS rebuild has been applied
**Plans**: 4 plans

Plans:
- [ ] 06-01-PLAN.md — State DB initialization module with full v2.0 schema (TDD)
- [ ] 06-02-PLAN.md — Cleanup stale artifacts, fix cron timezone, update LORE.md
- [ ] 06-03-PLAN.md — Centralized notification module with retry and rate limiting (TDD)
- [ ] 06-04-PLAN.md — Sentinel refactor, resolve_command, sops secrets, NixOS rebuild

### Phase 7: Orchestration Engine and Agent Cron Support
**Goal**: The orchestrate.ts engine can decompose and execute multi-step tasks via `claude -p`, cron-sync accepts agent-type YAML jobs and registers them correctly, and the full capability is validated in a real systemd cron context
**Depends on**: Phase 6
**Requirements**: INFRA-04, ORCH-01, ORCH-02, ORCH-03, ORCH-04, DOCS-02, DOCS-03
**Success Criteria** (what must be TRUE):
  1. A cron YAML with `type: agent` runs successfully via the scheduler and its execution appears in the cron_log table of state.db
  2. `bin/orchestrate.ts` called from a cron context (not interactive session) successfully invokes `claude -p`, captures output, and checkpoints task state to state.db
  3. The orchestrate skill is listed in `zeroclaw skills list` output and can be invoked by the agent
  4. cron/README.md documents the agent job YAML schema with a working example
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 7 to break down)

### Phase 8: Daily Automation Crons
**Goal**: Four daily automation crons are live and delivering value — morning briefing arrives on WhatsApp every day at 07:30, EOD summary at 20:00, follow-up enforcer checks commitments 3x daily, and content scout delivers a digest
**Depends on**: Phase 7
**Requirements**: DAILY-01, DAILY-02, DAILY-03, DAILY-04, DOCS-04
**Success Criteria** (what must be TRUE):
  1. A WhatsApp message with calendar events, email summary, and pending follow-ups arrives at 07:30 America/Lima without manual intervention
  2. A WhatsApp message with the day recap (what moved, unanswered threads, tomorrow priorities) arrives at 20:00 without manual intervention
  3. When a commitment in email is left unanswered, a nudge WhatsApp message arrives at 10:00, 14:00, or 17:00 depending on staleness
  4. A daily content digest with trending topics and RSS feed items relevant to content pillars is delivered via WhatsApp
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 8 to break down)

### Phase 9: Opportunity Scanning and System Health
**Goal**: Job scanner and freelance scanner find and deduplicate leads daily with persistence to state.db, and the self-audit program runs weekly detecting any drift between git source and deployed state
**Depends on**: Phase 6
**Requirements**: SCAN-01, SCAN-02, SCAN-03, HEALTH-01, HEALTH-02
**Success Criteria** (what must be TRUE):
  1. After the job scanner runs, new job leads appear in the job_applications table in state.db filtered by criteria from LORE.md — previously seen leads are not re-notified
  2. Freelance leads from gig platforms appear in the freelance_leads table with status tracking (new/applied/interview/offer/rejected)
  3. Running `bun run /etc/nixos/zeroclaw/bin/self-audit.ts` produces a report listing any files that differ between the git source and deployed state
  4. The self-audit cron runs weekly and sends a WhatsApp notification if any drift is detected
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 9 to break down)

### Phase 10: Research, Distribution, and Cost Calibration
**Goal**: All four research and distribution crons are live, the daily cost cap is set to a calibrated value based on measured spend from previous phases, and all new programs are documented in bin/README.md
**Depends on**: Phase 8, Phase 9
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04, FIX-07, DOCS-05
**Success Criteria** (what must be TRUE):
  1. The build-in-public drafter generates a draft post from recent git activity and delivers it for human approval without auto-posting
  2. The paper scout delivers a weekly arXiv digest filtered by research interests via WhatsApp every Monday
  3. `max_cost_per_day_cents` in config.toml is set to a value derived from at least 3 days of measured actual spend — not the default 500
  4. bin/README.md lists all programs added in v2.0 with their cron schedule, inputs, and output contract
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 10 to break down)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Config Foundation | v1.0 | 1/1 | Complete | 2026-03-04 |
| 2. Scaffolding and Identity | v1.0 | 3/3 | Complete | 2026-03-04 |
| 3. Self-Modification and Resilience | v1.0 | 4/4 | Complete | 2026-03-05 |
| 4. Sentinel Verification and Cleanup | v1.0 | 2/2 | Complete | 2026-03-05 |
| 5. Publication and Release Readiness | v1.1 | 2/2 | Complete | 2026-03-05 |
| 6. Foundation Fixes and Shared Infrastructure | 3/4 | In Progress|  | - |
| 7. Orchestration Engine and Agent Cron Support | v2.0 | 0/TBD | Not started | - |
| 8. Daily Automation Crons | v2.0 | 0/TBD | Not started | - |
| 9. Opportunity Scanning and System Health | v2.0 | 0/TBD | Not started | - |
| 10. Research, Distribution, and Cost Calibration | v2.0 | 0/TBD | Not started | - |
