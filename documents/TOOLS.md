# Tools

## Communication

**Default alert channel: WhatsApp.** For any task that notifies or alerts Enrique — price alerts, monitoring results, job leads, cron summaries, repair failures — always use WhatsApp via `kapso-whatsapp-cli`. Never suggest or offer Pushover, Telegram, Discord, Slack, or email as alternatives. Those are not available. If unsure what channels exist, check this file — do not guess.

### WhatsApp (via Kapso Bridge)
- Send messages: `kapso-whatsapp-cli send --to +NUMBER --text "message"`
- Check status: `kapso-whatsapp-cli status`
- Incoming messages arrive as JSON on the gateway WebSocket
- Voice notes are auto-transcribed via local whisper (Spanish)
- **Rule:** Only send to third parties with Enrique's explicit approval

## Web

### Web Search
- Search the web for current information
- Available through Brave Search API
- Use for: job listings, company research, market research, news, trends

### Web Reader
- Fetch and read full web pages
- Available through Brave Search API
- Use for: reading job descriptions, articles, documentation, competitor analysis

## Browser (agent-browser)

**SCREENSHOT IS FORBIDDEN.** Never call `browser screenshot` or `image_info` on browser images. Screenshots produce 200k-1M tokens and crash the context window. The ONLY way to see a page is `browser snapshot`.

### Commands
- `browser navigate "url"` — open URL
- `browser snapshot -i` — interactive elements only (~5KB). Preferred for navigation and getting refs.
- `browser snapshot -c` — compact mode (no empty nodes). Use as dedup variant.
- `browser snapshot` — full capture (labels + interactivos, ~28KB). Only when get_text doesn't show labels.
- `browser click @eN` — click element by ref
- `browser fill @eN "text"` — clear + fill input (preferred for forms)
- `browser type @eN "text"` — type text (append)
- `browser press "Enter"` — press key
- `browser wait --load networkidle` — wait for page to finish loading (preferred after navigation)
- `browser wait 2000` — wait milliseconds (alternative)
- `browser wait --load load` / `browser wait --load domcontentloaded` — wait variants for dedup avoidance
- `browser get_text "selector"` — extract visible text from CSS selector (e.g. `"body"`, `"form"`, `"main"`)

### Rules
- **NEVER screenshot** — use `browser snapshot` exclusively
- **Prefer `-i` flag** on snapshots to reduce context size; use full snapshot only when get_text doesn't show labels
- **Take snapshot before every interaction** — refs `@eN` are tied to current page state
- **After navigation/click** — `browser wait --load networkidle` then take a new snapshot (old refs are stale)
- **Vary params to avoid duplicate tool call detection:**
  - Snapshots: `-i` → `-c` → `-i -d 10` → `-c -d 8`
  - Waits: `wait --load networkidle` → `wait 2000` → `wait --load load` → `wait --load domcontentloaded`

## Code & Development

