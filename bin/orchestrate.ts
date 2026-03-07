#!/usr/bin/env bun
// bin/orchestrate.ts — Orchestration engine
// Reads YAML job definitions, decomposes goals into sequential subtasks,
// executes each via claude -p (or injected runner for testing), and
// checkpoints progress to state.db.
// Output: JSON to stdout. Errors to stderr, exit 1.

import { $ } from "bun";
import { readFileSync, existsSync } from "fs";
import { basename, extname } from "path";
import { initStateDb } from "./init-state-db.ts";
import { notify } from "./notify.ts";

// ---- Types ----

export interface OrchestrateYaml {
  goal: string;
  steps: string[] | null;
  notify: string | null;
  name: string | null;
}

export interface OrchestrateResult {
  success: boolean;
  steps_run: number;
  parent_id: string;
  error?: string;
}

export interface OrchestrateOptions {
  dbPath?: string;
  runner?: (prompt: string) => Promise<string>;
}

// ---- Constants ----

const DEFAULT_DB_PATH = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const RESUME_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_STEP_OUTPUT_BYTES = 8192; // 8KB truncation limit

// ---- YAML parsing ----

/**
 * Parse a YAML string and extract orchestration fields.
 * Uses simple regex/line matching — avoids yq dependency.
 */
export function parseYaml(yaml: string): OrchestrateYaml {
  const lines = yaml.split("\n");

  // Extract single-line scalar fields
  function extractScalar(key: string): string | null {
    const re = new RegExp(`^${key}:\\s*(.+)$`);
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m[1].trim().replace(/^["']|["']$/g, ""); // strip surrounding quotes
    }
    return null;
  }

  // Extract steps array — lines indented under `steps:` key starting with `- `
  function extractSteps(): string[] | null {
    let inSteps = false;
    const steps: string[] = [];

    for (const line of lines) {
      // Detect `steps:` key (with optional trailing whitespace)
      if (/^steps:\s*$/.test(line.trim()) || line.trim() === "steps:") {
        inSteps = true;
        continue;
      }

      if (inSteps) {
        // Stop when we hit another top-level key (non-indented, non-empty, not a list item)
        if (/^\w/.test(line) && !line.startsWith(" ") && !line.startsWith("\t")) {
          break;
        }

        // Match list items: `  - "text"` or `  - text`
        const itemMatch = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
        if (itemMatch) {
          steps.push(itemMatch[1]);
        }
      }
    }

    return steps.length > 0 ? steps : null;
  }

  return {
    goal: extractScalar("goal") ?? "",
    steps: extractSteps(),
    notify: extractScalar("notify"),
    name: extractScalar("name"),
  };
}

// ---- Claude -p runner ----

/**
 * Default production runner: calls `claude -p` with the given prompt.
 * Strips CLAUDECODE env var so claude doesn't refuse to run.
 */
async function defaultRunner(prompt: string): Promise<string> {
  const result =
    await $`env -u CLAUDECODE $HOME/.local/bin/claude -p --dangerously-skip-permissions --output-format text ${prompt}`.text();
  return result.trim();
}

// ---- ID generation ----

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Core orchestration ----

/**
 * Run a single subtask step with one retry on failure.
 * Returns { output, success, error }.
 */
async function runWithRetry(
  prompt: string,
  runner: (p: string) => Promise<string>
): Promise<{ output: string; success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const output = await runner(prompt);
      return { output, success: true };
    } catch (e) {
      if (attempt === 2) {
        return { output: "", success: false, error: String(e) };
      }
      // First attempt failed — retry once
    }
  }
  return { output: "", success: false, error: "unexpected" };
}

/**
 * Truncate string to at most maxBytes UTF-8 bytes.
 */
function truncate(s: string, maxBytes: number): string {
  if (s.length <= maxBytes) return s;
  return s.slice(0, maxBytes);
}

/**
 * Main orchestration function.
 *
 * @param yamlPath - Absolute path to YAML job definition file
 * @param opts     - Optional overrides: dbPath, runner (for testing)
 * @returns OrchestrateResult with success, steps_run, parent_id, and optional error
 */
