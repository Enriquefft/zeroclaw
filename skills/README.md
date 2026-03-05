# Skills — Operational Guide

This guide covers everything needed to create, audit, install, and manage ZeroClaw skills. A skill is a self-contained package that extends Kiro's capabilities — either by injecting knowledge and instructions into the agent system prompt (SKILL.md format) or by registering custom shell tools (SKILL.toml format).

---

## Overview

### Two Supported Formats

| Format | Use When | Location After Install |
|--------|----------|----------------------|
| `SKILL.md` | Knowledge skills, behavioral instructions, prompt injection | `~/.zeroclaw/workspace/skills/<name>/` |
| `SKILL.toml` | Registering custom shell tools the agent can invoke | `~/.zeroclaw/workspace/skills/<name>/` |

**SKILL.md** is the simpler format and is recommended for most of Kiro's skills — any skill that teaches Kiro how to do something, follows a workflow, or injects context into the agent session.

**SKILL.toml** is needed when the skill provides a callable tool (a shell command Kiro can invoke during a session). It includes a `[[tools]]` block that registers the tool name, description, and command.

Both formats are supported simultaneously. A skill directory can include both files if needed.

**Source of truth:** `/etc/nixos/zeroclaw/skills/` — this is where skill source lives and where git tracks it.

**Installed workspace:** `~/.zeroclaw/workspace/skills/` — this is where ZeroClaw runtime reads installed skills. ZeroClaw manages this directory; do not edit it directly.

---

## Directory Structure

```
skills/
└── my-skill/               # skill root — name must be unique
    ├── SKILL.md            # required — frontmatter + markdown instructions
    ├── SKILL.toml          # optional — use when registering shell tools
    ├── scripts/            # optional — executable scripts the skill invokes
    ├── references/         # optional — context documents loaded into agent context
    └── assets/             # optional — templates, icons, static files
```

**Important:** All files inside a skill directory must be **regular files** — no symlinks allowed inside skill packages. The `zeroclaw skills audit` command will reject any skill that contains symlinks, even in subdirectories. Copy files; never symlink them.

Shell script files (`.sh`) also cannot be placed inside skill packages — the `zeroclaw skills audit` security policy rejects them. Scripts invoked by skill tools must live **outside** the skill directory. The established pattern is `/etc/nixos/zeroclaw/bin/<script>.sh`. Reference scripts via absolute path in the SKILL.toml `command` field.

When `zeroclaw skills install` succeeds, ZeroClaw also auto-generates `_meta.json` in the installed copy — this file is managed by ZeroClaw and should not be manually created or edited.

---

## SKILL.md Format

Use SKILL.md when you want to inject instructions, knowledge, or behavioral guidance into the agent system prompt at runtime.

**Full annotated example:**

```markdown
---
name: morning-briefing
description: Runs Kiro's morning briefing session — job scan, task queue triage, overnight summary. Use when morning routine needs to run.
---

# Morning Briefing

Check overnight messages, triage task queue, scan for hot job listings.
Report findings to Enrique via WhatsApp.

## Steps

1. Run `zeroclaw cron list` to confirm cron system is healthy
2. Check task queue for items over 24h old
3. Scan job boards for new high-match listings
4. Compose summary and send via kapso-whatsapp-cli
```

**Frontmatter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique skill identifier — must match directory name |
| `description` | Yes | One-line description of when and how to use this skill |

The `name` and `description` fields are injected into the agent system prompt at runtime, making the skill discoverable during a session. The markdown body provides the full instructions Kiro follows when activating the skill.

---

## SKILL.toml Format

Use SKILL.toml when the skill provides a callable shell tool the agent can invoke during a session. The `[[tools]]` block registers the tool name, its description (shown to the agent), and the shell command to execute.

**Full annotated example:**

```toml
[skill]
name = "job-scanner"
description = "Fetches and filters job listings from configured boards"
version = "0.1.0"
author = "kiro"
tags = ["job-search", "automation"]

[[tools]]
name = "scan_jobs"
description = "Scan job boards for new listings"
kind = "shell"
command = "node /etc/nixos/zeroclaw/skills/job-scanner/run.js"
```

**[skill] block fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique skill identifier |
| `description` | Yes | What this skill provides |
| `version` | No | Semver string |
| `author` | No | Who authored the skill |
| `tags` | No | Array of category strings |

**[[tools]] block fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Tool name the agent calls — use underscores, no spaces |
| `description` | Yes | Shown to the agent so it knows when to invoke this tool |
| `kind` | Yes | Always `"shell"` for native tools |
| `command` | Yes | Full shell command to execute when tool is invoked |