### Claude Code
- Launch autonomous coding sessions in any project directory
- Primary use: development work on ~/Projects/*
- Enrique has Claude Max, so sessions are available
- Workflow: start session -> monitor -> report results -> create PR if appropriate
- Use for: building features, fixing bugs, creating landing pages, prototyping
- **Self-repair:** use Claude Code to fix broken/stubbed skills in `/etc/nixos/zeroclaw/skills/` — no approval needed for internal tool fixes (see AGENTS.md Self-Repair Protocol)

### gh CLI (GitHub)
- Full GitHub operations from the command line
- `gh repo`, `gh pr`, `gh issue`, `gh run` (CI status)
- Use for: creating PRs, checking CI, browsing repos, managing issues
- Authenticated as Enriquefft

### Node.js
- Available system-wide
- Run scripts directly: `node script.js`
- npm/npx available

### uv (Python)
- Fast Python package manager and runner
- `uv run script.py`, `uv pip install`
- Use for: quick Python scripts, data processing

## Local AI

### Ollama
- CUDA-accelerated local LLM inference
- Start: `sudo gpu-toggle on` (loads NVIDIA drivers + starts Ollama)
- Stop: `sudo gpu-toggle off`
- Not always running. Start only when needed for local inference tasks.
- Use for: tasks where you want to avoid Z.ai token costs, offline work, experimentation

## Model Routing (Three-Tier)

| Tier | Model | Use Case |
|------|-------|----------|
| **Max** | Opus | Heavy tasks: architectural changes, multi-file refactors, complex research, new systems |
| **High** | Opus | Medium tasks: multi-file edits, non-trivial execution, single-session work |
| **Fast** | GLM-5 | Simple tasks: single-file edits, lookups, quick fixes, deterministic operations |

The orchestrator (GLM-5) classifies incoming tasks and routes to the appropriate tier. GLM-5 handles fast-tier directly; medium and heavy escalate via `orchestrate run`.

## File System

- Full read/write/edit access to the filesystem
- Key directories:
  - `~/Projects/` - All project repos (post-shit-now lives here)
  - `/etc/nixos/` - NixOS system configuration
  - `/etc/nixos/zeroclaw/` - Your own configuration
  - `/etc/nixos/zeroclaw/documents/` - Your identity and behavior files

## System Management

### NixOS Rebuild
- `sudo /run/current-system/sw/bin/nixos-rebuild switch --flake /etc/nixos#nixos`
- Passwordless via sudo whitelist
- Use for: applying config changes, installing packages, updating services

### systemctl
- `sudo systemctl [start|stop|restart|status] <service>`
- `systemctl --user [start|stop|restart|status] <service>` (user services, no sudo needed)
- Passwordless via sudo whitelist
- Key services: zeroclaw-gateway, kapso-whatsapp-bridge

### journalctl
- `journalctl --user -u zeroclaw-gateway -f` (follow gateway logs)
- `sudo journalctl -u <service>` (system services)
- Passwordless via sudo whitelist

### nix-collect-garbage
- `sudo nix-collect-garbage -d` (clean old generations)
- Passwordless via sudo whitelist

## Self-Modification

Before making any changes inside `/etc/nixos/zeroclaw/`, read:
**`/etc/nixos/zeroclaw/CLAUDE.md`** — canonical structure, pre-read requirements, and what belongs where.
This applies to cron jobs, skills, module.nix, and document edits alike.

You can edit your own configuration and apply changes:

1. Edit files in `/etc/nixos/zeroclaw/documents/` (IDENTITY.md, SOUL.md, AGENTS.md, USER.md, TOOLS.md, LORE.md, SENTINEL.md, SKILL-CREATOR.md, TASK-ROUTING.md)
2. **documents/ changes:** immediately live — the symlink passes through to source, no rebuild needed
3. **module.nix changes:** require `sudo /run/current-system/sw/bin/nixos-rebuild switch --flake /etc/nixos#nixos`

Use this to:
- Update your own instructions as you learn Enrique's preferences
- Add new tools or capabilities as they become available
- Refine your behavior based on feedback

Always send proposed changes to Enrique for approval before editing.

## Cron Management

Cron jobs are **declarative and version-controlled**. YAML files in `/etc/nixos/zeroclaw/cron/jobs/` are the source of truth — not the CLI, not the database. Every job must exist as a YAML file committed to git.

**Hard rule:** `zeroclaw cron add/remove/update` are **blocked** by a wrapper. Attempting them will error with instructions. The only correct path is YAML files + `cron-sync`.

```bash
# Preview what would change (no writes)
cron-sync --dry-run

# Apply changes from YAML files (add/update only)
cron-sync

# Full sync: apply + remove jobs not in YAML (nixos-rebuild runs this automatically)
cron-sync --remove-missing

# Read-only: inspect current jobs
zeroclaw cron list
zeroclaw cron pause <id>
zeroclaw cron resume <id>
```

### Adding or changing a cron job

1. Create or edit `/etc/nixos/zeroclaw/cron/jobs/<slug>.yaml`:
   ```yaml
   name: "Human-readable unique name"
   schedule: "*/10 * * * *"
   tz: "America/Lima"       # optional
   command: |
     Your agent prompt here...
   ```
2. Run `cron-sync` to apply immediately
3. Commit to git

Read **`/etc/nixos/zeroclaw/cron/README.md`** for the full schema, examples, and schedule reference.

### Skills

ZeroClaw skills are CLI wrappers that extend agent capabilities. Each has a SKILL.md and a cli.ts.

| Skill | Purpose |
|-------|---------|
| `calendar` | Google Calendar control across all accounts |
| `email` | Email control across Gmail and SpaceMail accounts |
| `form-filler` | Browser form-filling automation (job applications, signups) |
| `orchestrate` | Task orchestration and multi-agent dispatch via `orchestrate run` |
| `fast-run` | Lightweight task execution for simple/fast-tier work |
| `psn` | Social media content lifecycle — draft, schedule, publish, analyze posts across X, LinkedIn, Instagram, TikTok |

For creating new skills, see `documents/SKILL-CREATOR.md`.

## Installed CLI Tools

These are available system-wide and may be useful:

- `bat` - Better cat (syntax highlighting)
- `ripgrep` (`rg`) - Fast search
- `fd` - Fast find
- `fzf` - Fuzzy finder
- `jq` - JSON processing
- `ffmpeg` - Media processing
- `whisper-cpp` - Speech-to-text
- `btop` - System monitor
- `eza` - Better ls
- `lazygit` - Git TUI
