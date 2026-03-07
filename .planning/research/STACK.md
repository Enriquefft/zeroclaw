# Stack Research

**Domain:** Autonomous AI agent configuration infrastructure (NixOS + ZeroClaw) — v2.0 Heartbeat additions
**Researched:** 2026-03-06
**Confidence:** HIGH (primary sources: live binaries, ZeroClaw gateway API wiki, nixpkgs search, direct CLI inspection)

> **Scope:** This file covers ONLY the new stack additions needed for v2.0 Heartbeat features.
> Existing v1.0 stack (NixOS home-manager, sops-nix, ZeroClaw daemon, bun:sqlite, kapso-whatsapp)
> is validated and unchanged. See git history for the v1.0 STACK.md content.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `bun:sqlite` (built-in) | Bun 1.3.3 (already installed) | Shared state database for all `bin/` programs and trackers | Already used in `sentinel-scan.ts`. Zero additional dependencies — SQLite is built into Bun's runtime. WAL mode + prepared statements give safe concurrent reads from multiple cron processes. No npm package needed. |
| ZeroClaw Gateway REST API (`POST /webhook`) | Current ZeroClaw daemon | Trigger agent jobs from shell programs (the "agent job" cron support) | The daemon runs on port 42617 (localhost). `POST /webhook` with `{"message": "..."}` triggers a full ZeroClaw agent session. This is the correct programmatic interface for `cron-sync` agent job support — no new binary needed. |
| `claude` CLI (`claude -p`) | 2.1.63 (already at `~/.local/bin/claude`) | Orchestration engine for task decomposition in shell programs | `claude -p "prompt"` is headless, exits after response, supports `--output-format json`, `--model`, `--max-budget-usd`. Confirmed working locally. Use for decomposing complex tasks in `bin/` programs where ZeroClaw's own agent would have model/cost constraints. Requires `ANTHROPIC_API_KEY` env var. |
| `kapso-whatsapp-cli` (already installed) | Current (via kapso-whatsapp-plugin flake) | Notification delivery for all heartbeat cron alerts | Already used in `sentinel-scan.ts`. Wrap with retry logic in a shared `notify.ts` module — do not call directly from each cron program. |
| `feedsmith` | Latest npm | RSS/Atom feed parsing for paper scout and content scout crons | TypeScript-native, built on `fast-xml-parser`, fully typed. Works directly with Bun's built-in `fetch`. arXiv and academic RSS feeds are Atom 1.0 — `feedsmith` handles this correctly. No browser needed. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ts-jobspy` | Latest npm | Job board scraping (LinkedIn + Indeed) for job scanner cron | TypeScript port of python-jobspy. LinkedIn + Indeed scrapers currently working. Use for the job-scanner heartbeat cron. Wrap in try/catch — rate limiting (HTTP 429) is expected from LinkedIn. |
| `fast-xml-parser` | 5.x (latest npm) | Low-level XML parsing for arXiv API responses | Use directly if `feedsmith` is too heavy. arXiv's API returns Atom 1.0. `fetch` + `fast-xml-parser` is the minimal pattern. |
| `exponential-backoff` | Latest npm | Retry logic for `kapso-whatsapp-cli` and job board requests | Standard pattern for transient failures. Use in the shared `notify.ts` module for WhatsApp retries (3 attempts, delays: 1s, 2s, 4s). Also use for job board 429 handling. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `bun:sqlite` (no install needed) | State DB reads/writes in all `bin/` programs | Already in Bun runtime. Import as `import { Database } from "bun:sqlite"`. Use WAL mode for cron-safe concurrent access. |
| `sqlite3` CLI (already available via `pkgs.sqlite` in cron-sync runtimeInputs) | State DB inspection during debugging | `sqlite3 ~/.zeroclaw/workspace/state.db ".tables"` |
| `jq` (already available system-wide) | Parse `claude -p --output-format json` responses in shell | `claude -p "..." --output-format json \| jq -r '.result'` |

---

## Installation

