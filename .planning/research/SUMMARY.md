# Project Research Summary

**Project:** ZeroClaw v2.0 Heartbeat — Kiro Chief-of-Staff Cron Infrastructure
**Domain:** Autonomous AI agent infrastructure on NixOS (ZeroClaw daemon + scheduled cron programs)
**Researched:** 2026-03-06
**Confidence:** HIGH

## Executive Summary

ZeroClaw v2.0 Heartbeat adds 11 scheduled cron jobs to an already-operational autonomous agent system. The research confirms a clean addition pattern: the existing v1.0 three-layer architecture (source-of-truth/deployment/runtime) remains unchanged, and v2.0 slots new components into the runtime layer without touching NixOS services — except for one `module.nix` change to `cron-sync` to support agent-type job registration. The dominant architectural decision is infrastructure-first: a shared SQLite state database and centralized WhatsApp notification module must be built before any heartbeat cron goes live. All 11 jobs depend on these two building blocks. Building them after the jobs would require retrofitting every program.

The recommended approach divides the 11 jobs into deterministic shell programs (8 jobs: job scanner, freelance scanner, follow-up enforcer, morning briefing, content scout, paper scout, engagement scout, self-audit) and LLM-driven agent jobs (3 jobs: build-in-public drafter, EOD summary, company research refresh). Shell programs are testable in isolation with `bun run`, use `bun:sqlite` for state, and wire to the cron scheduler without daemon dependency. Agent jobs require the cron-sync overhaul to complete first. This split allows shell program development and cron-sync overhaul to proceed in parallel, reducing the critical path. The orchestration engine (`orchestrate.ts` via `claude -p`) is deferred complexity — build it in Phase 1 infrastructure but only invoke it if a program proves too complex for single-pass execution.

