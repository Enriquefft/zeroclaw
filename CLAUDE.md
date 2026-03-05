# CLAUDE.md — ZeroClaw Agent Guide

This file provides complete operational guidance for any coding agent (Claude Code, Copilot) or Kiro working on this repository. A fresh agent with no prior context should understand the full deployment model from reading this file once.

**What this repo is:** The NixOS home-manager module (`module.nix`) and Kiro's operational documents — skills, cron configuration guide, identity documents, and reference material. It lives at `/etc/nixos/zeroclaw/`.

---

## Deployment Model

Different files in this repo have different deployment models. This is the most important thing to know before making any change.

| File / Directory | Model | How to Apply |
|-----------------|-------|-------------|
| `module.nix` | Rebuild required | `sudo nixos-rebuild switch --option eval-cache false --flake /etc/nixos#nixos` |
| `/etc/nixos/flake.nix` | Rebuild required | `direnv reload` first, then rebuild |
| `documents/*.md` (IDENTITY, SOUL, AGENTS, TOOLS, USER, LORE) | Live edit | Edit in `/etc/nixos/zeroclaw/documents/`, commit to git — symlink means ZeroClaw sees changes immediately, no rebuild needed |
| `skills/<name>/` (source) | Deploy via CLI | `zeroclaw skills audit ./skills/<name>` then `zeroclaw skills install ./skills/<name>` |
| `~/.zeroclaw/workspace/skills/` (installed) | Live after install | ZeroClaw reads from here; managed by runtime, do not edit directly |
| Cron jobs | Live via `cron-sync` | Edit `cron/jobs/*.yaml`, run `cron-sync` — direct CLI mutations are blocked |
| `config.toml` | Rebuild required | Rendered via sops template at activation time — symlinked to `/run/secrets/rendered/zeroclaw-config` |
| Agenix secrets | Rebuild required | Secrets rendered by NixOS at activation time |

**Summary rule:** `documents/` and installed skills are live. Everything else in the module requires a NixOS rebuild.

---

## File Map

Every important file and directory in this repo:

```
/etc/nixos/zeroclaw/
├── CLAUDE.md                   # This file — agent operational guide (live edit, commit to git)
├── module.nix                  # NixOS home-manager module — REBUILD REQUIRED for changes
│
├── documents/                  # Identity docs — LIVE EDIT via mkOutOfStoreSymlink
│   │                           # Symlinked to ~/.zeroclaw/documents/ — changes are immediate
│   ├── IDENTITY.md             # Who Kiro is, core purpose, platform context
│   ├── SOUL.md                 # Kiro's personality, values, behavioral principles
│   ├── AGENTS.md               # Autonomy rules, approval gates, operational protocols
│   ├── TOOLS.md                # Available tools and tool usage patterns
│   ├── USER.md                 # Enrique's profile, preferences, context
│   └── LORE.md                 # Projects, job search state, resume notes, key stories
│
├── skills/                     # Skill source — tracked in git, deployed via CLI
│   └── README.md               # Full guide for creating and installing skills
│   └── <skill-name>/           # Each skill is a directory with SKILL.md or SKILL.toml
│
├── cron/                       # Declarative cron — YAML files are source of truth
│   ├── jobs/                   # *.yaml job definitions — edit here, apply with cron-sync
│   └── README.md               # Full guide: YAML schema, cron-sync CLI, examples
│
└── reference/                  # Reference documents — live edit (mkOutOfStoreSymlink)
    │                           # Symlinked to /etc/nixos/zeroclaw/reference/ in workspace
    └── upstream-docs/          # Symlink → ~/Projects/zeroclaw/docs (upstream ZeroClaw docs)
```

**Git-tracked:** Everything under `/etc/nixos/zeroclaw/` is tracked in git — CLAUDE.md, module.nix, documents/, skills/, cron/, reference/.

