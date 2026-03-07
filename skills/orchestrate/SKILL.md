---
name: orchestrate
description: Run multi-step tasks via claude -p. Supports inline goals, YAML job files, and status tracking.
---

# Orchestrate

Run, monitor, and manage multi-step orchestrated tasks. Each task is decomposed into sequential subtasks executed via claude -p with automatic checkpointing.

## When to Use

- Running a complex multi-step task that needs LLM reasoning at each step
- Checking status of running or completed orchestration tasks
- Canceling a stuck orchestration run

## CLI Reference

### orchestrate run <target>
Run an orchestration task. Target can be:
- A YAML file path: `orchestrate run /etc/nixos/zeroclaw/cron/jobs/daily-briefing.yaml`
- An inline goal string: `orchestrate run "Summarize today's emails and calendar"`

For inline goals, a temporary YAML is created and passed to the engine.

### orchestrate status [parent-id]
Show status of orchestration tasks. Without ID, shows recent runs. With ID, shows subtask detail.

### orchestrate list
List all orchestration runs with their status, step count, and timestamps.

### orchestrate cancel <parent-id>
Cancel a running orchestration by marking its pending steps as cancelled.
