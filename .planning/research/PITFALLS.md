# Pitfalls Research

**Domain:** Autonomous AI agent infrastructure — v2.0 Heartbeat additions to existing ZeroClaw/NixOS system
**Researched:** 2026-03-06
**Confidence:** HIGH — derived from first-hand v1.0 retrospective, direct code inspection of existing system, confirmed working patterns and known quirks documented in project memory

---

## Critical Pitfalls

### Pitfall 1: SQLite WAL Mode Not Enabled — Cron Jobs Deadlock Each Other

**What goes wrong:**
11 cron jobs running on overlapping schedules all open the shared state SQLite DB. Without WAL (Write-Ahead Logging) mode, SQLite uses exclusive write locks. A morning-briefing agent session (which may hold a write lock for 30+ seconds while LLM reasoning completes) blocks every other concurrent cron job that tries to write. Jobs queue up, time out, or crash with `SQLITE_BUSY`. The DB appears healthy but concurrent jobs silently fail.

**Why it happens:**
SQLite's default journal mode is DELETE (exclusive locking). The existing `sentinel-scan.ts` opens brain.db with `{ readonly: true }` which works fine for a single reader. The new shared state DB will have multiple writers (job-tracker, follow-up enforcer, content scout all writing simultaneously around 9am). Without WAL, the first writer blocks all others.

**How to avoid:**
Initialize the shared state DB with `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000`. Every program that opens the DB must set these pragmas on first open. Use Bun's `Database` with `{ create: true }` and run the pragmas immediately after. WAL allows concurrent readers and one writer — sufficient for this workload. Include a DB initialization function in the shared module that all programs import.

**Warning signs:**
- `SQLITE_BUSY` or `database is locked` errors in cron job logs
- Jobs that should take 5 seconds taking 30+ seconds
- Multiple cron jobs completing but with timestamps clustered (they serialized)
- Morning slot (7-9am) failures when 3+ jobs overlap

**Phase to address:** Phase 1 (Shared state DB) — WAL must be set at DB creation before any cron jobs write to it.

---

### Pitfall 2: Agent Cron Jobs via REST API Require Daemon Running — No Retry On Startup Race

**What goes wrong:**
The v2.0 cron-sync overhaul needs to register "agent" job types via the ZeroClaw daemon's REST API instead of direct SQLite writes. If `zeroclaw daemon` is not fully started when cron-sync runs during `nixos-rebuild switch` (the `home.activation.zeroclawCronSync` hook), the REST call fails silently. All agent-type jobs are never registered. Shell jobs (which bypass the REST API and write SQLite directly) register fine. The mismatch is invisible until a job that should be an agent-type fires and runs the wrong way.

**Why it happens:**
`home.activation` hooks run during NixOS activation before all systemd user services are necessarily up. The existing cron-sync writes directly to SQLite (`~/.zeroclaw/workspace/cron/jobs.db`), bypassing the daemon entirely — which is why it works reliably now. Adding a REST API call to a potentially-not-running daemon breaks this assumption.

**How to avoid:**
Keep shell jobs on the direct SQLite path (current cron-sync behavior). Add agent job support via a separate `--type agent` flag in cron-sync that: (1) first tries the REST API, (2) falls back to a pending-registration file if daemon is not responsive, (3) on daemon startup, ZeroClaw processes pending registrations. Alternatively: avoid the REST API entirely by writing the `job_type` column directly in SQLite for agent jobs — inspect the `cron_jobs` schema to confirm the column exists and is writable without daemon mediation.

**Warning signs:**
- `cron-sync` completes without errors but agent-type jobs don't appear in `zeroclaw cron list`
- `zeroclaw cron list` shows jobs as shell type when they should be agent type
- Jobs that should invoke an LLM instead run a command string verbatim

**Phase to address:** Phase 3 (Cron-sync overhaul) — design the agent job registration path before writing any agent cron YAMLs.

---

### Pitfall 3: `claude -p` Subprocess in Systemd Inherits No Environment — Orchestration Fails Silently

