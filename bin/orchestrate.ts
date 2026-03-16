#!/usr/bin/env bun
// bin/orchestrate.ts — Orchestration launcher with enqueue/worker modes
// Accepts a YAML job file or inline goal string, constructs an orchestrator
// prompt, and hands the entire task to Opus via `claude -p --model opus`.
//
// Modes:
//   orchestrate.ts <yaml-or-goal>              sync (existing behavior)
//   orchestrate.ts --enqueue <yaml-or-goal>    fast: insert queued row, spawn detached worker, exit 0
//   orchestrate.ts --work [--once]             worker: claim queued task, run opus, log result
//
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
  status?: string;
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
const MAX_CONCURRENT = 2;
const STALE_THRESHOLD_MS = 45 * 60 * 1000; // 45 min

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
- **SQLite**: state.db at ~/.zeroclaw/workspace/state.db (job_applications, freelance_leads, daily_state, content_log, orchestration_tasks, cron_log, notify_log, kv_store)

## Key Paths

- Documents: ~/.zeroclaw/documents/ (IDENTITY, SOUL, AGENTS, TOOLS, USER, LORE, SENTINEL, SKILL-CREATOR, TASK-ROUTING)
- Reference: ~/.zeroclaw/reference/ (full-profile.md, reusable-responses.md)
- State DB: ~/.zeroclaw/workspace/state.db
- Workspace: ~/.zeroclaw/workspace/

## Quality Standards

- NEVER send messages to third parties without Enrique's explicit prior approval
- Do NOT send WhatsApp messages yourself. Your text output is automatically delivered via the orchestrator's notify system. Just produce well-formatted output
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
- Counts: items found, filtered, scored
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

// ---- Parse input into goal/hints/notify/jobName ----

interface ParsedInput {
  goal: string;
  hints: string[] | null;
  notifyRecipient: string | null;
  jobName: string;
  yamlSource: string | null;
}

function parseInput(input: string): ParsedInput | { error: string } {
  const looksLikeYaml = input.endsWith(".yaml") || input.endsWith(".yml");
  const isFile = looksLikeYaml && existsSync(input);

  if (looksLikeYaml && !isFile) {
    return { error: `YAML file not found: ${input}` };
  }

  if (isFile) {
    const parsed = parseYamlFile(input);
    if (!parsed.goal) {
      return { error: "YAML missing required 'goal' field" };
    }
    return {
      goal: parsed.goal,
      hints: parsed.hints,
      notifyRecipient: parsed.notify,
      jobName: parsed.name ?? basename(input, extname(input)),
      yamlSource: input,
    };
  }

  return {
    goal: input,
    hints: null,
    notifyRecipient: null,
    jobName: "inline-goal",
    yamlSource: null,
  };
}

// ---- PID liveness check ----

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---- Core orchestration (sync mode — original behavior) ----

