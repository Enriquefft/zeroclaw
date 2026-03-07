# Programs — Standalone Executables

Standalone deterministic executables that run without an LLM agent. These handle scheduled
automation where the decision logic can be expressed as if-statements — no reasoning needed.

---

## When to Use a Program vs a Skill

| Use a program when... | Use a skill when... |
|-----------------------|---------------------|
| Decision logic is deterministic (if-statements) | Task requires reading meaning, judgment, or novel output |
| No LLM reasoning needed at runtime | Agent context is valuable for execution |
| Wired to cron as a shell job | Invoked interactively or as agent cron |

**The test:** Can you express the decision logic as an if-statement? Yes → program. No → skill.

---

## Standards

**Language:** TypeScript (bun) preferred. Shell for trivial operations.

**Output contract (same as skill CLIs):**
- stdout: JSON always — structured data
- stderr: human-readable error messages only
- exit 0: success
- exit 1: error — emit `{"error": "..."}` to stderr

**State:** Programs manage their own state files in `~/.zeroclaw/workspace/`.
Agent IPC tools (`state_get`/`state_set`) are not available to standalone programs.

**Location:** Always `/etc/nixos/zeroclaw/bin/`. Git-tracked, live edit (no rebuild needed).

**Cron wiring:** Reference by absolute path in cron YAML:
```yaml
name: "My Program"
schedule: "*/10 * * * *"
command: "bun run /etc/nixos/zeroclaw/bin/my-program.ts"
```

---

## Programs

### `init-state-db.ts`

**Purpose:** Initialize SQLite `state.db` with WAL mode and v3 schema (includes `notify_log` and `orchestration_tasks` tables).

| Field | Value |
|-------|-------|
| Cron | None — called by other programs at startup |
| Inputs | Optional `--db-path <path>` CLI arg (default: `~/.zeroclaw/workspace/state.db`) |
| Output | `{"schema_version": 3}` to stdout on success |
| Side effects | Creates `state.db` if missing, runs v1→v2→v3 migrations if needed |

---

### `notify.ts`

**Purpose:** Send a WhatsApp message with retry (3 attempts) and rate limiting (1 per 5 minutes for normal-priority sends). Shared module imported by other programs.

| Field | Value |
|-------|-------|
| Cron | None — called by other programs (orchestrate.ts, sentinel-scan.ts, self-audit.ts) |
| Inputs | `--to <phone>` and `--text <message>` CLI flags (also importable as `notify(to, text, opts?)`) |
| Output | `{"sent": true, "attempt": 1}` to stdout on success |
| Side effects | Appends to `notify_log` table in `state.db`; invokes `kapso-whatsapp-cli` |

---

### `orchestrate.ts`

**Purpose:** Execute multi-step agent tasks defined in a YAML file. Each step calls `claude -p` with the step prompt, feeding output forward to the next step.

| Field | Value |
|-------|-------|
| Cron | Auto-generated for `type: agent` cron YAMLs — each agent YAML's `command` field calls this program |
| Inputs | Positional YAML file path; optional `--db-path <path>` |
| Output | JSON task result `{"task_id": "...", "status": "completed", "steps": [...]}` to stdout |
| Side effects | Writes task and subtask rows to `orchestration_tasks` table; sends WhatsApp alert on failure if YAML has `notify:` field |

---

### `self-audit.ts`

**Purpose:** Detect configuration and document drift between the git source tree and deployed state. Checks skill symlinks, cron DB consistency, config.toml render freshness, and bin/ integrity.

| Field | Value |
|-------|-------|
| Cron | Weekly — `self-audit.yaml` (Mon 08:00 America/Lima) |
| Inputs | None |
| Output | JSON drift report `{"drift": [...], "clean": true|false}` to stdout |
| Side effects | Sends WhatsApp alert via `notify.ts` if any drift is detected |

---

### `sentinel-scan.ts`

**Purpose:** Scan ZeroClaw memory for unresolved issues and alert via WhatsApp if any are found.

| Field | Value |
|-------|-------|
| Cron | Every 2 hours — `sentinel.yaml` (`0 */2 * * *` America/Lima) |
| Inputs | `--notify <phone>` CLI flag (phone number to alert) |
| Output | JSON scan results `{"issues": [...], "count": N}` to stdout |
| Side effects | Sends WhatsApp alert via `notify.ts` if unresolved issues found |

---

### `zai-proxy.ts`

**Purpose:** ZAI API reverse proxy server. Translates ZeroClaw model requests to the ZAI provider API, applying cost tracking and request routing.

| Field | Value |
|-------|-------|
| Cron | None — runs as a persistent systemd service |
| Inputs | Settings from `config.toml` (base_url, api_key, port 5100) |
| Output | HTTP responses on port 5100; logs request/cost data |
| Side effects | Forwards requests to upstream ZAI API; tracks spend against `max_cost_per_day_cents` |
