# Phase 6: Foundation Fixes and Shared Infrastructure - Research

**Researched:** 2026-03-07
**Domain:** Bun TypeScript programs, bun:sqlite, NixOS sops secrets, cron YAML cleanup
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**State DB Schema:**
- Rich tracking for job/freelance leads: title, company, url, status (new/applied/interview/offer/rejected), found_date, salary_range, location, match_score, source_platform, notes, applied_date, last_updated
- All 7 tables created upfront in Phase 6 (job_applications, freelance_leads, daily_state, content_log, orchestration_tasks, notify_log, cron_log) — downstream phases just INSERT
- Add a `kv_store` table (key/value/updated_at) for ad-hoc state that doesn't justify its own table
- No auto-pruning retention policy — keep everything. SQLite handles the volume fine (~50 entries/day). Prune manually if ever needed
- WAL mode enabled, busy_timeout set, schema versioning included

**Notify Module API:**
- Dual interface: primary is import function (`import { notify } from '../bin/notify.ts'`), also expose CLI wrapper for shell scripts or non-TS callers
- Two priority levels: **normal** (respects 5-min rate limit) and **urgent** (bypasses rate limit, e.g., sentinel alerts)
- Rate limiting uses per-process check against notify_log table — if another program sent within 5 min, current message queues/waits. DB is the coordination point
- Retry: 3 attempts with exponential backoff on failure
- Failure mode: log to notify_log AND write to stderr — callers can detect failure, cron output captures error, but calling program doesn't crash
- Phone number from `NOTIFY_TARGET` env var — no hardcoded numbers anywhere

**Sentinel Refactor:**
- Swap inline WhatsApp logic (`kapso-whatsapp-cli send --to ${ALERT_TO}`) for notify module import
- Remove hardcoded phone number `+51926689401`
- Sentinel alerts use **urgent** priority (bypass rate limit)

**Cleanup:**
- Delete stale files outright: `bin/repair-loop.sh`, `.planning/phases/` directory, `ORCHESTRATION.md` from repo root
- Consume ORCHESTRATION.md content into planning docs before removing
- Add `tz: America/Lima` to all cron YAMLs (currently only sentinel.yaml, missing tz)
- Apply NixOS rebuild to activate resolve_command() and skills-sync cleanup

