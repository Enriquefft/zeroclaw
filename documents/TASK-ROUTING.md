# Task Routing

Procedures for executing coding work and fixes via Claude Code. Route here after classifying complexity in AGENTS.md Task Routing.

## Routing Decision

1. Is it a fix (something broken) or a build (feature, refactor, new code)?
2. Classify complexity: simple, medium, or heavy.
3. Route:
   - Fixes → Fix procedures below (all tiers)
   - Builds, simple/medium → Coding procedures below
   - Heavy (fix or build) → Heavy procedures below

## Coding Tasks

### Context Gathering Checklist

Before launching ANY Claude Code session (medium or above), gather:

- [ ] **Project path** — absolute path to the project root
- [ ] **Current state** — what exists now (relevant files, current behavior)
- [ ] **Goal** — what the end state should look like (specific, testable)
- [ ] **Relevant files** — list file paths that Claude Code must read (do not rely on it finding them)
- [ ] **Constraints** — framework version, style conventions, existing patterns to follow
- [ ] **Test criteria** — how to verify success (command to run, expected output, behavior to check)

### Simple Coding Task

Single file or small addition, clear outcome.

1. Identify the file(s) and what needs to change.
2. Launch Claude Code with a 1-shot prompt:
```
claude -p "In <project_path>, <what to do>. File: <file_path>. <any constraints>."
```
3. Verify: does the change work? Quick functional check.

No planning mode. No elaborate context. Get in, make the change, verify, done.

### Medium Coding Task

Multi-file, clear requirements, non-trivial execution.

1. **Gather context** — complete the checklist above.
2. **Launch Claude Code with planning mode:**
```
claude -p "

## Task
<clear description of what to build/change>

## Project
Path: <project_path>
Framework/stack: <if relevant>

## Current state
<what exists now, relevant to this task>

## Files to read first
- <file1> — <why it is relevant>
- <file2> — <why it is relevant>

## Constraints
- <pattern to follow, e.g., 'follow the pattern in <existing_file>'>
- <style/convention requirements>

## Success criteria
- <specific testable outcome 1>
- <specific testable outcome 2>

Use /plan before writing any code.
"
```
3. **Verify** — run the success criteria checks. Confirm each one passes.
4. **Review** — skim the changes to confirm they follow the stated constraints.

**Key rules for medium tasks:**
- **ALWAYS** use Claude planning mode. A medium task without a plan is a recipe for rework.
- **ALWAYS** include file paths in the prompt. Never say "find the relevant file" — tell Claude Code exactly which files matter.
- **NEVER** use a vague prompt like "add feature X to this project." Always include current state, files, and success criteria.

### Prompt Anti-Patterns

Never do these:

| Anti-pattern | Why it fails | Do this instead |
|-------------|-------------|-----------------|
| "Fix the tests" | No context, no file paths | "In `<path>`, test `<name>` fails with `<error>`. The test expects `<X>` but gets `<Y>`." |
| "Add a login page" | No stack, no constraints, no files | Full medium-task prompt with framework, existing auth files, and success criteria |
| "Refactor this to be cleaner" | Subjective, no testable outcome | "Extract `<function>` from `<file>` into `<new_file>`, update imports in `<files>`, verify tests pass" |
| Skipping planning mode for multi-file changes | Context rot mid-session | Always use `/plan` for 2+ file changes |

## Fix Tasks

### Anti-Hallucination Principles

These apply to ALL tiers. Violating any of these invalidates the fix.

1. **Never fix based on assumption.** Always read the failing code, config, or log FIRST.
2. **Reproduce or confirm the issue** before attempting anything. If you cannot reproduce it, state that explicitly and gather more information.
3. **State the expected outcome** before starting the fix. After the fix, verify against that stated outcome — not a vague sense of "it works."
4. **Read before touching.** Open the relevant file(s) and understand the current state before making any change.

### Simple Fix

Single file, <~10 lines, deterministic outcome, reversible.

1. **Reproduce** — confirm the issue exists (run the command, read the error, check the log).
2. **Read** — open the file that needs changing. Understand the immediate context.
3. **Fix** — make the change. For Claude Code: use a 1-shot prompt with the file path, error, and expected fix.
4. **Verify** — does it work? Yes/no. Run the same command or check that produced the error.

**Claude Code prompt pattern for simple fixes:**
```
claude -p "In <file_path>, <describe the issue>. Fix it by <expected change>. The file currently <current state>."
```

