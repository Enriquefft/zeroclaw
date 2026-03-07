---
phase: 7
slug: orchestration-engine-and-agent-cron-support
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in) |
| **Config file** | none — `bun test <file>` directly |
| **Quick run command** | `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts` |
| **Full suite command** | `cd /etc/nixos/zeroclaw && bun test bin/ skills/orchestrate/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts`
- **After every plan wave:** Run `cd /etc/nixos/zeroclaw && bun test bin/ skills/orchestrate/`
- **Before `/gsd:verify-work`:** Full suite must be green + manual skill list check + probe test confirmed
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 07-01-01 | 01 | 1 | ORCH-03 | unit | `bun test bin/init-state-db.test.ts` | pending |
| 07-01-02 | 01 | 1 | ORCH-01 | smoke | `test -x bin/probe-claude-p.sh` | pending |
| 07-02-01 | 02 (TDD) | 2 | ORCH-01 | unit | `bun test bin/orchestrate.test.ts` | pending |
| 07-02-02 | 02 (TDD) | 2 | ORCH-02 | unit | `bun test bin/orchestrate.test.ts` | pending |
| 07-02-03 | 02 (TDD) | 2 | ORCH-03 | unit | `bun test bin/orchestrate.test.ts` | pending |
| 07-03-01 | 03 | 3 | INFRA-04 | syntax | `nix flake check` | pending |
| 07-03-02 | 03 | 3 | ORCH-04 | unit | `bun test skills/orchestrate/cli.test.ts` | pending |
| 07-03-03 | 03 | 3 | ORCH-04 | smoke | `zeroclaw skills list \| grep orchestrate` | pending |
| 07-03-04 | 03 | 3 | DOCS-02 | smoke | `grep -c "type: agent" cron/README.md` | pending |
| 07-03-05 | 03 | 3 | INFRA-04 | smoke | `systemctl is-active zeroclaw` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

All Wave 0 test file dependencies are satisfied:

- [x] `bin/init-state-db.test.ts` — already exists (extended in Plan 01 Task 1, TDD task creates tests before code)
- [x] `bin/orchestrate.test.ts` — created by Plan 02 (TDD plan: test file is the FIRST artifact of RED phase, created before production code)
- [x] `skills/orchestrate/cli.test.ts` — created by Plan 03 Task 2 (TDD task with `tdd="true"`, tests written before cli.ts implementation)

**Note:** Plan 02 is `type: tdd`, which means it creates `orchestrate.test.ts` as its first action (RED phase). The test file does not need to pre-exist before Wave 2 because the TDD plan's entire purpose is to write tests first. Similarly, Plan 03 Task 2 has `tdd="true"` and writes `cli.test.ts` before implementing `cli.ts`.

*Bun test framework is already available — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Agent job runs via cron scheduler | INFRA-04 | Requires real cron trigger (>30s wait) | Add test YAML with `*/1 * * * *`, wait 2 min, check `cron_log` |
| `claude -p` works in systemd context | ORCH-01 | CLAUDECODE env var blocks in test session | Run `bin/probe-claude-p.sh` from plain terminal (not Claude Code) |
| cron/README.md has agent schema | DOCS-02 | Documentation review | Read file, verify agent YAML section exists |
| ORCHESTRATION.md reflects implementation | DOCS-03 | Documentation review | Noted in SUMMARY — original file deleted in Phase 6, docs live in cron/README.md |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all test file dependencies (TDD plans create their own)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