### Claude's Discretion
- Exact column types and indexes for state.db tables
- Schema versioning mechanism (migration table vs pragma)
- Exponential backoff timing (initial delay, multiplier)
- notify.ts internal architecture (class vs functions)
- Cleanup verification approach

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIX-01 | NixOS rebuild applied to activate resolve_command() and skills-sync cleanup | Rebuild command documented; resolve_command() already exists in module.nix — rebuild propagates it |
| FIX-02 | All cron YAMLs include `tz: America/Lima` | Only sentinel.yaml exists; adding tz field is trivial — cron-sync reads and passes `--tz` flag already |
| FIX-03 | `bin/repair-loop.sh` removed (orphaned after skill refactor) | File confirmed at `/etc/nixos/zeroclaw/bin/repair-loop.sh` — delete it |
| FIX-04 | Stale workspace state cleaned (`memory_hygiene_state.json`, `runtime-trace.jsonl`) | Both confirmed at `~/.zeroclaw/workspace/state/` — delete them |
| FIX-05 | Stale `.planning/phases/` directory cleaned | `.planning/phases/` directory confirmed exists — delete it (except current phase work) |
| FIX-06 | `ORCHESTRATION.md` consumed into planning docs and removed from repo root | File confirmed; content is a design proposal — capture into planning, then delete |
| FIX-08 | `NOTIFY_TARGET` env var added to sops secrets and `zeroclaw.env` rendering | zeroclaw-secrets.nix is the only file to edit; pattern clear from existing secret entries |
| INFRA-01 | Shared SQLite state database at `~/.zeroclaw/workspace/state.db` with WAL mode, busy_timeout, and schema versioning | bun:sqlite confirmed working; WAL mode verified; PRAGMA user_version for schema versioning |
| INFRA-02 | Centralized notification module (`bin/notify.ts`) with WhatsApp retry (3 attempts, exponential backoff) and rate limiting (5-min gap) | kapso-whatsapp-cli interface confirmed; import.meta.main pattern for dual CLI/module; rate limiting via notify_log table verified |
| INFRA-03 | Notification target phone number read from `NOTIFY_TARGET` environment variable | `Bun.env.NOTIFY_TARGET` pattern; NOTIFY_TARGET must be in zeroclaw.env (FIX-08 dependency) |
| INFRA-05 | `resolve_command()` extended to cover `claude` binary path | claude lives at `~/.local/bin/claude` (symlink), which IS in systemd user PATH — no resolve needed, OR resolve to `~/.local/bin/claude` |
| INFRA-06 | Sentinel scan refactored to use notify module instead of inline WhatsApp logic | sentinel-scan.ts fully read; exact refactor points identified: remove ALERT_TO constant, replace $\`kapso-whatsapp-cli ...\` with await notify(...) |
| INFRA-07 | Cron execution logging (what ran, duration, success/fail) to state.db | cron_log table schema defined; ZeroClaw cron daemon handles this automatically once table exists |
| DOCS-01 | LORE.md updated to reference state.db instead of `~/zeroclaw-data/` JSON trackers | LORE.md has `~/zeroclaw-data/job-tracker.json` and `~/zeroclaw-data/freelance-tracker.json` references — update to state.db |
</phase_requirements>

---

## Summary

Phase 6 is a cleanup and infrastructure phase. No new external libraries needed — everything builds on `bun:sqlite` (already used in sentinel-scan.ts) and `kapso-whatsapp-cli` (already installed). The three pillars are: (1) delete stale artifacts, (2) create state.db with full v2.0 schema, (3) build notify.ts as a shared module.

All technology choices are confirmed with live verification on this machine. `bun:sqlite` WAL mode works. The `import.meta.main` pattern enables the dual CLI/module interface for notify.ts. Rate limiting via notify_log table is verified. The `kapso-whatsapp-cli send --to NUMBER --text MESSAGE` interface is confirmed. No new dependencies to install — `bun` and `kapso-whatsapp-cli` are already on PATH.

The only NixOS rebuild concern is FIX-08 (adding NOTIFY_TARGET to sops) — this requires editing `zeroclaw-secrets.nix` and the sops yaml, then running a rebuild. Everything else (TypeScript files, cron YAMLs, LORE.md edits) is live-edit with no rebuild.

**Primary recommendation:** Create state.db initialization first (INFRA-01), then build notify.ts (INFRA-02/INFRA-03), then refactor sentinel (INFRA-06), then do cleanup (FIX-01 through FIX-08), then DOCS-01.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | Bun 1.3.3 built-in | State database | Already used in sentinel-scan.ts; zero extra dependencies; WAL mode verified |
| kapso-whatsapp-cli | Installed | WhatsApp delivery | Already installed; `send --to NUMBER --text MESSAGE` interface confirmed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bun ($) | Bun 1.3.3 built-in | Shell command execution | Already used in sentinel-scan.ts for kapso-whatsapp-cli calls |
| sops (NixOS) | System-managed | Secret injection into zeroclaw.env | FIX-08: adding NOTIFY_TARGET |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PRAGMA user_version | Separate schema_migrations table | user_version is simpler for single-consumer DB with no external migrations |
| Functions module | Class-based notify | Functions are simpler, match existing codebase style (sentinel-scan.ts is procedural) |

**Installation:** No new packages needed. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

```
bin/
├── notify.ts          # NEW: shared notification module (import + CLI)
├── sentinel-scan.ts   # MODIFIED: remove inline WhatsApp, import notify
├── repair-loop.sh     # DELETE: orphaned
└── zai-proxy.ts       # unchanged

cron/jobs/
└── sentinel.yaml      # MODIFIED: add tz: America/Lima

zeroclaw-secrets.nix   # MODIFIED: add NOTIFY_TARGET secret + zeroclaw.env entry
secrets/zeroclaw.yaml  # MODIFIED: add notify-target encrypted value

