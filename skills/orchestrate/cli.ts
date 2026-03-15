#!/usr/bin/env bun
/**
 * skills/orchestrate/cli.ts — Orchestrate skill CLI wrapper
 *
 * Subcommands: run, status, list, cancel, checkpoint, complete, fail
 *
 * Output: JSON to stdout (success), JSON to stderr (error)
 * Exit: 0 on success, 1 on error
 *
 * Accept --db-path <path> for test isolation.
 */

import { $ } from "bun";
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

    ok(rows.map((r) => ({
      id: r.id,
      description: r.description,
      status: r.status,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    })));
  } finally {
    db.close();
  }
}

/** status [parent-id] — show task status */
function cmdStatus(parentId?: string): void {
  const db = initStateDb(dbPath);
  try {
    if (parentId) {
      const parent = db
        .query(
          `SELECT id, description, status, created_at, updated_at, parent_goal, yaml_source, step_output
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
        step_output: string | null;
      } | null;

      ok({
        parent: parent
          ? {
              ...parent,
              created_at: new Date(parent.created_at).toISOString(),
              updated_at: new Date(parent.updated_at).toISOString(),
            }
          : null,
      });
    } else {
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

/** cancel <parent-id> — mark pending/running as cancelled */
function cmdCancel(parentId: string): void {
  const db = initStateDb(dbPath);
  try {
    const now = Date.now();

    const subtaskResult = db
      .prepare(
        `UPDATE orchestration_tasks
         SET status = 'cancelled', updated_at = ?
         WHERE parent_id = ? AND status IN ('pending', 'running')`
      )
      .run(now, parentId);

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

/** checkpoint <parent-id> <note> — save progress marker */
function cmdCheckpoint(parentId: string, note: string): void {
  const db = initStateDb(dbPath);
  try {
    db.prepare(
      `INSERT OR REPLACE INTO kv_store (key, value, updated_at)
       VALUES (?, ?, ?)`
    ).run(
      `orch:checkpoint:${parentId}`,
      JSON.stringify({ note, timestamp: new Date().toISOString() }),
      Date.now()
    );
    ok({ checkpointed: true, parent_id: parentId });
  } finally {
    db.close();
  }
}

/** complete <parent-id> — mark task completed */
function cmdComplete(parentId: string): void {
  const db = initStateDb(dbPath);
  try {
    db.prepare(
      `UPDATE orchestration_tasks SET status = 'completed', updated_at = ? WHERE id = ? AND parent_id IS NULL`
    ).run(Date.now(), parentId);
    ok({ completed: true, parent_id: parentId });
  } finally {
    db.close();
  }
}

/** fail <parent-id> <error> — mark task failed */
function cmdFail(parentId: string, error: string): void {
  const db = initStateDb(dbPath);
  try {
    db.prepare(
      `UPDATE orchestration_tasks SET status = 'failed', step_output = ?, updated_at = ? WHERE id = ? AND parent_id IS NULL`
    ).run(error, Date.now(), parentId);
    ok({ failed: true, parent_id: parentId });
  } finally {
    db.close();
  }
}

/** run <target> — invoke orchestrate.ts (accepts YAML path or inline goal) */
async function cmdRun(target: string): Promise<void> {
  const bunPath = Bun.which("bun") ?? "/run/current-system/sw/bin/bun";

  try {
    const cmdArgs: string[] = [bunPath, "run", ORCHESTRATE_BIN, target];
    if (dbPath !== DEFAULT_DB_PATH) {
      cmdArgs.push("--db-path", dbPath);
    }

    const result = await $`${cmdArgs}`.text();
    console.log(result.trim());
    process.exit(0);
  } catch (e) {
    fail(`orchestrate run failed: ${String(e)}`);
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
    if (!args[1]) fail("cancel requires a parent-id argument");
    cmdCancel(args[1]);
    break;

  case "checkpoint":
    if (!args[1] || !args[2]) fail("checkpoint requires <parent-id> <note>");
    cmdCheckpoint(args[1], args.slice(2).join(" "));
    break;

  case "complete":
    if (!args[1]) fail("complete requires a parent-id argument");
    cmdComplete(args[1]);
    break;

  case "fail":
    if (!args[1] || !args[2]) fail("fail requires <parent-id> <error>");
    cmdFail(args[1], args.slice(2).join(" "));
    break;

  case "run":
    if (!args[1]) fail("run requires a target argument (file path or inline goal string)");
    await cmdRun(args[1]);
    break;

  default:
    fail(
      subcommand
        ? `unknown subcommand: ${subcommand}. Use: run, status, list, cancel, checkpoint, complete, fail`
        : "usage: orchestrate <run|status|list|cancel|checkpoint|complete|fail> [args...]"
    );
}
