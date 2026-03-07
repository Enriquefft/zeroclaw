# Architecture Research

**Domain:** NixOS-deployed autonomous AI agent infrastructure (ZeroClaw / Kiro) — v2.0 Heartbeat integration
**Researched:** 2026-03-06
**Confidence:** HIGH

Sources: live `module.nix`, `sentinel-scan.ts`, `bin/README.md`, `skills/README.md`, `cron/README.md`, `skills/email/cli.ts`, `skills/calendar/cli.ts`, `PROJECT.md`, existing `ARCHITECTURE.md` (v1.0, 2026-03-04).

---

## Context: What v2.0 Adds to the Existing Architecture

v1.0 established a three-layer architecture (source-of-truth / deployment / runtime). v2.0 adds infrastructure
that sits _inside_ the runtime layer: a shared state database, a notification module, agent-type cron support
via REST, and an orchestration engine. None of these require NixOS rebuild changes except the REST-API integration
for agent crons (which extends `cron-sync`).

**Existing components that remain unchanged:**
- `module.nix` service declarations (zeroclaw-gateway, kapso-bridge, zai-proxy, chromedriver)
- `~/.zeroclaw/workspace/memory/brain.db` (ZeroClaw agent memory — not touched by new components)
- `~/.zeroclaw/workspace/cron/jobs.db` (cron scheduler — read-only inspection only; writes via daemon REST)
- `~/.zeroclaw/agents.db` (IPC — untouched)
- Skills (email, calendar) — untouched; patterns from `cli.ts` inform new programs

---

## System Overview: v2.0 Integration

```
┌────────────────────────────────────────────────────────────────────────┐
│                          SOURCE OF TRUTH LAYER                         │
│                      /etc/nixos/zeroclaw/  (git-tracked)               │
│                                                                        │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ module.nix │  │  documents/  │  │   skills/    │  │    cron/    │  │
│  │  (no new   │  │ (unchanged)  │  │ (unchanged)  │  │  11 new     │  │
│  │  services) │  │              │  │              │  │  *.yaml     │  │
│  └────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
│                                                                        │
│                   NEW in v2.0 (live-edit, no rebuild):                 │
│  ┌──────────────────┐  ┌────────────────┐  ┌───────────────────────┐  │
│  │  bin/notify.ts   │  │ bin/state-db/  │  │  bin/orchestrate.ts   │  │
│  │  (shared module) │  │  schema + init │  │  (task decomposition) │  │
│  └──────────────────┘  └────────────────┘  └───────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              bin/<11 heartbeat programs>.ts                      │  │
│  │  (morning-briefing, job-scanner, content-scout, follow-up, ...)  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│   MODIFIED in v2.0 (rebuild required for cron-sync REST support):     │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  module.nix → cronSync shell script extended for agent jobs    │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ nixos-rebuild (module.nix changes only)
                                   │ home.activation (cron-sync, skills-sync)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          DEPLOYMENT LAYER                              │
│                          ~/.zeroclaw/  (generated)                     │
│                                                                        │
│  ┌────────────────────┐  ┌──────────────────────────────────────────┐  │
│  │    config.toml     │  │  documents/ → symlink to /etc/nixos/     │  │
│  │  (no v2 changes)   │  │  skills/   → symlink to /etc/nixos/     │  │
│  └────────────────────┘  └──────────────────────────────────────────┘  │
│                                                                        │
│  NEW in v2.0 (created at first run, persists across runs):            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ~/.zeroclaw/workspace/state.db  (NEW shared SQLite)             │  │
│  │    tables: job_applications, freelance_leads, daily_state,       │  │
│  │            content_log, orchestration_tasks, notify_log          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           RUNTIME LAYER                                │
│              zeroclaw daemon (systemd user service, unchanged)         │
│                                                                        │
│  ┌────────────┐  ┌──────────────────────────────────────────────────┐  │
│  │  Gateway   │  │  Scheduler (cron loop)                           │  │
│  │ :42617/ws  │  │  Shell jobs → bun run bin/<program>.ts           │  │
│  └────────────┘  │  Agent jobs → REST POST /cron/trigger or prompt  │  │
│                  └──────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Existing DBs (unchanged)                                       │   │
│  │  brain.db (memory)  │  jobs.db (cron)  │  agents.db (IPC)       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────┬────────────────────────────────────────────────┘
                        │ WebSocket /ws/chat
                        ▼
               kapso-whatsapp-bridge ──► WhatsApp (Tailscale)
```