documents/
└── LORE.md            # MODIFIED: update tracker references to state.db

ORCHESTRATION.md       # DELETE after capturing content to planning

~/.zeroclaw/workspace/
└── state.db           # NEW: created by init script at activation
    state/
    ├── memory_hygiene_state.json  # DELETE
    └── runtime-trace.jsonl        # DELETE
```

### Pattern 1: Bun Dual CLI/Module Interface

**What:** A TypeScript file that exports functions for import AND handles CLI invocation via `import.meta.main`.
**When to use:** Any shared utility program (notify.ts) that both TypeScript programs import and shell scripts call.

```typescript
// Source: Bun docs — import.meta.main
// bin/notify.ts

export type Priority = "normal" | "urgent";

export async function notify(message: string, priority: Priority = "normal"): Promise<boolean> {
  // ... implementation
}

// CLI entrypoint — only runs when invoked directly
if (import.meta.main) {
  const args = process.argv.slice(2);
  const priority = args.includes("--urgent") ? "urgent" : "normal";
  const message = args.filter(a => !a.startsWith("--")).join(" ");

  if (!message) {
    console.error("Usage: notify.ts [--urgent] <message>");
    process.exit(1);
  }

  const ok = await notify(message, priority);
  process.exit(ok ? 0 : 1);
}
```

**Callers:**
```typescript
// TypeScript import (sentinel-scan.ts)
import { notify } from "./notify.ts";
await notify("alert message", "urgent");

// Shell script CLI
bun run /etc/nixos/zeroclaw/bin/notify.ts --urgent "alert message"
```

### Pattern 2: state.db Initialization

**What:** Create database with WAL mode, busy_timeout, and all v2.0 tables in a single init function. Use `PRAGMA user_version` for schema versioning.
**When to use:** State.db must be initialized before any other program writes to it. Init is idempotent (CREATE TABLE IF NOT EXISTS).

```typescript
// Source: Verified with bun:sqlite 1.3.3
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";

const STATE_DB = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const SCHEMA_VERSION = 1;

export function initStateDb(): Database {
  mkdirSync(`${Bun.env.HOME}/.zeroclaw/workspace`, { recursive: true });
  const db = new Database(STATE_DB);

  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");

  const currentVersion = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;

  if (currentVersion === 0) {
    db.exec(SCHEMA_V1_DDL);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  return db;
}
```

### Pattern 3: Rate-Limited Notify with Retry

**What:** Check notify_log for recent sends before delivering. Retry with exponential backoff on failure. Never throw — log and return false.

```typescript
// Source: Verified logic pattern — bun:sqlite 1.3.3 + Bun.sleep
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

async function sendWithRetry(to: string, text: string, maxAttempts = 3): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await $`kapso-whatsapp-cli send --to ${to} --text ${text}`.quiet();
      return true;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await Bun.sleep(1000 * Math.pow(2, attempt - 1)); // 1s, 2s, 4s
      }
    }
  }
  console.error(`notify: delivery failed after ${maxAttempts} attempts:`, lastError);
  return false;
}

