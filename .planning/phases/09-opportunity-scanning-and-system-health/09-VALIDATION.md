---
phase: 9
slug: opportunity-scanning-and-system-health
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — bun discovers `*.test.ts` automatically |
| **Quick run command** | `cd /etc/nixos/zeroclaw && bun test bin/self-audit.test.ts` |
| **Full suite command** | `cd /etc/nixos/zeroclaw && bun test bin/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /etc/nixos/zeroclaw && bun test bin/self-audit.test.ts`
- **After every plan wave:** Run `cd /etc/nixos/zeroclaw && bun test bin/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | SCAN-01, SCAN-02 | smoke | `bun -e "import('./bin/orchestrate.ts').then(m => { ... })"` | N/A (ESM import) | pending |
| 09-01-02 | 01 | 1 | SCAN-03 | smoke | `cron-sync --dry-run` | yes | pending |
| 09-02-01 | 02 | 2 | HEALTH-01 | unit (TDD) | `bun test bin/self-audit.test.ts` | created by task | pending |
| 09-02-02 | 02 | 2 | HEALTH-02 | smoke | `cron-sync --dry-run` | yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `bin/self-audit.test.ts` — created as part of Plan 09-02 Task 1 (TDD task writes tests first before implementation)

*Wave 0 is satisfied: the TDD task in Plan 09-02 creates the test file as its first action (RED phase), before writing production code. No separate Wave 0 plan needed.*

*Existing infrastructure covers SCAN-01/SCAN-02/SCAN-03 — scanner logic runs inside agent steps (claude -p), validated by parseYaml import and cron-sync dry-run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Job scanner finds leads from web search | SCAN-01 | Agent searches web via claude -p — not unit-testable | Run `bun run bin/orchestrate.ts cron/jobs/job-scanner.yaml` and verify leads appear in state.db |
| Freelance scanner finds leads | SCAN-02 | Same — agent web search | Run `bun run bin/orchestrate.ts cron/jobs/freelance-scanner.yaml` and verify freelance_leads table |
| WhatsApp digest sent for qualifying leads | SCAN-01, SCAN-02 | External side effect | Check WhatsApp after manual scanner run with qualifying leads |
| Self-audit cron fires weekly | HEALTH-02 | Requires actual cron execution | Verify via `zeroclaw cron list` after cron-sync |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