export async function orchestrate(
  input: string,
  opts: OrchestrateOptions = {}
): Promise<OrchestrateResult> {
  const dbPath = opts.dbPath ?? DEFAULT_DB_PATH;
  const runner = opts.runner ?? defaultRunner;
  const startedAt = Date.now();

  const parsed = parseInput(input);
  if ("error" in parsed) {
    return { success: false, parent_id: "", error: parsed.error };
  }

  const { goal, hints, notifyRecipient, jobName, yamlSource } = parsed;

  // Init DB and create parent row
  const db = initStateDb(dbPath);
  const parentId = newId();

  try {
    db.prepare(
      `INSERT INTO orchestration_tasks
         (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, yaml_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(parentId, goal, "running", startedAt, startedAt, null, 0, goal, yamlSource);

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

// ---- Enqueue mode ----

export async function enqueue(
  input: string,
  opts: OrchestrateOptions = {}
): Promise<OrchestrateResult> {
  const dbPath = opts.dbPath ?? DEFAULT_DB_PATH;

  const parsed = parseInput(input);
  if ("error" in parsed) {
    return { success: false, parent_id: "", error: parsed.error };
  }

  const { goal, hints, notifyRecipient, jobName, yamlSource } = parsed;

  const db = initStateDb(dbPath);
  const parentId = newId();
  const now = Date.now();

  try {
    db.prepare(
      `INSERT INTO orchestration_tasks
         (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, yaml_source, queued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(parentId, goal, "queued", now, now, null, 0, goal, yamlSource, now);
  } finally {
    db.close();
  }

  // Spawn detached worker
  const thisFile = import.meta.path;
  const workerArgs = ["run", thisFile, "--work", "--once"];
  if (dbPath !== DEFAULT_DB_PATH) {
    workerArgs.push("--db-path", dbPath);
  }
  const child = Bun.spawn(["bun", ...workerArgs], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();

  return { success: true, parent_id: parentId, status: "queued" };
}

// ---- Worker mode ----

export async function work(
  opts: OrchestrateOptions & { once?: boolean } = {}
): Promise<void> {
  const dbPath = opts.dbPath ?? DEFAULT_DB_PATH;
  const runner = opts.runner ?? defaultRunner;

  const loop = true;
  while (loop) {
    const db = initStateDb(dbPath);

    try {
      // Concurrency gate
      const active = db.query(
        `SELECT COUNT(*) as cnt FROM orchestration_tasks WHERE status IN ('picked','running')`
      ).get() as { cnt: number };

      if (active.cnt >= MAX_CONCURRENT) {
        break;
      }

      // Orphan sweep — mark stale running/picked rows as failed
      const now = Date.now();
      const staleThreshold = now - STALE_THRESHOLD_MS;
      const staleRows = db.query(
        `SELECT id, pid FROM orchestration_tasks
         WHERE status IN ('picked','running')
           AND started_work_at IS NOT NULL
           AND started_work_at < ?`
      ).all(staleThreshold) as { id: string; pid: number | null }[];

      for (const row of staleRows) {
        if (row.pid && isPidAlive(row.pid)) continue;
        db.prepare(
          `UPDATE orchestration_tasks SET status = 'failed',
            step_output = 'orphaned: stale worker (pid dead or threshold exceeded)',
            updated_at = ? WHERE id = ?`
        ).run(now, row.id);
      }

      // Claim next queued task
      const task = db.query(
        `SELECT id, description, parent_goal, yaml_source FROM orchestration_tasks
         WHERE status = 'queued' ORDER BY queued_at ASC LIMIT 1`
      ).get() as { id: string; description: string; parent_goal: string; yaml_source: string | null } | null;

      if (!task) break;

      db.prepare(
        `UPDATE orchestration_tasks SET status = 'picked', pid = ?, started_work_at = ?, updated_at = ? WHERE id = ?`
      ).run(process.pid, now, now, task.id);

      // Parse the original input to get hints/notify/jobName
      let hints: string[] | null = null;
      let notifyRecipient: string | null = null;
      let jobName: string;

      if (task.yaml_source && existsSync(task.yaml_source)) {
        const parsed = parseYamlFile(task.yaml_source);
        hints = parsed.hints;
        notifyRecipient = parsed.notify;
        jobName = parsed.name ?? basename(task.yaml_source, extname(task.yaml_source));
      } else {
        jobName = "inline-goal";
      }

      const goal = task.parent_goal ?? task.description;

      // Update to running
      db.prepare(
        `UPDATE orchestration_tasks SET status = 'running', updated_at = ? WHERE id = ?`
      ).run(Date.now(), task.id);

      const startedAt = Date.now();

      // Execute
      const userPrompt = buildUserPrompt(goal, hints);
      let output: string;

      try {
        output = await runner(ORCHESTRATOR_SYSTEM_PROMPT, userPrompt);
      } catch (e) {
        db.prepare(
          `UPDATE orchestration_tasks SET status = 'failed', updated_at = ? WHERE id = ?`
        ).run(Date.now(), task.id);

        const durationMs = Date.now() - startedAt;
        db.prepare(
          `INSERT INTO cron_log (job_name, started_at, duration_ms, success) VALUES (?, ?, ?, ?)`
        ).run(jobName, startedAt, durationMs, 0);

        const error = String(e);
        if (notifyRecipient) {
          notify(`Orchestration failed: ${goal}\n${error.slice(0, 500)}`, notifyRecipient).catch(() => {});
        }

        if (opts.once) break;
        continue;
      }

      // Update status
      const isSilent = output.trim() === "SILENT" || output.trim().startsWith("SILENT\n");
      db.prepare(
        `UPDATE orchestration_tasks SET status = 'completed', step_output = ?, updated_at = ? WHERE id = ?`
      ).run(output.slice(0, 8192), Date.now(), task.id);

      const durationMs = Date.now() - startedAt;
      db.prepare(
        `INSERT INTO cron_log (job_name, started_at, duration_ms, success) VALUES (?, ?, ?, ?)`
      ).run(jobName, startedAt, durationMs, 1);

      if (notifyRecipient && !isSilent) {
        const notifyMsg = output.length > 1500
          ? output.slice(0, 1497) + "..."
          : output;
        notify(notifyMsg, notifyRecipient).catch((e) => {
          console.error("orchestrate: notify failed:", e);
        });
      }
    } finally {
      db.close();
    }

    if (opts.once) break;
  }
}

// ---- CLI entrypoint ----

if (import.meta.main) {
  const args = process.argv.slice(2);

  const hasEnqueue = args.includes("--enqueue");
  const hasWork = args.includes("--work");
  const hasOnce = args.includes("--once");

  const dbPathIdx = args.indexOf("--db-path");
  const dbPath = dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;

  // Filter out flags and --db-path value to find the positional input
  const flagSet = new Set(["--enqueue", "--work", "--once", "--db-path"]);
  const input = args.find(
    (a, i) => !flagSet.has(a) && !(i === dbPathIdx + 1 && dbPathIdx !== -1)
  );

  if (hasWork) {
    // Worker mode
    await work({ dbPath, once: hasOnce });
    process.exit(0);
  }

  if (!input) {
    console.error("Usage: orchestrate.ts [--enqueue] <yaml-path-or-goal-string> [--db-path <path>]");
    console.error("       orchestrate.ts --work [--once] [--db-path <path>]");
    process.exit(1);
  }

  try {
    if (hasEnqueue) {
      const result = await enqueue(input, { dbPath });
      console.log(JSON.stringify(result));
      process.exit(result.success ? 0 : 1);
    } else {
      const result = await orchestrate(input, { dbPath });
      console.log(JSON.stringify(result));
      process.exit(result.success ? 0 : 1);
    }
  } catch (e) {
    console.error(JSON.stringify({ error: String(e) }));
    process.exit(1);
  }
}
