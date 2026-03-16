import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { initStateDb } from "./init-state-db.ts";
import { orchestrate, enqueue, work, type OrchestrateResult } from "./orchestrate.ts";

let tempDir: string;
let tempDb: string;
let tempDbDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "orchestrate-test-"));
  tempDbDir = mkdtempSync(join(tmpdir(), "orchestrate-db-"));
  tempDb = join(tempDbDir, "state.db");
  const db = initStateDb(tempDb);
  db.close();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(tempDbDir, { recursive: true, force: true });
});

// ---- Helpers ----

function writeYaml(content: string): string {
  const path = join(tempDir, `test-${Date.now()}.yaml`);
  writeFileSync(path, content);
  return path;
}

function mockRunner(output: string): (sys: string, user: string) => Promise<string> {
  return async (_sys: string, _user: string) => output;
}

function failingRunner(msg = "mock failure"): (sys: string, user: string) => Promise<string> {
  return async () => { throw new Error(msg); };
}

function trackingRunner(output: string): {
  runner: (sys: string, user: string) => Promise<string>;
  calls: { systemPrompt: string; userPrompt: string }[];
} {
  const calls: { systemPrompt: string; userPrompt: string }[] = [];
  return {
    runner: async (sys: string, user: string) => { calls.push({ systemPrompt: sys, userPrompt: user }); return output; },
    calls,
  };
}

// ---- YAML parsing (via orchestrate function) ----

describe("orchestrate — YAML parsing", () => {
  test("parses goal from YAML file", async () => {
    const yamlPath = writeYaml(`
name: test-job
goal: "Write a daily summary"
hints:
  - "Check email"
`);
    const { runner, calls } = trackingRunner("done");
    await orchestrate(yamlPath, { dbPath: tempDb, runner });
    expect(calls[0].userPrompt).toContain("Write a daily summary");
  });

  test("parses hints and includes them in prompt", async () => {
    const yamlPath = writeYaml(`
name: hints-test
goal: "Do the thing"
hints:
  - "Hint one"
  - "Hint two"
`);
    const { runner, calls } = trackingRunner("done");
    await orchestrate(yamlPath, { dbPath: tempDb, runner });
    expect(calls[0].userPrompt).toContain("Hint one");
    expect(calls[0].userPrompt).toContain("Hint two");
  });

  test("accepts steps as alias for hints (backward compat)", async () => {
    const yamlPath = writeYaml(`
name: compat-test
goal: "Backward compat"
steps:
  - "Old step one"
  - "Old step two"
`);
    const { runner, calls } = trackingRunner("done");
    await orchestrate(yamlPath, { dbPath: tempDb, runner });
    expect(calls[0].userPrompt).toContain("Old step one");
    expect(calls[0].userPrompt).toContain("Old step two");
  });

  test("works without hints", async () => {
    const yamlPath = writeYaml(`
name: no-hints
goal: "Just a goal"
`);
    const { runner, calls } = trackingRunner("done");
    await orchestrate(yamlPath, { dbPath: tempDb, runner });
    expect(calls[0].userPrompt).toContain("Just a goal");
    expect(calls[0].userPrompt).not.toContain("Hints");
  });
});

// ---- Inline goal (non-YAML) ----

describe("orchestrate — inline goals", () => {
  test("accepts an inline goal string", async () => {
    const { runner, calls } = trackingRunner("inline result");
    const result = await orchestrate("Summarize my emails", { dbPath: tempDb, runner });
    expect(result.success).toBe(true);
    expect(calls[0].userPrompt).toContain("Summarize my emails");
  });
});

// ---- Core execution ----

describe("orchestrate — execution", () => {
  test("calls runner with system prompt and user prompt", async () => {
    const yamlPath = writeYaml(`
name: prompt-test
goal: "Test prompts"
hints:
  - "A hint"
`);
    const { runner, calls } = trackingRunner("output");
    await orchestrate(yamlPath, { dbPath: tempDb, runner });

    expect(calls.length).toBe(1);
    expect(calls[0].systemPrompt).toContain("orchestration engine");
    expect(calls[0].userPrompt).toContain("Test prompts");
    expect(calls[0].userPrompt).toContain("A hint");
  });

  test("returns success with parent_id on successful run", async () => {
    const yamlPath = writeYaml(`
name: success-test
goal: "Test success"
hints:
  - "Do it"
`);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner: mockRunner("done") });

    expect(result.success).toBe(true);
    expect(typeof result.parent_id).toBe("string");
    expect(result.parent_id.length).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  test("returns failure with error on runner exception", async () => {
    const yamlPath = writeYaml(`
name: fail-test
goal: "Test failure"
hints:
  - "Will fail"
`);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner: failingRunner("kaboom") });

    expect(result.success).toBe(false);
    expect(result.error).toContain("kaboom");
  });
});