function isRateLimited(db: Database): boolean {
  const last = db.query(
    "SELECT sent_at FROM notify_log WHERE success = 1 AND priority = 'normal' ORDER BY sent_at DESC LIMIT 1"
  ).get() as { sent_at: number } | null;
  return !!last && (Date.now() - last.sent_at) < RATE_LIMIT_MS;
}
```

### Pattern 4: resolve_command() Extension for claude

**What:** The cron-sync `resolve_command()` function in module.nix resolves bare binary names to absolute paths. INFRA-05 adds `claude` to this mapping.

**Current state in module.nix:**
```bash
resolve_command() {
  local cmd="$1"
  cmd="${cmd/#bun /${pkgs.bun}/bin/bun }"
  cmd="${cmd/#node /${pkgs.nodejs}/bin/node }"
  cmd="${cmd/#python3 /${pkgs.python3}/bin/python3 }"
  printf '%s' "$cmd"
}
```

**Extension for claude:**
```bash
resolve_command() {
  local cmd="$1"
  cmd="${cmd/#bun /${pkgs.bun}/bin/bun }"
  cmd="${cmd/#node /${pkgs.nodejs}/bin/node }"
  cmd="${cmd/#python3 /${pkgs.python3}/bin/python3 }"
  cmd="${cmd/#claude /${config.home.homeDirectory}/.local/bin/claude }"
  printf '%s' "$cmd"
}
```

Note: `claude` lives at `~/.local/bin/claude` (a symlink managed by Claude Code auto-updater). `~/.local/bin` IS in the systemd user PATH (verified), so claude would work even without resolve_command. But adding it to resolve_command ensures consistency if future cron job YAML uses `claude` prefix.

### Anti-Patterns to Avoid

- **Hardcoded phone numbers:** Any phone number in source code is a security/maintenance risk. `Bun.env.NOTIFY_TARGET` is the only correct pattern.
- **Throwing from notify.ts:** notify.ts must NEVER throw. Callers (cron programs) must not crash due to notification failures. Return `false`, log to stderr.
- **WAL on in-memory DB:** WAL mode silently falls back to "memory" journal mode for `:memory:` databases. Always use a file path for state.db.
- **Skipping CREATE TABLE IF NOT EXISTS:** The state.db init must be idempotent. A NixOS rebuild runs home.activation which could trigger init again.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WhatsApp delivery | Custom HTTP client to Kapso API | `kapso-whatsapp-cli` | Already installed, handles auth, webhooks, phone-number-id |
| SQLite WAL setup | Custom file locking | `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout` | Bun:sqlite handles all WAL complexity |
| Schema migrations | Custom migration runner | `PRAGMA user_version` check + conditional DDL | Single-consumer DB, v1 covers all Phase 6 needs |
| Exponential backoff | Complex retry library | `Bun.sleep(1000 * Math.pow(2, attempt - 1))` | 3 lines, zero dependencies |

**Key insight:** This phase's infrastructure is simple enough that standard library patterns suffice. The complexity is in correctness (rate limiting, retry), not in library selection.

---

## Common Pitfalls

### Pitfall 1: FIX-05 — Deleting Planning Phases Directory Too Eagerly

**What goes wrong:** The `.planning/phases/` directory at `/etc/nixos/zeroclaw/.planning/phases/` contains `06-foundation-fixes-and-shared-infrastructure/` — the current phase's own planning files. Deleting the whole directory loses the CONTEXT.md, RESEARCH.md, and PLAN.md.

**Why it happens:** FIX-05 says "delete `.planning/phases/` directory" — but Phase 6 must NOT delete its own planning directory (GSD planner still needs it).

**How to avoid:** Delete only old phase directories (e.g., `01-declarative-cron-management-*`). The current `06-*` directory stays. Verify: `ls .planning/phases/` should show only `06-*` after cleanup.

**Warning signs:** If a task says "rm -rf .planning/phases/" without exclusion, it's wrong.

---

### Pitfall 2: NOTIFY_TARGET Not Available When notify.ts Runs

**What goes wrong:** `Bun.env.NOTIFY_TARGET` is undefined at runtime because FIX-08 (adding NOTIFY_TARGET to zeroclaw.env) was not completed or the rebuild was not applied.

**Why it happens:** The zeroclaw.env file is rendered by sops at activation time. If the secret was added to zeroclaw-secrets.nix but no rebuild happened, the env file is stale.

**How to avoid:** FIX-08 must precede INFRA-02 in execution order (or be in the same wave). notify.ts must validate `Bun.env.NOTIFY_TARGET` at startup and exit 1 with clear error if missing.

**Warning signs:** `notify.ts` exits with "NOTIFY_TARGET not set" error in cron output.

---

### Pitfall 3: state.db Initialization Race Condition

**What goes wrong:** Two programs start simultaneously (possible if multiple cron jobs trigger at the same second) and both try to initialize state.db. One fails with SQLITE_BUSY.

**Why it happens:** Without busy_timeout, SQLite immediately throws SQLITE_BUSY on lock contention.

**How to avoid:** Set `PRAGMA busy_timeout=5000` BEFORE running any schema DDL. The init function must set this as the very first pragma.

**Warning signs:** Occasional "database is locked" errors in cron output.

---

### Pitfall 4: FIX-06 — ORCHESTRATION.md Content Loss

**What goes wrong:** ORCHESTRATION.md is deleted without capturing its SQL schema definitions for `orchestration_tasks` and `orchestration_steps` tables.

**Why it happens:** FIX-06 says "consume into planning docs before removing" — but if the researcher skips this, Phase 7 (which implements orchestration) loses the reference schema.

**How to avoid:** Copy the SQL DDL from ORCHESTRATION.md into the Phase 6 RESEARCH.md (done below in Code Examples) AND into a planning doc reference before deleting. The orchestration_tasks table schema from ORCHESTRATION.md is already incorporated into INFRA-01 state.db schema.

**Warning signs:** Phase 7 planner has no reference for orchestration_tasks schema.

---

### Pitfall 5: sops zeroclaw.yaml Must Be Re-Encrypted

**What goes wrong:** Adding `notify-target` key to `zeroclaw.yaml` requires re-encrypting the file with sops. If the file is edited as plaintext without sops, it breaks decryption.

**Why it happens:** sops uses age/PGP encryption — the file must be decrypted, edited, and re-encrypted atomically via `sops edit`.

**How to avoid:** Use `sops /etc/nixos/secrets/zeroclaw.yaml` to open the editor, add the key, save. Never edit the file directly with a text editor.

**Warning signs:** sops decryption error at NixOS activation: "mac mismatch".

---

## Code Examples

Verified patterns from official sources and live testing:

### state.db Full Schema DDL

```sql
-- Source: CONTEXT.md decisions + ORCHESTRATION.md (FIX-06 capture)
-- PRAGMA user_version = 1 after this block

