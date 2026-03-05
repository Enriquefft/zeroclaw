# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — Kiro MVP

**Shipped:** 2026-03-05
**Phases:** 4 | **Plans:** 10 | **Timeline:** 1 day

### What Was Built

- ZeroClaw config.toml wired with 5 sections (autonomy, memory, observability, agent, IPC) — Kiro passes health checks
- Operational docs: CLAUDE.md deployment guide, skills/README.md, cron/README.md
- All 6 identity documents migrated from OpenClaw to ZeroClaw-native tooling
- Self-modification policy table + unconditional self-repair mandate in AGENTS.md
- repair-loop skill: callable `repair_loop` tool for durable issue filing before repair
- Sentinel cron: 2-hour automated error detection, repair invocation, WhatsApp escalation
- Multi-Agent IPC configured and documented
- Live verification: memory prefix scan confirmed, sentinel E2E detection passed

### What Worked

- **GSD wave execution** — parallel plan execution within phases kept context lean and progress fast
- **Checkpoint gates for human-action tasks** — the pattern of stopping and handing off interactive ZeroClaw commands to the user worked well; no guessing at live session results
- **Phase 4 gap closure loop** — the gaps_found → plan-phase --gaps → execute-phase --gaps-only cycle closed all verification gaps cleanly
- **SUMMARY.md as evidence chain** — detailed summaries made the verifier's job tractable across 10 plans

### What Was Inefficient

- **memory_store permission gate discovery** — the first checkpoint attempt (Phase 4 plan 01) was blocked by the interactive permission gate; needed a second plan and session to resolve. Could have been caught earlier by reading AGENTS.md permission model before planning the test
- **`mkOutOfStoreSymlink` → `home.activation` pivot** — the symlink approach required a quick fix mid-milestone (quick-3). Pre-reading NixOS home-manager symlink docs would have avoided this
- **`max_actions_per_hour` missing field** — added as a quick fix when `zeroclaw cron list` failed. A quick `zeroclaw --version` + config schema check at project start would have caught this
- **Phase 2 plan count mismatch** — roadmap showed 2/3 complete at milestone completion even though all 3 plans had SUMMARYs; minor tracking artifact

### Patterns Established

- `bin/` directory for skill scripts — `.sh` files rejected inside skill packages; `bin/<script>.sh` + absolute SKILL.toml path is the approved pattern
- `home.activation` for document symlinks — not `mkOutOfStoreSymlink` (multi-hop issues)
- Checkpoint type `human-action` for ZeroClaw agent sessions — coding agents cannot run `zeroclaw agent`; always route to user
- `memory_recall("issue:")` prefix scan pattern — confirmed working; sentinel skill correctly uses this
- Test seeding + cleanup protocol — seed issue → trigger sentinel → verify detection → mark resolved; prevents lingering test artifacts firing real alerts

### Key Lessons

1. **Interactive ZeroClaw sessions require the user** — `zeroclaw agent` cannot be invoked by Claude Code (no API key in that context). Any plan task requiring a live ZeroClaw session must be `type="checkpoint:human-action"`.
2. **Config schema changes need pre-flight** — before any ZeroClaw CLI usage, verify `zeroclaw cron list` works to catch missing required config fields early.
3. **Permission gates are session-type-specific** — `memory_store` requires user approval in interactive sessions but cron-triggered sessions (sentinel) are unaffected. This matters for test design.
4. **Infrastructure quick fixes accumulate** — 4 `/gsd:quick` fixes were needed mid-milestone. Consider a "pre-flight" phase that validates the ZeroClaw runtime state before deeper implementation phases.

### Cost Observations

- Model mix: 100% sonnet (all orchestrators and subagents)
- Sessions: ~6 Claude Code sessions across 1 day
- Notable: GSD's subagent architecture kept orchestrator context at ~10-15%; fresh 200k per executor meant no context degradation across 10 plans

---

## Milestone: v1.1 — Public Release

**Shipped:** 2026-03-05
**Phases:** 1 | **Plans:** 2

### What Was Built

- README.md (166 lines) — public repo landing page with deployment model, live-edit guide, personalizing table for external visitors
- MIT LICENSE — Enrique Flores 2026, standard for NixOS configs
- GitHub repo description + 6 topics (`nixos`, `nix`, `home-manager`, `zeroclaw`, `ai-agent`, `nix-flakes`)
- GitHub release v1.0 with polished notes at github.com/Enriquefft/zeroclaw/releases/tag/v1.0
- config.toml migrated to sops template for secret injection at activation time
- Task execution skill framework: routing, fix-task, coding-task, heavy-task

### What Worked

- **Fast execution** — both plans took under 10 minutes total; publication work is low-friction when the infrastructure is solid
- **gh CLI for GitHub operations** — `gh repo edit`, `gh release create` handled all GitHub API operations without browser; zero friction
- **GSD quick tasks** — handled the config.toml sops migration and symlink fixes without interrupting the main phase flow

### What Was Inefficient

- **Accomplishments not auto-captured by gsd-tools** — the `milestone complete` CLI returned empty accomplishments because `summary-extract` path resolution failed. The tool couldn't find the summary files by their relative paths. Required manual MILESTONES.md update.
- **ROADMAP.md progress table stale** — showed "1/2" for Phase 5 even though both plans had SUMMARYs; the roadmap_complete field in `roadmap analyze` was false despite disk_status being complete. Minor tracking artifact.

### Patterns Established

- `--target main` for GitHub releases when tag pre-exists in git — prevents duplicate tag errors
- On-demand reference pattern: symlink large context files to `reference/` but don't auto-load; agent fetches on demand
- sops template pattern for config.toml: rendered at NixOS activation via `config.sops.templates`, symlinked to `/run/secrets/rendered/zeroclaw-config`

### Key Lessons

1. **Publication phases are fast but need a PR checklist mindset** — README quality, license choice, GitHub metadata are judgment calls. Worth having explicit success criteria (as Phase 5 did) to avoid "good enough" vs "done" ambiguity.
2. **gsd-tools summary-extract uses relative paths** — when running from a different working directory, path resolution fails silently. Always verify accomplishments were captured before completing milestone archival.

### Cost Observations

- Model mix: 100% sonnet
- Sessions: 2-3 Claude Code sessions
- Notable: v1.1 was a lightweight milestone — 2 plans, pure publication work. Validates the milestone scoping approach (v1.0 = foundation, v1.1 = public face)

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.1 |
|--------|------|------|
| Plans/phase avg | 2.5 | 2.0 |
| Quick fixes needed | 4 | 3 |
| Verification gaps closed | 2 | 0 |
| Timeline | 1 day | 1 day |
| Human-action checkpoints | 3 | 0 |