// ---- Database state ----

describe("orchestrate — database", () => {
  test("creates parent row in orchestration_tasks", async () => {
    const yamlPath = writeYaml(`
name: db-test
goal: "Test DB row"
hints:
  - "Do it"
`);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner: mockRunner("output") });

    const db = new Database(tempDb);
    const parent = db.query(
      "SELECT * FROM orchestration_tasks WHERE id = ? AND parent_id IS NULL"
    ).get(result.parent_id) as any;
    db.close();

    expect(parent).not.toBeNull();
    expect(parent.status).toBe("completed");
    expect(parent.parent_goal).toBe("Test DB row");
    expect(parent.yaml_source).toBe(yamlPath);
  });

  test("marks parent as failed on runner error", async () => {
    const yamlPath = writeYaml(`
name: fail-db-test
goal: "Fail DB test"
hints:
  - "Will fail"
`);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner: failingRunner() });

    const db = new Database(tempDb);
    const parent = db.query(
      "SELECT status FROM orchestration_tasks WHERE id = ? AND parent_id IS NULL"
    ).get(result.parent_id) as any;
    db.close();

    expect(parent.status).toBe("failed");
  });

  test("stores output in step_output column (truncated to 8KB)", async () => {
    const yamlPath = writeYaml(`
name: output-test
goal: "Test output storage"
hints:
  - "Generate output"
`);
    const largeOutput = "x".repeat(10000);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner: mockRunner(largeOutput) });

    const db = new Database(tempDb);
    const row = db.query(
      "SELECT step_output FROM orchestration_tasks WHERE id = ?"
    ).get(result.parent_id) as any;
    db.close();

    expect(row.step_output.length).toBeLessThanOrEqual(8192);
  });

  test("inserts cron_log row on success", async () => {
    const yamlPath = writeYaml(`
name: log-test-job
goal: "Test logging"
hints:
  - "Do it"
`);
    await orchestrate(yamlPath, { dbPath: tempDb, runner: mockRunner("done") });

    const db = new Database(tempDb);
    const rows = db.query("SELECT * FROM cron_log WHERE job_name = 'log-test-job'").all() as any[];
    db.close();

    expect(rows.length).toBe(1);
    expect(rows[0].success).toBe(1);
    expect(rows[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  test("inserts cron_log row on failure with success=0", async () => {
    const yamlPath = writeYaml(`
name: fail-log-job
goal: "Fail logging"
hints:
  - "Will fail"
`);
    await orchestrate(yamlPath, { dbPath: tempDb, runner: failingRunner() });

    const db = new Database(tempDb);
    const rows = db.query("SELECT * FROM cron_log WHERE job_name = 'fail-log-job'").all() as any[];
    db.close();

    expect(rows.length).toBe(1);
    expect(rows[0].success).toBe(0);
  });

  test("uses filename as job_name when name absent", async () => {
    const yamlPath = join(tempDir, "my-custom-job.yaml");
    writeFileSync(yamlPath, `goal: "Test filename"\nhints:\n  - "Do it"\n`);

    await orchestrate(yamlPath, { dbPath: tempDb, runner: mockRunner("done") });

    const db = new Database(tempDb);
    const rows = db.query("SELECT * FROM cron_log WHERE job_name = 'my-custom-job'").all() as any[];
    db.close();

    expect(rows.length).toBe(1);
  });
});

// ---- SILENT handling ----

describe("orchestrate — SILENT output", () => {
  test("detects SILENT output", async () => {
    const yamlPath = writeYaml(`
name: silent-test
goal: "Nothing to do"
notify: "+15550001234"
hints:
  - "Check if anything"
`);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner: mockRunner("SILENT") });

    expect(result.success).toBe(true);
    expect(result.output).toBe("SILENT");
  });

  test("detects SILENT with trailing content", async () => {
    const yamlPath = writeYaml(`
name: silent-newline
goal: "Nothing"
hints:
  - "Check"
`);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner: mockRunner("SILENT\nNo items found") });

    expect(result.success).toBe(true);
    expect(result.output).toBe("SILENT");
  });
});

