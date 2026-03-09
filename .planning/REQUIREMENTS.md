# Requirements: ZeroClaw Infrastructure

**Defined:** 2026-03-09
**Core Value:** A robust, extensible foundation that enables Kiro to grow and self-modify without friction

## v2.1 Requirements

Requirements for the Hardening milestone. Each maps to roadmap phases.

### Cron Runtime

- [ ] **CRON-01**: All 12 cron jobs execute without spawn errors after PATH fix
- [ ] **CRON-02**: Orchestration-based agent jobs complete end-to-end (claude -p works in systemd daemon context)
- [ ] **CRON-03**: WhatsApp notification sends succeed (session window resolved, delivery confirmed)
- [ ] **CRON-04**: Self-audit runs clean with zero drift after all fixes applied

### Documentation

- [ ] **DOCS-01**: LORE.md "not yet migrated" tags removed (reference files exist)
- [ ] **DOCS-02**: All MD files cross-referenced for stale or broken references
- [ ] **DOCS-03**: SKILL-CREATOR.md updated to mandate test file for every skill CLI
- [ ] **DOCS-04**: CLAUDE.md files verified accurate for current project state

### Testing

- [ ] **TEST-01**: sentinel-scan.ts has test file covering issue parsing and alert logic
- [ ] **TEST-02**: zai-proxy.ts has test file covering request routing and cost tracking
- [ ] **TEST-03**: calendar skill CLI has test file covering core operations
- [ ] **TEST-04**: email skill CLI has test file covering core operations
- [ ] **TEST-05**: All existing tests pass (init-state-db, notify, orchestrate, self-audit)

### Config & Security

- [ ] **CONF-01**: config.toml file permissions restricted to 600 (owner-only)
- [ ] **CONF-02**: Cost calibration completed (measure actual spend, set max_cost_per_day_cents)
- [ ] **CONF-03**: company-refresh LORE.md writes use atomic update pattern (temp file + rename)

## Future Requirements

### Observability

- **OBS-01**: Dashboard or reporting for cron job health and token cost tracking
- **OBS-02**: Alerting on consecutive cron failures

### Advanced Automation

- **AUTO-01**: Auto-apply to high-confidence job matches
- **AUTO-02**: Smart scheduling based on job success patterns

## Out of Scope

| Feature | Reason |
|---------|--------|
| New cron jobs | Hardening only — no new automation until existing works |
| New skills | Stabilize existing 3 skills first |
| OpenClaw migration | Clean break achieved in v1.0, not revisiting |
| Model provider changes | Z.AI working, no reason to change |
| UI/dashboard | Deferred to future milestone (OBS-01) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CRON-01 | Phase 11 | Pending |
| CRON-02 | Phase 11 | Pending |
| CRON-03 | Phase 11 | Pending |
| CONF-01 | Phase 11 | Pending |
| TEST-01 | Phase 12 | Pending |
| TEST-02 | Phase 12 | Pending |
| TEST-03 | Phase 12 | Pending |
| TEST-04 | Phase 12 | Pending |
| TEST-05 | Phase 12 | Pending |
| DOCS-01 | Phase 13 | Pending |
| DOCS-02 | Phase 13 | Pending |
| DOCS-03 | Phase 13 | Pending |
| DOCS-04 | Phase 13 | Pending |
| CONF-02 | Phase 14 | Pending |
| CONF-03 | Phase 14 | Pending |
| CRON-04 | Phase 14 | Pending |

**Coverage:**
- v2.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after roadmap creation*
