# zeroclaw

[![NixOS](https://img.shields.io/badge/NixOS-25.11-blue?logo=nixos)](https://nixos.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

A production NixOS home-manager module for running [ZeroClaw](https://zeroclaw.dev) as a persistent personal AI agent — Kiro.

Kiro is Enrique's chief of staff: runs 24/7 on a personal NixOS workstation, communicates via WhatsApp, and handles operations while Enrique focuses on building. ZeroClaw is a self-hosted agentic AI runtime for personal use — not a SaaS product. This repo contains the NixOS module, identity documents, skills, and operational config that make it all work.

---

## What is this?

**ZeroClaw** is a self-hosted agentic AI runtime. It manages tools, memory, scheduling, and multi-agent IPC. You run it on your own machine. There is no cloud service to sign up for — you install ZeroClaw, configure it, and run it as a systemd service.

**Kiro** is the agent persona configured in this repo — Enrique's chief of staff. The `documents/` directory contains Kiro's actual identity documents (IDENTITY.md, SOUL.md, AGENTS.md, TOOLS.md, USER.md, LORE.md). These are the real documents that shape Kiro's behavior at runtime. They are live-editable via a symlink — ZeroClaw reads changes immediately without a NixOS rebuild.

**This repo** is a complete, working reference implementation. It shows how to wire ZeroClaw into NixOS home-manager, author skills, set up cron jobs, and configure multi-agent IPC. You can study it as a reference or adapt it for your own setup.

---

## Repository Structure

| Path | Purpose |
|------|---------|
| `module.nix` | NixOS home-manager module — wires ZeroClaw, systemd service, Kapso WhatsApp bridge |
| `documents/` | Kiro's identity documents — live-edit, ZeroClaw reads changes immediately |
| `skills/` | Skill source (deployed via `zeroclaw skills install`) |
| `cron/` | Cron job documentation and patterns |
| `bin/` | Scripts referenced by skills (must live outside skill packages) |
| `CLAUDE.md` | Agent operational guide — read this first if you are making changes |

```
/etc/nixos/zeroclaw/
├── CLAUDE.md                   # Agent operational guide
├── module.nix                  # NixOS home-manager module
├── LICENSE
├── README.md                   # This file
│
├── documents/                  # Identity docs — live via mkOutOfStoreSymlink
│   ├── IDENTITY.md             # Who Kiro is, core purpose, platform context
│   ├── SOUL.md                 # Personality, values, behavioral principles
│   ├── AGENTS.md               # Autonomy rules, approval gates, protocols
│   ├── TOOLS.md                # Available tools and usage patterns
│   ├── USER.md                 # Enrique's profile, preferences, context
│   └── LORE.md                 # Projects, job search state, key context
│
├── skills/
│   ├── README.md               # Full guide for authoring and installing skills
│   ├── sentinel/               # Health monitoring skill
│   └── repair-loop/            # Self-repair skill
│
├── bin/                        # Scripts referenced by skills
│   └── repair-loop.sh          # Shell script invoked by repair-loop skill
│
├── cron/
│   └── README.md               # Guide for managing cron jobs via zeroclaw CLI
│
└── reference/                  # Reference documents (upstream ZeroClaw docs)
```

---

## Getting Started

### Prerequisites

- NixOS with flakes enabled
- Home Manager configured
- A ZeroClaw installation ([ZeroClaw documentation](https://zeroclaw.dev))
- Agenix (for secrets management) — or replace the `secrets.*` blocks with your own approach

### Using this as a Reference

This repo is primarily a reference. Study `module.nix` to see how ZeroClaw integrates with NixOS home-manager. Read `documents/` to understand how identity documents shape agent behavior. Read `skills/README.md` to understand the skill authoring workflow.

Start with `CLAUDE.md` — it describes the full deployment model, file map, and operational procedures in one place.

### Adapting for Your Own Setup

If you want to run your own ZeroClaw agent on NixOS:

1. Add ZeroClaw to your flake inputs (see `module.nix` for the input name and URL)
2. Import `module.nix` (or adapt it inline) in your home-manager config
3. Replace the identity documents in `documents/` with your own — these define who your agent is
4. Adapt `module.nix` to remove or replace personal infrastructure (see Personalizing below)
5. Set up your own agenix secrets or replace the `secrets.*` blocks with plain files for testing
6. Run `sudo nixos-rebuild switch --option eval-cache false --flake /etc/nixos#nixos` to activate

After activation, ZeroClaw runs as a systemd user service (`zeroclaw-gateway.service`). You can interact with it via the CLI or via whatever channel you configure.

---

## Personalizing

Several parts of this repo are specific to Enrique's setup and must be replaced for your own use:

| Item | Location | What to change |
|------|----------|----------------|
| Identity documents | `documents/` | Replace with your own IDENTITY.md, SOUL.md, AGENTS.md, etc. |
| WhatsApp bridge | `module.nix` → `services.kapso-whatsapp` | Personal infrastructure — remove or replace with your preferred channel |
| Allowed phone numbers | `module.nix` → `security.roles.owner` | Replace with your own numbers (e.g., `+15551234567`) |
| Home directory paths | `module.nix` (e.g., `/home/hybridz/`, `~/Projects/`) | Replace with your username and project paths |
| Whisper model path | `module.nix` → `transcribe.modelPath` | Path to your local Whisper model (`ggml-base.bin` or similar) |
| Secrets | `module.nix` → `secrets.*` | Agenix-managed — set up your own secret files or replace with another approach |
| Delivery mode | `module.nix` → `delivery.mode = "tailscale"` | Kapso-specific — remove if not using Tailscale for message delivery |

The `documents/` directory is the most important thing to personalize. Everything else is infrastructure — it can be removed, replaced, or simplified. The documents define who your agent is.

---

## Skills

Skills extend the agent's capabilities beyond its built-in tools. This repo ships two:

| Skill | Purpose |
|-------|---------|
| `sentinel` | Health monitoring — runs on cron, detects issues, escalates via WhatsApp if unresolved |
| `repair-loop` | Self-repair — invoked by sentinel or directly when Kiro detects a fixable issue |

Skills are authored in `skills/<name>/` and deployed to the ZeroClaw workspace via CLI:

```bash
# Audit before installing (required — rejects symlinks and injection patterns)
zeroclaw skills audit ./skills/my-skill

# Install into ZeroClaw workspace
zeroclaw skills install ./skills/my-skill

# Verify
zeroclaw skills list
```

See `skills/README.md` for the complete guide, including SKILL.md format, SKILL.toml format, and the `bin/` directory pattern for shell scripts.

---

## Key Design Decisions

Non-obvious decisions visible in this repo:

- **Live documents via `mkOutOfStoreSymlink`** — identity docs symlink directly from `/etc/nixos/zeroclaw/documents/` into `~/.zeroclaw/documents/`. Edits take effect immediately without a NixOS rebuild.
- **Skills deploy via CLI, not Nix** — `zeroclaw skills install` manages its own workspace at `~/.zeroclaw/workspace/skills/`. Wiring skills through Nix would fight the runtime's own install mechanism.
- **`bin/` directory for shell scripts** — ZeroClaw's security policy rejects `.sh` files inside skill packages during audit. Scripts go in `bin/` at the repo root and are referenced by absolute path in SKILL.toml.
- **Multi-agent IPC via shared SQLite** — agents on the same host share `~/.zeroclaw/agents.db`. They discover each other via `agents_list` and exchange messages via `agents_send`/`agents_inbox`. Agent identity is derived from workspace directory hash, not a user-supplied name.
- **Config rendered at build time** — `config.toml` is generated by `pkgs.writeText` in `module.nix`. It is not a hand-edited file. To change config, edit `module.nix` and rebuild.

---

## Deployment Model

Different files in this repo require different steps to take effect:

| File / Directory | How to apply |
|-----------------|-------------|
| `module.nix` | NixOS rebuild required |
| `documents/*.md` | Live — edit and commit, ZeroClaw sees changes immediately |
| `skills/<name>/` | Deploy via `zeroclaw skills install` after editing |
| Cron jobs | `zeroclaw cron add/remove/pause/resume` — no files, just CLI |
| `config.toml` | NixOS rebuild required (generated from `module.nix`) |

---

## License

MIT — see [LICENSE](./LICENSE).
