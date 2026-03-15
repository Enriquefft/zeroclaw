#!/usr/bin/env bun
// bin/orchestrate.ts — Thin orchestration launcher
// Accepts a YAML job file or inline goal string, constructs an orchestrator
// prompt, and hands the entire task to Opus via `claude -p --model opus`.
// Output: JSON to stdout. Errors to stderr, exit 1.

import { $ } from "bun";
import { readFileSync, existsSync } from "fs";
import { basename, extname } from "path";
import YAML from "yaml";
import { initStateDb } from "./init-state-db.ts";
import { notify } from "./notify.ts";

// ---- Types ----

export interface OrchestrateYaml {
  goal: string;
  hints: string[] | null;
  notify: string | null;
  name: string | null;
}

export interface OrchestrateResult {
  success: boolean;
  parent_id: string;
  output?: string;
  error?: string;
}

export interface OrchestrateOptions {
  dbPath?: string;
  runner?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

// ---- Constants ----

const DEFAULT_DB_PATH = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const CLAUDE_BIN = `${Bun.env.HOME}/.local/bin/claude`;

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the orchestration engine for Kiro, Enrique's chief of staff. You are running as Claude Opus at max effort. Your job is to fully accomplish the goal given to you -- not to explain how, but to DO it.

## Identity

You ARE Kiro. Read IDENTITY.md and SOUL.md if you need voice or personality guidance. When drafting content or messages as Enrique, use his voice from SOUL.md -- never sound AI-generated.

## Execution Model

You receive a GOAL and optional HINTS. You must:
1. Decompose the goal into concrete sub-tasks
2. Execute each sub-task using the tools available to you
3. Review your own output for quality and completeness
4. Iterate if results are insufficient
5. Produce a final deliverable (not a plan, not an explanation)

Hints are guidance, not instructions. You decide order, parallelism, whether to skip a hint, and when to stop. If a hint is irrelevant to the current state, ignore it.

## Delegation via fast_run

You have a tool called fast_run_cli. Use it to delegate simple, tool-heavy sub-tasks to a faster model (GLM-5). fast_run is ideal for:
- Fetching and extracting data from web pages
- Reading files and extracting structured information
- Running database queries and returning results
- Collecting RSS feeds or search results
- Any task that is primarily I/O with minimal reasoning

Do NOT delegate to fast_run:
- Scoring or ranking that requires judgment
- Creative writing (drafts, content, outreach)
- Strategic decisions or analysis
- Review of sub-task output quality
- Anything requiring SOUL.md voice

When delegating, be specific. Give fast_run a complete, self-contained task description with all context it needs.

## Tools Available

You have full access to:
- **browser**: navigate, snapshot, click, fill, get_text, wait (use snapshot -i, NEVER screenshot)
- **email_cli**: list, read, send, search, thread, label, mark, trash across all accounts
- **calendar_cli**: events, create, update, delete, search, freebusy, conflicts, batch
- **form_filler**: extract, list, show, prepare, login, cookies bridge/clear
- **fast_run_cli**: delegate simple sub-tasks to GLM-5
- **Shell/Bash**: run commands, query SQLite, git operations, file I/O
- **Web search**: search the web for current information
- **kapso-whatsapp-cli**: send --to +NUMBER --text "message" (WhatsApp notifications)
- **SQLite**: state.db at ~/.zeroclaw/workspace/state.db (job_applications, freelance_leads, daily_state, content_log, orchestration_tasks, cron_log, notify_log, kv_store)

## Key Paths

- Documents: ~/.zeroclaw/documents/ (IDENTITY, SOUL, AGENTS, TOOLS, USER, LORE, SENTINEL, SKILL-CREATOR, TASK-ROUTING)
- Reference: ~/.zeroclaw/reference/ (full-profile.md, reusable-responses.md)
- State DB: ~/.zeroclaw/workspace/state.db
- Workspace: ~/.zeroclaw/workspace/

## Quality Standards

- NEVER send messages to third parties without Enrique's explicit prior approval
- Only send WhatsApp messages to Enrique at +51926689401
- When writing as Enrique: casual, direct, concise. No em dashes. No AI-speak. See SOUL.md Kill List.
- When producing job search deliverables: score against LORE.md rubric, deduplicate against state.db
- When producing content: check content_log for recent topics to avoid repetition
- Output SILENT (literally the word, alone on a line) if the task has no actionable results

## Failure Handling

- If a tool fails, retry once. If it fails again, note the failure and continue with remaining sub-tasks.
- If a critical sub-task fails (one that blocks all downstream work), stop and report what failed and why.
- Never silently swallow errors. Always surface what went wrong.
- If fast_run returns garbage or incomplete results, redo the sub-task yourself rather than delegating again.

## Completion

When finished, output a structured summary:
- What was accomplished (concrete deliverables)
- Counts: items found, filtered, scored, messages sent
- Any failures or skipped sub-tasks with reasons

Do NOT output a plan. Do NOT ask for permission. Execute the goal fully.`;

// ---- YAML parsing ----

function parseYamlFile(filePath: string): OrchestrateYaml {
  const content = readFileSync(filePath, "utf-8");
  const doc = YAML.parse(content);

  return {
    goal: doc.goal ?? "",
    hints: doc.hints ?? doc.steps ?? null,
    notify: doc.notify ?? null,
    name: doc.name ?? null,
  };
}

// ---- Prompt construction ----

function buildUserPrompt(goal: string, hints?: string[] | null): string {
  let prompt = `## Goal\n\n${goal}`;
  if (hints && hints.length > 0) {
    prompt += `\n\n## Hints\n\n${hints.map((h) => `- ${h}`).join("\n")}`;
  }
  return prompt;
}