// ---- Error handling ----

describe("orchestrate — error cases", () => {
  test("returns error for nonexistent YAML file", async () => {
    const result = await orchestrate("/nonexistent/path.yaml", {
      dbPath: tempDb,
      runner: mockRunner(""),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("returns error for YAML without goal", async () => {
    const yamlPath = writeYaml(`name: no-goal\nhints:\n  - "Something"\n`);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner: mockRunner("") });

    expect(result.success).toBe(false);
    expect(result.error).toContain("goal");
  });
});

// ---- Real YAML file parsing ----

describe("orchestrate — real YAML files parse correctly", () => {
  test("morning-briefing.yaml has correct fields", async () => {
    const { runner, calls } = trackingRunner("briefing done");
    const result = await orchestrate(
      "/etc/nixos/zeroclaw/cron/jobs/morning-briefing.yaml",
      { dbPath: tempDb, runner }
    );

    expect(result.success).toBe(true);
    expect(calls[0].userPrompt).toContain("morning briefing");
    expect(calls[0].userPrompt).toContain("calendar");
  });

  test("eod-summary.yaml has correct fields", async () => {
    const { runner, calls } = trackingRunner("eod done");
    const result = await orchestrate(
      "/etc/nixos/zeroclaw/cron/jobs/eod-summary.yaml",
      { dbPath: tempDb, runner }
    );

    expect(result.success).toBe(true);
    expect(calls[0].userPrompt).toContain("Git commits");
  });
});

// ---- Module exports ----

describe("orchestrate — module structure", () => {
  test("exports orchestrate as AsyncFunction", () => {
    expect(typeof orchestrate).toBe("function");
    expect(orchestrate.constructor.name).toBe("AsyncFunction");
  });

  test("exports enqueue as AsyncFunction", () => {
    expect(typeof enqueue).toBe("function");
    expect(enqueue.constructor.name).toBe("AsyncFunction");
  });

  test("exports work as AsyncFunction", () => {
    expect(typeof work).toBe("function");
    expect(work.constructor.name).toBe("AsyncFunction");
  });

  test("source imports initStateDb", async () => {
    const content = await Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts").text();
    expect(content).toContain("initStateDb");
  });

  test("source imports notify", async () => {
    const content = await Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts").text();
    expect(content).toContain("notify");
  });

  test("source references orchestration_tasks", async () => {
    const content = await Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts").text();
    expect(content).toContain("orchestration_tasks");
  });

  test("source references cron_log", async () => {
    const content = await Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts").text();
    expect(content).toContain("cron_log");
  });

  test("source uses YAML.parse (not regex)", async () => {
    const content = await Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts").text();
    expect(content).toContain("YAML.parse");
    expect(content).not.toContain("RegExp");
  });
});

// ---- Enqueue mode ----

describe("enqueue mode", () => {
  test("creates queued row and returns immediately", async () => {
    const yamlPath = writeYaml(`
name: enqueue-test
goal: "Enqueue this task"
hints:
  - "A hint"
`);
    const result = await enqueue(yamlPath, { dbPath: tempDb });

    expect(result.success).toBe(true);
    expect(result.status).toBe("queued");
    expect(result.parent_id.length).toBeGreaterThan(0);

    const db = new Database(tempDb);
    const row = db.query(
      "SELECT * FROM orchestration_tasks WHERE id = ?"
    ).get(result.parent_id) as any;
    db.close();

    expect(row).not.toBeNull();
    expect(row.status).toBe("queued");
    expect(row.queued_at).toBeGreaterThan(0);
    expect(row.parent_goal).toBe("Enqueue this task");
    expect(row.yaml_source).toBe(yamlPath);
  });

  test("returns error for invalid YAML", async () => {
    const result = await enqueue("/nonexistent/path.yaml", { dbPath: tempDb });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("returns error for YAML without goal", async () => {
    const yamlPath = writeYaml(`name: no-goal\nhints:\n  - "Something"\n`);
    const result = await enqueue(yamlPath, { dbPath: tempDb });
    expect(result.success).toBe(false);
    expect(result.error).toContain("goal");
  });
});

// ---- Worker mode ----

describe("worker mode", () => {
  test("claims queued task and executes it", async () => {
    const yamlPath = writeYaml(`
name: worker-test
goal: "Worker should run this"
hints:
  - "Do it"
`);

    // Pre-insert a queued row
    const db = new Database(tempDb);
    const taskId = `test-${Date.now()}`;
    const now = Date.now();
    db.prepare(
      `INSERT INTO orchestration_tasks
         (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, yaml_source, queued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, "Worker should run this", "queued", now, now, null, 0, "Worker should run this", yamlPath, now);
    db.close();

    await work({ dbPath: tempDb, runner: mockRunner("worker output"), once: true });

    const db2 = new Database(tempDb);
    const row = db2.query(
      "SELECT * FROM orchestration_tasks WHERE id = ?"
    ).get(taskId) as any;
    db2.close();

    expect(row.status).toBe("completed");
    expect(row.step_output).toBe("worker output");
    expect(row.pid).toBe(process.pid);
    expect(row.started_work_at).toBeGreaterThan(0);
  });

  test("respects concurrency gate", async () => {
    // Pre-insert 2 running rows
    const db = new Database(tempDb);
    const now = Date.now();
    for (let i = 0; i < 2; i++) {
      db.prepare(
        `INSERT INTO orchestration_tasks
           (id, description, status, created_at, updated_at, parent_id, step_index, started_work_at, pid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(`running-${i}`, `Running task ${i}`, "running", now, now, null, 0, now, process.pid);
    }
    // Also insert a queued row that should NOT be claimed
    db.prepare(
      `INSERT INTO orchestration_tasks
         (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, queued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("should-not-run", "Should not run", "queued", now, now, null, 0, "Should not run", now);
    db.close();

    const { runner, calls } = trackingRunner("should not see this");
    await work({ dbPath: tempDb, runner, once: true });

    // Runner should never have been called
    expect(calls.length).toBe(0);

    // Queued task should still be queued
    const db2 = new Database(tempDb);
    const row = db2.query(
      "SELECT status FROM orchestration_tasks WHERE id = 'should-not-run'"
    ).get() as any;
    db2.close();

    expect(row.status).toBe("queued");
  });

  test("sweeps orphaned stale rows with dead PIDs", async () => {
    const db = new Database(tempDb);
    const now = Date.now();
    const staleTime = now - 46 * 60 * 1000; // 46 min ago (> 45 min threshold)

    // Insert a stale running row with a PID that's definitely dead
    db.prepare(
      `INSERT INTO orchestration_tasks
         (id, description, status, created_at, updated_at, parent_id, step_index, started_work_at, pid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("stale-task", "Stale task", "running", staleTime, staleTime, null, 0, staleTime, 999999);
    db.close();

    await work({ dbPath: tempDb, runner: mockRunner("done"), once: true });

    const db2 = new Database(tempDb);
    const row = db2.query(
      "SELECT status, step_output FROM orchestration_tasks WHERE id = 'stale-task'"
    ).get() as any;
    db2.close();

    expect(row.status).toBe("failed");
    expect(row.step_output).toContain("orphaned");
  });

  test("exits cleanly when no queued tasks", async () => {
    const { runner, calls } = trackingRunner("should not run");
    await work({ dbPath: tempDb, runner, once: true });
    expect(calls.length).toBe(0);
  });

  test("handles runner failure in worker mode", async () => {
    const yamlPath = writeYaml(`
name: worker-fail-test
goal: "This will fail"
`);

    const db = new Database(tempDb);
    const taskId = `fail-${Date.now()}`;
    const now = Date.now();
    db.prepare(
      `INSERT INTO orchestration_tasks
         (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, yaml_source, queued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, "This will fail", "queued", now, now, null, 0, "This will fail", yamlPath, now);
    db.close();

    await work({ dbPath: tempDb, runner: failingRunner("worker kaboom"), once: true });

    const db2 = new Database(tempDb);
    const row = db2.query(
      "SELECT status FROM orchestration_tasks WHERE id = ?"
    ).get(taskId) as any;
    const cronRow = db2.query(
      "SELECT success FROM cron_log WHERE job_name = 'worker-fail-test'"
    ).get() as any;
    db2.close();

    expect(row.status).toBe("failed");
    expect(cronRow.success).toBe(0);
  });
});
