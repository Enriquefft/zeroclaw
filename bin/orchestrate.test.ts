import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { initStateDb } from "./init-state-db.ts";

// Import the orchestrate module functions for testing
import {
  parseYaml,
  type OrchestrateYaml,
  orchestrate,
  type OrchestrateResult,
} from "./orchestrate.ts";

let tempDir: string;
let tempDb: string;
let tempDbDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "orchestrate-test-"));
  tempDbDir = mkdtempSync(join(tmpdir(), "orchestrate-db-"));
  tempDb = join(tempDbDir, "state.db");
  // Pre-initialize the DB
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

function mockRunner(outputs: string[]): (prompt: string) => Promise<string> {
  let idx = 0;
  return async (_prompt: string) => {
    if (idx >= outputs.length) return "default mock output";
    return outputs[idx++];
  };
}

function failingRunner(
  errorMsg = "mock failure"
): (prompt: string) => Promise<string> {
  return async (_prompt: string) => {
    throw new Error(errorMsg);
  };
}

// ---- parseYaml tests ----

describe("parseYaml", () => {
  test("extracts goal from YAML string", () => {
    const yaml = `
name: daily-report
goal: Write a daily summary report
notify: "+15550001234"
`;
    const result = parseYaml(yaml);
    expect(result.goal).toBe("Write a daily summary report");
  });

  test("extracts steps array from YAML", () => {
    const yaml = `
name: multi-step
goal: Do multiple things
steps:
  - "Step one: gather data"
  - "Step two: analyze data"
  - "Step three: write report"
`;
    const result = parseYaml(yaml);
    expect(result.steps).not.toBeNull();
    expect(result.steps?.length).toBe(3);
    expect(result.steps?.[0]).toBe("Step one: gather data");
    expect(result.steps?.[1]).toBe("Step two: analyze data");
    expect(result.steps?.[2]).toBe("Step three: write report");
  });

  test("returns null steps when steps field is absent", () => {
    const yaml = `
name: no-steps
goal: Just a goal with no steps
`;
    const result = parseYaml(yaml);
    expect(result.steps).toBeNull();
  });

  test("extracts notify field", () => {
    const yaml = `
goal: Test goal
notify: "+15550001234"
`;
    const result = parseYaml(yaml);
    expect(result.notify).toBe("+15550001234");
  });

  test("returns null notify when absent", () => {
    const yaml = `
goal: Test goal without notify
`;
    const result = parseYaml(yaml);
    expect(result.notify).toBeNull();
  });

  test("extracts name field", () => {
    const yaml = `
name: my-job-name
goal: Test goal
`;
    const result = parseYaml(yaml);
    expect(result.name).toBe("my-job-name");
  });

  test("returns null name when absent", () => {
    const yaml = `
goal: Test goal
`;
    const result = parseYaml(yaml);
    expect(result.name).toBeNull();
  });

  test("handles steps without quotes", () => {
    const yaml = `
goal: Test
steps:
  - Gather data from API
  - Process and transform data
`;
    const result = parseYaml(yaml);
    expect(result.steps?.length).toBe(2);
    expect(result.steps?.[0]).toBe("Gather data from API");
    expect(result.steps?.[1]).toBe("Process and transform data");
  });
});

// ---- orchestrate() function tests ----

