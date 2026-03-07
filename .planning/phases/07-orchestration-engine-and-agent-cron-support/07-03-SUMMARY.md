---
phase: 07-orchestration-engine-and-agent-cron-support
plan: "03"
subsystem: cron-scheduler, orchestrate-skill, documentation
tags: [cron, orchestration, skills, nixos-rebuild, tdd]
requirements: [INFRA-04, ORCH-04, DOCS-02, DOCS-03]

dependency_graph:
  requires: ["07-02"]
  provides: [cron-agent-job-detection, orchestrate-skill, agent-job-docs]
  affects: [module.nix, skills/orchestrate/, cron/README.md]

tech_stack:
  added: []
  patterns:
    - "type: agent YAML field triggers cron-sync auto-command generation"
    - "Skill CLI queries state.db directly via initStateDb() for status/list/cancel"
    - "run subcommand calls orchestrate.ts via Bun subprocess (Bun.which for runtime path)"
    - "--db-path flag used across all subcommands for test isolation"

key_files:
  created:
    - skills/orchestrate/SKILL.md
    - skills/orchestrate/cli.ts
    - skills/orchestrate/cli.test.ts
  modified:
    - module.nix (cron-sync agent job type detection)
    - cron/README.md (agent job schema + documentation)

decisions:
  - "DOCS-03 addressed in SUMMARY: orchestration documented via cron/README.md agent section, no separate ORCHESTRATION.md needed — file was deleted in Phase 6 (FIX-06)"
  - "skills audit requires absolute path to skill dir, not relative ./skills/orchestrate"
  - "Bun.which('bun') used in cli.ts for runtime path resolution — never Nix interpolation in TypeScript"

metrics:
  duration: "5 min"
  completed_date: "2026-03-07"
  tasks_completed: 3
  files_modified: 5
---

# Phase 7 Plan 03: cron-sync agent detection, orchestrate skill, NixOS rebuild Summary

One-liner: Extended cron-sync to auto-generate orchestrate.ts commands for `type: agent` YAML jobs, created the orchestrate skill (run/status/list/cancel), and applied a NixOS rebuild to activate changes.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Extend cron-sync for agent job type detection | `1f8c026` |
| 2 (RED) | Add failing tests for orchestrate skill CLI | `a175257` |
| 2 (GREEN) | Create orchestrate SKILL.md and cli.ts (6/6 tests pass) | `f59adfa` |
| 3 | Update cron/README.md with agent schema; NixOS rebuild applied | `d5fc487` |

## What Was Built

### Task 1: cron-sync Agent Job Detection (module.nix)

Before extracting `command`, the YAML processing loop now reads `job_type`:

```bash
job_type=$(yq -r '.type // "shell"' "$yaml_file")

if [[ "$job_type" == "agent" ]]; then
  command="${pkgs.bun}/bin/bun run /etc/nixos/zeroclaw/bin/orchestrate.ts $(realpath "$yaml_file")"
else
  command=$(resolve_command "$(yq -r '.command' "$yaml_file")")
fi
```

- `${pkgs.bun}` is Nix interpolation — resolves to the absolute nix store path at build time
- `$(realpath "$yaml_file")` gives canonical absolute path to the YAML
- Shell jobs continue to use `resolve_command()` unchanged

### Task 2: Orchestrate Skill (TDD)

**SKILL.md** frontmatter: `name: orchestrate`, `description: Run multi-step tasks via claude -p...`

**cli.ts** subcommands:
- `list` — queries `orchestration_tasks WHERE parent_id IS NULL`, returns JSON array
- `status [id]` — without ID: same as list; with ID: parent + children subtask rows with `steps: []`
- `cancel <id>` — UPDATEs pending/running subtasks + parent to `cancelled`, returns `{cancelled, subtasks_cancelled, parent_cancelled}`
- `run <target>` — detects file vs inline goal, creates temp YAML for inline goals, calls `orchestrate.ts` via Bun subprocess

**cli.test.ts** — 6 tests covering all subcommands + error cases. All pass.

### Task 3: Documentation + NixOS Rebuild

**cron/README.md** updates:
- YAML Schema section now shows both shell and agent formats side-by-side
- Job Types table updated with `type` field column and agent row
- New "Agent Job YAML Schema" section with full schema, how-it-works steps, and daily email example

**DOCS-03 resolution:** The original `ORCHESTRATION.md` was deleted in Phase 6 (FIX-06). Orchestration is now documented through:
- `cron/README.md` — agent job YAML schema and workflow
- `bin/orchestrate.ts` — the implementation
- `skills/orchestrate/SKILL.md` — skill usage and CLI reference
No separate ORCHESTRATION.md is needed.

**NixOS rebuild** applied — `cron-sync` now contains agent detection, `skills-sync` ran automatically, orchestrate skill installed.

## Verification Results

- `nix flake check --impure` — passes (no syntax errors)
- `bun test skills/orchestrate/cli.test.ts` — 6 pass, 0 fail
- `zeroclaw skills audit /etc/nixos/zeroclaw/skills/orchestrate` — audit passed (4 files scanned)
- `zeroclaw skills list | grep orchestrate` — `orchestrate v0.1.0` listed
- `grep "type: agent" cron/README.md` — 8 matches
- `systemctl --user is-active zeroclaw-gateway` — active
- NixOS rebuild succeeded (8 derivations built)

## Deviations from Plan

### Auto-noted Issues

**1. skills audit relative path** — `zeroclaw skills audit ./skills/orchestrate` fails when cwd is not `/etc/nixos/zeroclaw`. Used absolute path `/etc/nixos/zeroclaw/skills/orchestrate` in verification. This is a ZeroClaw binary behavior, not a bug in the skill.

None of the three plan tasks required deviation from the specified approach. The implementation matches plan specifications exactly.

## Requirements Satisfied

| Requirement | Status |
|-------------|--------|
| INFRA-04 | Done — cron-sync auto-generates orchestrate.ts command for type: agent YAML |
| ORCH-04 | Done — orchestrate skill installed with run/status/list/cancel subcommands |
| DOCS-02 | Done — cron/README.md documents agent job schema with working example |
| DOCS-03 | Done — addressed in SUMMARY (no separate ORCHESTRATION.md needed) |

## Self-Check: PASSED

All created files exist. All task commits verified in git log.

| Item | Status |
|------|--------|
| module.nix | FOUND |
| skills/orchestrate/SKILL.md | FOUND |
| skills/orchestrate/cli.ts | FOUND |
| skills/orchestrate/cli.test.ts | FOUND |
| cron/README.md | FOUND |
| commit 1f8c026 (cron-sync agent detection) | FOUND |
| commit a175257 (failing tests RED) | FOUND |
| commit f59adfa (skill implementation GREEN) | FOUND |
| commit d5fc487 (docs + rebuild) | FOUND |