---

## New Component Breakdown

### 1. state.db — Shared SQLite for All Programs

**Location:** `~/.zeroclaw/workspace/state.db`

**Created by:** `bin/state-init.ts` (run once at first use, idempotent via `CREATE TABLE IF NOT EXISTS`)

**Accessed by:** All heartbeat programs and `orchestrate.ts` via direct SQLite reads/writes using `bun:sqlite`

**Schema domains:**

```
state.db
├── job_applications      — job tracker (job_id, title, company, status, url, applied_at, follow_up_at)
├── freelance_leads       — freelance tracker (lead_id, platform, title, status, url, seen_at, bid_at)
├── daily_state           — daily running state (date TEXT PK, morning_done, eod_done, briefing_sent, summary_json)
├── content_log           — content pipeline (content_id, type, title, source_url, status, drafted_at)
├── orchestration_tasks   — orchestrator checkpoints (task_id, parent_id, prompt, status, result, created_at, updated_at)
└── notify_log            — notification deduplication (key TEXT PK, sent_at, message_hash)
```

**Why SQLite over JSON state files (current pattern):** Multiple programs need to read/write the same logical state (e.g., job-scanner writes, follow-up-enforcer reads). JSON files require read-parse-modify-write with no concurrency protection. SQLite gives ACID transactions, concurrent read safety, and queryable history at zero infrastructure cost. File-per-program state still applies for program-local ephemeral data (last run timestamps, etc).

**Integration pattern (same as `sentinel-scan.ts`):**
```typescript
import { Database } from "bun:sqlite";
const STATE_DB = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const db = new Database(STATE_DB);
// Ensure tables exist at startup (idempotent)
db.run(`CREATE TABLE IF NOT EXISTS job_applications (
  job_id TEXT PRIMARY KEY,
  title TEXT, company TEXT, status TEXT,
  url TEXT, applied_at TEXT, follow_up_at TEXT
)`);
```

---

### 2. notify.ts — Centralized Notification Module

**Location:** `bin/notify.ts` (importable module, not a standalone program)

**Purpose:** Single abstraction for WhatsApp delivery with retry, deduplication via `notify_log` table in state.db, and env-var configuration for phone number.

**Import pattern (used by all heartbeat programs):**
```typescript
import { notify } from "./notify.ts";
// or with absolute path for robustness in bun:
import { notify } from "/etc/nixos/zeroclaw/bin/notify.ts";

await notify({
  to: process.env.KIRO_NOTIFY_TO ?? "+51926689401",
  message: "Morning briefing: ...",
  dedupeKey: `morning-briefing:${today}`,  // prevents duplicate sends if cron fires twice
});
```

**Internal implementation:**
```
notify(opts)
  ├── Check notify_log in state.db for dedupeKey (skip if already sent today)
  ├── Attempt: kapso-whatsapp-cli send --to <to> --text <message>
  ├── On failure: retry up to 3x with 5s backoff
  ├── On persistent failure: log to stderr (stdout stays clean JSON)
  └── On success: write to notify_log (key, sent_at, message_hash)
```

**Env-var config (avoids hardcoded phone number):**
- `KIRO_NOTIFY_TO` — primary notification target (default: hardcoded owner number as fallback)
- Read from `/run/secrets/rendered/zeroclaw.env` at program start (same pattern as `email/cli.ts` and `calendar/cli.ts`)

**Why a module vs copy-paste:** `sentinel-scan.ts` already hardcodes the WhatsApp call inline. 11 new programs would repeat this pattern. The notification channel is likely to change (retry logic, phone number, fallback behavior). A single module means one change propagates everywhere.

---

### 3. cron-sync Agent Job Support via REST API

**Current state:** `cron-sync` in `module.nix` only calls `zeroclaw cron add ... --command <shell command>`. This creates `job_type = 'shell'` jobs. Agent jobs (job_type = 'agent', prompt text as command) require a different code path.