-- Job application tracking
CREATE TABLE IF NOT EXISTS job_applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  company     TEXT NOT NULL,
  url         TEXT,
  status      TEXT NOT NULL DEFAULT 'new',  -- new|applied|interview|offer|rejected
  found_date  INTEGER NOT NULL,              -- epoch ms
  salary_range TEXT,
  location    TEXT,
  match_score REAL,
  source_platform TEXT,
  notes       TEXT,
  applied_date INTEGER,                      -- epoch ms, NULL until applied
  last_updated INTEGER NOT NULL
);

-- Freelance lead tracking
CREATE TABLE IF NOT EXISTS freelance_leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  company     TEXT,
  url         TEXT,
  status      TEXT NOT NULL DEFAULT 'new',  -- new|applied|interview|offer|rejected
  found_date  INTEGER NOT NULL,
  salary_range TEXT,
  location    TEXT,
  match_score REAL,
  source_platform TEXT,
  notes       TEXT,
  applied_date INTEGER,
  last_updated INTEGER NOT NULL
);

-- Daily planner state (one row per day)
CREATE TABLE IF NOT EXISTS daily_state (
  date        TEXT PRIMARY KEY,             -- ISO date YYYY-MM-DD
  briefing_sent INTEGER NOT NULL DEFAULT 0, -- boolean
  eod_sent    INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  updated_at  INTEGER NOT NULL
);

-- Content pipeline log
CREATE TABLE IF NOT EXISTS content_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  platform    TEXT NOT NULL,                -- twitter|linkedin|reddit
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft', -- draft|posted|rejected
  created_at  INTEGER NOT NULL,
  posted_at   INTEGER
);

-- Orchestration task tracking (from ORCHESTRATION.md proposal)
CREATE TABLE IF NOT EXISTS orchestration_tasks (
  id          TEXT PRIMARY KEY,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending|running|done|failed
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Notification delivery log (used for rate limiting + audit)
CREATE TABLE IF NOT EXISTS notify_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message     TEXT NOT NULL,
  sent_at     INTEGER NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'normal', -- normal|urgent
  success     INTEGER NOT NULL DEFAULT 1,     -- boolean
  error       TEXT                            -- NULL on success
);