No planning mode needed. No regression check needed. Simple pass/fail verification.

### Medium Fix

Multi-file, clear failure mode, non-trivial root cause or fix path.

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

### Heavy Fix

Systemic issue, deep root cause, may require architectural understanding.

1. **File a durable record** — call `memory_store("issue:<timestamp>", ...)` before doing anything else.
2. **Reproduce and document** — capture exact error, environment state, and reproduction steps.
3. **Route to heavy task procedures** — heavy fixes follow the same execution framework as heavy builds. Use the Heavy Tasks section below for GSD routing or Claude Code planning mode.
4. **Full verification** — the heavy task verification protocol applies.

## Heavy Tasks (Build or Fix)

Execution framework for heavy-complexity work. Handles GSD project detection, command routing, and fallback to Claude Code for non-GSD projects.

### Step 1: GSD Detection

Before choosing an execution path, check the project:

```bash
ls <project_path>/.planning/ 2>/dev/null
```

**Decision:**
- `.planning/` exists → GSD project. Go to Step 2A.
- `.planning/` does not exist → check if GSD should be introduced. Go to Step 2B.

### Step 2A: GSD Project (`.planning/` exists)

Route to the correct GSD command based on the task:

| Scenario | GSD Command | When to use |
|----------|------------|-------------|
| Quick change within existing scope | `gsd:quick` | Task fits current milestone, small-to-medium scope, no new phases needed |
| New capability that fits current milestone | `gsd:insert-phase` | Task is a new phase within the active milestone |
| New major feature or direction | `gsd:new-milestone` | Task is large enough to be its own milestone |
| Need to understand what exists first | `gsd:progress` | Before deciding which command, check current state |

**Invocation:**

Launch Claude Code in the project directory with the GSD slash command:

```
cd <project_path>
claude
# Then use the appropriate GSD command:
# /gsd:quick "<task description>"
# /gsd:insert-phase
# /gsd:new-milestone "<milestone description>"
```

GSD manages its own planning, execution, and verification. Follow GSD's output and state tracking.

### Step 2B: Non-GSD Project

**Should GSD be introduced?**

| Condition | Decision |
|-----------|----------|
| New project + high complexity + expected long-term | Yes — use `gsd:new-project` to initialize |
| Existing project + no `.planning/` + complex task | No — use Claude Code with planning mode (do NOT introduce GSD) |
| One-off heavy task in any project | No — use Claude Code with planning mode |

**If introducing GSD:**

```
cd <project_path>
claude
# Then: /gsd:new-project
# Follow GSD's project initialization flow
```

**If NOT introducing GSD (Claude Code fallback):**

Use the medium coding task procedure above, with these additions for heavy work:

1. **Break it down first.** Before launching Claude Code, decompose the heavy task into discrete steps. Write them down.
2. **One session per step.** Do not try to accomplish everything in a single Claude Code session. Context rot is real.
3. **Planning mode is mandatory.** Every session starts with `/plan`.
4. **Session handoff.** At the end of each session, note:
   - What was completed
   - What remains
   - Any decisions made that affect the next step
   - File paths that the next session needs to read
5. **Store progress.** Call `memory_store("task:<project>:<step>", "<status and notes>")` between sessions.

**Claude Code prompt for heavy non-GSD tasks:**

```
claude -p "

## Task (Step N of M)
<what this specific step accomplishes>

## Overall goal
<brief description of the full task for context>

## Previous steps completed
- Step 1: <what was done>
- Step 2: <what was done>

## This step
<detailed description>

## Files to read first
- <file1> — <why>
- <file2> — <why>

## Success criteria for this step
- <testable outcome>

Use /plan before writing any code.
"
```

### Verification

Heavy tasks require full verification regardless of executor (GSD or Claude Code):

1. **Functional test** — does the feature/change work as specified?
2. **Regression check** — do existing features still work? Run the project's test suite if one exists.
3. **Build check** — does the project compile/build without errors?
4. **Integration check** — if the change touches APIs, configs, or shared state, verify downstream consumers.

## Reporting

- **Simple:** include in next summary as "fixed: [what]"
- **Medium:** include what was broken, what caused it, and what was changed
- **Heavy:** full report to Enrique:
  - What was the task
  - What approach was taken (GSD or Claude Code)
  - What was completed
  - What remains (if multi-session)
  - Any architectural decisions made
  - Verification results