**Integration approach:** Extend the `cronSync` shell script in `module.nix` to detect agent-type YAML and use the ZeroClaw daemon REST API instead of the `zeroclaw cron add` CLI.

**YAML schema extension (new `type` field):**
```yaml
# Shell job (existing, unchanged)
name: "Sentinel"
schedule: "0 */2 * * *"
command: "bun run /etc/nixos/zeroclaw/bin/sentinel-scan.ts"

# Agent job (NEW)
name: "Morning Briefing"
schedule: "0 8 * * *"
type: "agent"
command: "Run the morning briefing: compile calendar, emails, and tasks into a WhatsApp summary."
tz: "America/Lima"
```

**REST API call (replaces `zeroclaw cron add` for agent jobs):**
```bash
# Daemon exposes REST at gateway port (42617) or a separate management port
# Exact endpoint needs validation against ZeroClaw REST API docs before implementation
curl -s -X POST "http://127.0.0.1:42617/api/cron/jobs" \
  -H "Content-Type: application/json" \
  -d '{"name":"Morning Briefing","expression":"0 8 * * *","prompt":"Run the morning briefing...","tz":"America/Lima"}'
```

**cron-sync modification in module.nix:**
```bash
type=$(yq -r '.type // "shell"' "$yaml_file")

if [[ "$type" == "agent" ]]; then
  # Use REST API for agent jobs (daemon must be running)
  prompt=$(yq -r '.command' "$yaml_file")
  curl -s -X POST "http://127.0.0.1:42617/api/cron/jobs" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg name "$name" --arg expr "$schedule" --arg prompt "$prompt" --arg tz "$tz" \
         '{name:$name,expression:$expr,prompt:$prompt,tz:$tz}')"
else
  # Existing shell job path (unchanged)
  zeroclaw cron add "$schedule" "$command" ...
fi
```

**Risk flag:** The ZeroClaw daemon REST API endpoint for cron management is not confirmed. `cron-sync` currently inspects `jobs.db` directly via sqlite3. If no REST API exists, the alternative is to write directly to `jobs.db` with the correct schema (job_type column, prompt column). Validate with `zeroclaw --help` and inspect `jobs.db` schema before implementing.

**Fallback if REST API is unavailable:** Insert directly into `~/.zeroclaw/workspace/cron/jobs.db` using sqlite3 with the correct schema (inspect existing rows to determine column layout for agent vs shell jobs). This bypasses the daemon but is safe as long as the daemon re-reads the DB on schedule evaluation.

---

### 4. orchestrate.ts — Task Decomposition Engine

**Location:** `bin/orchestrate.ts`

**Purpose:** Decompose complex tasks into subtasks, execute them via `claude -p` (Claude CLI subprocess), checkpoint progress to `orchestration_tasks` table in state.db, and aggregate results.

**When to use:** Complex heartbeat programs (morning briefing aggregating 5+ data sources, EOD summary synthesizing a full day, weekly company refresh) where a single `claude -p` call would be too long or benefit from parallel subtask execution.

**Architecture:**
```
orchestrate(parentTask)
  ├── Write parent task to orchestration_tasks (status: 'running')
  ├── Decompose into subtasks (defined by caller, not LLM-driven)
  ├── For each subtask:
  │   ├── Write subtask row (parent_id, prompt, status: 'pending')
  │   ├── Execute: claude -p "<prompt>" (subprocess via Bun.$)
  │   ├── Capture stdout as result
  │   └── Update subtask row (status: 'done'|'failed', result)
  ├── On subtask failure: mark failed, continue others (non-blocking)
  ├── Aggregate results from completed subtasks
  ├── Update parent task (status: 'done', result: aggregated)
  └── Return aggregated result to caller
```

**Checkpointing purpose:** If a heartbeat program is interrupted mid-run (system restart, cron timeout), the orchestration_tasks table shows exactly which subtasks completed. On next run, the program can detect a partial previous run and either resume or skip.

**`claude -p` invocation pattern:**
```typescript
import { $ } from "bun";

async function runSubtask(prompt: string, timeout = 60000): Promise<string> {
  const result = await $`claude -p ${prompt}`.timeout(timeout).quiet();
  if (result.exitCode !== 0) {
    throw new Error(`claude subprocess failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}