**ZeroClaw runtime-managed (not in this repo's git):**
- `~/.zeroclaw/workspace/skills/` — installed skills (deployed via `zeroclaw skills install`)
- `~/.zeroclaw/workspace/cron/jobs.db` — cron job database
- `~/.zeroclaw/documents/` — symlink target for identity documents

---

## Build Commands

For coding agents making changes to module.nix or any NixOS-managed files:

```bash
# Step 1: Quick syntax validation (fast, catches most errors)
nix flake check

# Step 2: Full build test — verifies the full system config compiles (takes longer)
nix build .#nixosConfigurations.nixos.config.system.build.toplevel

# Step 3: Rebuild and activate (only after build test passes)
sudo nixos-rebuild switch --option eval-cache false --flake /etc/nixos#nixos
```

**NEVER run `nix flake update`** — use `direnv reload` after editing `flake.nix`.

For document changes (`documents/*.md`): edit in the repo and commit. No rebuild needed — the symlink means ZeroClaw reads the updated file immediately.

---

## Agent Operational Guide

### Kiro: Creating Skills

Skills are authored in `/etc/nixos/zeroclaw/skills/` and deployed to the ZeroClaw workspace via CLI.

```bash
# 1. Create the skill directory
mkdir -p /etc/nixos/zeroclaw/skills/my-skill

# 2. Write SKILL.md (minimum required file)
#    Add YAML frontmatter (name, description) and markdown instructions

# 3. Audit before installing (required — rejects symlinks and injection patterns)
cd /etc/nixos/zeroclaw
zeroclaw skills audit ./skills/my-skill

# 4. Install into ZeroClaw workspace
zeroclaw skills install ./skills/my-skill

# 5. Verify the skill appears
zeroclaw skills list

# 6. Commit the source to git
git add skills/my-skill/
git commit -m "feat(skills): add my-skill"
```

See `skills/README.md` for the complete guide including SKILL.md format, SKILL.toml format, and the directory structure rules (no symlinks inside skill packages).

### Kiro: Managing Cron Jobs

Cron jobs are **declarative and version-controlled**. YAML files in `cron/jobs/` are the source of truth. `zeroclaw cron add/remove/update` are **blocked** by a wrapper — attempting them will error.

```bash
# 1. Create or edit the job definition
nano /etc/nixos/zeroclaw/cron/jobs/my-job.yaml
# Required fields: name, schedule, command
# Optional: tz

# 2. Apply immediately
cron-sync

# 3. Commit to git
git add cron/jobs/my-job.yaml
git commit -m "feat(cron): add my-job"

# Read-only inspection
zeroclaw cron list
zeroclaw cron pause <id>
zeroclaw cron resume <id>
```

nixos-rebuild runs `cron-sync --remove-missing` automatically — SQLite always mirrors git after a rebuild.

See `cron/README.md` for the complete guide including YAML schema, schedule reference, and examples.

### Coding Agents: Testing Changes

**For module.nix changes:**

1. Run `nix flake check` first to catch syntax errors quickly
2. Run `nix build .#nixosConfigurations.nixos.config.system.build.toplevel` to verify full config
3. Run `sudo nixos-rebuild switch --option eval-cache false --flake /etc/nixos#nixos` to activate

**For documents/ changes:**

1. Edit the file in `/etc/nixos/zeroclaw/documents/`
2. Changes are immediately live — no rebuild needed
3. Commit to git: `git add documents/FILENAME.md && git commit -m "..."`

**For skills/ changes:**

1. Edit source in `/etc/nixos/zeroclaw/skills/<name>/`
2. Run `zeroclaw skills audit ./skills/<name>` to verify
3. Run `zeroclaw skills install ./skills/<name>` to update the workspace copy
4. Run `zeroclaw skills list` to confirm
5. Commit source to git

---

## Single Source of Truth Rule

**Always edit source files in `/etc/nixos/zeroclaw/`.**

Never edit `~/.zeroclaw/` directly:

- `~/.zeroclaw/workspace/skills/` is managed by ZeroClaw — edits are overwritten on next install
- `~/.zeroclaw/documents/` is a symlink target — edits must go through the source in `documents/`
- `~/.zeroclaw/workspace/cron/jobs.db` is managed by ZeroClaw — use `cron-sync` (via YAML files), not direct CLI mutations or SQL writes

Git is the source of truth for all content. When in doubt: if it's in `/etc/nixos/zeroclaw/`, edit it there and commit.

---

## Multi-Agent IPC

ZeroClaw supports multiple independent agent instances communicating on the same host via a shared SQLite database.

### How IPC Works

IPC is enabled by the `[agents_ipc]` config section. When enabled, ZeroClaw registers five tools in the agent's session:

| Tool | Purpose |
|------|---------|
| `agents_list` | Discover agents currently registered in the shared DB |
| `agents_send` | Send a message to another agent by identity |
| `agents_inbox` | Read messages addressed to this agent |
| `state_get` | Read shared state by key |
| `state_set` | Write shared state by key |

All agents that share the same `db_path` can discover each other. Agent identity is derived from the `workspace_dir` SHA-256 hash — not a user-supplied name. Use `agents_list` to discover other agents' identities at runtime.

No database is created until `enabled = true` in at least one instance.

### Kiro's IPC Configuration

Kiro's current configuration (set in Phase 1, IPC-01):

```toml
[agents_ipc]
enabled = true
db_path = "~/.zeroclaw/agents.db"
staleness_secs = 300
```

`staleness_secs = 300` means an agent not seen for 5 minutes is considered offline. Use `agents_list` to check which agents are currently active.

### Configuring a Second Agent Instance

A second ZeroClaw instance must point to the **same `db_path`** as Kiro to participate in IPC:

```toml
[agents_ipc]
enabled = true
db_path = "~/.zeroclaw/agents.db"   # Same path as Kiro — shared state
staleness_secs = 300                 # Match Kiro's staleness window
```

The second instance needs its own workspace directory (separate `ZEROCLAW_WORKSPACE` env var or a different `~/.zeroclaw/` setup). It does **not** need the same `config.toml` overall — only the same `db_path` value under `[agents_ipc]`.

**config.toml location:** Kiro's config.toml is rendered by Nix at build time from `module.nix`. To reconfigure Kiro's IPC settings, edit `module.nix` and run a nixos-rebuild. See the Deployment Model table above.