**What goes wrong:**
The orchestration engine spawns `claude -p` subprocesses to decompose and delegate tasks. In a systemd user service context (where ZeroClaw daemon runs), the subprocess inherits only the minimal environment set by `EnvironmentFile = ["/run/secrets/rendered/zeroclaw.env"]`. The `claude` binary may not be on PATH (it's in a Nix profile, not `/usr/bin`). `HOME` may be set but `XDG_*`, `ANTHROPIC_API_KEY`, and user profile derivations (`~/.nix-profile/bin`) are absent. The subprocess exits with `127 (command not found)` or auth failure. ZeroClaw logs a tool failure but the orchestration engine retries or silently drops the subtask.

**Why it happens:**
Systemd user services have a deliberately stripped environment. The existing services work around this with explicit `Environment` keys (e.g., `SSL_CERT_FILE` in zai-proxy). The `claude` CLI needs `ANTHROPIC_API_KEY` and must be invokable by absolute path. The orchestration engine's subprocess spawner likely uses the inherited environment without augmentation.

**How to avoid:**
(1) Use absolute path for the `claude` binary: find it in the Nix store via `${pkgs.claude-code}/bin/claude` (or wherever it's installed) and hardcode that path in the orchestration config or skill TOML. (2) Add `ANTHROPIC_API_KEY` to `/run/secrets/rendered/zeroclaw.env` so it's available via the existing `EnvironmentFile`. (3) Test orchestration with a minimal probe job from a cron context (not interactive) before wiring real subtasks. (4) If ZeroClaw's orchestration engine has a `subprocess_env` config key, use it to enumerate required vars.

**Warning signs:**
- Orchestration engine logs show subtask spawned but no result received
- `journalctl --user -u zeroclaw-gateway` shows `claude: command not found` or exit code 127
- Tasks delegated to claude-p never complete but the parent session doesn't error
- `ANTHROPIC_API_KEY` not set errors in subprocess stderr

**Phase to address:** Phase 4 (Orchestration engine) — validate end-to-end subprocess invocation before wiring to any cron job.

---

### Pitfall 4: API Token Burn Rate — 11 Agent Crons Exceed `max_cost_per_day_cents = 500`

**What goes wrong:**
The current `max_cost_per_day_cents = 500` (5 USD/day) cap was set for a system with 1 active cron job (sentinel, which is a shell job — zero tokens). Adding 11 agent cron jobs that each invoke an LLM session will burn this budget by mid-morning. At GLM-5 pricing via Z.AI, a morning briefing session with tool use may consume 100-200k tokens. By the time the job scanner, content scout, and follow-up enforcer run, the daily cap is hit and all afternoon/evening jobs are blocked without warning.

**Why it happens:**
The cap was a conservative safety setting when Kiro had no cron jobs consuming tokens. Agent crons are a fundamentally different cost profile from interactive sessions (which are capped by human interaction frequency). 11 jobs × N tokens × daily frequency will dwarf interactive usage. Z.AI's GLM models are cheaper than Anthropic's, but the volume still requires recalibration.

**How to avoid:**
(1) Calculate per-job token budget before enabling all 11: estimate input tokens (system prompt + skill context + tool results) and output tokens per job. (2) Raise `max_cost_per_day_cents` to a realistic figure (e.g., 2000 = 20 USD/day) with explicit acknowledgment. (3) Mark genuinely expensive jobs (morning briefing, paper scout) with deeper-research flags. (4) Start with 3-4 low-frequency jobs enabled, measure actual spend for one week, then enable the rest. (5) Consider a per-job cost limit if ZeroClaw supports `max_cost_per_session_cents` in cron job config.

**Warning signs:**
- Jobs after 10am start failing with "daily cost cap exceeded"
- `zeroclaw cron list` shows jobs as "skipped (budget)" in last_status
- Kiro sends a budget-exceeded WhatsApp message and stops all activity

**Phase to address:** Phase 5 (Heartbeat cron wiring) — recalibrate the budget cap before enabling any agent crons.

---

### Pitfall 5: WhatsApp Rate Limiting — Morning Burst From 6 Jobs Triggers Kapso Bridge Throttle

**What goes wrong:**
6 of the 11 heartbeat crons send WhatsApp notifications as part of their output (morning briefing, follow-up enforcer, build-in-public drafter, EOD summary, self-audit, engagement scout). If multiple of these overlap in their schedule window (e.g., all set to fire around 8-9am), they generate a burst of outbound messages within seconds. The Kapso bridge has an internal rate limit (the existing `StartLimitBurst = 10` over 60 seconds for the systemd service restart), and Meta's WhatsApp Business API has a per-phone-number message rate limit. Burst delivery fails silently — messages are dropped, not queued.

**Why it happens:**
The current system sends at most 1 WhatsApp message per 2 hours (sentinel). The Kapso bridge and Meta API were never tested under burst conditions. The bridge's `errorMessage` fallback only handles gateway connection errors, not downstream delivery throttling.

**How to avoid:**
(1) Stagger cron schedules: minimum 10-minute gap between any two notification-sending jobs. (2) The notification module must include a per-channel rate limiter — persist the last-sent timestamp in the shared state DB and enforce a minimum interval (suggested: 5 minutes between any two messages to the same recipient). (3) Implement exponential backoff retry in the notification module: max 3 attempts, starting at 30s. (4) Treat notification delivery as best-effort with local logging — never let notification failure block the cron job's primary work.

**Warning signs:**
- WhatsApp messages from multiple jobs arrive out of order or some are missing
- `kapso-whatsapp-cli send` exits with non-zero status in cron job logs
- Kapso bridge service shows restart events in `journalctl` around scheduled job windows
- Meta API returns 429 (rate limit exceeded) in bridge logs

**Phase to address:** Phase 2 (Notification module) — build rate limiting into the notification module before any cron job uses it.

---

### Pitfall 6: JSON-to-SQLite Migration — Programs Still Writing Old Trackers After New DB Exists

**What goes wrong:**
The transition from `~/zeroclaw-data/` JSON trackers to the shared SQLite DB creates a dual-write window. If existing programs are updated to read from SQLite but still write to JSON (or vice versa), or if the migration is done incrementally, the two stores diverge. A follow-up enforcer reading from SQLite misses contacts that were last updated in the JSON tracker. The inconsistency is not immediately obvious — data looks present in one place, stale in another.

**Why it happens:**
Incremental migration is risky when the source and destination are both "live." Each program is updated independently; during the transition, some read the new DB while others still write the old format. There's no atomic cutover. The JSON files also don't enforce a schema — a field rename in the new SQLite schema is invisible to programs still reading JSON.

**How to avoid:**
(1) Migrate all at once, not incrementally: write the SQLite schema, migration script, and all updated programs in a single phase, then cut over. (2) The migration script must: read all JSON trackers, transform to SQLite schema, verify row count matches, then — and only then — rename the old JSON files to `.migrated` (not delete, in case of rollback). (3) After migration, remove `~/zeroclaw-data/` from `autonomy.allowed_roots` to prevent accidental JSON writes. (4) Version the SQLite schema (add a `schema_version` table) so programs can detect and refuse to run against a wrong-version DB.

**Warning signs:**
- Follow-up enforcer reports "no contacts pending" immediately after migration
- Job tracker shows 0 tracked jobs while JSON file has 50 entries
- Two programs reporting contradictory state about the same entity
- `~/zeroclaw-data/` files have newer `mtime` than the migration date

**Phase to address:** Phase 1 (Shared state DB) — schema + migration script must be complete before any program is updated to use it.

---

### Pitfall 7: `resolve_command()` Missing New Runtimes — Agent Cron Jobs Fail in Systemd

**What goes wrong:**
The existing `cron-sync` `resolve_command()` function rewrites `bun`, `node`, and `python3` prefixes to absolute Nix store paths. Agent cron jobs added in v2.0 may use `claude` as a command prefix (for orchestration), or programs may use new runtimes not in the current rewrite list. In systemd's stripped PATH, an unresolved bare binary name causes immediate `ENOENT` — the job fires, the command is not found, the ZeroClaw cron scheduler marks it as failed with no useful error.

**Why it happens:**
`resolve_command()` is a whitelist, not a PATH lookup. Any new binary not explicitly listed is silently left as-is, which fails in systemd's environment. This was already caught once in v1.0 (the `max_actions_per_hour` missing field issue) — the pattern of "works interactively, fails in systemd" repeats here.

**How to avoid:**
Extend `resolve_command()` in `module.nix` to cover all binaries used by v2.0 cron jobs. Before adding any new cron job to YAML, check whether its command prefix is in the rewrite list. Add a validation step in `cron-sync` that warns when a command appears to use a bare binary name that is not in the rewrite list. Better: implement a general PATH lookup using `type -p` at resolve time rather than a hardcoded prefix list.

**Warning signs:**
- New agent/program cron jobs show `last_status = "failed"` immediately after first fire
- Systemd journal shows `No such file or directory` for the command
- The command works when run manually as the user but fails as a cron job
- `cron-sync` reports "Added" successfully but the job never completes

**Phase to address:** Phase 3 (Cron-sync overhaul) — extend `resolve_command()` before any new cron YAML files are written.

---

### Pitfall 8: Cron Cascade Failure — One Broken Job Causes All Subsequent Jobs to Queue

**What goes wrong:**
If ZeroClaw's cron scheduler uses a single-threaded execution queue, a cron job that hangs (e.g., an LLM session waiting for a response that never comes, or an orchestration subtask that deadlocks) blocks all subsequent scheduled jobs. With 11 jobs, a stuck morning briefing at 7am means the job scanner (7:30am), content scout (8am), and follow-up enforcer (9am) all queue and fire late — or not at all if the scheduler has a max-queue depth. The system appears to stop working.

**Why it happens:**
LLM API calls have variable latency. Z.AI GLM-5 sessions via the proxy have a 60-second upstream timeout, but a multi-turn agent session (morning briefing may take 5-10 tool call rounds) can run for 5-15 minutes legitimately. If two such jobs overlap, a single-queue scheduler stacks them. There is currently no per-job execution timeout in the cron YAML schema.

**How to avoid:**
(1) Set conservative schedules that assume jobs take up to 15 minutes: no two heavy agent jobs within 20 minutes of each other. (2) Verify whether ZeroClaw's cron scheduler is concurrent or sequential — read upstream docs or source. If sequential, schedule heavy jobs with 30+ minute gaps. (3) Add a `timeout_mins` field to cron YAML (even if currently a comment/no-op) as documentation of expected job duration. (4) Implement per-job watchdog in shell program crons: `timeout 600 bun run ...` wrapping all bin/ invocations.

**Warning signs:**
- Jobs fire at wrong times (shifted by previous job's duration)
- `zeroclaw cron list` shows `next_run` times drifting later each day
- A job with 5-minute expected duration shows 45-minute `last_duration`
- Multiple jobs show `last_status = "running"` simultaneously (or none do when several should be)

**Phase to address:** Phase 5 (Heartbeat cron wiring) — schedule design must account for cascade risk.

---

### Pitfall 9: config.toml `@PLACEHOLDER@` Sed Replacement — Notification Module Breaks With URL Values

**What goes wrong:**
The notification module's config (webhook URLs, retry endpoints, API keys) may be added to `config.toml` as new sections. If any value contains `@` characters (e.g., email addresses used as webhook identifiers, or URL patterns like `user@host`), the activation-time `sed` replacement (`-e "s|@BRAVE_API_KEY@|...|g"`) will corrupt those values. The sed command uses `@` as its delimiter — a value containing `@` causes a malformed substitution. The corrupted config.toml causes ZeroClaw daemon startup failure, which is hard to diagnose because the rendered file is at `/run/secrets/rendered/zeroclaw-config` and only visible at runtime.

**Why it happens:**
This is a known quirk in project memory (MEMORY.md: "Comments in config.toml must NOT use `@TOKEN@` syntax"). The same risk applies to any config value. The notification module, if it gains new config sections with webhook URLs or contact identifiers, is a likely vector. Phone numbers in E.164 format (`+51926689401`) are safe because `+` is not `@`, but email-style identifiers are not.

**How to avoid:**
(1) Never use `@` in any config.toml literal value — use environment variable references instead (`${KAPSO_WEBHOOK_URL}`). (2) Add a validation step to the activation hook that checks the rendered config.toml for remaining `@PLACEHOLDER@` patterns (which indicates a missing secret) and warns. (3) Document explicitly in `config.toml` header: "Do not use @ in literal values — sed uses @ as delimiter."

**Warning signs:**
- ZeroClaw daemon fails to start after `nixos-rebuild switch` with a config parse error
- The rendered config at `/run/secrets/rendered/zeroclaw-config` contains malformed lines
- A new config section was added with email addresses or URL patterns as values

**Phase to address:** Phase 2 (Notification module) — review all new config.toml additions for `@` characters before committing.

---

### Pitfall 10: Shared State DB Path Not in `autonomy.allowed_roots` — Agent Sessions Cannot Write

**What goes wrong:**
The shared state SQLite DB will live somewhere like `~/.zeroclaw/workspace/state.db` or a new path like `~/zeroclaw-data/state.db`. ZeroClaw's autonomy config has `allowed_roots = ["/etc/nixos/", "~/Projects/", "~/.zeroclaw/documents/"]`. Agent sessions that need to update state (e.g., a cron job writing a follow-up record to SQLite via a skill CLI) will be blocked if the DB path is outside `allowed_roots`. The file write tool call will fail silently, the state update is lost, and the next job run re-processes the same data.

**Why it happens:**
`allowed_roots` was defined for v1.0 where agents only needed to modify documents and NixOS config. The new shared state DB is a new writable path that wasn't anticipated. The config is currently missing `~/.zeroclaw/workspace/` and `~/zeroclaw-data/` (the likely new paths).

**How to avoid:**
Add the shared state DB directory to `allowed_roots` when defining the DB location in Phase 1. The canonical location should be `~/.zeroclaw/workspace/` (already used by existing DBs: `cron/jobs.db`, `memory/brain.db`). Placing the shared state DB there means no `allowed_roots` change is needed. Avoid creating a new top-level directory for state.

**Warning signs:**
- Agent session logs show `file_write blocked: path not in allowed_roots`
- State DB exists but rows are never inserted by agent-triggered jobs
- Programs that write directly (non-agent) work fine; skills that go through the agent's file tools fail

**Phase to address:** Phase 1 (Shared state DB) — choose a path inside `~/.zeroclaw/workspace/` to avoid allowed_roots expansion.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keeping JSON trackers alongside SQLite | No migration risk | Dual-write confusion, stale reads, two sources of truth | Never — cut over atomically |
| Hardcoding WhatsApp recipient number in each program | Simpler code | Any phone number change requires editing every bin/ file | Never — use env var or shared config module |
| Skipping WAL mode on shared state DB | One less pragma | SQLITE_BUSY cascades under concurrent cron load | Never — add at DB creation time |
| Setting `max_cost_per_day_cents` to unlimited | No budget surprises | Runaway agent sessions or misconfigured cron schedules cause unbounded spend | Never — set a high but finite limit |
| Enabling all 11 cron jobs simultaneously on first deploy | Faster to "done" | Cannot isolate which job causes issues; budget blown on first day | Never — enable in batches of 3-4 |
| Inline LLM prompts in cron YAML instead of skill references | Fewer files | Prompts cannot be tested, versioned, or audited independently; context window in YAML | Never — prompts go in skills or documents |
| Using `claude -p` without absolute binary path | Simpler YAML | Works interactively, fails silently in systemd | Never — always resolve to absolute path |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ZeroClaw cron + SQLite | Opening DB without WAL pragma | Set `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;` on every DB open |
| Kapso WhatsApp + burst notifications | Sending multiple messages in quick succession | Rate-limit at notification module level: min 5-minute gap per recipient |
| `claude -p` subprocess + systemd | Relying on inherited PATH | Use absolute Nix store path; add API key to `zeroclaw.env` EnvironmentFile |
| cron-sync + agent job type | REST API call during activation when daemon may be down | Write job_type directly to SQLite if REST API unavailable; reconcile on daemon start |
| config.toml + notification URLs | Using `@` in literal config values | Use env var references; `@` chars corrupt sed-based secret injection |
| Shared state DB + agent allowed_roots | DB outside allowed paths | Place DB in `~/.zeroclaw/workspace/` which is accessible to agent file tools |
| Z.AI + multiple concurrent agent crons | Rate limiting on provider side | Stagger agent cron schedules; Z.AI endpoint is a local proxy — check upstream API limits |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| SQLite without WAL under concurrent writes | `SQLITE_BUSY` errors, jobs serialize | WAL mode + busy_timeout on DB init | First morning with 3+ overlapping jobs |
| Agent cron jobs with unbounded tool iterations | Morning briefing runs 45 minutes, blocks all other jobs | Set `max_tool_iterations = 40` (already configured) and per-job `timeout_mins` | First complex multi-tool agent session |
| `max_cost_per_day_cents = 500` with 11 agent crons | Budget cap hit by 10am, afternoon jobs blocked | Raise to 2000+; measure actual per-job cost first week | Day 1 of full 11-job deployment |
| Notification module blocking cron job on retry | Follow-up enforcer hangs waiting for WhatsApp delivery | Make notification async (fire-and-forget with local log); never block job completion on delivery | First WhatsApp rate limit or Kapso bridge restart |
| Sentinel brain.db readonly open + new concurrent writers | Read-only open fails if WAL mode not set by the writer first | Ensure shared state DB uses WAL before sentinel tries readonly access | First run after shared DB is created alongside brain.db |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Adding notification API keys to config.toml as literals | Keys visible in git if @PLACEHOLDER@ not used | All new secrets via sops; reference as `@VARNAME@` tokens injected at activation |
| Shared state DB world-readable | Other system users can read job/follow-up data | DB lives in `~/.zeroclaw/workspace/` with 700 directory permissions (already set by ZeroClaw) |
| `claude -p` subprocess receiving full zeroclaw.env | Subprocess has access to all agent secrets (Brave API key, etc.) | Pass only required vars to claude subprocess; use a separate minimal env file if possible |
| Orchestration engine creating arbitrary subprocesses | LLM-driven task decomposition could spawn unexpected commands | Ensure orchestration engine uses same `allowed_commands` policy as agent sessions |
| Notification module logging message content | WhatsApp message text persisted in logs | Log metadata only (timestamp, recipient, status) — never message body |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Morning briefing sends at 7am before user is awake | Notification at wrong time, unread by 10am | Schedule for 7:30am with timezone `America/Lima`; verify tz offset in cron YAML |
| EOD summary and self-audit both send at 6pm | Two messages within minutes | Merge or stagger by 30 minutes |
| Build-in-public drafter sends a draft without confirmation | Draft posted to social media accidentally | Drafter outputs to shared state DB / task queue; user approves before posting |
| 11 cron jobs all sending "status: ok" messages | Phone notification spam | Only notify on action items, anomalies, or summaries — not "everything is fine" |
| Follow-up enforcer sends same reminder daily | User ignores repeated WhatsApp pings | Track acknowledgement in state DB; suppress after 3 unanswered reminders |

---

## "Looks Done But Isn't" Checklist

- [ ] **Shared state DB:** WAL mode confirmed via `PRAGMA journal_mode;` returning `wal` — not just that the file was created.
- [ ] **Notification module:** A retry actually retries — test by temporarily blocking `kapso-whatsapp-cli` and confirm retry fires after 30s.
- [ ] **Agent cron registration:** `zeroclaw cron list` shows `job_type = agent` (not shell) for agent jobs — inspect the SQLite column directly.
- [ ] **Orchestration engine:** Run a probe task from a cron context (not interactive), confirm subprocess output captured in parent session — not just "task delegated."
- [ ] **JSON migration:** `~/zeroclaw-data/*.json` files renamed to `.migrated` and row count in SQLite matches old JSON entry count.
- [ ] **Budget calibration:** Run 2-3 agent cron jobs in isolation and check actual cost before enabling all 11.
- [ ] **Cascade test:** Intentionally delay one cron job by 5 minutes and verify the next scheduled job still fires on time (confirming concurrent execution).
- [ ] **Timezone verification:** Trigger morning briefing manually at the expected time and confirm `America/Lima` offset is applied correctly (UTC-5).
- [ ] **Notification rate limit:** Send 5 rapid test messages via the notification module and confirm the 5th is delayed, not dropped.
- [ ] **resolve_command coverage:** Run `cron-sync --dry-run` after adding all 11 jobs and verify no bare binary names appear in the output commands.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SQLite deadlock under concurrent writes | LOW | Add WAL pragma to DB init; restart ZeroClaw daemon; jobs will retry on next schedule |
| Agent cron jobs not registered as agent type | LOW | Inspect `job_type` column in SQLite; update directly or fix cron-sync and re-run |
| claude subprocess not found in systemd | LOW | Add absolute path to cron YAML; re-run cron-sync; no rebuild needed |
| Daily cost cap exceeded mid-day | LOW | Raise `max_cost_per_day_cents`; rebuild (config change requires rebuild); paused jobs retry on schedule |
| WhatsApp burst throttle drops messages | LOW | Notification module adds rate limiting; missed messages are logged; no data loss |
| JSON-to-SQLite migration divergence | MEDIUM | Stop all writes; identify divergence; re-run migration from JSON source; verify row counts |
| config.toml `@` corruption | MEDIUM | Fix offending config values; rebuild; check rendered file for correctness |
| All-at-once cron cascade failure | MEDIUM | Disable all agent crons; re-enable one at a time with monitoring; adjust schedules |
| `allowed_roots` blocks state DB writes | LOW | Move DB to `~/.zeroclaw/workspace/`; update all programs; no rebuild needed for bin/ changes |
| Orchestration subprocess deadlock | MEDIUM | Kill hung subprocess (identified via `ps aux` for claude processes); add per-subprocess timeout; fix engine config |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SQLite deadlock (no WAL) | Phase 1 (Shared state DB) | `PRAGMA journal_mode;` returns `wal`; concurrent write test passes |
| Agent cron REST API startup race | Phase 3 (Cron-sync overhaul) | Agent jobs appear with correct `job_type` after cold rebuild |
| claude subprocess in systemd | Phase 4 (Orchestration engine) | Probe task completes from cron context (not interactive) |
| Token burn rate / budget cap | Phase 5 (Heartbeat cron wiring) | Per-job cost measured; `max_cost_per_day_cents` calibrated |
| WhatsApp burst throttle | Phase 2 (Notification module) | Rate limiter test: 5 rapid sends, 5th is delayed not dropped |
| JSON-to-SQLite migration divergence | Phase 1 (Shared state DB) | Migration script: row count matches, old files renamed `.migrated` |
| resolve_command missing new binaries | Phase 3 (Cron-sync overhaul) | All new cron commands use absolute paths in registered DB entries |
| Cron cascade failure | Phase 5 (Heartbeat cron wiring) | Schedule audit: no two heavy agent jobs within 20 minutes |
| config.toml `@` corruption in new sections | Phase 2 (Notification module) | Rendered config passes `grep '@' ~/.zeroclaw/config.toml` check |
| State DB outside allowed_roots | Phase 1 (Shared state DB) | DB placed in `~/.zeroclaw/workspace/`; agent session write succeeds |

---

## Sources

- `/etc/nixos/zeroclaw/.planning/RETROSPECTIVE.md` — First-hand v1.0 and v1.1 post-mortems: known failure modes, patterns established, lessons learned
- `/etc/nixos/zeroclaw/module.nix` — Direct inspection: `resolve_command()` whitelist, `home.activation` hook ordering, systemd service `EnvironmentFile`, existing WAL absence in sentinel-scan.ts
- `/etc/nixos/zeroclaw/bin/sentinel-scan.ts` — Direct inspection: `{ readonly: true }` DB open, fire-and-forget WhatsApp pattern, no retry logic
- `/etc/nixos/zeroclaw/config.toml` — Direct inspection: `max_cost_per_day_cents = 500`, `allowed_roots` list, existing `@PLACEHOLDER@` sed token pattern
- `/home/hybridz/.claude/projects/-etc-nixos-zeroclaw/memory/MEMORY.md` — Confirmed quirks: `@PLACEHOLDER@` sed corruption, `memory_store` permission gates, systemd PATH stripping
- `/etc/nixos/zeroclaw/.planning/PROJECT.md` — Milestone context and known system constraints
- `/etc/nixos/zeroclaw/.planning/research/PITFALLS.md` (v1.0 version) — Carried-forward patterns: pitfalls 1-10 from v1.0 remain valid for base system; this document covers v2.0 additions only

---
*Pitfalls research for: ZeroClaw v2.0 Heartbeat — adding shared state, notifications, agent crons, orchestration, and 11 heartbeat cron jobs to existing NixOS system*
*Researched: 2026-03-06*
