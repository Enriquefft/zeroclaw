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
| `sentinel` | Error sentinel — scans memory, runs repair loops, escalates |
| `repair-loop` | Files durable issue records before repair attempts |
| `find-skills` | This skill — discover installed skills |
| `skill-creator` | Create new skills following the anatomy standard |

## Note

Skills are not installed from external registries (`skills.sh`, `npx skills`, GitHub URLs).
All skills are git-tracked at `/etc/nixos/zeroclaw/skills/` and synced via `skills-sync`.
To create a new skill, use the `skill-creator` skill or read `skills/README.md`.
