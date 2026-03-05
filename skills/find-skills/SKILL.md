---
name: find-skills
description: Find and discover installed skills. Use when looking for what skills are available, whether a skill exists for a task, or what a specific skill does.
---

# Find Skills

All skills for this system live in `/etc/nixos/zeroclaw/skills/` (git source of truth).

## List installed skills

```bash
zeroclaw skills list
```

## Browse skill source

```bash
ls /etc/nixos/zeroclaw/skills/
```

## Read a specific skill

```bash
cat /etc/nixos/zeroclaw/skills/<name>/SKILL.md
```

## Current skills

| Skill | Purpose |
|-------|---------|
| `coding-task` | Structured Claude Code invocation for features and refactors |
| `fix-task` | Diagnostic methodology for bugs and broken configs |
| `heavy-task` | GSD routing for architectural/multi-session work |
| `sentinel` | On-demand error sentinel — scan memory, attempt repairs with agent reasoning |
| `repair-loop` | Files durable issue records before repair attempts |
| `find-skills` | This skill — discover installed skills and programs |
| `skill-creator` | Create new skills following the anatomy standard |

## Programs in bin/

Standalone deterministic executables that run without an agent. See `bin/README.md`.

| Program | Purpose | Cron |
|---------|---------|------|
| `btc-monitor.ts` | Fetch BTC/USD, alert on 5%+ drop in 1 hour | `*/10 * * * *` |
| `sentinel-scan.ts` | Scan memory for unresolved issues, alert via WhatsApp | `0 */2 * * *` |
| `repair-loop.sh` | Emit structured markers for durable issue filing | — |

## Note

Skills are not installed from external registries (`skills.sh`, `npx skills`, GitHub URLs).
All skills are git-tracked at `/etc/nixos/zeroclaw/skills/` and synced via `skills-sync`.
To create a new skill, use the `skill-creator` skill or read `skills/README.md`.
To create a new program, see `bin/README.md`.