describe("orchestrate — basic execution", () => {
  test("executes all steps sequentially and returns success", async () => {
    const yamlPath = writeYaml(`
name: test-job
goal: Complete a test task
steps:
  - "Step 1: initialize"
  - "Step 2: process"
  - "Step 3: finalize"
`);

    const runner = mockRunner(["init output", "process output", "done output"]);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    expect(result.success).toBe(true);
    expect(result.steps_run).toBe(3);
    expect(typeof result.parent_id).toBe("string");
    expect(result.parent_id.length).toBeGreaterThan(0);
  });

  test("creates parent row in orchestration_tasks with status completed", async () => {
    const yamlPath = writeYaml(`
name: parent-row-test
goal: Test parent row creation
steps:
  - "Do the thing"
`);

    const runner = mockRunner(["step output"]);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const parent = db
      .query(
        "SELECT * FROM orchestration_tasks WHERE id = ? AND parent_id IS NULL"
      )
      .get(result.parent_id) as {
      id: string;
      status: string;
      parent_goal: string;
      yaml_source: string;
    } | null;
    db.close();

    expect(parent).not.toBeNull();
    expect(parent?.status).toBe("completed");
    expect(parent?.parent_goal).toBe("Test parent row creation");
    expect(parent?.yaml_source).toBe(yamlPath);
  });

  test("creates subtask rows with correct step_index for each step", async () => {
    const yamlPath = writeYaml(`
name: subtask-test
goal: Test subtask creation
steps:
  - "First step"
  - "Second step"
  - "Third step"
`);

    const runner = mockRunner(["out1", "out2", "out3"]);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const subtasks = db
      .query(
        "SELECT * FROM orchestration_tasks WHERE parent_id = ? ORDER BY step_index"
      )
      .all(result.parent_id) as {
      description: string;
      status: string;
      step_index: number;
      step_output: string;
    }[];
    db.close();

    expect(subtasks.length).toBe(3);
    expect(subtasks[0].step_index).toBe(0);
    expect(subtasks[1].step_index).toBe(1);
    expect(subtasks[2].step_index).toBe(2);
    expect(subtasks[0].status).toBe("completed");
    expect(subtasks[1].status).toBe("completed");
    expect(subtasks[2].status).toBe("completed");
  });

  test("subtask row is inserted BEFORE runner is called (checkpoint before execution)", async () => {
    const yamlPath = writeYaml(`
name: checkpoint-test
goal: Test checkpointing
steps:
  - "Only step"
`);

    let rowExistedBeforeReturn = false;
    const checkpointRunner = async (_prompt: string): Promise<string> => {
      // Check if the subtask row was inserted before this call
      const db = new Database(tempDb);
      const rows = db
        .query(
          "SELECT * FROM orchestration_tasks WHERE parent_id IS NOT NULL AND step_index = 0"
        )
        .all() as any[];
      db.close();
      rowExistedBeforeReturn = rows.length > 0;
      return "output";
    };

    await orchestrate(yamlPath, { dbPath: tempDb, runner: checkpointRunner });
    expect(rowExistedBeforeReturn).toBe(true);
  });

  test("step_output is stored in subtask row after completion", async () => {
    const yamlPath = writeYaml(`
name: output-test
goal: Test output storage
steps:
  - "Generate output"
`);

    const runner = mockRunner(["this is the step output"]);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const subtask = db
      .query(
        "SELECT step_output FROM orchestration_tasks WHERE parent_id = ? AND step_index = 0"
      )
      .get(result.parent_id) as { step_output: string } | null;
    db.close();

    expect(subtask?.step_output).toBe("this is the step output");
  });

  test("step_output is truncated to 8KB", async () => {
    const yamlPath = writeYaml(`
name: truncation-test
goal: Test output truncation
steps:
  - "Generate large output"
`);

    const largeOutput = "x".repeat(10000); // 10KB
    const runner = mockRunner([largeOutput]);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const subtask = db
      .query(
        "SELECT step_output FROM orchestration_tasks WHERE parent_id = ? AND step_index = 0"
      )
      .get(result.parent_id) as { step_output: string } | null;
    db.close();

    expect(subtask?.step_output?.length).toBeLessThanOrEqual(8192);
  });

  test("previous steps output is passed as context to subsequent steps", async () => {
    const yamlPath = writeYaml(`
name: context-chain-test
goal: Test context chaining
steps:
  - "Step A"
  - "Step B uses A output"
`);

    const prompts: string[] = [];
    const trackingRunner = async (prompt: string): Promise<string> => {
      prompts.push(prompt);
      return `output for: ${prompt.slice(0, 20)}`;
    };

    await orchestrate(yamlPath, { dbPath: tempDb, runner: trackingRunner });

    // Second step prompt should contain output from step 1
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain("output for:");
  });
});

// ---- Retry logic tests ----