The key risks cluster around three themes: concurrency (SQLite WAL mode must be enabled at DB creation or concurrent morning jobs deadlock each other), cost (the current 500-cent/day cap was calibrated for a zero-token cron system and will be exhausted by mid-morning with 11 agent crons), and environment (the `claude -p` subprocess and any new cron binaries must be resolved to absolute Nix store paths or they fail silently in systemd's stripped PATH). All three have clear prevention strategies documented in PITFALLS.md and can be addressed in the correct phases before they become production incidents.

## Key Findings

### Recommended Stack

The v2.0 stack requires only three new npm dependencies on top of the existing foundation: `feedsmith` for RSS/Atom feed parsing (arXiv, content scout), `ts-jobspy` for job board scraping (LinkedIn + Indeed), and `exponential-backoff` for retry logic in complex scenarios. Everything else — `bun:sqlite` (built-in, zero-install), `kapso-whatsapp-cli`, ZeroClaw gateway REST API on port 42617, and the `claude` CLI at `~/.local/bin/claude` — is already present. No NixOS rebuild is required for npm dependencies. The `claude -p` headless mode (version 2.1.63, confirmed working) provides task decomposition for complex multi-source synthesis programs.

**Core technologies:**
- `bun:sqlite` (built-in): Shared state DB for all programs — zero dependency, WAL-safe, production-validated in sentinel-scan.ts
- ZeroClaw Gateway `POST /webhook` (port 42617): Trigger agent jobs programmatically — daemon already running, no Bearer token needed locally
- `claude -p` CLI (v2.1.63 at `~/.local/bin/claude`): Headless orchestration for synthesis tasks — always set `--max-budget-usd 0.10` per call as a cost guardrail
- `kapso-whatsapp-cli` (existing): Notification delivery — wrap in shared `bin/notify.ts` with retry, never call directly from heartbeat programs
- `feedsmith` (new npm): TypeScript-native Atom 1.0 feed parsing for arXiv API and content RSS feeds
- `ts-jobspy` (new npm): LinkedIn + Indeed scraping — LOW-MEDIUM confidence (low download count); wrap all calls in try/catch for HTTP 429s

### Expected Features

The 11 heartbeat cron jobs split across a dependency graph rooted at two infrastructure pieces. The follow-up enforcer is the highest-complexity job (requires NLP judgment to detect commitment closures in email reply threads). The job scanner and freelance scanner share ~80% of implementation and should be built together. Self-audit has zero external dependencies and can ship in Phase 1 as early validation of the infrastructure pattern.

**Must have (table stakes — v2.0 milestone blockers):**
- Shared state DB — foundation for all 11 jobs; without it every job is stateless and produces duplicate notifications
- Centralized notification module — without it, 11 programs duplicate retry, auth, and phone-number logic
- Cron-sync agent job support — without it, agent-type jobs cannot be registered in the scheduler
- Morning briefing — calendar + email + pending follow-ups → WhatsApp at 07:30 (America/Lima)
- EOD summary — what moved today + unanswered threads → WhatsApp at 20:00
- Follow-up enforcer — commitment tracker with stale-detection → runs 3x daily (10:00, 14:00, 17:00)
- Self-audit — filesystem/git drift detection, weekly, no LLM required

**Should have (ship immediately after daily crons validated):**
- Job scanner — qualified lead filtering, LinkedIn + Indeed, dedup via state DB
- Freelance scanner — shares job scanner infrastructure (~80% code reuse), higher cadence
- Content scout — RSS + trending tech topics, daily digest supplement

**Defer to v2.x (lower urgency, higher complexity):**
- Build-in-public drafter — git activity → draft posts for human approval
- Engagement scout — relevant threads for response drafting
- Weekly company research refresh — watch-list news refresh
- Paper scout — arXiv/Semantic Scholar weekly digest
- Orchestration engine integration — defer unless a program proves too complex for single-pass execution

**Anti-features (never build):**
- Auto-posting to social media, auto-applying to jobs, sub-minute real-time polling, fully automated follow-up sending without human approval, inline LLM prompts in cron YAML

### Architecture Approach

v2.0 adds four new components inside the runtime layer — `state.db` (shared SQLite), `notify.ts` (notification module), `orchestrate.ts` (task decomposition), and 11 heartbeat programs in `bin/` — plus one modification to `module.nix` (cron-sync agent job support requiring a rebuild). The three-layer architecture is otherwise unchanged. The shared state DB lives at `~/.zeroclaw/workspace/state.db` (inside existing `allowed_roots`, no config change needed). All programs use absolute import paths for shared modules to avoid cwd-dependent failures in the daemon context.

**Major components:**
1. `~/.zeroclaw/workspace/state.db` — shared SQLite (WAL mode); tables: job_applications, freelance_leads, daily_state, content_log, orchestration_tasks, notify_log
2. `bin/notify.ts` — shared WhatsApp module with deduplication via notify_log; imported by all 11 programs via absolute path
3. `bin/orchestrate.ts` — task decomposition engine calling `claude -p` subprocess; checkpoints to state.db; used only by complex programs (morning briefing, EOD, company research)
4. `cron-sync` (modified in module.nix) — extended to detect `type: agent` in YAML and register via gateway REST API or direct SQLite fallback
5. 11 heartbeat programs in `bin/` — each idempotent (CREATE TABLE IF NOT EXISTS at startup), reads secrets from zeroclaw.env, outputs JSON to stdout

### Critical Pitfalls

1. **SQLite WAL mode not enabled** — Without `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;` at DB creation, concurrent morning jobs (3+ overlap at 8-9am) deadlock with SQLITE_BUSY. Prevention: set both pragmas in the shared DB init function imported by every program. Address in Phase 1 before any program is written.

2. **Daily cost cap (`max_cost_per_day_cents = 500`) exhausted by mid-morning** — The current cap was set for a zero-token cron system. 11 agent crons will blow this budget on day 1. Prevention: measure actual per-job cost with 2-3 isolated runs first, then raise cap to a calibrated figure (target 2000+). Address before enabling any agent crons in Phase 5.

3. **`claude -p` not found in systemd PATH** — The binary at `~/.local/bin/claude` is not in systemd's stripped PATH. Prevention: use absolute path `/home/hybridz/.local/bin/claude` in all orchestration calls; add `ANTHROPIC_API_KEY` to `zeroclaw.env` EnvironmentFile. Address in Phase 4 with a cron-context probe test before wiring real programs.

4. **Agent cron registration startup race** — `home.activation` hooks run before the ZeroClaw daemon is necessarily up; REST API calls fail silently if the daemon is not responsive. Prevention: use direct SQLite fallback for agent job registration; never block on daemon availability in activation hooks. Address in Phase 2 when designing the cron-sync overhaul.

5. **WhatsApp burst throttle** — 6 notification-sending jobs potentially firing in the same morning window triggers Meta's per-number message rate limit. Prevention: enforce minimum 5-minute gap between messages in `notify.ts` using notify_log timestamps; stagger cron schedules by at least 10 minutes. Address in Phase 1 when building notify.ts.

## Implications for Roadmap

The dependency graph mandates a 5-phase structure. Shell program development and agent-type cron wiring are parallel branches that converge at the final deployment phase. The critical insight is that Phases 3 and 4 can begin simultaneously — shell programs don't need the agent cron REST path, and the cron-sync overhaul can be investigated while shell programs are being built.

### Phase 1: Shared Infrastructure
**Rationale:** All 11 heartbeat programs depend on state.db and notify.ts. These must exist before any program is written. The self-audit program has zero external dependencies and validates the infrastructure pattern. The orchestrate.ts engine is built here as infrastructure but intentionally not wired to any cron — it is available, not deployed.
**Delivers:** state.db schema + init module (WAL mode, all tables, idempotent CREATE TABLE IF NOT EXISTS), notify.ts module with rate limiting + deduplication, orchestrate.ts task decomposition engine, bin/self-audit.ts, bin/state-init.ts
**Addresses:** Shared state DB and centralized notification module (table stakes), self-audit (low-complexity early win)
**Avoids:** SQLite WAL deadlock (Pitfall 1), JSON-to-SQLite migration divergence (Pitfall 6), state DB outside allowed_roots (Pitfall 10), WhatsApp burst throttle (Pitfall 5 — rate limiter built here)

### Phase 2: Cron-sync Agent Job Support
**Rationale:** The cron-sync overhaul is the only Phase in this milestone that requires a NixOS rebuild. It must be complete before any agent-type YAML files are authored. Shell-type cron jobs do not depend on this phase, so Phase 3 can begin in parallel. The critical task here is validating the ZeroClaw daemon REST API endpoint for cron management — if no REST path exists, the SQLite direct-write fallback must be designed and tested.
**Delivers:** module.nix extended with `type: agent` YAML detection, agent job registration via gateway REST API (confirmed endpoint) or direct sqlite3 fallback, `resolve_command()` extended to cover all new binaries, NixOS rebuild applied
**Uses:** ZeroClaw gateway REST API (`/api/cron/jobs` endpoint — needs validation) or direct sqlite3 write to jobs.db
**Avoids:** Agent cron startup race (Pitfall 2), resolve_command missing new binaries (Pitfall 7), config.toml `@` corruption in new sections (Pitfall 9)

### Phase 3: Shell-type Heartbeat Programs
**Rationale:** Shell programs are deterministic, testable with `bun run` independently of the daemon, and cover the highest-value daily crons (morning briefing, follow-up enforcer). The job scanner and freelance scanner share ~80% of implementation and should ship together. This phase can run in parallel with Phase 2 — shell-type cron YAMLs use the existing cron-sync path and don't need the agent job support.
**Delivers:** morning-briefing.ts, follow-up-enforcer.ts, job-scanner.ts, freelance-scanner.ts, content-scout.ts, paper-scout.ts, engagement-scout.ts + corresponding `type: shell` cron YAML files
**Uses:** bun:sqlite (state.db write patterns for job_applications, freelance_leads, daily_state), email + calendar skill CLIs, feedsmith (arXiv), ts-jobspy (job boards)
**Avoids:** Hardcoded phone numbers (Anti-pattern 1), per-program JSON state files (Anti-pattern 2), blocking on notification failure (Anti-pattern 3)

### Phase 4: Agent-type Crons + Orchestration Validation
**Rationale:** Agent jobs (build-in-public, EOD summary, company research) depend on Phase 2 completing. The `orchestrate.ts` engine must be validated in a systemd/cron context (not interactive) before any program invokes it. A probe job that runs from cron context and calls `claude -p` is the first deliverable — everything else in this phase depends on that probe passing.
**Delivers:** Cron-context probe test for `claude -p` subprocess, build-in-public.yaml, eod-summary.yaml, company-refresh.yaml (agent-type jobs), optional orchestrate.ts wiring for complex programs, paper-scout.yaml + engagement-scout.yaml
**Uses:** Absolute path for `claude` binary, ANTHROPIC_API_KEY in zeroclaw.env, orchestrate.ts for multi-source synthesis programs only
**Avoids:** claude subprocess systemd PATH failure (Pitfall 3), running orchestrate.ts for simple programs (Anti-pattern 4)

### Phase 5: Full Deployment + Cost Calibration
**Rationale:** Enable all 11 jobs in batches of 3-4, measuring actual per-job token cost before enabling the next batch. A schedule audit is required to prevent cascade failures — no two heavy agent jobs within 20 minutes of each other. The `max_cost_per_day_cents` cap must be raised to a calibrated value based on measured first-week spend before the full set is live.
**Delivers:** All 11 cron jobs live and passing the 10-item verification checklist, cost cap calibrated from empirical measurement, schedules staggered to prevent cascade, cascade test passed (intentional delay of one job does not block next)
**Avoids:** Token burn rate exceeding budget cap (Pitfall 4), cron cascade failure (Pitfall 8), enabling all 11 simultaneously (documented technical debt anti-pattern)

### Phase Ordering Rationale

- Infrastructure (state.db, notify.ts) must precede all programs — every single job depends on both
- cron-sync overhaul is on the critical path for agent jobs only — shell program development starts in parallel with Phase 2, not after it
- Shell programs before agent programs — shell programs are testable in isolation; agent jobs require a running daemon and a validated REST API integration
- Orchestration probe test gates all Phase 4 work — `claude -p` in systemd must be confirmed working before any program invokes orchestrate.ts
- Cost calibration and schedule auditing are the last gates — can only be done with real data from real cron runs

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (cron-sync agent job support):** The ZeroClaw daemon REST endpoint for cron management is unconfirmed. Must inspect `jobs.db` schema and run `zeroclaw --help` / `zeroclaw cron --help` before implementing. If no REST path exists, the SQLite column layout for agent-type jobs needs reverse-engineering from existing rows.
- **Phase 4 (orchestration + claude subprocess):** `claude -p` has never been invoked from a ZeroClaw daemon systemd context. A cron-context probe test is required before building on this pattern. Budget behavior under the zai-proxy is also unverified for subprocess-spawned claude calls.
- **Phase 5 (cost calibration):** Per-job token budgets are estimates only. Actual cost must be measured empirically during the first week of live runs. The current 500-cent/day cap is a hard blocker — must be raised before enabling any agent crons.

Phases with standard patterns (skip research-phase):
- **Phase 1 (state.db + notify.ts):** The WAL SQLite pattern is identical to the existing production sentinel-scan.ts code. notify.ts is a wrapper with established retry logic. Zero unknown unknowns.
- **Phase 3 (shell programs):** All skill CLIs (email, calendar) are shipped and fully documented. State DB write patterns are established in Phase 1. Job scanner pattern is documented in STACK.md with working code examples.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Primary sources: live binaries, confirmed CLI flags (`claude --help`), existing production code (sentinel-scan.ts), ZeroClaw gateway wiki. Only ts-jobspy is LOW-MEDIUM (low npm activity, wrap defensively). |
| Features | HIGH | Based on live codebase inspection, existing skill capabilities, PROJECT.md milestone scope. Dependency graph verified against actual tool signatures in email/cli.ts and calendar/cli.ts. |
| Architecture | HIGH | Directly derived from live module.nix, sentinel-scan.ts, and existing DB schemas. Component interactions fully traced. Patterns are extensions of already-working v1.0 patterns. |
| Pitfalls | HIGH | All 10 pitfalls derived from first-hand v1.0 retrospective and direct code inspection of module.nix and config.toml. None are speculative — each references a specific file, existing behavior, or confirmed system quirk from MEMORY.md. |

**Overall confidence:** HIGH

### Gaps to Address

- **ZeroClaw REST API for agent cron management:** No confirmed endpoint for creating agent-type cron jobs via REST. Must inspect `jobs.db` schema (`sqlite3 ~/.zeroclaw/workspace/cron/jobs.db .schema`) and run `zeroclaw cron --help` before Phase 2 implementation. The SQLite direct-write fallback is fully viable if the REST path doesn't exist.
- **`claude -p` subprocess in systemd:** Works interactively but never tested from a cron/daemon context. A 5-minute probe cron job should be the first deliverable of Phase 4, before any real programs invoke orchestrate.ts. Specifically validate: (1) binary found at absolute path, (2) ANTHROPIC_API_KEY available, (3) stdout captured correctly by Bun subprocess.
- **ts-jobspy reliability under daily cadence:** LinkedIn rate-limiting under daily 50-result queries is untested in this environment. Wrap all calls defensively with try/catch and exponential backoff. Keep python-jobspy subprocess as the fallback plan if ts-jobspy proves too unreliable.
- **Z.AI rate limits on concurrent agent sessions:** If 2-3 agent cron jobs fire simultaneously and each spawns an LLM session through the zai-proxy, the upstream Z.AI API may rate-limit. The 60-second proxy timeout is documented but concurrent session behavior is not. Address in Phase 5 via schedule staggering and empirical monitoring.

## Sources

### Primary (HIGH confidence)
- `/etc/nixos/zeroclaw/bin/sentinel-scan.ts` — bun:sqlite + notification pattern in production
- `/etc/nixos/zeroclaw/module.nix` — cron-sync implementation, resolve_command whitelist, systemd EnvironmentFile config
- `/etc/nixos/zeroclaw/config.toml` — gateway port 42617, max_cost_per_day_cents, allowed_roots, @PLACEHOLDER@ sed pattern
- `/etc/nixos/zeroclaw/skills/email/cli.ts`, `skills/calendar/cli.ts` — skill CLI patterns, env-var secret loading
- `/etc/nixos/zeroclaw/bin/README.md`, `cron/README.md` — program standard, job type distinction, YAML schema
- `/etc/nixos/zeroclaw/.planning/RETROSPECTIVE.md` — v1.0/v1.1 post-mortems, first-hand failure modes
- [ZeroClaw Gateway API Reference wiki](https://github.com/zeroclaw-labs/zeroclaw/wiki/10.2-gateway-api-reference) — /webhook endpoint confirmed
- `claude --help` — Confirmed -p/--print flag, --output-format json, --max-budget-usd. Version 2.1.63.
- [bun:sqlite docs](https://bun.com/docs/runtime/sqlite) — Built-in, WAL mode, concurrent access
- [arXiv API docs](https://info.arxiv.org/help/api/user-manual.html) — Free Atom 1.0 API, no auth required

### Secondary (MEDIUM confidence)
- [feedsmith GitHub](https://github.com/macieklamberski/feedsmith) — TypeScript Atom/RSS parser (not Context7 verified)
- [ts-jobspy npm](https://www.npmjs.com/package/ts-jobspy) — LinkedIn + Indeed scrapers (low download count, treat as fragile)
- `/home/hybridz/.claude/projects/-etc-nixos-zeroclaw/memory/MEMORY.md` — Confirmed system quirks (@PLACEHOLDER@ sed corruption, systemd PATH stripping)

### Tertiary (LOW confidence — needs validation during implementation)
- ZeroClaw daemon REST API for cron management (endpoint existence unconfirmed — must inspect before Phase 2)
- `claude -p` subprocess behavior in ZeroClaw daemon systemd context (works interactively, unverified in cron)
- ts-jobspy LinkedIn rate limit behavior under daily cron cadence (untested in this environment)

---
*Research completed: 2026-03-06*
*Ready for roadmap: yes*
