import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { initStateDb } from "./init-state-db.ts";
import { orchestrate, type OrchestrateResult } from "./orchestrate.ts";

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
