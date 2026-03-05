---
name: fix-task
description: Diagnostic methodology for fixing bugs, broken configs, and errors. Tiered by complexity (simple/medium/heavy). Activate when something is broken and needs repair.
---

# Fix Task

Structured diagnostic and repair procedure. Follow the tier matching the task's complexity classification (see AGENTS.md Task Routing).

## Anti-Hallucination Principles

These apply to ALL tiers. Violating any of these invalidates the fix.

1. **Never fix based on assumption.** Always read the failing code, config, or log FIRST.
2. **Reproduce or confirm the issue** before attempting anything. If you cannot reproduce it, state that explicitly and gather more information.
3. **State the expected outcome** before starting the fix. After the fix, verify against that stated outcome — not a vague sense of "it works."
4. **Read before touching.** Open the relevant file(s) and understand the current state before making any change.

## Simple Fix

Single file, <~10 lines, deterministic outcome, reversible.

### Procedure

1. **Reproduce** — confirm the issue exists (run the command, read the error, check the log).
2. **Read** — open the file that needs changing. Understand the immediate context.
3. **Fix** — make the change. For Claude Code: use a 1-shot prompt with the file path, error, and expected fix.
4. **Verify** — does it work? Yes/no. Run the same command or check that produced the error.

**Claude Code prompt pattern for simple fixes:**
```
claude -p "In <file_path>, <describe the issue>. Fix it by <expected change>. The file currently <current state>."
```

No planning mode needed. No regression check needed. Simple pass/fail verification.

## Medium Fix

Multi-file, clear failure mode, non-trivial root cause or fix path.

### Procedure

1. **Reproduce** — confirm the issue with exact error output or behavior.
2. **State expected outcome** — write down what "fixed" looks like before touching anything.
3. **Read relevant code** — do NOT limit to the file that errors. Trace the call chain, check imports, read related configs.
4. **Plan the fix** — identify all files that need changes and what each change is.
5. **Execute via Claude Code with planning mode:**
```
claude -p "

## Context
Project: <project_path>
Issue: <exact error or broken behavior>
Root cause: <what you found in step 3>

## Files involved
- <file1>: <what needs to change>
- <file2>: <what needs to change>

## Expected outcome
<from step 2>

Use /plan before writing any code. Verify the fix compiles/runs after changes.
"
```
6. **Verify** — reproduce the original test. Confirm the expected outcome matches.
7. **Check regressions** — run related tests or verify adjacent functionality was not broken.

## Heavy Fix

Systemic issue, deep root cause, may require architectural understanding.

### Procedure

1. **File a durable record** — call `memory_store("issue:<timestamp>", ...)` before doing anything else.
2. **Reproduce and document** — capture exact error, environment state, and reproduction steps.
3. **Route to heavy-task skill** — heavy fixes follow the same execution framework as heavy builds. Use `heavy-task` for GSD routing or Claude Code planning mode.
4. **Full verification** — the heavy-task skill's verification protocol applies.

## Reporting

- **Simple:** include in next summary as "fixed: [what]"
- **Medium:** include what was broken, what caused it, and what was changed
- **Heavy:** full report with root cause analysis
