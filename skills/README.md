# Skills — Operational Guide

A skill is a CLI wrapper with a SKILL.md and a cli.ts. If it doesn't have a CLI, it's a document (lives in `documents/`). For creating new skills, see `documents/SKILL-CREATOR.md`.

---

## Overview

**Source of truth:** `/etc/nixos/zeroclaw/skills/` — this is where skill source lives and where git tracks it.

**Installed workspace:** `~/.zeroclaw/workspace/skills/` — this is where ZeroClaw runtime reads installed skills. ZeroClaw manages this directory; do not edit it directly.

---

## Directory Structure

```
skills/
└── my-skill/               # skill root — name must be unique
    ├── SKILL.md            # required — frontmatter + markdown instructions + CLI reference
    └── cli.ts              # required — the CLI wrapper (TypeScript preferred)
```

**Important:** All files inside a skill directory must be **regular files** — no symlinks allowed inside skill packages. The `zeroclaw skills audit` command will reject any skill that contains symlinks, even in subdirectories. Copy files; never symlink them.

Shell script files (`.sh`) also cannot be placed inside skill packages — the `zeroclaw skills audit` security policy rejects them. If a skill needs shell commands, wrap them in the TypeScript CLI.

When `zeroclaw skills install` succeeds, ZeroClaw also auto-generates `_meta.json` in the installed copy — this file is managed by ZeroClaw and should not be manually created or edited.

---

## SKILL.md Format

```markdown
---
name: my-skill
description: One-line description — when and why Kiro invokes this skill.
---

# My Skill

Instructions Kiro follows when this skill activates.

## CLI Reference

### my-skill help
Show available commands.

### my-skill <subcommand> [flags]
Description of what this subcommand does.
```

**Frontmatter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique skill identifier — must match directory name |
| `description` | Yes | One-line description of when and how to use this skill |

The `name` and `description` fields are injected into the agent system prompt at runtime, making the skill discoverable during a session. The markdown body provides the full instructions Kiro follows when activating the skill.

---

## Skill Anatomy

Every skill is a directory. Files inside:

| File | Required | Purpose |
|------|----------|---------|
| `SKILL.md` | Yes | Agent instructions + CLI reference |
| `cli.ts` | Yes | The CLI wrapper — TypeScript, runs via bun |

**Language:**
- TypeScript (bun) — preferred for structured data, external APIs, JSON output
- Python (uv) — acceptable alternative (`cli.py`)

**CLI placement:** `.ts` / `.py` files live inside the skill directory (e.g., `skills/my-skill/cli.ts`).

### CLI output contract

All CLIs in this system follow the same contract:

- **stdout:** JSON always — the structured data the agent acts on
- **stderr:** human-readable error messages only
- **exit 0:** success
- **exit 1:** error — emit `{"error": "..."}` to stderr

---

## Installed Skills

| Skill | Purpose |
|-------|---------|
| `calendar` | Google Calendar control across all accounts |
| `email` | Email control across Gmail and SpaceMail accounts |
| `psn` | Social media content lifecycle via Post Shit Now (draft, schedule, publish, analyze) |

---

## Declarative Installation

Skills are **declarative** — git is the source of truth, not the workspace. Every `nixos-rebuild` runs `skills-sync --remove-missing` which installs all skills in `skills/*/` and removes any workspace skills not tracked in git.

**You do not need to run `zeroclaw skills install` after a rebuild** — the activation hook handles it.

`zeroclaw skills install` from external URLs or GitHub is **blocked** by the wrapper. Source must be in `/etc/nixos/zeroclaw/skills/` first.

---

## Workflow — Creating and Installing a Skill

Follow the full guide in `documents/SKILL-CREATOR.md`. Quick reference:

```bash
# Step 1: Create skill directory in the repo
mkdir -p /etc/nixos/zeroclaw/skills/my-skill

# Step 2: Write SKILL.md (frontmatter + instructions + CLI reference)

# Step 3: Write cli.ts using the template in SKILL-CREATOR.md

# Step 4: Test the CLI
bun run /etc/nixos/zeroclaw/skills/my-skill/cli.ts help

# Step 5: Audit the skill before installing (security check)
cd /etc/nixos/zeroclaw
zeroclaw skills audit ./skills/my-skill

# Step 6: Install into ZeroClaw workspace
zeroclaw skills install /etc/nixos/zeroclaw/skills/my-skill

# Step 7: Verify the skill is listed
zeroclaw skills list

# Step 8: Commit to git (source of truth — rebuild will sync automatically)
git add skills/my-skill/
git commit -m "feat(skills): add my-skill"
```

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

---

## Skills vs Programs

Skills and programs are both automation, but for different contexts:

| | Skill | Program |
|-|-------|---------|
| **Has CLI** | Yes — always | Yes — standalone |
| **Requires LLM** | Yes — agent context is valuable | No — deterministic logic only |
| **Location** | `skills/<name>/` | `bin/<name>.ts` |
| **Triggered by** | Agent session (interactive or cron) | Shell cron or direct execution |
| **State** | Via agent tools (`memory_store`, `state_set`) | Own state files in `~/.zeroclaw/workspace/` |

**The test:** Can you express the decision logic as an if-statement? Yes → program (`bin/`). No → skill.

If automation is wired to cron AND needs no LLM reasoning, it should be a program, not a skill.
See `bin/README.md` for the program standard.
