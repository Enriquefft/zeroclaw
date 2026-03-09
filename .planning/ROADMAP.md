# Roadmap: ZeroClaw Infrastructure

## Milestones

- ✅ **v1.0 Kiro MVP** — Phases 1-4 (shipped 2026-03-05)
- ✅ **v1.1 Public Release** — Phase 5 (shipped 2026-03-05)
- ✅ **v2.0 Heartbeat** — Phases 6-10 (shipped 2026-03-08)
- 🚧 **v2.1 Hardening** — Phases 11-14 (in progress)

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

<details>
<summary>✅ v2.0 Heartbeat (Phases 6-10) — SHIPPED 2026-03-08</summary>

- [x] Phase 6: Foundation Fixes and Shared Infrastructure (4/4 plans) — completed 2026-03-07
- [x] Phase 7: Orchestration Engine and Agent Cron Support (3/3 plans) — completed 2026-03-07
- [x] Phase 8: Daily Automation Crons (2/2 plans) — completed 2026-03-07
- [x] Phase 9: Opportunity Scanning and System Health (2/2 plans) — completed 2026-03-07
- [x] Phase 10: Research, Distribution, and Cost Calibration (2/2 plans) — completed 2026-03-08

See `.planning/milestones/v2.0-ROADMAP.md` for full phase details.

</details>

### 🚧 v2.1 Hardening (In Progress)

**Milestone Goal:** Verify and fix all v2.0 automation so every cron job, notification path, document, and skill works reliably in production before adding new capabilities.

- [ ] **Phase 11: Cron Runtime Verification** - Confirm all 12 crons execute and notifications deliver end-to-end
- [ ] **Phase 12: Test Coverage** - Add test files for every untested program and skill CLI
- [ ] **Phase 13: Documentation Audit** - Remove stale references, enforce updated conventions
- [ ] **Phase 14: Final Verification** - Cost calibration, atomic writes, and clean self-audit pass

## Phase Details

### Phase 11: Cron Runtime Verification
**Goal**: All 12 cron jobs execute without errors and WhatsApp notification delivery is confirmed end-to-end
**Depends on**: Phase 10 (v2.0 complete)
**Requirements**: CRON-01, CRON-02, CRON-03, CONF-01
**Success Criteria** (what must be TRUE):
  1. All 12 cron jobs show successful execution status with no spawn or PATH errors in logs
  2. Agent jobs using `claude -p` complete end-to-end when triggered from the systemd daemon context
  3. WhatsApp notifications from at least one cron job arrive on the recipient device with content intact
  4. config.toml file permissions are 600 (owner-read/write only, no world-readable warning)
**Plans**: TBD

Plans:
- [ ] 11-01: Verify CRON-01 PATH fix and confirm all 12 jobs execute cleanly
- [ ] 11-02: Verify CRON-02 claude -p end-to-end in systemd and fix CRON-03 WhatsApp session; apply CONF-01 permissions fix

### Phase 12: Test Coverage
**Goal**: Every untested bin/ program and skill CLI has at least one test file exercising its core logic
**Depends on**: Phase 11
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. sentinel-scan.ts has a test file that exercises issue parsing and alert-trigger logic
  2. zai-proxy.ts has a test file that exercises request routing and cost-tracking logic
  3. calendar skill CLI has a test file covering its core operations
  4. email skill CLI has a test file covering its core operations
  5. All existing tests (init-state-db, notify, orchestrate, self-audit) pass without modification
**Plans**: TBD

Plans:
- [ ] 12-01: Write test files for sentinel-scan.ts and zai-proxy.ts
- [ ] 12-02: Write test files for calendar and email skill CLIs; verify all existing tests pass

### Phase 13: Documentation Audit
**Goal**: All MD files are accurate, cross-referenced, and enforce current conventions — no stale tags, broken links, or outdated guidance
**Depends on**: Phase 11
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. LORE.md contains no "not yet migrated" tags (all referenced files exist or tags are removed)
  2. A full cross-reference pass finds no broken internal links or stale file references across all MD files
  3. SKILL-CREATOR.md explicitly mandates a test file for every skill with a CLI
  4. CLAUDE.md files (project and zeroclaw) accurately describe the current codebase with no outdated instructions
**Plans**: TBD

Plans:
- [ ] 13-01: Audit LORE.md tags and cross-reference all MD files for broken references
- [ ] 13-02: Update SKILL-CREATOR.md with test mandate; review and correct CLAUDE.md accuracy

### Phase 14: Final Verification
**Goal**: Cost calibration is set from real data, atomic write safety is enforced, and a clean self-audit confirms zero infrastructure drift
**Depends on**: Phase 11 (requires 3+ days of cron execution data)
**Requirements**: CONF-02, CONF-03, CRON-04
**Success Criteria** (what must be TRUE):
  1. max_cost_per_day_cents in config.toml is set to a value derived from at least 3 days of measured spend
  2. company-refresh LORE.md writes use an atomic temp-file-plus-rename pattern (no partial-write risk)
  3. Self-audit runs clean with zero drift detected across all checked dimensions
**Plans**: TBD

Plans:
- [ ] 14-01: Apply CONF-03 atomic write fix to company-refresh; measure 3+ days of cost data and update CONF-02
- [ ] 14-02: Run CRON-04 self-audit end-to-end and confirm clean pass

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Config Foundation | v1.0 | 1/1 | Complete | 2026-03-04 |
| 2. Scaffolding and Identity | v1.0 | 3/3 | Complete | 2026-03-04 |
| 3. Self-Modification and Resilience | v1.0 | 4/4 | Complete | 2026-03-05 |
| 4. Sentinel Verification and Cleanup | v1.0 | 2/2 | Complete | 2026-03-05 |
| 5. Publication and Release Readiness | v1.1 | 2/2 | Complete | 2026-03-05 |
| 6. Foundation Fixes and Shared Infrastructure | v2.0 | 4/4 | Complete | 2026-03-07 |
| 7. Orchestration Engine and Agent Cron Support | v2.0 | 3/3 | Complete | 2026-03-07 |
| 8. Daily Automation Crons | v2.0 | 2/2 | Complete | 2026-03-07 |
| 9. Opportunity Scanning and System Health | v2.0 | 2/2 | Complete | 2026-03-07 |
| 10. Research, Distribution, and Cost Calibration | v2.0 | 2/2 | Complete | 2026-03-08 |
| 11. Cron Runtime Verification | v2.1 | 0/2 | Not started | - |
| 12. Test Coverage | v2.1 | 0/2 | Not started | - |
| 13. Documentation Audit | v2.1 | 0/2 | Not started | - |
| 14. Final Verification | v2.1 | 0/2 | Not started | - |