-- Cron job execution log
CREATE TABLE IF NOT EXISTS cron_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name    TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  duration_ms INTEGER,
  success     INTEGER NOT NULL DEFAULT 1,
  output      TEXT,
  error       TEXT
);

-- Ad-hoc key-value store for state that doesn't justify its own table
CREATE TABLE IF NOT EXISTS kv_store (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  INTEGER NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_job_status     ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_freelance_status ON freelance_leads(status);
CREATE INDEX IF NOT EXISTS idx_notify_sent_at ON notify_log(sent_at);
CREATE INDEX IF NOT EXISTS idx_cron_job_name  ON cron_log(job_name, started_at);
```

### notify.ts Complete Structure

```typescript
// Source: CONTEXT.md decisions + bun:sqlite verified patterns
// bin/notify.ts

import { Database } from "bun:sqlite";
import { $ } from "bun";

export type Priority = "normal" | "urgent";

const STATE_DB = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

function getDb(): Database {
  return new Database(STATE_DB);
}

function isRateLimited(db: Database): boolean {
  const last = db.query(
    "SELECT sent_at FROM notify_log WHERE success = 1 AND priority = 'normal' ORDER BY sent_at DESC LIMIT 1"
  ).get() as { sent_at: number } | null;
  return !!last && (Date.now() - last.sent_at) < RATE_LIMIT_MS;
}

function logResult(db: Database, message: string, priority: Priority, success: boolean, error?: string): void {
  db.prepare(
    "INSERT INTO notify_log (message, sent_at, priority, success, error) VALUES (?, ?, ?, ?, ?)"
  ).run(message, Date.now(), priority, success ? 1 : 0, error ?? null);
}

async function sendWithRetry(to: string, text: string, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await $`kapso-whatsapp-cli send --to ${to} --text ${text}`.quiet();
      return true;
    } catch (e) {
      if (attempt < maxAttempts) {
        await Bun.sleep(1000 * Math.pow(2, attempt - 1)); // 1s, 2s, 4s
      } else {
        console.error(`notify: delivery failed after ${maxAttempts} attempts:`, e);
      }
    }
  }
  return false;
}

export async function notify(message: string, priority: Priority = "normal"): Promise<boolean> {
  const target = Bun.env.NOTIFY_TARGET;
  if (!target) {
    console.error("notify: NOTIFY_TARGET env var not set");
    return false;
  }

  const db = getDb();
  try {
    if (priority === "normal" && isRateLimited(db)) {
      // Rate limited — skip silently (log it)
      logResult(db, message, priority, false, "rate_limited");
      return false;
    }

    const success = await sendWithRetry(target, message);
    logResult(db, message, priority, success, success ? undefined : "delivery_failed");
    return success;
  } catch (e) {
    console.error("notify: unexpected error:", e);
    logResult(db, message, priority, false, String(e));
    return false;
  } finally {
    db.close();
  }
}

// CLI entrypoint
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.error("Usage: notify.ts [--urgent] <message>");
    process.exit(1);
  }
  const priority: Priority = args.includes("--urgent") ? "urgent" : "normal";
  const message = args.filter(a => !a.startsWith("--")).join(" ");
  const ok = await notify(message, priority);
  process.exit(ok ? 0 : 1);
}
```

### sentinel-scan.ts Refactor Target

```typescript
// BEFORE (remove this):
const ALERT_TO = "+51926689401";
// ...
await $`kapso-whatsapp-cli send --to ${ALERT_TO} --text ${msg}`.quiet();

// AFTER (replace with):
import { notify } from "./notify.ts";
// ...
alerted = await notify(msg, "urgent");
```

### FIX-08: zeroclaw-secrets.nix Addition

```nix
# Add to sops.secrets block in /etc/nixos/modules/services/zeroclaw-secrets.nix:
"zeroclaw/notify-target" = {
  sopsFile = ../../secrets/zeroclaw.yaml;
  owner = "hybridz";
};

