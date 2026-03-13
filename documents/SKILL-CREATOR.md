# Skill Creator

Guide for authoring and installing skills in this system. All skills live at
`/etc/nixos/zeroclaw/skills/` (git source of truth) and are installed via `skills-sync`.

## Decision Tree

Need to automate something?

```
Is it deterministic (expressible as if-statement)?
  YES → bin/ program (see bin/README.md)
  NO  → Does it need I/O the agent can't do natively?
          YES → Skill (CLI wrapper + SKILL.md)
                → Wraps rate-limited API? → Include batch subcommand
          NO  → Document (behavioral guidance in documents/)
```

**The rule:** a skill is a directory in `skills/` with a SKILL.md and a CLI. No CLI = document.

## Skill Anatomy

```
skills/my-skill/
├── SKILL.md      # required — agent instructions, CLI reference
└── cli.ts        # required — the CLI wrapper
```

The agent discovers CLI capabilities via SKILL.md content and `--help`.

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

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/v1/resource | 10 req | 10s |

Use `batch` for 2+ write operations. Never fire parallel shell calls.
```

The `description` is what Kiro reads to decide whether to activate the skill. Make it
specific and action-oriented. Vague descriptions cause undertriggering.

Include the Rate Limits section when the CLI wraps a rate-limited API.

## CLI Template

All CLIs follow this skeleton. Copy and adapt:

```typescript
#!/usr/bin/env bun
// cli.ts — <skill-name> CLI
// Output: JSON to stdout. Errors to stderr, exit 1.

// --- Error helpers ---

function err(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ error: message, ...details }));
  process.exit(1);
}

async function run(cmd: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const errOut = await new Response(proc.stderr).text();
      err(`Command failed (exit ${exitCode})`, { command: cmd.join(" "), stderr: errOut.trim() });
    }
    return out.trim();
  } catch (e) {
    err(`Failed to execute: ${cmd[0]}`, { message: String(e) });
  }
}

// --- Secrets loading ---

async function loadSecrets() {
  try {
    const envText = await Bun.file("/run/secrets/rendered/zeroclaw.env").text();
    for (const line of envText.split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) process.env[match[1]] = match[2];
    }
  } catch {
    // Secrets file may not exist in dev — continue without
  }
}

// --- Argument parsing ---

function parseArgs(args: string[]): { command: string; flags: Record<string, string> } {
  const command = args[0] || "help";
  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      flags[key] = args[i + 1] || "true";
      if (args[i + 1] && !args[i + 1].startsWith("--")) i++;
    }
  }
  return { command, flags };
}

// --- Main ---

const USAGE = `Usage: bun run cli.ts <command>

Commands:
  help          Show this help
  <command>     Description of command`;

async function main() {
  await loadSecrets();
  const { command, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      break;

    // Add your commands here:
    // case "list":
    //   const result = await doList(flags);
    //   console.log(JSON.stringify(result));
    //   break;

    default:
      err(`Unknown command: ${command}`, { usage: USAGE });
  }
}

main();
```

**Key points:**
- `err()` outputs clean JSON to stderr and exits 1 — no raw stack traces
- `run()` wraps subprocess calls with error extraction
- `loadSecrets()` reads zeroclaw.env for API keys — call once at startup
- `parseArgs()` handles `--flag value` pairs
- Every unknown command hits the default case with usage

## Batch Subcommand Template

Include a `batch` subcommand when the CLI wraps an API with rate limits AND the agent might call it N times in sequence.

```typescript
case "batch": {
  // Reads JSON array from stdin: [{ "action": "create", ...params }, ...]
  const input = await Bun.stdin.text();
  let operations: Array<Record<string, unknown>>;
  try {
    operations = JSON.parse(input);
    if (!Array.isArray(operations)) err("Batch input must be a JSON array");
  } catch {
    err("Invalid JSON on stdin");
  }

  const results: Array<{ index: number; ok: boolean; data?: unknown; error?: string }> = [];
  const DELAY_MS = 500;
  const MAX_RETRIES = 3;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    let retries = 0;
    let success = false;

    while (retries <= MAX_RETRIES && !success) {
      try {
        const data = await executeOperation(op); // implement per-skill
        results.push({ index: i, ok: true, data });
        success = true;
      } catch (e: any) {
        const isRateLimit = e.status === 429 ||
          String(e.message).includes("rateLimitExceeded") ||
          String(e.message).includes("Rate Limit");
        if (isRateLimit && retries < MAX_RETRIES) {
          const backoff = DELAY_MS * Math.pow(2, retries);
          await Bun.sleep(backoff);
          retries++;
        } else {
          results.push({ index: i, ok: false, error: String(e.message || e) });
          success = true; // move on, don't retry non-rate-limit errors
        }
      }
    }

    // Inter-operation delay to stay under rate limits
    if (i < operations.length - 1) await Bun.sleep(DELAY_MS);
  }

  console.log(JSON.stringify(results));
  break;
}
```

**When to include batch:** the CLI wraps an API with rate limits AND the agent might invoke it multiple times in a single session. Example: creating 5 calendar events, sending 3 emails.

## Error Path Testing Checklist

Before committing a new skill, verify each error path:

- [ ] Invalid arguments → prints usage, exits 1
- [ ] Missing required flags → JSON error, exits 1
- [ ] API timeout → JSON error (not raw stack trace)
- [ ] Rate limit → backoff+retry (batch) or JSON error (single)
- [ ] Auth failure → JSON error mentioning secrets
- [ ] Malformed API response → JSON error, no crash

## Step-by-Step Workflow

```bash
# 1. Create the skill directory
mkdir -p /etc/nixos/zeroclaw/skills/my-skill

# 2. Write SKILL.md with frontmatter + CLI reference docs
# Include rate limit section if wrapping a rate-limited API

# 3. Write cli.ts using the template above

# 4. Test the CLI directly
bun run /etc/nixos/zeroclaw/skills/my-skill/cli.ts help

# 5. Run the error-path checklist above

# 6. Audit before installing (required — rejects symlinks and injection patterns)
cd /etc/nixos/zeroclaw
zeroclaw skills audit ./skills/my-skill

# 7. Install into workspace
zeroclaw skills install /etc/nixos/zeroclaw/skills/my-skill

# 8. Verify it appears
zeroclaw skills list

# 9. Commit to git
git add skills/my-skill/
git commit -m "feat(skills): add my-skill"
```

After commit, `nixos-rebuild` will auto-install via the `zeroclawSkillsSync` activation hook.

## Hard Rules

- **Only install from git:** `zeroclaw skills install` from external URLs is blocked by the wrapper. Source must be in `/etc/nixos/zeroclaw/skills/` before installing.
- **No `.sh` inside skill dirs:** audit rejects them. Shell scripts go in `bin/`.
- **No symlinks inside skill dirs:** audit rejects them. Copy files, never symlink.
- **Always audit before install:** non-negotiable — run `zeroclaw skills audit` first.
- **Always commit after install:** git is the source of truth, not the workspace.
- **Every skill has a CLI.** If there's no CLI, it's a document, not a skill.