```bash
# New npm dependencies for bin/ programs (run in /etc/nixos/zeroclaw/):
bun add feedsmith
bun add ts-jobspy
bun add exponential-backoff

# No NixOS rebuild needed — bin/ is live-edit territory.
# New bun packages are committed to git alongside the programs that use them.
```

> Note: `package.json` and `bun.lockb` should be created at `/etc/nixos/zeroclaw/` if not already present.
> Programs in `bin/` import from relative paths or npm packages resolved by Bun.

---

## Detailed Integration Notes

### 1. Shared State Database (`state.db`)

**Path:** `~/.zeroclaw/workspace/state.db`

**Pattern** (directly from existing `sentinel-scan.ts` which uses `bun:sqlite`):

```typescript
import { Database } from "bun:sqlite";

const STATE_DB = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;

function openStateDb() {
  const db = new Database(STATE_DB, { create: true });
  db.exec("PRAGMA journal_mode=WAL");  // safe for concurrent cron reads
  db.exec(`CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}

// Read
function getState(key: string): string | null {
  const db = openStateDb();
  const row = db.query("SELECT value FROM state WHERE key = ?").get(key) as { value: string } | null;
  db.close();
  return row?.value ?? null;
}

// Write
function setState(key: string, value: string): void {
  const db = openStateDb();
  db.run(
    "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    [key, value]
  );
  db.close();
}
```

**Key conventions for heartbeat crons:**
- `job_scan:last_run` — ISO timestamp of last job scanner run
- `job_scan:seen_ids` — JSON array of already-seen job IDs (dedup)
- `company_research:last_refresh` — timestamp for weekly refresh cadence
- `follow_up:pending` — JSON array of pending follow-up items
- `content_scout:seen_urls` — JSON array of seen content URLs

**Why `state.db` and NOT `brain.db`:** `brain.db` is ZeroClaw's agent memory — only agent sessions write to it via `memory_store`. Programs in `bin/` cannot access `state_get`/`state_set` agent tools (per `bin/README.md`). `state.db` is the correct parallel file for program-level persistence.

---

### 2. Notification Module with WhatsApp Retry

**Create:** `/etc/nixos/zeroclaw/bin/notify.ts` — shared module imported by all heartbeat crons.

```typescript
// bin/notify.ts — shared WhatsApp notification with retry
import { $ } from "bun";

const ALERT_TO = "+51926689401";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export async function notify(message: string): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await $`kapso-whatsapp-cli send --to ${ALERT_TO} --text ${message}`.quiet();
      if (result.exitCode === 0) return true;
    } catch {}
    if (attempt < MAX_RETRIES - 1) {
      await Bun.sleep(BASE_DELAY_MS * Math.pow(2, attempt));  // 1s, 2s, 4s
    }
  }
  console.error("Warning: WhatsApp notification failed after all retries");
  return false;
}
```

**Retry rationale:** `kapso-whatsapp-cli` makes an HTTP call to the Kapso bridge. The bridge can be temporarily unavailable (process restarting, network blip). Three retries with exponential backoff handles transient failures without blocking the cron program for too long (max wait: 7s total).

**Why not the `exponential-backoff` npm package here:** The `kapso-whatsapp-cli` call pattern is simple enough to implement inline without a dependency. Use the npm package only for complex retry scenarios (e.g., job board API calls with different error classifications).

---

### 3. Cron-Sync Agent Job Support via Gateway REST API

**Current limitation:** `cron-sync` creates all jobs as `command` (shell) type. The ZeroClaw cron SQLite schema has a `job_type` column that distinguishes `shell` from `agent` jobs. Agent jobs need a `prompt` field, not a `command` field.

**How the daemon executes agent jobs:** When an agent-type cron fires, the ZeroClaw daemon calls `POST /webhook` on its own gateway (`http://127.0.0.1:42617/webhook`) with the stored prompt as the message body. The gateway spawns a full agent session.