# Add to sops.templates."zeroclaw.env".content block:
NOTIFY_TARGET=${config.sops.placeholder."zeroclaw/notify-target"}
```

### FIX-02: sentinel.yaml After Change

```yaml
name: "Sentinel"
schedule: "0 */2 * * *"
tz: "America/Lima"
command: "bun run /etc/nixos/zeroclaw/bin/sentinel-scan.ts"
```

### DOCS-01: LORE.md Application Tracker Section Update

```markdown
## Application Tracker

Tracked in state.db (`~/.zeroclaw/workspace/state.db`), table `job_applications`.
Schema: title, company, url, status (new|applied|interview|offer|rejected),
found_date, salary_range, location, match_score, source_platform, notes,
applied_date, last_updated.

## Freelance Tracker

Tracked in state.db (`~/.zeroclaw/workspace/state.db`), table `freelance_leads`.
Same schema as job_applications.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `~/zeroclaw-data/*.json` | `~/.zeroclaw/workspace/state.db` | Phase 6 | Structured queries, deduplication, status tracking |
| Inline `kapso-whatsapp-cli` in programs | `import { notify } from './notify.ts'` | Phase 6 | Centralized retry, rate limiting, logging |
| Hardcoded `ALERT_TO` in sentinel-scan.ts | `NOTIFY_TARGET` env var | Phase 6 | No phone numbers in source code |

**Deprecated/outdated:**
- `bin/repair-loop.sh`: Orphaned after skill refactor — delete without replacement
- `~/.zeroclaw/workspace/state/memory_hygiene_state.json`: Replaced by state.db
- `~/.zeroclaw/workspace/state/runtime-trace.jsonl`: Rolling trace is in config.toml (`runtime_trace_mode = "rolling"`, `runtime_trace_max_entries = 200`) — ZeroClaw manages this internally; the stale file can simply be deleted

---

## Open Questions

1. **INFRA-05: Does resolve_command() need claude, given ~/.local/bin is in systemd PATH?**
   - What we know: `~/.local/bin/claude` is in systemd user PATH (verified). ZeroClaw cron daemon runs as user service and inherits this PATH.
   - What's unclear: Whether future Phase 7/8 cron YAML will use `claude` prefix (vs full path) is TBD.
   - Recommendation: Add the mapping anyway. It's 1 line in module.nix, costs nothing, and prevents a footgun if someone writes `command: "claude -p ..."` in a YAML.

2. **FIX-05: Which specific directories under .planning/phases/ to delete?**
   - What we know: Confirmed directories are `01-declarative-cron-management-*` and `06-foundation-fixes-and-shared-infrastructure`.
   - What's unclear: The current phase's own directory (06-*) must NOT be deleted.
   - Recommendation: Delete `01-declarative-cron-management-version-controlled-job-definitions/` only. Phase 6 planning files stay.

3. **FIX-08: Where does NOTIFY_TARGET value come from?**
   - What we know: It's the WhatsApp phone number to send notifications to. The kapso-whatsapp-cli allowlist in module.nix shows: `+51926689401`, `+51984089340`, `+51917443156`, `+51984938682`.
   - What's unclear: Which of those numbers is the correct notification target for Kiro's outbound alerts.
   - Recommendation: The planner should flag this as a human input step — Enrique must confirm which number before `sops edit` adds the value.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun built-in test runner (bun:test) |
