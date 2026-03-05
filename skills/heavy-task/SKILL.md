---
name: heavy-task
description: GSD routing and execution for heavy/complex tasks. Detects whether a project uses GSD, routes to the correct command, or falls back to Claude Code planning mode. Activate for architectural changes, new systems, or multi-session work.
---

# Heavy Task

Execution framework for heavy-complexity work. Handles GSD project detection, command routing, and fallback to Claude Code for non-GSD projects.

## Step 1: GSD Detection

Before choosing an execution path, check the project:

```bash
ls <project_path>/.planning/ 2>/dev/null
```

**Decision:**
- `.planning/` exists → GSD project. Go to Step 2A.
- `.planning/` does not exist → check if GSD should be introduced. Go to Step 2B.

## Step 2A: GSD Project (`.planning/` exists)

Route to the correct GSD command based on the task:

| Scenario | GSD Command | When to use |
|----------|------------|-------------|
| Quick change within existing scope | `gsd:quick` | Task fits current milestone, small-to-medium scope, no new phases needed |
| New capability that fits current milestone | `gsd:insert-phase` | Task is a new phase within the active milestone |
| New major feature or direction | `gsd:new-milestone` | Task is large enough to be its own milestone |
| Need to understand what exists first | `gsd:progress` | Before deciding which command, check current state |

### Invocation

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

## Step 2B: Non-GSD Project

**Should GSD be introduced?**

| Condition | Decision |
|-----------|----------|
| New project + high complexity + expected long-term | Yes — use `gsd:new-project` to initialize |
| Existing project + no `.planning/` + complex task | No — use Claude Code with planning mode (do NOT introduce GSD) |
| One-off heavy task in any project | No — use Claude Code with planning mode |

### If introducing GSD:

```
cd <project_path>
claude
# Then: /gsd:new-project
# Follow GSD's project initialization flow
```

### If NOT introducing GSD (Claude Code fallback):

Use the medium-task procedure from the `coding-task` skill, with these additions for heavy work:

1. **Break it down first.** Before launching Claude Code, decompose the heavy task into discrete steps. Write them down.
2. **One session per step.** Do not try to accomplish everything in a single Claude Code session. Context rot is real.
3. **Planning mode is mandatory.** Every session starts with `/plan`.
4. **Session handoff.** At the end of each session, note:
   - What was completed
   - What remains
   - Any decisions made that affect the next step
   - File paths that the next session needs to read
5. **Store progress.** Call `memory_store("task:<project>:<step>", "<status and notes>")` between sessions.

### Claude Code prompt for heavy non-GSD tasks:

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

## Step 3: Verification

Heavy tasks require full verification regardless of executor (GSD or Claude Code):

1. **Functional test** — does the feature/change work as specified?
2. **Regression check** — do existing features still work? Run the project's test suite if one exists.
3. **Build check** — does the project compile/build without errors?
4. **Integration check** — if the change touches APIs, configs, or shared state, verify downstream consumers.

## Reporting

Heavy tasks get a full report to Enrique:

- What was the task
- What approach was taken (GSD or Claude Code)
- What was completed
- What remains (if multi-session)
- Any architectural decisions made
- Verification results