**Gateway API (confirmed from official wiki):**
```bash
# The daemon's own gateway (port 42617 per config.toml [gateway] section)
curl -X POST http://127.0.0.1:42617/webhook \
  -H "Content-Type: application/json" \
  -d '{"message": "Run the sentinel skill"}'
# Note: require_pairing = false in config.toml — no Bearer token needed for local calls
```

**cron-sync update needed:** Add `job_type` field to YAML schema and update `cron-sync` to:
1. Read `type: agent` from YAML (default: `shell` for backward compatibility)
2. For agent jobs: use `zeroclaw cron add --agent` flag (verify flag name against upstream) OR write directly to `jobs.db` `job_type` column after `zeroclaw cron add`

**YAML schema extension:**
```yaml
name: "Morning Briefing"
schedule: "0 8 * * *"
tz: "America/Lima"
type: agent   # new field — "shell" (default) or "agent"
command: "Prepare a morning briefing covering emails, calendar, news. Send to WhatsApp."
```

**Confidence note:** The exact `zeroclaw cron add` flag for agent jobs needs verification against the upstream CLI reference (`~/Projects/zeroclaw/docs/commands-reference.md`). If no flag exists, the SQLite update approach is the fallback: `UPDATE cron_jobs SET job_type='agent', prompt=command, command=NULL WHERE name=?`.

---

### 4. Orchestration Engine using `claude -p`

**What it is:** `claude -p` (the `--print` flag) puts Claude Code in headless mode — takes a prompt, returns a response, exits. Version 2.1.63 is confirmed installed at `~/.local/bin/claude`.

**Usage from a `bin/` program:**
```typescript
import { $ } from "bun";

async function orchestrate(task: string): Promise<string> {
  // Use --output-format json for structured parsing
  // Use --model sonnet to control cost
  // Use --max-budget-usd 0.10 as a per-call guardrail
  const result = await $`claude -p ${task} \
    --output-format json \
    --model sonnet \
    --max-budget-usd 0.10 \
    --dangerously-skip-permissions`.quiet();

  if (result.exitCode !== 0) {
    throw new Error(`claude -p failed: ${result.stderr.toString()}`);
  }

  const parsed = JSON.parse(result.stdout.toString());
  return parsed.result;  // the text response
}
```

**When to use `claude -p` vs ZeroClaw's own agent:**
- Use `claude -p` when: the orchestration is initiated from a `bin/` program (no agent context), the task needs Claude-specific capabilities (tool use, file edits), or the task is a one-shot decomposition step
- Use ZeroClaw's own agent (via `POST /webhook` or agent-type cron) when: the task benefits from ZeroClaw's memory, skills, and tool ecosystem
- Do NOT use both in the same pipeline — pick one per task to avoid double LLM costs

**`ANTHROPIC_API_KEY` requirement:** `claude -p` uses Anthropic's API directly. The key must be available in the environment when ZeroClaw's systemd service runs the cron. Add to `zeroclaw.env` via sops and ensure the systemd `EnvironmentFile` covers it.

**NixOS delivery of `claude`:** The binary is at `~/.local/bin/claude` (npm global install). The ZeroClaw systemd cron service runs as `hybridz` and should have `~/.local/bin` in PATH via the `Environment=` or `ExecSearchPath=` directive in the unit. Verify this — or use the full absolute path `/home/hybridz/.local/bin/claude`.

**Alternative for NixOS:** `claude-code` is in `nixpkgs` as of 2025-03-03 (`legacyPackages.x86_64-linux.claude-code` version 2.1.25). The installed version 2.1.63 is newer. Either add the nixpkgs package to `home.packages` for path stability, or keep the npm install but reference by absolute path in programs.

---

### 5. Job Scanner (ts-jobspy)

**Pattern:**
```typescript
import { scrapeJobs } from "ts-jobspy";

const jobs = await scrapeJobs({
  siteName: ["indeed", "linkedin"],
  searchTerm: "software engineer",
  location: "Remote",
  resultsWanted: 50,
  hoursOld: 24,
});
```

