---
phase: 10
slug: research-distribution-and-cost-calibration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — bun discovers `*.test.ts` automatically |
| **Quick run command** | `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts` |
| **Full suite command** | `cd /etc/nixos/zeroclaw && bun test bin/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts`
- **After every plan wave:** Run `cd /etc/nixos/zeroclaw && bun test bin/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | DIST-01 | unit (YAML parse) | `bun test bin/orchestrate.test.ts` | Partial | ⬜ pending |
| 10-01-02 | 01 | 1 | DIST-02 | unit (YAML parse) | `bun test bin/orchestrate.test.ts` | Partial | ⬜ pending |
| 10-01-03 | 01 | 1 | DIST-03 | unit (YAML parse) | `bun test bin/orchestrate.test.ts` | Partial | ⬜ pending |
| 10-01-04 | 01 | 1 | DIST-04 | unit (YAML parse) | `bun test bin/orchestrate.test.ts` | Partial | ⬜ pending |
| 10-02-01 | 02 | 2 | FIX-07 | manual | `grep max_cost_per_day_cents config.toml` | N/A | ⬜ pending |
| 10-02-02 | 02 | 2 | DOCS-05 | manual | `cat bin/README.md` | Partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* The `parseYaml` tests in `orchestrate.test.ts` already validate YAML structure. New YAML files are validated through the same parsing logic.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Build-in-public drafter generates draft from git activity | DIST-01 | Steps run via `claude -p` — not unit-testable | `bun run orchestrate.ts cron/jobs/build-in-public-drafter.yaml --db-path /tmp/test.db` and inspect WhatsApp output |
| Engagement scout finds relevant threads | DIST-02 | Agent web search not mockable | `bun run orchestrate.ts cron/jobs/engagement-scout.yaml --db-path /tmp/test.db` and inspect output |
| Paper scout delivers weekly arXiv digest | DIST-03 | Agent RSS fetch + LLM filtering | `bun run orchestrate.ts cron/jobs/paper-scout.yaml --db-path /tmp/test.db` and check WhatsApp |
| Company refresh updates LORE.md correctly | DIST-04 | Agent writes to live file | Run and verify LORE.md Target Companies section updated without overwriting other sections |
| Cost cap set to calibrated value | FIX-07 | Requires 3+ days of measurement data | `grep max_cost_per_day_cents /etc/nixos/zeroclaw/config.toml` — verify not 500 |
| bin/README.md lists all v2.0 programs | DOCS-05 | Documentation review | `cat /etc/nixos/zeroclaw/bin/README.md` — verify all 6 programs listed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