Use absolute paths in `command` — relative paths will break after install since the working directory is not guaranteed. A skill directory can include both SKILL.md (for instructions) and SKILL.toml (for tool registration) at the same time.

---

## Skill Anatomy

Every skill is a directory. Files inside:

| File | Required | Purpose |
|------|----------|---------|
| `SKILL.md` | Always | Agent instructions + describes the CLI if one exists |
| `SKILL.toml` | If registering a callable tool | Declares the tool name, description, and shell command |
| `cli.ts` / `cli.py` | If doing I/O work | The actual program — TypeScript or Python, lives inside skill dir |
| `evals.json` | If outputs are testable | Test cases for verifying skill behavior |

**Shell scripts (`.sh`) cannot live inside skill directories** — the audit security policy rejects them. Shell scripts must live in `/etc/nixos/zeroclaw/bin/` and be referenced via absolute path in the SKILL.toml `command` field.

**TypeScript and Python files may live inside the skill directory.** Reference them via absolute path:
```toml
command = "bun run /etc/nixos/zeroclaw/skills/my-skill/cli.ts"
command = "uv run /etc/nixos/zeroclaw/skills/my-skill/cli.py"
```

### When to include a CLI

Include a CLI when the skill does **I/O work**: fetches data, manages state, calls APIs, filters records, or produces structured output. Moving this work out of the agent's token budget makes it deterministic, testable, and cheaper.

Pure procedure skills (how to structure prompts, how to route tasks, behavioral guidance) do not need a CLI — `SKILL.md` alone is correct.

### CLI output contract

All CLIs in this system follow the same contract:

- **stdout:** JSON always — the structured data the agent acts on
- **stderr:** human-readable error messages only
- **exit 0:** success
- **exit 1:** error — emit `{"error": "..."}` to stderr

---

## Declarative Installation

Skills are **declarative** — git is the source of truth, not the workspace. Every `nixos-rebuild` runs `skills-sync --remove-missing` which installs all skills in `skills/*/` and removes any workspace skills not tracked in git.

**You do not need to run `zeroclaw skills install` after a rebuild** — the activation hook handles it.

`zeroclaw skills install` from external URLs or GitHub is **blocked** by the wrapper. Source must be in `/etc/nixos/zeroclaw/skills/` first.

---

## Workflow — Creating and Installing a Skill

Follow these steps in order:

```bash
# Step 1: Create skill directory in the repo
mkdir -p /etc/nixos/zeroclaw/skills/my-skill

# Step 2: Write SKILL.md (minimum required)
# Add frontmatter (name, description) and markdown instructions

# Step 3: If the skill needs a callable tool:
#   - Write SKILL.toml with [[tools]] block
#   - Write cli.ts (or cli.py) inside the skill dir for TypeScript/Python
#   - Write bin/my-skill.sh for shell scripts (outside skill dir)

# Step 4: Audit the skill before installing (security check)
cd /etc/nixos/zeroclaw
zeroclaw skills audit ./skills/my-skill

# Step 5: Install into ZeroClaw workspace
zeroclaw skills install /etc/nixos/zeroclaw/skills/my-skill

# Step 6: Verify the skill is listed
zeroclaw skills list

# Step 7: Commit to git (source of truth — rebuild will sync automatically)
git add skills/my-skill/
git commit -m "feat(skills): add my-skill"
```

**What audit checks:** Symlinks inside the skill package, `.sh` files, script injection patterns, prompt injection attempts. Always run audit before install — it is non-destructive.

**Where skills live after install:** `~/.zeroclaw/workspace/skills/my-skill/` — managed by ZeroClaw. The repo copy remains the source of truth.

**To update an installed skill:** Edit source in the repo, re-run `zeroclaw skills audit` and `zeroclaw skills install`, then commit. The next rebuild also auto-syncs.

---

## CLI Quick Reference

| Command | Description |
|---------|-------------|
| `zeroclaw skills list` | List all installed skills with name, version, description |
| `zeroclaw skills audit <path>` | Security audit a skill before installing (required) |
| `zeroclaw skills install <path>` | Install from `/etc/nixos/zeroclaw/skills/<name>` only |
| `zeroclaw skills remove <name>` | Remove an installed skill by name |
| `skills-sync` | Apply git source to workspace (add/update only) |
| `skills-sync --remove-missing` | Full sync — also removes workspace skills not in git |
| `skills-sync --dry-run` | Preview changes without applying |

**Enforcement:** `zeroclaw skills install` from external sources (GitHub URLs, npm) is blocked. Use absolute paths under `/etc/nixos/zeroclaw/skills/`.
