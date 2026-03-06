# Programs — Standalone Executables

Standalone deterministic executables that run without an LLM agent. These handle scheduled
automation where the decision logic can be expressed as if-statements — no reasoning needed.

---

## When to Use a Program vs a Skill

| Use a program when... | Use a skill when... |
|-----------------------|---------------------|
| Decision logic is deterministic (if-statements) | Task requires reading meaning, judgment, or novel output |
| No LLM reasoning needed at runtime | Agent context is valuable for execution |
| Wired to cron as a shell job | Invoked interactively or as agent cron |

**The test:** Can you express the decision logic as an if-statement? Yes → program. No → skill.

---

## Standards

**Language:** TypeScript (bun) preferred. Shell for trivial operations.

**Output contract (same as skill CLIs):**
- stdout: JSON always — structured data
- stderr: human-readable error messages only
- exit 0: success
- exit 1: error — emit `{"error": "..."}` to stderr

**State:** Programs manage their own state files in `~/.zeroclaw/workspace/`.
Agent IPC tools (`state_get`/`state_set`) are not available to standalone programs.

**Location:** Always `/etc/nixos/zeroclaw/bin/`. Git-tracked, live edit (no rebuild needed).

**Cron wiring:** Reference by absolute path in cron YAML:
```yaml
name: "My Program"
schedule: "*/10 * * * *"
command: "bun run /etc/nixos/zeroclaw/bin/my-program.ts"
```

---

## Programs

| Program | Purpose | Cron |
|---------|---------|------|
| `sentinel-scan.ts` | Scan memory for unresolved issues, alert via WhatsApp | `0 */2 * * *` |
| `repair-loop.sh` | Emit structured markers for durable issue filing (agent-session helper) | — |
