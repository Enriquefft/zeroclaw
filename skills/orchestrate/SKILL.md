---
name: orchestrate
description: Escalate complex tasks to Opus. Use when a task needs deep reasoning, multi-step execution, scoring, creative drafting, or coordination across multiple tools.
---

# Orchestrate

Escalate complex tasks to the Opus orchestrator. This is the universal path to high-effort reasoning for any task that needs it -- scheduled (cron), interactive (chat), or on-demand (CLI).

## When to Use

Escalate via `orchestrate_cli run` when the task requires:
- Multi-tool coordination (browser + email + database + notification)
- Scoring or ranking with judgment (job leads, content quality)
- Creative writing in Enrique's voice (outreach, content drafts)
- Multi-step analysis (company research, interview prep)
- Strategic decisions that need context from multiple sources

## When NOT to Use

Do NOT escalate for:
- Simple factual lookups (use web search directly)
- Single-tool operations (one email send, one calendar query)
- File reading or data extraction (use fast_run_cli instead)
- Quick status checks (use the status/list subcommands)

## CLI Reference

### orchestrate_cli run <target>
Launch the Opus orchestrator for a task. Target can be:
- A YAML file path: `orchestrate_cli run /etc/nixos/zeroclaw/cron/jobs/job-scanner.yaml`
- An inline goal string: `orchestrate_cli run "Prep me for interview at Anthropic"`

Opus receives the goal and optional hints, decomposes the task, executes sub-tasks using all available tools, and returns a structured summary.

### orchestrate_cli status [parent-id]
Show status of orchestration tasks. Without ID, shows recent runs. With ID, shows detail.

### orchestrate_cli list
List all orchestration runs with status and timestamps.

### orchestrate_cli cancel <parent-id>
Cancel a running orchestration by marking it as cancelled.

### orchestrate_cli checkpoint <parent-id> <note>
Save a progress marker for a running task.

### orchestrate_cli complete <parent-id>
Explicitly mark a task as completed.

### orchestrate_cli fail <parent-id> <error>
Explicitly mark a task as failed with an error message.
