# Cron — Operational Guide

ZeroClaw's cron scheduler is SQLite-backed. In this configuration, **YAML files are the
source of truth** — `zeroclaw cron add/remove/update` are blocked for interactive use.
All job definitions live in `cron/jobs/*.yaml` and are synced to SQLite automatically
on every `nixos-rebuild switch`.

---

## Source of Truth

```
/etc/nixos/zeroclaw/cron/
└── jobs/
    ├── btc-monitor.yaml   # Bitcoin price drop monitor
    ├── sentinel.yaml      # Sentinel scan every 2 hours
    └── <name>.yaml        # Add new jobs here
```

Edit YAML files, commit to git, then either:
- Run `cron-sync` to apply immediately, or
- Run `sudo nixos-rebuild switch ...` — the activation hook runs `cron-sync --remove-missing` automatically.

---

## YAML Schema

```yaml
name: "Human-readable unique name"   # required — reconciliation key
schedule: "*/10 * * * *"             # standard 5-field cron expression
tz: "America/Lima"                   # optional IANA timezone (default: UTC)
command: "bun run /etc/nixos/zeroclaw/bin/my-program.ts"  # shell command or agent prompt
```

---

## Job Types

ZeroClaw cron supports two execution modes. The `command` field in YAML determines behavior:

| Type | When to use | `command` value | How daemon runs it |
|------|-------------|-----------------|-------------------|
| **Shell** | Decision logic is deterministic (if-statements) | Path to a program: `bun run /path/to/program.ts` | Executes command directly as a shell process |
| **Agent** | Requires LLM reasoning, judgment, novel output | Agent prompt text describing what to do | Creates an LLM session with the prompt |

**The test:** Can you express the decision logic as an if-statement? Yes → shell job with a `bin/` program. No → agent job with a prompt.

**Shell jobs** reference programs in `bin/` by absolute path. The program does the work deterministically — no tokens burned, fast, testable. This is the preferred type for most scheduled automation.

**Agent jobs** should keep prompts focused and reference skills by name where possible (e.g., "Run the sentinel skill" rather than inlining the full procedure). Agent jobs are expensive and should only be used when the task genuinely requires reasoning at runtime.

`cron-sync` creates all jobs as shell type via `zeroclaw cron add`. The daemon distinguishes based on the `job_type` column in SQLite.

### Schedule Reference

| Expression | Meaning |
|------------|---------|
| `0 9 * * *` | Every day at 9:00 AM |
| `0 * * * *` | Every hour |
| `*/10 * * * *` | Every 10 minutes |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 */2 * * *` | Every 2 hours |

---

## cron-sync CLI

```bash
# Preview changes without applying
cron-sync --dry-run

# Apply changes (add/update) without removing extras
cron-sync

# Full sync: apply + remove jobs not in YAML (run by nixos-rebuild automatically)
cron-sync --remove-missing
```

`cron-sync` reads all `*.yaml` files in `cron/jobs/`, reconciles them against the
running SQLite database, and applies only what changed.

---

## Adding a New Job

1. Create `cron/jobs/<slug>.yaml` with the schema above
2. Run `cron-sync` to apply immediately (or rebuild to auto-apply)
3. Commit to git: `git add cron/jobs/<slug>.yaml && git commit -m "feat(cron): add ..."`

---

## Removing a Job

1. Delete `cron/jobs/<slug>.yaml`
2. Run `cron-sync --remove-missing` or rebuild

---

## Enforcement

`zeroclaw cron add/remove/update` are blocked by a wrapper:

```
$ zeroclaw cron add '0 9 * * *' 'Morning briefing'
ERROR: Direct cron management is disabled.
Edit YAML files in /etc/nixos/zeroclaw/cron/jobs/ and run 'cron-sync'
or 'sudo nixos-rebuild switch ...' to auto-apply.
```

All other `zeroclaw` subcommands work normally. The wrapper passes everything else through
to the real binary.

---

## Database

SQLite at `~/.zeroclaw/workspace/cron/jobs.db`. Read-only inspection is fine:

```bash
nix run nixpkgs#sqlite -- ~/.zeroclaw/workspace/cron/jobs.db \
  "SELECT name, expression, last_status FROM cron_jobs"
```

Do not write to the DB directly — only `cron-sync` and `zeroclaw cron` CLI write to it.
