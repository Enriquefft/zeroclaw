# CLAUDE.md — ZeroClaw Agent Guide

## Deployment Model

| File / Directory | Model | How to Apply |
|-----------------|-------|-------------|
| `module.nix` | Rebuild required | `sudo nixos-rebuild switch --impure --option eval-cache false --flake /etc/nixos#nixos` |
| `/etc/nixos/flake.nix` | Rebuild required | `direnv reload` first, then rebuild |
| `documents/*.md` | Live edit | Edit in `/etc/nixos/zeroclaw/documents/`, commit — symlink means ZeroClaw sees changes immediately |
| `skills/<name>/` (source) | Declarative via `skills-sync` | Edit in git, run `skills-sync` or rebuild |
| `~/.zeroclaw/workspace/skills/` (installed) | Managed by runtime | Do not edit directly — `skills-sync` is the only write path |
| `bin/*.ts`, `bin/*.sh` | Live edit | Run directly or via cron — no rebuild needed |
| `cron/jobs/*.yaml` | Live via `cron-sync` | Edit YAML, run `cron-sync` — direct CLI mutations are blocked |
| `config.toml` | Rebuild required | Rendered via sops at activation — symlinked to `/run/secrets/rendered/zeroclaw-config` |

**Rule:** `documents/`, skills, and `bin/` are live. Everything else requires a NixOS rebuild.

### Three Concepts

Everything in this repo is a **Document** (static context), **Skill** (agent capability), or **Program** (standalone executable). Cron jobs reference Skills or Programs — never inline prompts. See `bin/README.md`, `skills/README.md`, and `cron/README.md` for details.

---

## Skills

Git is source of truth. `nixos-rebuild` auto-installs via `zeroclawSkillsSync`. External `zeroclaw skills install` is blocked.

```bash
mkdir -p /etc/nixos/zeroclaw/skills/my-skill
# Write SKILL.md (required), SKILL.toml + CLI if skill does I/O work
zeroclaw skills audit ./skills/my-skill
zeroclaw skills install /etc/nixos/zeroclaw/skills/my-skill
zeroclaw skills list
git add skills/my-skill/ && git commit -m "feat(skills): add my-skill"
```

```bash
skills-sync                  # install/update all git-tracked skills
skills-sync --remove-missing # also remove workspace skills not in git
skills-sync --dry-run        # preview only
```

See `skills/README.md` for anatomy standard and CLI convention.

---

## Cron Jobs

YAML files in `cron/jobs/` are source of truth. `zeroclaw cron add/remove/update` are blocked.

```bash
# Edit job definition (required fields: name, schedule, command — optional: tz)
/etc/nixos/zeroclaw/cron/jobs/my-job.yaml
cron-sync
git add cron/jobs/my-job.yaml && git commit -m "feat(cron): add my-job"

# Read-only inspection
zeroclaw cron list
zeroclaw cron pause <id>
zeroclaw cron resume <id>
```

`nixos-rebuild` runs `cron-sync --remove-missing` automatically. See `cron/README.md` for YAML schema and job types.

---

## Programs (bin/)

Standalone executables that run without an LLM agent. For deterministic scheduled automation.

```bash
# Create program
bin/my-program.ts

# Test directly
bun run /etc/nixos/zeroclaw/bin/my-program.ts

# Wire to cron
# In cron/jobs/my-program.yaml: command: "bun run /etc/nixos/zeroclaw/bin/my-program.ts"
cron-sync
```

See `bin/README.md` for the full standard (output contract, state management, when to use).

---

## Single Source of Truth

Edit source in `/etc/nixos/zeroclaw/`. Never edit `~/.zeroclaw/` directly — managed paths are overwritten on next sync/rebuild.

---

## Multi-Agent IPC

Agents share state via SQLite. Identity is derived from `workspace_dir` SHA-256 — use `agents_list` to discover at runtime.

| Tool | Purpose |
|------|---------|
| `agents_list` | Discover registered agents |
| `agents_send` | Send message to another agent |
| `agents_inbox` | Read messages addressed to this agent |
| `state_get` / `state_set` | Read/write shared state by key |

**Kiro's config** (edit `module.nix` to change):
```toml
[agents_ipc]
enabled = true
db_path = "~/.zeroclaw/agents.db"
staleness_secs = 300
```

A second instance needs its own workspace dir and the same `db_path` to participate.