describe("orchestrate — retry on failure", () => {
  test("retries a failed step once before stopping", async () => {
    const yamlPath = writeYaml(`
name: retry-test
goal: Test retry logic
steps:
  - "Step that will fail"
  - "Step that won't run"
`);

    let callCount = 0;
    const alwaysFailRunner = async (_prompt: string): Promise<string> => {
      callCount++;
      throw new Error("always fails");
    };

    const result = await orchestrate(yamlPath, {
      dbPath: tempDb,
      runner: alwaysFailRunner,
    });

    expect(result.success).toBe(false);
    // Called once + one retry = 2 calls total for the first step
    expect(callCount).toBe(2);
  });

  test("marks subtask as failed after retry exhausted", async () => {
    const yamlPath = writeYaml(`
name: failed-subtask-test
goal: Test failure marking
steps:
  - "Failing step"
`);

    const runner = failingRunner("test failure");
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const subtask = db
      .query(
        "SELECT status FROM orchestration_tasks WHERE parent_id = ? AND step_index = 0"
      )
      .get(result.parent_id) as { status: string } | null;
    db.close();

    expect(subtask?.status).toBe("failed");
  });

  test("stops execution after first step fails — subsequent steps not run", async () => {
    const yamlPath = writeYaml(`
name: stop-on-failure-test
goal: Test stop on failure
steps:
  - "Step 1 fails"
  - "Step 2 should not run"
`);

    let callCount = 0;
    const runner = async (_prompt: string): Promise<string> => {
      callCount++;
      throw new Error("fail");
    };

    await orchestrate(yamlPath, { dbPath: tempDb, runner });

    // Only step 1 + its retry = 2 calls; step 2 never runs
    expect(callCount).toBe(2);
  });

  test("marks parent as failed when a step fails permanently", async () => {
    const yamlPath = writeYaml(`
name: parent-fail-test
goal: Test parent failure
steps:
  - "Failing step"
`);

    const runner = failingRunner();
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const parent = db
      .query(
        "SELECT status FROM orchestration_tasks WHERE id = ? AND parent_id IS NULL"
      )
      .get(result.parent_id) as { status: string } | null;
    db.close();

    expect(parent?.status).toBe("failed");
    expect(result.success).toBe(false);
  });

  test("succeeds when step fails first attempt but succeeds on retry", async () => {
    const yamlPath = writeYaml(`
name: retry-success-test
goal: Test retry success
steps:
  - "Step that fails then succeeds"
`);

    let callCount = 0;
    const flakeyRunner = async (_prompt: string): Promise<string> => {
      callCount++;
      if (callCount === 1) throw new Error("first attempt fails");
      return "success on retry";
    };

    const result = await orchestrate(yamlPath, {
      dbPath: tempDb,
      runner: flakeyRunner,
    });

    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });
});

// ---- Dual logging tests ----

describe("orchestrate — cron_log dual logging", () => {
  test("inserts one row into cron_log after successful run", async () => {
    const yamlPath = writeYaml(`
name: log-test-job
goal: Test logging
steps:
  - "Log step"
`);

    const runner = mockRunner(["output"]);
    await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const rows = db
      .query("SELECT * FROM cron_log WHERE job_name = 'log-test-job'")
      .all() as any[];
    db.close();

    expect(rows.length).toBe(1);
    expect(rows[0].success).toBe(1);
    expect(rows[0].started_at).toBeGreaterThan(0);
    expect(rows[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  test("inserts one row into cron_log after failed run with success=0", async () => {
    const yamlPath = writeYaml(`
name: fail-log-test-job
goal: Test failure logging
steps:
  - "Failing step"
`);

    const runner = failingRunner();
    await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const rows = db
      .query("SELECT * FROM cron_log WHERE job_name = 'fail-log-test-job'")
      .all() as any[];
    db.close();

    expect(rows.length).toBe(1);
    expect(rows[0].success).toBe(0);
  });

  test("uses filename as job_name when name field absent from YAML", async () => {
    const yamlPath = join(tempDir, "my-custom-job.yaml");
    writeFileSync(
      yamlPath,
      `
goal: Test with filename
steps:
  - "Do something"
`
    );

    const runner = mockRunner(["output"]);
    await orchestrate(yamlPath, { dbPath: tempDb, runner });

    const db = new Database(tempDb);
    const rows = db
      .query("SELECT * FROM cron_log WHERE job_name = 'my-custom-job'")
      .all() as any[];
    db.close();

    expect(rows.length).toBe(1);
  });
});

// ---- Resume logic tests ----

describe("orchestrate — resume logic", () => {
  test("resumes from failed step within 4h window — skips completed steps", async () => {
    const yamlPath = writeYaml(`
name: resume-test
goal: Test resume logic
steps:
  - "Step 1 (already done)"
  - "Step 2 (failed last time)"
  - "Step 3 (not yet run)"
`);

    const now = Date.now();
    const withinWindow = now - 2 * 60 * 60 * 1000; // 2 hours ago

    // Pre-seed state: parent row running + step 0 completed + step 1 failed
    const db = new Database(tempDb);
    const parentId = "resume-parent-id";
    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, yaml_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      parentId,
      "Test resume logic",
      "running",
      withinWindow,
      withinWindow,
      null,
      0,
      "Test resume logic",
      yamlPath
    );
    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, parent_id, step_index, step_output) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "step-0-id",
      "Step 1 (already done)",
      "completed",
      withinWindow,
      withinWindow,
      parentId,
      0,
      "step 0 output"
    );
    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, parent_id, step_index) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "step-1-id",
      "Step 2 (failed last time)",
      "failed",
      withinWindow,
      withinWindow,
      parentId,
      1
    );
    db.close();

    const runnerPrompts: string[] = [];
    const runner = async (prompt: string): Promise<string> => {
      runnerPrompts.push(prompt);
      return "resumed output";
    };

    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    // Should only run steps 1 and 2 (step 0 was completed)
    expect(result.success).toBe(true);
    expect(result.steps_run).toBe(2); // steps 1 and 2 re-run
    expect(result.parent_id).toBe(parentId); // reuses existing parent
  });

  test("starts fresh when previous run is beyond 4h resume window", async () => {
    const yamlPath = writeYaml(`
name: fresh-start-test
goal: Test fresh start beyond window
steps:
  - "Step 1"
  - "Step 2"
`);

    const now = Date.now();
    const beyondWindow = now - 5 * 60 * 60 * 1000; // 5 hours ago

    // Pre-seed state from old run (beyond window)
    const db = new Database(tempDb);
    const oldParentId = "old-parent-id";
    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, parent_id, step_index, parent_goal, yaml_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      oldParentId,
      "Test fresh start beyond window",
      "running",
      beyondWindow,
      beyondWindow,
      null,
      0,
      "Test fresh start beyond window",
      yamlPath
    );
    db.close();

    const runner = mockRunner(["out1", "out2"]);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    // Should create a NEW parent row (fresh start)
    expect(result.success).toBe(true);
    expect(result.parent_id).not.toBe(oldParentId);
    expect(result.steps_run).toBe(2);
  });

  test("starts fresh when no prior run exists", async () => {
    const yamlPath = writeYaml(`
name: first-run-test
goal: First ever run
steps:
  - "Step A"
  - "Step B"
`);

    const runner = mockRunner(["output A", "output B"]);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    expect(result.success).toBe(true);
    expect(result.steps_run).toBe(2);
  });
});

