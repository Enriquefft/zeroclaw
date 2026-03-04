# ZeroClaw Infrastructure

## What This Is

A version-controlled infrastructure for ZeroClaw — an autonomous AI agent runtime ("Kiro") that serves as a personal chief of staff. This project replaces the previous OpenClaw setup with ZeroClaw's more extensible, configurable, and lightweight platform. Everything lives in `/etc/nixos/zeroclaw/` as the single source of truth, deployed to `~/.zeroclaw/` via NixOS home-manager with symlinks for live-editable files.

## Core Value

A robust, extensible foundation that enables Kiro to grow and self-modify without friction — editing identity, creating skills, adding cron jobs, and refining config — all version-controlled, all without unnecessary rebuilds.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Complete config.toml covering all relevant ZeroClaw sections (autonomy, cron, skills, memory, model routes, agents, research, observability)
- [ ] Proper directory structure with scaffolding for skills/, cron/, and conventions documented
- [ ] Comprehensive CLAUDE.md optimized for LLM coding agents working on this infrastructure
- [ ] module.nix updated to wire all config sections, symlink live-editable paths (docs, skills, cron)
- [ ] Self-modification paths: Kiro can edit docs, create skills, modify config, add cron — all git-first
- [ ] No-rebuild workflow for common changes (identity docs, skills, cron definitions) via mkOutOfStoreSymlink
- [ ] Rebuild-required workflow clearly documented for .nix and structural config changes
- [ ] Upstream ZeroClaw docs accessible via symlink for reference by any agent working here

### Out of Scope

- Migrating the 13 OpenClaw cron jobs — infrastructure first, jobs come later
- Specific skills implementation — scaffolding only, skills built incrementally
- OpenClaw compatibility — clean break, achieve the same goals through ZeroClaw's native systems
- Hardware/peripheral config — not relevant to current use case
- Multi-agent IPC — single agent for now

## Context

- **Platform:** ZeroClaw is a Rust-based autonomous agent runtime with native support for cron, skills (SKILL.toml manifests), sub-agent delegation, model routing, memory, autonomy controls, and multi-channel communication
- **Previous system:** OpenClaw used a Go gateway with custom plugins, hooks, and Bun/TS CLI skills. It required extensive custom infrastructure (cron-sync, plugin system, hook scripts) to achieve what ZeroClaw provides natively
- **Deployment model:** NixOS flake → home-manager module → systemd user service. Config rendered at build time, identity docs and skills symlinked for live editing
- **Communication:** WhatsApp via Kapso bridge, CLI for direct interaction
- **Model providers:** Z.AI (zai, zai-coding) with GLM models
- **Upstream docs:** Symlinked at `reference/upstream-docs/` → `~/Projects/zeroclaw/docs/`
- **Source of truth:** `/etc/nixos/zeroclaw/` is the single source of truth for all Kiro configuration

## Constraints

- **NixOS deployment:** All structural changes require `sudo nixos-rebuild switch`. Minimize rebuild frequency by symlink-ing mutable content
- **Git-first edits:** Kiro makes changes in `/etc/nixos/zeroclaw/`, commits to git. No ad-hoc runtime modifications outside version control
- **Single source of truth:** `/etc/nixos/zeroclaw/` is canonical. `~/.zeroclaw/` is a deployment target, never edited directly
- **Z.AI provider:** Uses `chat_completions` wire API only (NOT `openai-responses` — returns 404)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Replace OpenClaw entirely (not migrate) | ZeroClaw is fundamentally different — native cron, skills, autonomy. Porting OpenClaw's custom infra would fight ZeroClaw's design | — Pending |
| Symlink for live-editable files | Identity docs, skills, cron defs should not require NixOS rebuild to take effect | — Pending |
| Upstream docs via symlink | Keeps reference current with `git pull`, zero duplication, any agent can read ZeroClaw docs | — Pending |
| Git-first self-modification | All Kiro changes go through git in `/etc/nixos/zeroclaw/`. Ensures auditability, rollback, and version control | — Pending |
| Infrastructure before jobs | Build the foundation right, then incrementally add cron jobs and skills on solid ground | — Pending |

---
*Last updated: 2026-03-04 after initialization*