```

**Why `claude -p` over ZeroClaw sub-agents:** ZeroClaw sub-agent delegation (IPC via agents.db) is currently not deployed and would require `module.nix` changes. `claude -p` is available today via the Anthropic CLI, works as a subprocess with predictable stdout, and gives access to Claude Opus 4.6 for high-quality synthesis. The tradeoff is that `claude -p` does not have ZeroClaw tool access (no memory_store, no shell tools) — it is a pure text generation call. Use for synthesis/drafting subtasks only; use ZeroClaw skills for tool-access subtasks.

---

## Component Interaction Map

```
11 Heartbeat Programs (bin/*.ts)
       │
       ├── import notify.ts          ──► kapso-whatsapp-cli ──► WhatsApp
       │
       ├── read/write state.db       ──► ~/.zeroclaw/workspace/state.db
       │     (job_applications,           (shared, multi-program)
       │      freelance_leads,
       │      daily_state, etc.)
       │
       ├── call orchestrate.ts       ──► claude -p (subprocess)
       │     (complex programs only)       checkpoints to state.db
       │
       └── call skill CLIs           ──► bun run skills/<name>/cli.ts
             (email, calendar)             reads zeroclaw.env for secrets

cron/jobs/*.yaml (11 new)
       │
       ├── type: "shell"  ──► cron-sync ──► zeroclaw cron add (existing path)
       │                                    ──► jobs.db shell job
       │
       └── type: "agent"  ──► cron-sync ──► REST POST /api/cron/jobs (new path)
                                            OR direct sqlite insert (fallback)
                                            ──► jobs.db agent job

state.db initialization
       │
       └── bin/state-init.ts ──► CREATE TABLE IF NOT EXISTS (idempotent)
             (run once by first program that needs it, or by cron-sync setup)
```

---

## Integration Points: New vs Existing

### New Components and Where They Hook In

| New Component | Type | Hooks Into | Notes |
|---------------|------|-----------|-------|
| `bin/state.db` | SQLite database | All 11 heartbeat programs + orchestrate.ts | Created at `~/.zeroclaw/workspace/state.db`; programs create tables at startup (idempotent) |
| `bin/notify.ts` | Importable module | All 11 heartbeat programs | Replaces inline `kapso-whatsapp-cli` pattern from sentinel-scan.ts |
| `bin/orchestrate.ts` | Importable module | Programs needing multi-step synthesis | Calls `claude -p` as subprocess; checkpoints to state.db |
| `bin/state-init.ts` | Standalone program | cron-sync setup phase OR first-run of any program | Creates state.db tables; safe to call multiple times |
| `cron/jobs/*.yaml` (11) | YAML definitions | cron-sync → zeroclaw scheduler | 8 shell jobs + 3 agent jobs (estimated split) |
| `cron-sync` (modified) | NixOS shell script | `module.nix` (rebuild required) | Extended to detect `type: agent` and use REST API |

### Existing Components That Are Unchanged

| Component | Why Unchanged |
|-----------|---------------|
| `brain.db` | ZeroClaw agent memory — only agent core writes here; programs use state.db instead |
| `jobs.db` | Cron scheduler DB — only daemon writes here; cron-sync continues as the write path |
| `agents.db` | IPC — not used by heartbeat programs |
| `config.toml` | No new providers, ports, or structural changes needed |
| `module.nix` services | All 4 systemd services (gateway, bridge, zai-proxy, chromedriver) unchanged |
| `skills/email`, `skills/calendar` | Heartbeat programs call their CLIs as subprocesses; skills themselves unchanged |

### Modified Components

| Component | What Changes | Rebuild Required? |
|-----------|-------------|-------------------|
| `cron-sync` (in module.nix) | Add `type` field detection, REST API / sqlite direct insert for agent jobs | YES (module.nix change) |
| `bin/README.md` | Add new programs to the table | NO (live edit) |
| `cron/README.md` | Document `type: agent` YAML field | NO (live edit) |

---

## Data Flow: Each New Component

### Heartbeat Program Execution Flow

```
ZeroClaw scheduler fires cron job
    │
    │ (shell job): zeroclaw daemon → executes bun run bin/<program>.ts
    │
    ▼
bin/<program>.ts starts
    ├── Load secrets from /run/secrets/rendered/zeroclaw.env
    ├── Open state.db (CREATE TABLE IF NOT EXISTS ...)
    ├── Check daily_state: has this job already run today? → skip if yes
    ├── Execute domain logic:
    │   ├── Query external APIs / skill CLIs (email, calendar)
    │   ├── Write new records to state.db (job_applications, etc.)
    │   └── Call orchestrate.ts if complex synthesis needed
    ├── Compose notification message
    ├── Call notify.ts → kapso-whatsapp-cli → WhatsApp
    ├── Update daily_state (mark job done)
    └── Output JSON summary to stdout (captured by ZeroClaw scheduler log)
```

### notify.ts Flow

```
notify({ to, message, dedupeKey })
    │
    ├── db = open state.db
    ├── SELECT from notify_log WHERE key = dedupeKey AND sent_at > (now - 12h)
    │   └── if found: return { ok: false, skipped: true, reason: "already_sent" }
    │
    ├── Attempt 1: kapso-whatsapp-cli send --to <to> --text <message>
    │   └── success → INSERT notify_log (key, sent_at, message_hash) → return { ok: true }
    │
    ├── On failure: wait 5s
    ├── Attempt 2: same
    │   └── success → INSERT notify_log → return { ok: true }
    │
    ├── On failure: wait 10s
    ├── Attempt 3: same
    │   └── success → INSERT notify_log → return { ok: true }
    │
    └── All attempts failed → console.error(JSON.stringify({error: ...}))
                            → return { ok: false, error: "delivery_failed" }
                            (caller continues execution; notification is best-effort)
```

### orchestrate.ts Flow

```
orchestrate({ taskId, subtasks: [{name, prompt}, ...] })
    │
    ├── Check orchestration_tasks for existing taskId (resume from checkpoint if found)
    │
    ├── For each subtask (in parallel or sequential, defined by caller):
    │   ├── Write subtask row to orchestration_tasks (status: 'pending')
    │   ├── claude -p "<prompt>" (10-60s timeout per subtask)
    │   ├── On success: UPDATE orchestration_tasks (status: 'done', result: stdout)
    │   └── On failure: UPDATE orchestration_tasks (status: 'failed', result: stderr)
    │
    ├── Aggregate: collect all 'done' subtask results
    │
    └── Return { taskId, results: {subtask1: "...", subtask2: "..."}, failed: [...] }
```

### cron-sync Agent Job Flow (new path)

```
cron-sync reads cron/jobs/morning-briefing.yaml
    │
    ├── type = "agent" detected
    ├── Check jobs.db: does job named "Morning Briefing" exist?
    │
    ├── If not exists:
    │   └── REST: POST http://127.0.0.1:42617/api/cron/jobs
    │         { name, expression, prompt, tz }
    │         OR fallback: sqlite3 insert directly into jobs.db
    │
    └── If exists and changed:
        └── REST: PATCH http://127.0.0.1:42617/api/cron/jobs/<id>
              OR fallback: sqlite3 UPDATE jobs.db
```

---

## Recommended Directory Layout (v2.0)

```
/etc/nixos/zeroclaw/
├── module.nix                         # MODIFIED: cron-sync extended for agent jobs
├── bin/
│   ├── README.md                      # MODIFIED: add new programs
│   ├── notify.ts                      # NEW: importable notification module
│   ├── state-init.ts                  # NEW: idempotent state.db schema setup
│   ├── orchestrate.ts                 # NEW: task decomposition + checkpointing
│   ├── sentinel-scan.ts               # EXISTING (unchanged)
│   ├── zai-proxy.ts                   # EXISTING (unchanged)
│   ├── morning-briefing.ts            # NEW: heartbeat cron program
│   ├── job-scanner.ts                 # NEW: heartbeat cron program
│   ├── content-scout.ts               # NEW: heartbeat cron program
│   ├── follow-up-enforcer.ts          # NEW: heartbeat cron program
│   ├── build-in-public-drafter.ts     # NEW: heartbeat cron program
│   ├── eod-summary.ts                 # NEW: heartbeat cron program
│   ├── self-audit.ts                  # NEW: heartbeat cron program
│   ├── company-refresh.ts             # NEW: heartbeat cron program (weekly)
│   ├── paper-scout.ts                 # NEW: heartbeat cron program
│   ├── engagement-scout.ts            # NEW: heartbeat cron program
│   └── freelance-scanner.ts           # NEW: heartbeat cron program
├── cron/
│   ├── README.md                      # MODIFIED: document type: agent field
│   └── jobs/
│       ├── sentinel.yaml              # EXISTING (unchanged)
│       ├── morning-briefing.yaml      # NEW
│       ├── job-scanner.yaml           # NEW
│       ├── content-scout.yaml         # NEW
│       ├── follow-up-enforcer.yaml    # NEW
│       ├── build-in-public.yaml       # NEW
│       ├── eod-summary.yaml           # NEW
│       ├── self-audit.yaml            # NEW
│       ├── company-refresh.yaml       # NEW
│       ├── paper-scout.yaml           # NEW
│       ├── engagement-scout.yaml      # NEW
│       └── freelance-scanner.yaml     # NEW
└── skills/                            # UNCHANGED
    ├── email/
    └── calendar/

~/.zeroclaw/workspace/
├── state.db                           # NEW: shared state (created at first run)
├── memory/brain.db                    # EXISTING (unchanged)
├── cron/jobs.db                       # EXISTING (read by cron-sync, write via daemon)
└── email-accounts.json                # EXISTING (unchanged)
```

---

## Architectural Patterns

### Pattern 1: Import-by-Absolute-Path for Shared Modules

**What:** `notify.ts` and `orchestrate.ts` are imported by heartbeat programs using absolute paths, not relative paths.

**When to use:** Whenever a `bin/` program needs to import another `bin/` module. Bun supports TypeScript imports natively.

**Why absolute:** Cron jobs run from an unpredictable working directory (the ZeroClaw daemon's cwd). Relative imports like `./notify.ts` break. Absolute paths guarantee resolution.

**Example:**
```typescript
// Good — absolute path, works regardless of cwd
import { notify } from "/etc/nixos/zeroclaw/bin/notify.ts";
import { orchestrate } from "/etc/nixos/zeroclaw/bin/orchestrate.ts";

// Bad — relative path, breaks when run from daemon context
import { notify } from "./notify.ts";
```

### Pattern 2: Idempotent State Initialization

**What:** Every program that uses state.db runs `CREATE TABLE IF NOT EXISTS` at startup instead of relying on a pre-initialized database.

**When to use:** Always. The database file may not exist on first run. Multiple programs may start concurrently. State schema may evolve (new columns via `ALTER TABLE ADD COLUMN IF NOT EXISTS`).

**Trade-offs:** Tiny overhead per program startup (microseconds for SQLite DDL on existing tables). The benefit is that programs are self-contained and order-independent — no external setup step required.

### Pattern 3: Best-Effort Notifications with Deduplication

**What:** Notification failures do not fail the program. The program completes its state mutations and logs the failure. `notify_log` deduplication prevents double-sends if a program is retried.

**When to use:** All heartbeat programs. The notification is secondary to the state update. Missing a WhatsApp message is recoverable; corrupting state.db is not.

**Trade-offs:** Owner may not notice if notifications silently fail for multiple days. Mitigation: include a `notify_failures` count in the weekly self-audit summary.

### Pattern 4: Shell Jobs for Deterministic Work, Agent Jobs for Synthesis

**What:** The 11 heartbeat crons split between shell jobs (programs in `bin/`) and agent jobs (ZeroClaw agent session with a prompt). Shell jobs handle data collection, API calls, state updates. Agent jobs handle synthesis, drafting, judgment-requiring tasks.

**Decision rule (from `cron/README.md`):** "Can you express the decision logic as an if-statement? Yes → shell job. No → agent job."

**v2.0 estimated split:**
- Shell jobs (8): morning-briefing data collection, job-scanner, freelance-scanner, content-scout scraping, follow-up-enforcer, self-audit metrics collection, paper-scout, engagement-scout
- Agent jobs (3): build-in-public drafter (requires voice/style judgment), EOD narrative summary (synthesis), company-refresh (research + evaluation)

---

## Build Order

Dependencies define the order. Each phase can only start after its predecessors are complete.

```
Phase 1: Shared Infrastructure
    ├── bin/state-init.ts           ← state.db schema; no dependencies
    ├── bin/notify.ts               ← depends on state-init.ts (notify_log table)
    └── bin/orchestrate.ts          ← depends on state-init.ts (orchestration_tasks table)

        All heartbeat programs depend on Phase 1.
        notify.ts and orchestrate.ts must exist before any heartbeat program is written.

Phase 2: cron-sync Agent Job Support
    └── module.nix (cron-sync extended)   ← depends on knowing the REST API endpoint
                                            Validate ZeroClaw daemon API first.
                                            Fallback: direct sqlite insert if no REST API.
                                            REBUILD REQUIRED after this change.

        All agent-type cron YAMLs depend on Phase 2.
        Shell-type cron YAMLs can be added in Phase 3+ without waiting for Phase 2.

Phase 3: Shell-type Heartbeat Programs (no LLM, deterministic)
    ├── bin/job-scanner.ts             ← depends on state.db, notify.ts
    ├── bin/freelance-scanner.ts       ← depends on state.db, notify.ts
    ├── bin/follow-up-enforcer.ts      ← depends on state.db (reads job_applications)
    ├── bin/morning-briefing.ts        ← depends on state.db, notify.ts, email/calendar skills
    ├── bin/content-scout.ts           ← depends on state.db, notify.ts
    ├── bin/paper-scout.ts             ← depends on state.db, notify.ts
    ├── bin/engagement-scout.ts        ← depends on state.db, notify.ts
    └── bin/self-audit.ts              ← depends on state.db (reads all tables for metrics)

        Corresponding cron/*.yaml files added in parallel.
        Wire to ZeroClaw scheduler via cron-sync (shell type — no Phase 2 dependency).

Phase 4: Agent-type Heartbeat Programs (require LLM synthesis)
    ├── cron/jobs/build-in-public.yaml   ← depends on Phase 2 (agent job support)
    ├── cron/jobs/eod-summary.yaml       ← depends on Phase 2
    └── cron/jobs/company-refresh.yaml   ← depends on Phase 2

        These are cron YAML files only (no bin/ program).
        The agent session uses skills directly (email, calendar) if needed.
        Test by triggering manually: zeroclaw cron trigger <id>

Phase 5: orchestrate.ts Integration (optional complexity)
    └── Complex programs (morning-briefing, EOD) refactored to use orchestrate.ts
        if single-pass execution proves insufficient.

        Defer until Phase 3 programs are running and complexity is proven necessary.
        orchestrate.ts was built in Phase 1 but used only here.
```

**Rationale for this order:**
1. Infrastructure first (state.db, notify.ts, orchestrate.ts) — every heartbeat program depends on these. Building them first means programs can be written and tested in isolation.
2. cron-sync agent support second — but shell-type programs do not need to wait. Start Phase 3 in parallel with Phase 2 REST API investigation.
3. Shell programs before agent programs — shell programs are testable directly (`bun run bin/job-scanner.ts`); agent cron jobs require the daemon to be running and the REST API integration to work. Reduce the unknowns before adding agent jobs.
4. `orchestrate.ts` integration deferred — build it in Phase 1, use it only when a program proves too complex for single-pass execution. Don't add orchestration complexity preemptively.

---

## Anti-Patterns

### Anti-Pattern 1: Hardcoding Phone Numbers and Config in Programs

**What people do:** Copy the `ALERT_TO = "+51926689401"` pattern from `sentinel-scan.ts` into every new program.

**Why it's wrong:** Phone number changes require editing 11+ files. The sentinel is a special case (it predates the notify module). New programs should not follow the old pattern.

**Do this instead:** Use `notify.ts` with `KIRO_NOTIFY_TO` env var. The env var is loaded from `/run/secrets/rendered/zeroclaw.env` at startup, same pattern as `email/cli.ts` and `calendar/cli.ts`.

### Anti-Pattern 2: Per-Program JSON State Files for Shared Domains

**What people do:** Each heartbeat program writes its own `~/.zeroclaw/workspace/job-scanner-state.json`, `~/.zeroclaw/workspace/follow-up-state.json`, etc.

**Why it's wrong:** `follow-up-enforcer.ts` needs to read data written by `job-scanner.ts`. With separate files, each program must know the other's file format and path. Adding a new consumer requires editing the producer. No queryable history.

**Do this instead:** Shared domains (job applications, freelance leads) go in state.db shared tables. Program-local ephemeral data (last run timestamp, run count) can stay as small JSON files.

### Anti-Pattern 3: Blocking on Notification Failure

**What people do:** `if (!await notify(...)) { process.exit(1); }` — treating notification failure as a program failure.

**Why it's wrong:** `kapso-whatsapp-cli` depends on the Kapso bridge, which depends on WhatsApp Cloud API availability. Any of these can be temporarily unavailable. Failing the entire program means no state is updated, no log is written, and the cron job shows as failed in the scheduler — obscuring the real work that did complete.

**Do this instead:** Notifications are best-effort. Log failures to stderr. The program exits 0 if its core work completed. Only exit 1 if the core state mutation failed.

### Anti-Pattern 4: Running orchestrate.ts for Simple Programs

**What people do:** Use `orchestrate.ts` for every heartbeat program to "keep the pattern consistent."

**Why it's wrong:** `orchestrate.ts` adds a `claude -p` subprocess call, SQLite writes for checkpointing, and a timeout budget. For a program that just queries an API and sends a message, this is ~5x overhead with no benefit.

**Do this instead:** Use `orchestrate.ts` only when a program genuinely needs multi-source synthesis that exceeds what a single pass can reasonably do (morning briefing aggregating 5+ sources, EOD narrative, weekly company refresh). Most programs (job-scanner, follow-up-enforcer, paper-scout) are simple enough to run without it.

---

## Risk Flags Requiring Validation

| Risk | What to Validate | When |
|------|-----------------|------|
| ZeroClaw REST API for agent cron jobs | Does `zeroclaw` daemon expose REST for cron management? What is the endpoint? | Before Phase 2 implementation |
| Direct sqlite insert fallback | What columns does `jobs.db` have for agent jobs? What does a job_type='agent' row look like? | Before Phase 2 if REST not found |
| `claude -p` availability | Is `claude` CLI installed in PATH accessible from ZeroClaw daemon context? | Before Phase 5 (orchestrate.ts use) |
| bun import from absolute path | Does `bun run bin/job-scanner.ts` correctly resolve `import ... from "/etc/nixos/zeroclaw/bin/notify.ts"`? | Before Phase 3 first program |
| state.db concurrent access | If two cron jobs fire simultaneously and both write to state.db, does SQLite WAL mode prevent corruption? | Enable WAL mode: `PRAGMA journal_mode=WAL` in state-init.ts |

---

## Sources

- `/etc/nixos/zeroclaw/module.nix` — live cron-sync implementation (HIGH confidence)
- `/etc/nixos/zeroclaw/bin/sentinel-scan.ts` — existing notification + SQLite read pattern (HIGH confidence)
- `/etc/nixos/zeroclaw/skills/email/cli.ts` — env-var secret loading pattern (HIGH confidence)
- `/etc/nixos/zeroclaw/skills/calendar/cli.ts` — bun:sqlite + external CLI pattern (HIGH confidence)
- `/etc/nixos/zeroclaw/bin/README.md` — program standard, state convention (HIGH confidence)
- `/etc/nixos/zeroclaw/cron/README.md` — job type distinction, YAML schema (HIGH confidence)
- `/etc/nixos/zeroclaw/.planning/PROJECT.md` — v2.0 requirements (HIGH confidence)
- `/etc/nixos/zeroclaw/.planning/research/ARCHITECTURE.md` (2026-03-04) — v1.0 baseline (HIGH confidence)

---

*Architecture research for: ZeroClaw v2.0 Heartbeat — integration of state DB, notify module, agent cron support, orchestration engine*
*Researched: 2026-03-06*
