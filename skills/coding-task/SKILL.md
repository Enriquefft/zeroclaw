---
name: coding-task
description: Structured Claude Code invocation for features, refactors, and general coding work. Tiered by complexity (simple/medium). Activate for any build task — not fixes (use fix-task for those).
---

# Coding Task

Structured procedure for executing coding work via Claude Code. Features, refactors, new components, integrations. Follow the tier matching the complexity classification from AGENTS.md Task Routing.

## Context Gathering Checklist

Before launching ANY Claude Code session (medium or above), gather:

- [ ] **Project path** — absolute path to the project root
- [ ] **Current state** — what exists now (relevant files, current behavior)
- [ ] **Goal** — what the end state should look like (specific, testable)
- [ ] **Relevant files** — list file paths that Claude Code must read (do not rely on it finding them)
- [ ] **Constraints** — framework version, style conventions, existing patterns to follow
- [ ] **Test criteria** — how to verify success (command to run, expected output, behavior to check)

## Simple Task

Single file or small addition, clear outcome.

### Procedure

1. Identify the file(s) and what needs to change.
2. Launch Claude Code with a 1-shot prompt:
```
claude -p "In <project_path>, <what to do>. File: <file_path>. <any constraints>."
```
3. Verify: does the change work? Quick functional check.

No planning mode. No elaborate context. Get in, make the change, verify, done.

## Medium Task

Multi-file, clear requirements, non-trivial execution.

### Procedure

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

### Key rules for medium tasks

- **ALWAYS** use Claude planning mode. A medium task without a plan is a recipe for rework.
- **ALWAYS** include file paths in the prompt. Never say "find the relevant file" — tell Claude Code exactly which files matter.
- **NEVER** use a vague prompt like "add feature X to this project." Always include current state, files, and success criteria.

## Heavy Task

Architectural, multi-session, or long-term work.

### Procedure

Route to the `heavy-task` skill. Heavy coding tasks follow the GSD detection and execution framework defined there.

## Prompt Anti-Patterns

Never do these:

| Anti-pattern | Why it fails | Do this instead |
|-------------|-------------|-----------------|
| "Fix the tests" | No context, no file paths | "In `<path>`, test `<name>` fails with `<error>`. The test expects `<X>` but gets `<Y>`." |
| "Add a login page" | No stack, no constraints, no files | Full medium-task prompt with framework, existing auth files, and success criteria |
| "Refactor this to be cleaner" | Subjective, no testable outcome | "Extract `<function>` from `<file>` into `<new_file>`, update imports in `<files>`, verify tests pass" |
| Skipping planning mode for multi-file changes | Context rot mid-session | Always use `/plan` for 2+ file changes |