// ---- Output contract tests ----

describe("orchestrate — output contract", () => {
  test("returns OrchestrateResult with success, steps_run, parent_id on success", async () => {
    const yamlPath = writeYaml(`
goal: Test output contract
steps:
  - "Single step"
`);

    const runner = mockRunner(["output"]);
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    expect(typeof result.success).toBe("boolean");
    expect(typeof result.steps_run).toBe("number");
    expect(typeof result.parent_id).toBe("string");
    expect(result.error).toBeUndefined();
  });

  test("returns error field on failure", async () => {
    const yamlPath = writeYaml(`
goal: Test failure output
steps:
  - "Failing step"
`);

    const runner = failingRunner("specific error message");
    const result = await orchestrate(yamlPath, { dbPath: tempDb, runner });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---- YAML file reading edge cases ----

describe("orchestrate — YAML file handling", () => {
  test("returns error result when YAML file not found", async () => {
    const result = await orchestrate("/nonexistent/path.yaml", {
      dbPath: tempDb,
      runner: mockRunner([]),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---- Module structure tests ----

describe("orchestrate — module exports", () => {
  test("exports parseYaml function", () => {
    expect(typeof parseYaml).toBe("function");
  });

  test("exports orchestrate as AsyncFunction", () => {
    expect(typeof orchestrate).toBe("function");
    expect(orchestrate.constructor.name).toBe("AsyncFunction");
  });

  test("orchestrate.ts source imports initStateDb", async () => {
    const file = Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts");
    const content = await file.text();
    expect(content).toContain("initStateDb");
  });

  test("orchestrate.ts source imports notify", async () => {
    const file = Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts");
    const content = await file.text();
    expect(content).toContain("notify");
  });

  test("orchestrate.ts source references orchestration_tasks", async () => {
    const file = Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts");
    const content = await file.text();
    expect(content).toContain("orchestration_tasks");
  });

  test("orchestrate.ts source references cron_log", async () => {
    const file = Bun.file("/etc/nixos/zeroclaw/bin/orchestrate.ts");
    const content = await file.text();
    expect(content).toContain("cron_log");
  });
});
