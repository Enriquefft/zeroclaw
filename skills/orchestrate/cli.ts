#!/usr/bin/env bun
/**
 * skills/orchestrate/cli.ts — Orchestrate skill CLI wrapper
 *
 * Subcommands: run, status, list, cancel
 *
 * Output: JSON to stdout (success), JSON to stderr (error)
 * Exit: 0 on success, 1 on error
 *
 * Accept --db-path <path> for test isolation.
 */

import { $ } from "bun";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { initStateDb } from "../../bin/init-state-db.ts";

// ---- Constants ----

const DEFAULT_DB_PATH = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const ORCHESTRATE_BIN = "/etc/nixos/zeroclaw/bin/orchestrate.ts";

// ---- Argument parsing ----

const rawArgs = process.argv.slice(2);

// Extract --db-path <path>
const dbPathIdx = rawArgs.indexOf("--db-path");
const dbPath = dbPathIdx !== -1 ? rawArgs[dbPathIdx + 1] : DEFAULT_DB_PATH;

// Remaining args (filter out --db-path and its value)
const args = rawArgs.filter(
  (a, i) =>
    a !== "--db-path" &&
    !(i === dbPathIdx + 1 && dbPathIdx !== -1)
);

const subcommand = args[0];

// ---- Helpers ----

function ok(data: unknown): never {
  console.log(JSON.stringify(data));
  process.exit(0);
}

function fail(message: string): never {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

// ---- Subcommand implementations ----

/** list — show all parent orchestration runs */
function cmdList(): void {
  const db = initStateDb(dbPath);
  try {
    const rows = db
      .query(
        `SELECT id, description, status, created_at, updated_at
         FROM orchestration_tasks
         WHERE parent_id IS NULL
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .all() as {
      id: string;
      description: string | null;
      status: string;
      created_at: number;
      updated_at: number;
    }[];

    const result = rows.map((r) => ({
      id: r.id,
      description: r.description,
      status: r.status,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    }));

    ok(result);
  } finally {
    db.close();
  }
}

/** status [parent-id] — show task status, optionally with subtask detail */
function cmdStatus(parentId?: string): void {
  const db = initStateDb(dbPath);
  try {
    if (parentId) {
      // Show parent + child rows for this ID
      const parent = db
        .query(
          `SELECT id, description, status, created_at, updated_at, parent_goal, yaml_source
           FROM orchestration_tasks
           WHERE id = ? AND parent_id IS NULL`
        )
        .get(parentId) as {
        id: string;
        description: string | null;
        status: string;
        created_at: number;
        updated_at: number;
        parent_goal: string | null;
        yaml_source: string | null;
      } | null;

      const steps = db
        .query(
          `SELECT id, description, status, step_index, step_output, created_at, updated_at
           FROM orchestration_tasks
           WHERE parent_id = ?
           ORDER BY step_index`
        )
        .all(parentId) as {
        id: string;
        description: string | null;
        status: string;
        step_index: number;
        step_output: string | null;
        created_at: number;
        updated_at: number;
      }[];

      ok({
        parent: parent
          ? {
              ...parent,
              created_at: new Date(parent.created_at).toISOString(),
              updated_at: new Date(parent.updated_at).toISOString(),
            }
          : null,
        steps: steps.map((s) => ({
          ...s,
          created_at: new Date(s.created_at).toISOString(),
          updated_at: new Date(s.updated_at).toISOString(),
        })),
      });
    } else {
      // No ID — same as list
      const rows = db
        .query(
          `SELECT id, description, status, created_at, updated_at
           FROM orchestration_tasks
           WHERE parent_id IS NULL
           ORDER BY created_at DESC
           LIMIT 20`
        )
        .all() as {
        id: string;
        description: string | null;
        status: string;
        created_at: number;
        updated_at: number;
      }[];

      ok(
        rows.map((r) => ({
          ...r,
          created_at: new Date(r.created_at).toISOString(),
          updated_at: new Date(r.updated_at).toISOString(),
        }))
      );
    }
  } finally {
    db.close();
  }
}

/** cancel <parent-id> — mark pending/running steps + parent as cancelled */
function cmdCancel(parentId: string): void {
  const db = initStateDb(dbPath);
  try {
    const now = Date.now();

    // Cancel pending/running subtasks
    const subtaskResult = db
      .prepare(
        `UPDATE orchestration_tasks
         SET status = 'cancelled', updated_at = ?
         WHERE parent_id = ? AND status IN ('pending', 'running')`
      )
      .run(now, parentId);

    // Cancel parent if it exists
    const parentResult = db
      .prepare(
        `UPDATE orchestration_tasks
         SET status = 'cancelled', updated_at = ?
         WHERE id = ? AND parent_id IS NULL AND status IN ('pending', 'running')`
      )
      .run(now, parentId);

    ok({
      cancelled: true,
      subtasks_cancelled: subtaskResult.changes,
      parent_cancelled: parentResult.changes,
    });
  } finally {
    db.close();
  }
}

/** run <target> — invoke orchestrate.ts via subprocess */
async function cmdRun(target: string): Promise<void> {
  // Determine if target is a file path or inline goal
  const isFilePath =
    target.includes("/") || target.endsWith(".yaml") || target.endsWith(".yml");

  let yamlPath: string;
  let tempFile: string | null = null;

  if (isFilePath) {
    yamlPath = target;
  } else {
    // Inline goal — create a temp YAML file
    const tempDir = join(tmpdir(), `orchestrate-run-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    tempFile = join(tempDir, "goal.yaml");

    // Write a minimal YAML with just the goal (steps field is required by orchestrate.ts,
    // but the caller must know that auto-decomposition is not yet implemented)
    writeFileSync(
      tempFile,
      `goal: "${target.replace(/"/g, '\\"')}"\nname: "inline-goal"\n`
    );
    yamlPath = tempFile;
  }

  // Resolve bun path at runtime (never Nix-interpolate in TypeScript)
  const bunPath = Bun.which("bun") ?? "/run/current-system/sw/bin/bun";

  try {
    const args: string[] = [bunPath, "run", ORCHESTRATE_BIN, yamlPath];
    if (dbPath !== DEFAULT_DB_PATH) {
      args.push("--db-path", dbPath);
    }

    const result = await $`${args}`.text();
    // Print raw result (already JSON from orchestrate.ts)
    console.log(result.trim());
    process.exit(0);
  } catch (e) {
    fail(`orchestrate run failed: ${String(e)}`);
  } finally {
    if (tempFile) {
      try {
        rmSync(join(tmpdir(), `orchestrate-run-${Date.now() - 1}`), {
          recursive: true,
          force: true,
        });
      } catch {
        // cleanup is best-effort
      }
    }
  }
}

// ---- Dispatch ----

switch (subcommand) {
  case "list":
    cmdList();
    break;

  case "status":
    cmdStatus(args[1]);
    break;

  case "cancel":
    if (!args[1]) {
      fail("cancel requires a parent-id argument");
    }
    cmdCancel(args[1]);
    break;

  case "run":
    if (!args[1]) {
      fail("run requires a target argument (file path or inline goal string)");
    }
    await cmdRun(args[1]);
    break;

  default:
    fail(
      subcommand
        ? `unknown subcommand: ${subcommand}. Use: run, status, list, cancel`
        : "usage: orchestrate <run|status|list|cancel> [args...]"
    );
}