export async function orchestrate(
  yamlPath: string,
  opts: OrchestrateOptions = {}
): Promise<OrchestrateResult> {
  const dbPath = opts.dbPath ?? DEFAULT_DB_PATH;
  const runner = opts.runner ?? defaultRunner;

  const startedAt = Date.now();

  // ---- Read YAML ----
  if (!existsSync(yamlPath)) {
    return {
      success: false,
      steps_run: 0,
      parent_id: "",
      error: `YAML file not found: ${yamlPath}`,
    };
  }

  let parsed: OrchestrateYaml;
  try {
    const content = readFileSync(yamlPath, "utf-8");
    parsed = parseYaml(content);
  } catch (e) {
    return {
      success: false,
      steps_run: 0,
      parent_id: "",
      error: `Failed to read YAML: ${String(e)}`,
    };
  }

  if (!parsed.goal) {
    return {
      success: false,
      steps_run: 0,
      parent_id: "",
      error: "YAML missing required 'goal' field",
    };
  }

  const jobName =
    parsed.name ?? basename(yamlPath, extname(yamlPath));
  const steps = parsed.steps;

  if (!steps || steps.length === 0) {
    // No explicit steps — would call claude -p to decompose. For now, error.
    // (Auto-decomposition is a future enhancement; plan requires explicit steps for cron use.)
    return {
      success: false,
      steps_run: 0,
      parent_id: "",
      error: "YAML missing 'steps' field — auto-decomposition not yet implemented",
    };
  }

  // ---- Init DB ----
  const db = initStateDb(dbPath);

  try {
    // ---- Resume check ----
    const resumeWindowStart = Date.now() - RESUME_WINDOW_MS;
    const existingParent = db
      .query(
        `SELECT id, created_at FROM orchestration_tasks
         WHERE yaml_source = ? AND status = 'running' AND parent_id IS NULL
           AND created_at >= ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(yamlPath, resumeWindowStart) as {
      id: string;
      created_at: number;
    } | null;

    let parentId: string;
    let resuming = false;
    let completedStepOutputs: string[] = [];

    if (existingParent) {
      // Resume: reuse existing parent
      parentId = existingParent.id;
      resuming = true;

      // Collect outputs from completed steps (for context chaining)
      const completedSubtasks = db
        .query(
          `SELECT step_index, step_output FROM orchestration_tasks
           WHERE parent_id = ? AND status = 'completed'
           ORDER BY step_index`
        )
        .all(parentId) as { step_index: number; step_output: string | null }[];

      for (const sub of completedSubtasks) {
        completedStepOutputs[sub.step_index] = sub.step_output ?? "";
      }
    } else {
      // Fresh start
      parentId = newId();
      db.prepare(
        `INSERT INTO orchestration_tasks
           (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, yaml_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        parentId,
        parsed.goal,
        "running",
        Date.now(),
        Date.now(),
        null,
        0,
        parsed.goal,
        yamlPath
      );
    }

    // ---- Determine start step ----
    let startStep = 0;
    if (resuming) {
      // Find the first step that is NOT completed
      const completedIndices = new Set(
        (
          db
            .query(
              `SELECT step_index FROM orchestration_tasks
               WHERE parent_id = ? AND status = 'completed'`
            )
            .all(parentId) as { step_index: number }[]
        ).map((r) => r.step_index)
      );
      while (startStep < steps.length && completedIndices.has(startStep)) {
        startStep++;
      }
    }

    // ---- Execution loop ----
    let stepsRun = 0;
    let finalSuccess = true;
    let failureError: string | undefined;
    let failedStepDescription: string | undefined;
    let failedStepIndex: number | undefined;

    // Accumulated context from all steps (including resumed completed ones)
    let contextText = completedStepOutputs.filter(Boolean).join("\n\n");

    for (let i = startStep; i < steps.length; i++) {
      const step = steps[i];

      // Build prompt: step description + context from previous steps
      const prompt =
        contextText.length > 0
          ? `${step}\n\nContext from previous steps:\n${contextText}`
          : step;

      // ---- Checkpoint: insert subtask row BEFORE calling runner ----
      const subtaskId = newId();
      const existingSubtask = db
        .query(
          `SELECT id FROM orchestration_tasks WHERE parent_id = ? AND step_index = ?`
        )
        .get(parentId, i) as { id: string } | null;

      let activeSubtaskId: string;

      if (existingSubtask) {
        // Resuming a previously failed step — update its status to running
        activeSubtaskId = existingSubtask.id;
        db.prepare(
          `UPDATE orchestration_tasks SET status = 'running', updated_at = ? WHERE id = ?`
        ).run(Date.now(), activeSubtaskId);
      } else {
        activeSubtaskId = subtaskId;
        db.prepare(
          `INSERT INTO orchestration_tasks
             (id, description, status, created_at, updated_at, parent_id, step_index)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          activeSubtaskId,
          step,
          "pending",
          Date.now(),
          Date.now(),
          parentId,
          i
        );
      }

      // ---- Run subtask with retry ----
      const { output, success, error } = await runWithRetry(prompt, runner);
      stepsRun++;

      if (success) {
        const truncatedOutput = truncate(output, MAX_STEP_OUTPUT_BYTES);
        db.prepare(
          `UPDATE orchestration_tasks
           SET status = 'completed', step_output = ?, updated_at = ? WHERE id = ?`
        ).run(truncatedOutput, Date.now(), activeSubtaskId);

        // Accumulate context for next step
        contextText =
          contextText.length > 0
            ? `${contextText}\n\n${truncatedOutput}`
            : truncatedOutput;
      } else {
        db.prepare(
          `UPDATE orchestration_tasks SET status = 'failed', updated_at = ? WHERE id = ?`
        ).run(Date.now(), activeSubtaskId);
        finalSuccess = false;
        failureError = error;
        failedStepDescription = step;
        failedStepIndex = i;
        break; // Stop after first permanent failure
      }
    }

    // ---- Update parent status ----
    db.prepare(
      `UPDATE orchestration_tasks SET status = ?, updated_at = ? WHERE id = ?`
    ).run(
      finalSuccess ? "completed" : "failed",
      Date.now(),
      parentId
    );

    // ---- Dual logging: insert into cron_log ----
    const durationMs = Date.now() - startedAt;
    db.prepare(
      `INSERT INTO cron_log (job_name, started_at, duration_ms, success)
       VALUES (?, ?, ?, ?)`
    ).run(jobName, startedAt, durationMs, finalSuccess ? 1 : 0);

    // ---- Notification ----
    if (parsed.notify) {
      const notifyMsg = finalSuccess
        ? `Orchestration complete: ${parsed.goal} (${stepsRun} steps)`
        : `Orchestration failed at step ${(failedStepIndex ?? 0) + 1}: ${failedStepDescription ?? "unknown step"}`;

      // Fire-and-forget — don't let notification failure affect result
      notify(notifyMsg, parsed.notify).catch((e) => {
        console.error("orchestrate: notify failed:", e);
      });
    }

    if (finalSuccess) {
      return { success: true, steps_run: stepsRun, parent_id: parentId };
    } else {
      return {
        success: false,
        steps_run: stepsRun,
        parent_id: parentId,
        error: failureError ?? "step failed",
      };
    }
  } finally {
    db.close();
  }
}

// ---- CLI entrypoint ----

if (import.meta.main) {
  const args = process.argv.slice(2);

  // Parse --db-path <path> (for test isolation, same pattern as notify.ts)
  const dbPathIdx = args.indexOf("--db-path");
  const dbPath =
    dbPathIdx !== -1 ? args[dbPathIdx + 1] : undefined;
  const yamlPath = args.find((a) => !a.startsWith("--") && a !== dbPath);

  if (!yamlPath) {
    console.error(
      "Usage: orchestrate.ts <yaml-path> [--db-path <db-path>]"
    );
    process.exit(1);
  }

  try {
    const result = await orchestrate(yamlPath, { dbPath });
    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
  } catch (e) {
    console.error(JSON.stringify({ error: String(e) }));
    process.exit(1);
  }
}
