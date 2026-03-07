---
phase: 6
slug: foundation-fixes-and-shared-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun built-in test runner (bun:test) |
| **Config file** | None — bun auto-discovers `*.test.ts` files |
| **Quick run command** | `bun test /etc/nixos/zeroclaw/bin/notify.test.ts` |
| **Full suite command** | `bun test /etc/nixos/zeroclaw/bin/` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test /etc/nixos/zeroclaw/bin/`
- **After every plan wave:** Run full suite + smoke checks
- **Before `/gsd:verify-work`:** Full suite must be green + `bun run /etc/nixos/zeroclaw/bin/notify.ts "test message"` sends successfully
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | INFRA-01 | unit | `bun test /etc/nixos/zeroclaw/bin/init-state-db.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | INFRA-02 | unit (mock) | `bun test /etc/nixos/zeroclaw/bin/notify.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | INFRA-02 | unit | included in notify.test.ts | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | INFRA-03 | unit | included in notify.test.ts | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | INFRA-06 | smoke | `grep -r "ALERT_TO\|kapso-whatsapp-cli" /etc/nixos/zeroclaw/bin/sentinel-scan.ts` | manual-only | ⬜ pending |
| 06-04-01 | 04 | 1 | FIX-02 | smoke | `grep "tz:" /etc/nixos/zeroclaw/cron/jobs/sentinel.yaml` | manual-only | ⬜ pending |
| 06-04-02 | 04 | 1 | FIX-03 | smoke | `test ! -f /etc/nixos/zeroclaw/bin/repair-loop.sh` | manual-only | ⬜ pending |
| 06-04-03 | 04 | 1 | FIX-05 | smoke | `ls /etc/nixos/zeroclaw/.planning/phases/` | manual-only | ⬜ pending |
| 06-04-04 | 04 | 1 | FIX-06 | smoke | `test ! -f /etc/nixos/zeroclaw/ORCHESTRATION.md` | manual-only | ⬜ pending |
| 06-05-01 | 05 | 2 | INFRA-01 | integration | `bun -e "..."` WAL mode check | manual-only | ⬜ pending |
| 06-05-02 | 05 | 2 | FIX-08 | integration | `grep NOTIFY_TARGET /run/secrets/rendered/zeroclaw.env` | manual-only | ⬜ pending |
| 06-05-03 | 05 | 2 | DOCS-01 | smoke | `grep -c "zeroclaw-data" /etc/nixos/zeroclaw/documents/LORE.md` | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `/etc/nixos/zeroclaw/bin/notify.test.ts` — stubs for INFRA-02, INFRA-03 (mock kapso-whatsapp-cli)
- [ ] `/etc/nixos/zeroclaw/bin/init-state-db.test.ts` — stubs for INFRA-01 (all tables present, WAL mode, kv_store)
- [ ] Framework install: `bun test` is built-in — no install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| sentinel-scan.ts has no ALERT_TO or inline kapso calls | INFRA-06 | Refactored code — verify absence | `grep -r "ALERT_TO\|kapso-whatsapp-cli" bin/sentinel-scan.ts` should return empty |
| Cron YAMLs include tz field | FIX-02 | Simple file check | `grep "tz:" cron/jobs/*.yaml` |
| repair-loop.sh removed | FIX-03 | File deletion | `test ! -f bin/repair-loop.sh` |
| Stale .planning/phases cleaned | FIX-05 | Only 06-* should exist | `ls .planning/phases/` |
| ORCHESTRATION.md removed from repo root | FIX-06 | File deletion | `test ! -f ORCHESTRATION.md` (at repo root) |
| state.db WAL mode enabled | INFRA-01 | Requires live DB | Check `PRAGMA journal_mode` returns `wal` |
| NOTIFY_TARGET in rendered env | FIX-08 | Requires NixOS rebuild | `grep NOTIFY_TARGET /run/secrets/rendered/zeroclaw.env` |
| LORE.md references state.db | DOCS-01 | Content update | `grep -c "zeroclaw-data" documents/LORE.md` should return 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
