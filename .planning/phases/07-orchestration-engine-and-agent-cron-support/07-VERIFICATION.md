---
phase: 07-orchestration-engine-and-agent-cron-support
verified: 2026-03-07T00:00:00Z
status: passed
score: 6/7 must-haves verified
gaps:
  - truth: "orchestrate.ts executes subtasks in parallel with dependency ordering (ORCH-02)"
    status: failed
    reason: "REQUIREMENTS.md defines ORCH-02 as parallel execution with dependency ordering. The implementation is explicitly sequential — steps run one at a time with output chaining. The plan itself made this decision (key-decision: 'Auto-decomposition deferred; cron use cases always provide explicit steps'), claiming ORCH-02 complete without delivering parallelism."
    artifacts:
      - path: "bin/orchestrate.ts"
        issue: "Uses a for-loop (sequential) over steps. No Promise.all, no concurrency, no dependency graph. Comment on line 3 reads 'sequential subtasks'."
    missing:
      - "Parallel step execution (Promise.all or equivalent) when steps have no data dependency"
      - "Dependency ordering graph or at minimum a flag/field to mark steps as parallelizable"
      - "Alternatively: REQUIREMENTS.md ORCH-02 should be formally revised to match the sequential decision, with stakeholder acknowledgment"
---

# Phase 7: Orchestration Engine and Agent Cron Support — Verification Report

**Phase Goal:** The orchestrate.ts engine can decompose and execute multi-step tasks via `claude -p`, cron-sync accepts agent-type YAML jobs and registers them correctly, and the full capability is validated in a real systemd cron context.
**Verified:** 2026-03-07
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | initStateDb() migrates v2 databases to v3 with new orchestration columns | VERIFIED | SCHEMA_VERSION=3, ALTER TABLE adds parent_id, step_index, step_output, parent_goal, yaml_source; 16 tests pass |
| 2 | claude -p probe script exists and validates cron compatibility | VERIFIED | bin/probe-claude-p.sh exists, is executable (-rwxr-xr-x), contains `env -u CLAUDECODE` guard |
| 3 | orchestrate.ts reads YAML and executes steps via claude -p with checkpointing | VERIFIED | 437 lines, imports initStateDb + notify, checkpoint-before-execute pattern, 35 tests pass |
| 4 | orchestrate.ts supports resume within 4h window and retries once on failure | VERIFIED | RESUME_WINDOW_MS=4h constant, retry loop (attempt 1..2), verified by test suite |
| 5 | cron-sync detects type: agent and auto-generates orchestrate.ts command | VERIFIED | module.nix lines 73-78: yq reads .type, agent branch generates `${pkgs.bun}/bin/bun run orchestrate.ts $(realpath "$yaml_file")` |
| 6 | Orchestrate skill provides run/status/list/cancel subcommands with tests | VERIFIED | skills/orchestrate/cli.ts implements all 4 subcommands, 6 tests pass, skill listed by zeroclaw |
| 7 | orchestrate.ts executes subtasks in parallel with dependency ordering (ORCH-02) | FAILED | Implementation is sequential (for-loop). REQUIREMENTS.md requires parallel execution with dependency ordering. Plan deviated without formally revising the requirement. |