**Known limitations (MEDIUM confidence):**
- LinkedIn rate-limits at ~10 pages — expect 429s. Wrap in exponential backoff.
- Indeed has no rate limiting per the library docs.
- `ts-jobspy` only has LinkedIn + Indeed working as of early 2026 (Glassdoor, ZipRecruiter "coming soon").
- LinkedIn scraping violates LinkedIn ToS. For personal/private use this is acceptable risk; do not use at scale.

**Dedup via state.db:** Store seen job IDs in `state.db` under `job_scan:seen_ids`. Compare on each run. Only alert on truly new jobs.

---

### 6. Paper Scout (arXiv API)

arXiv provides a public Atom 1.0 API — no scraping needed, no auth required.

```typescript
import { parseFeed } from "feedsmith";

const query = "machine learning agent autonomous";
const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=20&sortBy=submittedDate&sortOrder=descending`;

const response = await fetch(url);
const xml = await response.text();
const feed = parseFeed(xml);

for (const entry of feed.entries ?? []) {
  console.log(entry.title, entry.links?.[0]?.href);
}
```

**arXiv API terms:** Free to use, no auth required. Rate limit: ~3 requests/second. Add `await Bun.sleep(1000)` between calls if fetching multiple pages. Always link back to arXiv for paper downloads (license requirement).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `bun:sqlite` for state.db | `state_get`/`state_set` agent IPC tools | Only in agent sessions (ZeroClaw skills). Programs in `bin/` cannot call agent tools — they run as standalone processes outside the agent context. |
| ZeroClaw Gateway `POST /webhook` for agent crons | `zeroclaw agent -m "..."` CLI | Use the CLI for one-off interactive invocations. For cron jobs, the gateway API is the correct interface — the daemon is already running and managing sessions. |
| `claude -p` for orchestration | ZeroClaw's built-in agent (via cron job) | Use ZeroClaw's agent for tasks needing memory, skills, and tool ecosystem. Use `claude -p` only when initiating from a `bin/` program that is already running outside the ZeroClaw context. |
| `feedsmith` for RSS/Atom | `fast-xml-parser` directly | Use `fast-xml-parser` if `feedsmith` introduces unwanted weight or type conflicts. `feedsmith` adds ~5KB of typed convenience wrappers over `fast-xml-parser` — acceptable trade-off. |
| `ts-jobspy` for job scanning | Python `python-jobspy` via `python3 -c` | `python-jobspy` has more boards and better LinkedIn support, but introduces a Python subprocess in a Bun program. Use if `ts-jobspy` proves too unreliable for LinkedIn. |
| Inline exponential backoff in `notify.ts` | `exponential-backoff` npm package | Use the npm package if retry logic grows more complex (different delays per error type, circuit breaker pattern). For the current 3-attempt WhatsApp retry, inline is sufficient. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Direct writes to `~/.zeroclaw/workspace/cron/jobs.db` | The cron DB schema is ZeroClaw's internal implementation detail. Direct writes bypass validation and risk corruption. | Use `zeroclaw cron add/update` via `cron-sync` or wait for the `zeroclaw cron add --agent` flag to be confirmed. |
| Direct writes to `~/.zeroclaw/workspace/memory/brain.db` | `brain.db` is ZeroClaw's agent memory — the schema is internal. Direct writes can corrupt agent memory state. | Write to `state.db` (program-level state) or use `memory_store` from inside an agent session. |
| Polling `zeroclaw agent -m` in a loop | Creates orphaned agent sessions, burns tokens, no dedup. | Use the gateway webhook with `X-Idempotency-Key` header for safe repeated calls. |
| `claude -p` without `--max-budget-usd` | Uncapped orchestration calls can exceed daily Z.AI budget. | Always set `--max-budget-usd 0.10` (or similar) per call. Stack-level cost control. |
| `ts-jobspy` for production-scale scraping | Rate limits are aggressive, IPs can be banned. | Use `python-jobspy` with proxy rotation, or a commercial job data API (Proxycurl, Apify) if scale increases. |
| Browser automation (Playwright) for job scraping | Heavyweight, flaky, requires display/Xvfb in systemd context. | Use `ts-jobspy` (HTTP-based) which does not require a browser. |

---

## Stack Patterns by Variant

**For shell-type cron jobs (deterministic logic):**
- Write a `bin/<name>.ts` Bun program
- Use `bun:sqlite` for state, `notify.ts` for alerts
- YAML `type: shell` (or omit — shell is default)
- `cron-sync` handles registration

**For agent-type cron jobs (LLM reasoning needed):**
- Write a focused prompt as the `command` field in YAML
- YAML `type: agent`
- ZeroClaw daemon fires `POST /webhook` internally with the prompt
- Optionally reference a skill: "Run the sentinel skill and report results"

**For orchestration-heavy programs (task decomposition):**
- Use `claude -p` from a `bin/` program
- Provide context via stdin or `--append-system-prompt`
- Parse response with `--output-format json`
- Budget per call with `--max-budget-usd`

**For content ingestion (RSS/Atom):**
- Use `feedsmith` + Bun's built-in `fetch`
- Store seen item IDs/hashes in `state.db` for dedup
- No browser, no scraping — prefer official APIs

---

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Bun | 1.3.3 | `bun:sqlite` built-in. `import { Database } from "bun:sqlite"` — no install needed. |
| `claude` CLI | 2.1.63 | At `~/.local/bin/claude`. Confirmed: `-p`/`--print` flag exits after response. `--output-format json` returns `{"result": "..."}`. |
| ZeroClaw gateway | Current | Port 42617 (from `config.toml [gateway]`). `require_pairing = false` — no Bearer token needed for local `POST /webhook` calls. |
| `feedsmith` | Latest | Requires `fast-xml-parser` as peer dep (auto-installed). Works with Bun's native `fetch`. |
| `ts-jobspy` | Latest npm | LinkedIn + Indeed only currently working. Bun-compatible (uses native fetch internally). |
| Node.js | 22.22.0 | Available but not primary runtime — use Bun for all `bin/` programs. |

---

## Sources

- `claude --help` — Direct CLI inspection. Confirmed `-p`/`--print` flag, `--output-format json`, `--max-budget-usd`, `--model`. Version 2.1.63. HIGH confidence.
- `nix search nixpkgs claude-code` — `claude-code` is in nixpkgs at 2.1.25. Installed version (2.1.63) is newer. MEDIUM confidence for nixpkgs path stability.
- [ZeroClaw Gateway API Reference wiki](https://github.com/zeroclaw-labs/zeroclaw/wiki/10.2-gateway-api-reference) — Confirmed `/webhook` endpoint, request/response shape, idempotency headers. HIGH confidence.
- `/etc/nixos/zeroclaw/bin/sentinel-scan.ts` — Existing `bun:sqlite` usage pattern. HIGH confidence (validated, in production).
- `/etc/nixos/zeroclaw/config.toml` — Gateway on port 42617, `require_pairing = false`. HIGH confidence.
- [feedsmith GitHub](https://github.com/macieklamberski/feedsmith) — TypeScript-native Atom/RSS parser. MEDIUM confidence (not Context7 verified).
- [ts-jobspy npm](https://www.npmjs.com/package/ts-jobspy) — LinkedIn + Indeed scrapers working. LOW-MEDIUM confidence (low download count, limited maintenance).
- [arXiv API docs](https://info.arxiv.org/help/api/user-manual.html) — Free Atom 1.0 API, no auth. HIGH confidence.
- [bun:sqlite docs](https://bun.com/docs/runtime/sqlite) — Built-in, no install, 3-6x faster than better-sqlite3. HIGH confidence.
- [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) — Python reference; confirms ts-jobspy is a port. MEDIUM confidence.

---

*Stack research for: ZeroClaw v2.0 Heartbeat — infrastructure additions*
*Researched: 2026-03-06*