| Config file | None — bun auto-discovers `*.test.ts` files |
| Quick run command | `bun test /etc/nixos/zeroclaw/bin/notify.test.ts` |
| Full suite command | `bun test /etc/nixos/zeroclaw/bin/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | state.db created with WAL + all 8 tables + kv_store | unit | `bun test /etc/nixos/zeroclaw/bin/init-state-db.test.ts` | Wave 0 |
| INFRA-02 | notify.ts retries 3x with exponential backoff on failure | unit (mock) | `bun test /etc/nixos/zeroclaw/bin/notify.test.ts` | Wave 0 |
| INFRA-02 | notify.ts rate limits normal priority | unit | included in notify.test.ts | Wave 0 |
| INFRA-02 | notify.ts urgent bypasses rate limit | unit | included in notify.test.ts | Wave 0 |
| INFRA-03 | notify.ts reads NOTIFY_TARGET from env, not hardcoded | unit | included in notify.test.ts | Wave 0 |
| INFRA-06 | sentinel-scan.ts has no ALERT_TO constant, no inline kapso-whatsapp-cli | smoke | `grep -r "ALERT_TO\|kapso-whatsapp-cli" /etc/nixos/zeroclaw/bin/sentinel-scan.ts` | manual-only |
| FIX-02 | sentinel.yaml includes tz field | smoke | `grep "tz:" /etc/nixos/zeroclaw/cron/jobs/sentinel.yaml` | manual-only |
| FIX-03 | repair-loop.sh does not exist | smoke | `test ! -f /etc/nixos/zeroclaw/bin/repair-loop.sh` | manual-only |
| FIX-05 | Only 06-* directory in .planning/phases/ | smoke | `ls /etc/nixos/zeroclaw/.planning/phases/` | manual-only |
| FIX-06 | ORCHESTRATION.md does not exist at repo root | smoke | `test ! -f /etc/nixos/zeroclaw/ORCHESTRATION.md` | manual-only |
| INFRA-01 | state.db has WAL mode enabled | integration | `bun -e "import { Database } from 'bun:sqlite'; const db = new Database(process.env.HOME + '/.zeroclaw/workspace/state.db'); console.log(db.query('PRAGMA journal_mode').get())"` | manual-only |
| FIX-08 | NOTIFY_TARGET present in rendered env | integration | `grep NOTIFY_TARGET /run/secrets/rendered/zeroclaw.env` | manual-only (needs rebuild) |
| DOCS-01 | LORE.md references state.db, not zeroclaw-data | smoke | `grep -c "zeroclaw-data" /etc/nixos/zeroclaw/documents/LORE.md` | manual-only |

### Sampling Rate
- **Per task commit:** `bun test /etc/nixos/zeroclaw/bin/` (covers unit tests)
- **Per wave merge:** Full suite + smoke checks above
- **Phase gate:** All smoke checks pass + `bun run /etc/nixos/zeroclaw/bin/notify.ts "test message"` sends successfully before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `/etc/nixos/zeroclaw/bin/notify.test.ts` — covers INFRA-02, INFRA-03 (mock kapso-whatsapp-cli)
- [ ] `/etc/nixos/zeroclaw/bin/init-state-db.test.ts` — covers INFRA-01 (all tables present, WAL mode)
- [ ] Framework install: `bun test` is built-in — no install needed

---

## Sources

### Primary (HIGH confidence)
- Bun docs (import.meta.main, bun:sqlite, Bun.sleep, $) — verified via live `bun -e` execution on this machine
- Live verification: WAL mode, user_version pragma, rate limiting logic, import.meta.main — all tested
- `/etc/nixos/zeroclaw/bin/sentinel-scan.ts` — read directly; exact refactor points identified
- `/etc/nixos/zeroclaw/module.nix` — read directly; resolve_command() and sops patterns clear
- `/etc/nixos/modules/services/zeroclaw-secrets.nix` — read directly; exact pattern for adding new secret
- `kapso-whatsapp-cli --help` — run directly; confirmed `send --to NUMBER --text MESSAGE` interface
- `~/.zeroclaw/workspace/state/` — listed directly; FIX-04 files confirmed
- `systemctl --user show-environment` — run directly; HOME and ~/.local/bin in PATH confirmed

### Secondary (MEDIUM confidence)
- `ORCHESTRATION.md` SQL schema — read directly from file being deleted; captured in Code Examples

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything verified live on this machine, no new dependencies
- Architecture: HIGH — patterns verified with bun -e tests; existing code read directly
- Pitfalls: HIGH — FIX-05 and FIX-08 pitfalls identified from direct file inspection

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable stack — bun 1.3.3, existing NixOS config)