**Score:** 6/7 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `bin/init-state-db.ts` | v2 to v3 schema migration | VERIFIED | SCHEMA_VERSION=3, 5 ALTER TABLE columns added in v2->v3 block |
| `bin/init-state-db.test.ts` | Migration test coverage | VERIFIED | Contains "v2 to v3" coverage, 16 tests pass |
| `bin/probe-claude-p.sh` | Probe script for claude -p in cron context | VERIFIED | Executable, contains `env -u CLAUDECODE`, 810 bytes |
| `bin/orchestrate.ts` | Orchestration engine, min 150 lines | VERIFIED | 437 lines, substantive implementation |
| `bin/orchestrate.test.ts` | Unit tests with mocked claude -p | VERIFIED | 726 lines, 35 tests pass |
| `module.nix` | cron-sync agent job detection | VERIFIED | Contains `type.*agent` branch on line 75, generates orchestrate.ts command |
| `skills/orchestrate/SKILL.md` | Orchestrate skill frontmatter | VERIFIED | name: orchestrate, description present |
| `skills/orchestrate/cli.ts` | Skill CLI wrapper | VERIFIED | References orchestrate.ts, uses Bun.which("bun") for runtime path |
| `skills/orchestrate/cli.test.ts` | Skill CLI subcommand tests | VERIFIED | 6 tests cover list, status, cancel, run error, unknown subcommand |
| `cron/README.md` | Agent job documentation | VERIFIED | 8 matches for "type: agent" |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| bin/orchestrate.ts | bin/init-state-db.ts | import initStateDb | WIRED | Line 11: `import { initStateDb } from "./init-state-db.ts"` |
| bin/orchestrate.ts | bin/notify.ts | import notify | WIRED | Line 12: `import { notify } from "./notify.ts"` |
| bin/orchestrate.ts | state.db orchestration_tasks | INSERT INTO orchestration_tasks | WIRED | Multiple INSERT/UPDATE statements; parent + subtask rows |
| bin/orchestrate.ts | state.db cron_log | INSERT INTO cron_log | WIRED | Line 380: `INSERT INTO cron_log (job_name, started_at, duration_ms, success)` |
| module.nix | bin/orchestrate.ts | auto-generated command string | WIRED | Line 78: `bun run /etc/nixos/zeroclaw/bin/orchestrate.ts $(realpath "$yaml_file")` |
| skills/orchestrate/cli.ts | bin/orchestrate.ts | bun subprocess | WIRED | ORCHESTRATE_BIN constant, Bun.which("bun") runtime resolution |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ORCH-01 | 07-02 | Orchestration engine decomposes tasks via claude -p into subtask graph | SATISFIED | orchestrate.ts parses YAML goal+steps, creates parent + subtask rows in orchestration_tasks, calls claude -p per step |
| ORCH-02 | 07-02 | Orchestration engine executes subtasks in parallel with dependency ordering | BLOCKED | Engine is sequential (for-loop). REQUIREMENTS.md requires parallel. Plan changed to sequential without updating the requirement. 35 tests pass but test against sequential behavior only. |
| ORCH-03 | 07-01, 07-02 | Checkpoints progress to state.db (resumable on failure) | SATISFIED | Checkpoint-before-execute pattern; resume query on yaml_source + status='running' + 4h window |
| ORCH-04 | 07-03 | Orchestration skill wraps the engine for agent invocation | SATISFIED | skills/orchestrate/ with run/status/list/cancel, installed, 6 tests pass |
| INFRA-04 | 07-03 | cron-sync supports type: agent YAML field | SATISFIED | module.nix agent detection branch generates orchestrate.ts command |
| DOCS-02 | 07-03 | cron/README.md updated with agent job YAML schema | SATISFIED | 8 occurrences of "type: agent", full schema section with example |
| DOCS-03 | 07-03 | ORCHESTRATION.md status updated to reflect implementation | SATISFIED (by decision) | ORCHESTRATION.md was deleted in Phase 6. Orchestration documented via cron/README.md + SKILL.md. Documented as a decision in 07-03-SUMMARY.md. |

**Orphaned requirements:** None. All 7 requirement IDs mapped to plans in this phase.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| bin/orchestrate.ts | 57 | `return null` | Info | Legitimate — parser function `extractScalar()` returns null when key not found. Not a stub. |

No blockers or warnings found. The `return null` is a proper nullable return from a parser helper, not a placeholder implementation.

---

## Human Verification Required

### 1. claude -p in systemd/cron context

**Test:** Run `bin/probe-claude-p.sh` from a plain terminal (not inside a Claude Code session).
**Expected:** Output ends with "PROBE: OK" and shows a numeric answer (e.g., "4").
**Why human:** The CLAUDECODE guard (`env -u CLAUDECODE`) cannot be tested from within Claude Code. Cron compatibility requires out-of-session execution.

### 2. End-to-end agent cron job registration

**Test:** Create a test YAML in `cron/jobs/` with `type: agent`, run `cron-sync`, then verify `zeroclaw cron list` shows the job with an auto-generated `bun run orchestrate.ts ...` command.
**Expected:** Job appears with the correct command string containing the absolute YAML path.
**Why human:** cron-sync reads live YAML files and mutates the zeroclaw cron DB — requires a real cron/jobs YAML and live cron-sync invocation to confirm end-to-end wiring.

### 3. NixOS rebuild confirmation

**Test:** `systemctl is-active zeroclaw` (or `systemctl --user is-active zeroclaw-gateway`).
**Expected:** "active"
**Why human:** SUMMARY claims rebuild succeeded and service is active, but service state can change after verification. Confirm the cron-sync agent detection logic is live in the running system.

---

## Gaps Summary

One gap blocks full goal achievement: **ORCH-02 parallelism**.

REQUIREMENTS.md defines ORCH-02 as "executes subtasks in parallel with dependency ordering." The plan (07-02) changed this to sequential execution mid-implementation (key-decision: "Auto-decomposition deferred; cron use cases always provide explicit steps") and marked ORCH-02 complete anyway. The implementation is correct for the sequential design — 35 tests pass, checkpoint/resume/retry all work — but the REQUIREMENTS.md contract was not fulfilled or formally revised.

**Two resolution paths:**
1. Implement parallel execution (Promise.all for steps with no prior-output dependency) to satisfy ORCH-02 as written.
2. Revise REQUIREMENTS.md ORCH-02 to match the sequential decision, accepting the scope reduction.

Path 2 is lower effort and arguably correct — the PLAN's decision note explains the rationale (cron use cases provide explicit linear steps). A gap-closure plan could update REQUIREMENTS.md and document the decision formally.

All other phase goals are achieved: the engine reads YAML, executes steps via claude -p with checkpointing and retry, cron-sync handles agent jobs, the orchestrate skill is installed and tested, and documentation is complete.

---

_Verified: 2026-03-07_
_Verifier: Claude (gsd-verifier)_
