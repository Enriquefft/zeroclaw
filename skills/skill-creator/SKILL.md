---
name: skill-creator
description: Create a new skill or improve an existing one. Use when you catch yourself doing the same manual task repeatedly across sessions and want to encode it as a reusable skill.
---

# Skill Creator

Guide for authoring and installing skills in this system. All skills live at
`/etc/nixos/zeroclaw/skills/` (git source of truth) and are installed via `skills-sync`.

## First: is a skill the right artifact?

Before creating a skill, determine if a skill is what you need:

```
Does this need to run on a schedule?
  YES → Does it need LLM reasoning at runtime?
          YES → Skill + agent cron
          NO  → bin/ program + shell cron (see bin/README.md)
  NO  → Is it a reusable agent capability?
          YES → Skill (continue below)
          NO  → One-off bin/ program or inline
```

**The LLM test:** can you express the decision logic as an if-statement? Yes → program, not skill.

If the answer is "program": create a TypeScript file in `bin/`, wire a shell cron job, commit.
See `bin/README.md` for the full standard.

If the answer is "skill": continue with this guide.

## When to create a skill

**Trigger:** you've done the same manual I/O task (web scraping, API call, data formatting,
state management) 3+ times across separate sessions. That repetition signals a skill.

Procedure-only work (how to structure a prompt, how to route a task) does NOT need a CLI —
pure `SKILL.md` is correct for those. Automation work that fetches data, manages state, or
produces structured output needs a CLI.

## Skill anatomy

```
skills/my-skill/
├── SKILL.md      # always required — agent instructions + describes CLI if one exists
├── SKILL.toml    # required if registering a callable tool
└── cli.ts        # optional — CLI for I/O work (TypeScript preferred)
```

Both `SKILL.md` and `SKILL.toml` can coexist. For the simplest skills, `SKILL.md` alone is
sufficient.

## SKILL.md format

```markdown
---
name: my-skill
description: One-line description — when and why Kiro invokes this skill.
---

# My Skill

Instructions Kiro follows when this skill activates...
```

The `description` is what Kiro reads to decide whether to activate the skill. Make it
specific and action-oriented. Vague descriptions cause undertriggering.

## SKILL.toml format (when registering a callable tool)

```toml
[skill]
name = "my-skill"
description = "What this skill provides"
version = "0.1.0"
author = "kiro"

[[tools]]
name = "my_tool"          # underscores, no spaces — this is what Kiro calls
description = "What the tool does and when to invoke it"
kind = "shell"
command = "bun run /etc/nixos/zeroclaw/skills/my-skill/cli.ts"
```

## CLI standard

**When to build a CLI:** the skill does I/O work (fetches data, manages state, filters
records, calls APIs). Deterministic work should not run inside the agent's token budget.

**Language:**
- TypeScript (bun) — preferred for structured data, external APIs, JSON output
- Python (uv) — acceptable alternative
- Shell (`writeShellApplication` in `module.nix`) — for system ops with explicit Nix deps

**CLI placement:**
- `.ts` / `.py` files: live inside the skill directory (e.g., `skills/my-skill/cli.ts`)
- `.sh` files: must live in `/etc/nixos/zeroclaw/bin/` (audit rejects `.sh` inside skills)

**Output contract (all CLIs must follow this):**
- stdout: JSON always — structured data the agent acts on
- stderr: human-readable error messages only
- exit 0: success
- exit 1: error — print `{"error": "..."}` to stderr

**Example TypeScript CLI skeleton:**

```typescript
#!/usr/bin/env bun
// cli.ts — <skill-name> CLI
// Output: JSON to stdout. Errors to stderr, exit 1.

const args = process.argv.slice(2);

try {
  const result = { /* ... your work ... */ };
  console.log(JSON.stringify(result));
} catch (err) {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
}
```

## Step-by-step: creating a skill

```bash
# 1. Create the skill directory
mkdir -p /etc/nixos/zeroclaw/skills/my-skill

# 2. Write SKILL.md (always required)
# Add frontmatter (name, description) and agent instructions

# 3. If the skill needs a callable tool: write SKILL.toml + CLI
# TypeScript CLIs: create skills/my-skill/cli.ts
# Shell scripts: create bin/my-skill.sh, reference via absolute path in SKILL.toml

# 4. Audit before installing (required — rejects symlinks and injection patterns)
cd /etc/nixos/zeroclaw
zeroclaw skills audit ./skills/my-skill

# 5. Install into workspace
zeroclaw skills install /etc/nixos/zeroclaw/skills/my-skill

# 6. Verify it appears
zeroclaw skills list

# 7. Test — invoke the skill or CLI directly and confirm output
# For CLIs: bun run /etc/nixos/zeroclaw/skills/my-skill/cli.ts

# 8. Commit to git
cd /etc/nixos/zeroclaw
git add skills/my-skill/
git commit -m "feat(skills): add my-skill"
```

After commit, `nixos-rebuild` will auto-install via the `zeroclawSkillsSync` activation hook.

## Hard rules

- **Only install from git:** `zeroclaw skills install` from external URLs is blocked by the
  wrapper. Source must be in `/etc/nixos/zeroclaw/skills/` before installing.
- **No `.sh` inside skill dirs:** audit rejects them. Shell scripts go in `bin/`.
- **No symlinks inside skill dirs:** audit rejects them. Copy files, never symlink.
- **Always audit before install:** non-negotiable — run `zeroclaw skills audit` first.
- **Always commit after install:** git is the source of truth, not the workspace.