// ---- Claude runner ----

async function defaultRunner(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const result =
    await $`env -u CLAUDECODE ${CLAUDE_BIN} -p --model opus --effort max --dangerously-skip-permissions --output-format text --system-prompt ${systemPrompt} ${userPrompt}`.text();
  return result.trim();
}

// ---- ID generation ----

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Core orchestration ----

export async function orchestrate(
  input: string,
  opts: OrchestrateOptions = {}
): Promise<OrchestrateResult> {
  const dbPath = opts.dbPath ?? DEFAULT_DB_PATH;
  const runner = opts.runner ?? defaultRunner;
  const startedAt = Date.now();

  // Determine if input is a YAML file or inline goal
  const isFile =
    (input.endsWith(".yaml") || input.endsWith(".yml")) && existsSync(input);

  let goal: string;
  let hints: string[] | null = null;
  let notifyRecipient: string | null = null;
  let jobName: string;

  if (isFile) {
    const parsed = parseYamlFile(input);
    if (!parsed.goal) {
      return { success: false, parent_id: "", error: "YAML missing required 'goal' field" };
    }
    goal = parsed.goal;
    hints = parsed.hints;
    notifyRecipient = parsed.notify;
    jobName = parsed.name ?? basename(input, extname(input));
  } else {
    goal = input;
    jobName = "inline-goal";
  }

  // Init DB and create parent row
  const db = initStateDb(dbPath);
  const parentId = newId();

  try {
    db.prepare(
      `INSERT INTO orchestration_tasks
         (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, yaml_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(parentId, goal, "running", startedAt, startedAt, null, 0, goal, isFile ? input : null);

    // Build prompts and run
    const userPrompt = buildUserPrompt(goal, hints);
    let output: string;

    try {
      output = await runner(ORCHESTRATOR_SYSTEM_PROMPT, userPrompt);
    } catch (e) {
      db.prepare(
        `UPDATE orchestration_tasks SET status = 'failed', updated_at = ? WHERE id = ?`
      ).run(Date.now(), parentId);

      const durationMs = Date.now() - startedAt;
      db.prepare(
        `INSERT INTO cron_log (job_name, started_at, duration_ms, success) VALUES (?, ?, ?, ?)`
      ).run(jobName, startedAt, durationMs, 0);

      const error = String(e);
      if (notifyRecipient) {
        notify(`Orchestration failed: ${goal}\n${error.slice(0, 500)}`, notifyRecipient).catch(() => {});
      }
      return { success: false, parent_id: parentId, error };
    }

    // Update parent status
    const isSilent = output.trim() === "SILENT" || output.trim().startsWith("SILENT\n");
    db.prepare(
      `UPDATE orchestration_tasks SET status = 'completed', step_output = ?, updated_at = ? WHERE id = ?`
    ).run(output.slice(0, 8192), Date.now(), parentId);

    // Log to cron_log
    const durationMs = Date.now() - startedAt;
    db.prepare(
      `INSERT INTO cron_log (job_name, started_at, duration_ms, success) VALUES (?, ?, ?, ?)`
    ).run(jobName, startedAt, durationMs, 1);

    // Notify (skip if SILENT)
    if (notifyRecipient && !isSilent) {
      const notifyMsg = output.length > 1500
        ? output.slice(0, 1497) + "..."
        : output;
      notify(notifyMsg, notifyRecipient).catch((e) => {
        console.error("orchestrate: notify failed:", e);
      });
    }

    return { success: true, parent_id: parentId, output: isSilent ? "SILENT" : undefined };
  } finally {
    db.close();
  }
}

// ---- CLI entrypoint ----

if (import.meta.main) {
  const args = process.argv.slice(2);

  const dbPathIdx = args.indexOf("--db-path");
  const dbPath = dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;
  const input = args.find(
    (a, i) => !a.startsWith("--") && !(i === dbPathIdx + 1 && dbPathIdx !== -1)
  );

  if (!input) {
    console.error("Usage: orchestrate.ts <yaml-path-or-goal-string> [--db-path <path>]");
    process.exit(1);
  }

  try {
    const result = await orchestrate(input, { dbPath });
    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
  } catch (e) {
    console.error(JSON.stringify({ error: String(e) }));
    process.exit(1);
  }
}
