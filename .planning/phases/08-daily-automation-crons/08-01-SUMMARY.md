---
phase: 08-daily-automation-crons
plan: "01"
subsystem: cron-jobs
tags: [agent-cron, daily-automation, morning-briefing, eod-summary, follow-up-enforcer, content-scout, tdd]
dependency_graph:
  requires: []
  provides: [DAILY-01, DAILY-02, DAILY-03, DAILY-04]
  affects: [bin/orchestrate.ts, cron-sync]
tech_stack:
  added: []
  patterns: [type-agent-yaml, conditional-notify, parseYaml-regex-safety]
key_files:
  created:
    - cron/jobs/morning-briefing.yaml
    - cron/jobs/eod-summary.yaml
    - cron/jobs/follow-up-enforcer.yaml
    - cron/jobs/content-scout.yaml
  modified:
    - bin/orchestrate.test.ts
decisions:
  - "Steps use single-line format with no inner double-quotes — parseYaml regex /^\\s+-\\s+\"?(.+?)\"?\\s*$/ uses lazy matching that truncates at first inner quote"
  - "Enforcer and content-scout omit top-level notify: field — both use conditional in-step sending so silence is the default when nothing is actionable"
  - "Idempotency guards use daily_state table with briefing_sent/eod_sent flags checked via date('now', '-5 hours') for Lima timezone"
  - "Follow-up enforcer urgency tiers: hour 10=gentle (5d), hour 14=warning (3d), hour 17=urgent (any age)"
metrics:
  duration: "2 minutes"
  completed_date: "2026-03-07"
  tasks_completed: 3
  files_created: 4
  files_modified: 1
  tests_added: 5
  tests_total: 40
---

# Phase 8 Plan 1: Daily Automation Cron YAMLs Summary

Four `type: agent` cron YAML files wired for daily heartbeat automation — morning briefing (07:30), EOD summary (20:00), follow-up enforcer (10/14/17:00), and content scout (08:00) — all validated with 5 new parseYaml tests using TDD.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add parseYaml tests for 4 new YAML files (RED) | 5072605 | bin/orchestrate.test.ts |
| 2 | Create morning-briefing.yaml and eod-summary.yaml | b5548fb | cron/jobs/morning-briefing.yaml, cron/jobs/eod-summary.yaml |
| 3 | Create follow-up-enforcer.yaml and content-scout.yaml | ecaca81 | cron/jobs/follow-up-enforcer.yaml, cron/jobs/content-scout.yaml |

## What Was Built

### morning-briefing.yaml (DAILY-01)
- Schedule: `30 7 * * *` — 07:30 Lima daily
- 4 steps: calendar fetch, email check, state.db follow-up query with idempotency guard, compose and send WhatsApp
- notify: `+51926689401`
- Idempotency: checks `daily_state.briefing_sent` before sending

### eod-summary.yaml (DAILY-02)
- Schedule: `0 20 * * *` — 20:00 Lima daily
- 5 steps: git/task completion count, job/lead/email activity, tomorrow calendar, follow-up priorities, compose and send with idempotency guard
- notify: `+51926689401`
- Idempotency: checks `daily_state.eod_sent` before sending

### follow-up-enforcer.yaml (DAILY-03)
- Schedule: `0 10,14,17 * * *` — 10:00, 14:00, 17:00 Lima daily
- 3 steps: urgency tier detection, stale item collection, conditional send
- No top-level notify field — silent by default when nothing is stale
- Urgency tiers: hour 10 = gentle (5d threshold), hour 14 = warning (3d), hour 17 = urgent (any age)

### content-scout.yaml (DAILY-04)
- Schedule: `0 8 * * *` — 08:00 Lima daily
- 4 steps: RSS feed aggregation (8 feeds), web search (2-3 queries), pillar filtering (5 pillars), conditional digest send
- No top-level notify field — silent by default when no relevant content
- Content pillars: build-in-public, AI/agent engineering, job hunt/market, startup/founder, ML research

## Verification

```
bun test bin/orchestrate.test.ts
40 pass, 0 fail
```

YAML step counts (verified via grep):
- morning-briefing.yaml: 4 steps
- eod-summary.yaml: 5 steps
- follow-up-enforcer.yaml: 3 steps
- content-scout.yaml: 4 steps

All have `type: agent`.

## Decisions Made

1. **No inner double-quotes in step text** — parseYaml regex `/^\s+-\s+"?(.+?)"?\s*$/` uses lazy matching; inner `"` would truncate step content. All steps use `--` instead of colons where needed, and avoid inner quotes.

2. **Conditional notify pattern** — enforcer and content-scout omit `notify:` field at top level. These jobs are silent by default; the final step conditionally sends via kapso-whatsapp-cli only when actionable content exists. This prevents "all clear" noise messages.

3. **Idempotency via daily_state** — morning briefing and EOD summary check `briefing_sent`/`eod_sent` flags before composing and sending, using `date('now', '-5 hours')` for Lima timezone alignment with SQLite's UTC storage.

## TDD Execution

- RED: 5 new test cases added to `orchestrate.test.ts`. 4 file-based tests failed (YAML files didn't exist). Colons utility test passed immediately.
- GREEN: 4 YAML files created. All 40 tests pass.
- REFACTOR: Not needed — plan followed exactly.

## Deviations from Plan

None — plan executed exactly as written.

Single minor formatting adaptation: replaced `--` for `—` in step text (same with SQL comment `--`) to avoid any YAML parser ambiguity while preserving readability.

## Self-Check: PASSED

Files exist:
- /etc/nixos/zeroclaw/cron/jobs/morning-briefing.yaml: FOUND
- /etc/nixos/zeroclaw/cron/jobs/eod-summary.yaml: FOUND
- /etc/nixos/zeroclaw/cron/jobs/follow-up-enforcer.yaml: FOUND
- /etc/nixos/zeroclaw/cron/jobs/content-scout.yaml: FOUND

Commits exist:
- 5072605: FOUND (test RED)
- b5548fb: FOUND (morning-briefing + eod-summary)
- ecaca81: FOUND (follow-up-enforcer + content-scout)

Tests: 40 pass, 0 fail.
