import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";

// We'll import the function after we create it
// For RED phase: tests should fail because the module doesn't exist yet
let initStateDb: (dbPath?: string) => Database;

describe("initStateDb", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "state-db-test-"));
    dbPath = join(tmpDir, "state.db");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates DB file at the expected path", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);
    db.close();
    expect(existsSync(dbPath)).toBe(true);
  });

  test("DB has WAL journal mode enabled", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);
    const result = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
    db.close();
    expect(result.journal_mode).toBe("wal");
  });

  test("DB has busy_timeout set to 5000", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);
    const result = db.query("PRAGMA busy_timeout").get() as { timeout: number };
    db.close();
    expect(result.timeout).toBe(5000);
  });

  test("PRAGMA user_version returns 3 after fresh init", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);
    const result = db.query("PRAGMA user_version").get() as { user_version: number };
    db.close();
    expect(result.user_version).toBe(3);
  });

  test("all 8 tables exist", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    const expectedTables = [
      "job_applications",
      "freelance_leads",
      "daily_state",
      "content_log",
      "orchestration_tasks",
      "notify_log",
      "cron_log",
      "kv_store",
    ];

    for (const table of expectedTables) {
      const result = db
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table) as { name: string } | null;
      expect(result).not.toBeNull();
      expect(result?.name).toBe(table);
    }

    db.close();
  });

  test("all 5 indexes exist (including idx_orch_parent)", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    const expectedIndexes = [
      "idx_job_status",
      "idx_freelance_status",
      "idx_notify_sent_at",
      "idx_cron_job_name",
      "idx_orch_parent",
    ];

    for (const idx of expectedIndexes) {
      const result = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
        .get(idx) as { name: string } | null;
      expect(result).not.toBeNull();
      expect(result?.name).toBe(idx);
    }

    db.close();
  });

  test("running initStateDb twice on same DB does not error (idempotent)", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;

    // First run
    const db1 = initStateDb(dbPath);
    db1.close();

    // Second run — should not throw
    expect(() => {
      const db2 = initStateDb(dbPath);
      db2.close();
    }).not.toThrow();
  });

  test("notify_log table has recipient column", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    // Insert a row with recipient to verify the column exists
    db.prepare(
      "INSERT INTO notify_log (message, recipient, sent_at, priority, success) VALUES (?, ?, ?, ?, ?)"
    ).run("test", "+51926689401", Date.now(), "normal", 1);

    const row = db.query("SELECT recipient FROM notify_log WHERE message = 'test'").get() as { recipient: string };
    db.close();
    expect(row.recipient).toBe("+51926689401");
  });

  // v2 → v3 migration tests
  test("v2 database migrates to v3 — PRAGMA user_version reads 3 after initStateDb()", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;

    // Create a v2 database manually (using the v1 DDL + v1→v2 migration)
    const db2 = new Database(dbPath);
    db2.exec("PRAGMA journal_mode=WAL");
    db2.exec(`
      CREATE TABLE IF NOT EXISTS orchestration_tasks (
        id          TEXT PRIMARY KEY,
        description TEXT,
        status      TEXT NOT NULL DEFAULT 'pending',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notify_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        message     TEXT NOT NULL,
        recipient   TEXT NOT NULL,
        sent_at     INTEGER NOT NULL,
        priority    TEXT NOT NULL DEFAULT 'normal',
        success     INTEGER NOT NULL DEFAULT 1,
        error       TEXT
      );
      CREATE TABLE IF NOT EXISTS job_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, company TEXT NOT NULL, url TEXT,
        status TEXT NOT NULL DEFAULT 'new', found_date INTEGER NOT NULL,
        salary_range TEXT, location TEXT, match_score REAL,
        source_platform TEXT, notes TEXT, applied_date INTEGER,
        last_updated INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS freelance_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, company TEXT, url TEXT,
        status TEXT NOT NULL DEFAULT 'new', found_date INTEGER NOT NULL,
        salary_range TEXT, location TEXT, match_score REAL,
        source_platform TEXT, notes TEXT, applied_date INTEGER,
        last_updated INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_state (
        date TEXT PRIMARY KEY, briefing_sent INTEGER NOT NULL DEFAULT 0,
        eod_sent INTEGER NOT NULL DEFAULT 0, notes TEXT, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS content_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL,
        content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
        created_at INTEGER NOT NULL, posted_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS cron_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, job_name TEXT NOT NULL,
        started_at INTEGER NOT NULL, duration_ms INTEGER,
        success INTEGER NOT NULL DEFAULT 1, output TEXT, error TEXT
      );
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_job_status ON job_applications(status);
      CREATE INDEX IF NOT EXISTS idx_freelance_status ON freelance_leads(status);
      CREATE INDEX IF NOT EXISTS idx_notify_sent_at ON notify_log(sent_at);
      CREATE INDEX IF NOT EXISTS idx_cron_job_name ON cron_log(job_name, started_at);
    `);
    db2.exec("PRAGMA user_version = 2");
    db2.close();

    // Now call initStateDb — should migrate v2 → v3
    const db3 = initStateDb(dbPath);
    const result = db3.query("PRAGMA user_version").get() as { user_version: number };
    db3.close();

    expect(result.user_version).toBe(3);
  });

  test("v3 adds parent_id TEXT column to orchestration_tasks", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    // Try inserting with parent_id
    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("task-1", "test", "pending", Date.now(), Date.now(), null);

    const row = db.query("SELECT parent_id FROM orchestration_tasks WHERE id = 'task-1'").get() as { parent_id: string | null };
    db.close();
    expect(row.parent_id).toBeNull();
  });

  test("v3 adds step_index INTEGER DEFAULT 0 column to orchestration_tasks", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("task-2", "test", "pending", Date.now(), Date.now());

    const row = db.query("SELECT step_index FROM orchestration_tasks WHERE id = 'task-2'").get() as { step_index: number };
    db.close();
    expect(row.step_index).toBe(0);
  });

  test("v3 adds step_output TEXT column to orchestration_tasks", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, step_output) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("task-3", "test", "pending", Date.now(), Date.now(), "some output");

    const row = db.query("SELECT step_output FROM orchestration_tasks WHERE id = 'task-3'").get() as { step_output: string };
    db.close();
    expect(row.step_output).toBe("some output");
  });

  test("v3 adds parent_goal TEXT column to orchestration_tasks", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, parent_goal) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("task-4", "test", "pending", Date.now(), Date.now(), "do the thing");

    const row = db.query("SELECT parent_goal FROM orchestration_tasks WHERE id = 'task-4'").get() as { parent_goal: string };
    db.close();
    expect(row.parent_goal).toBe("do the thing");
  });

  test("v3 adds yaml_source TEXT column to orchestration_tasks", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, yaml_source) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("task-5", "test", "pending", Date.now(), Date.now(), "/path/to/plan.yaml");

    const row = db.query("SELECT yaml_source FROM orchestration_tasks WHERE id = 'task-5'").get() as { yaml_source: string };
    db.close();
    expect(row.yaml_source).toBe("/path/to/plan.yaml");
  });

  test("existing v2 rows in orchestration_tasks are preserved after migration", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;

    // Build a v2 database with an existing row
    const db2 = new Database(dbPath);
    db2.exec("PRAGMA journal_mode=WAL");
    db2.exec(`
      CREATE TABLE IF NOT EXISTS orchestration_tasks (
        id          TEXT PRIMARY KEY,
        description TEXT,
        status      TEXT NOT NULL DEFAULT 'pending',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notify_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL,
        recipient TEXT NOT NULL, sent_at INTEGER NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal', success INTEGER NOT NULL DEFAULT 1, error TEXT
      );
      CREATE TABLE IF NOT EXISTS job_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, company TEXT NOT NULL, url TEXT,
        status TEXT NOT NULL DEFAULT 'new', found_date INTEGER NOT NULL,
        salary_range TEXT, location TEXT, match_score REAL,
        source_platform TEXT, notes TEXT, applied_date INTEGER,
        last_updated INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS freelance_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, company TEXT, url TEXT,
        status TEXT NOT NULL DEFAULT 'new', found_date INTEGER NOT NULL,
        salary_range TEXT, location TEXT, match_score REAL,
        source_platform TEXT, notes TEXT, applied_date INTEGER,
        last_updated INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_state (
        date TEXT PRIMARY KEY, briefing_sent INTEGER NOT NULL DEFAULT 0,
        eod_sent INTEGER NOT NULL DEFAULT 0, notes TEXT, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS content_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL,
        content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
        created_at INTEGER NOT NULL, posted_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS cron_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, job_name TEXT NOT NULL,
        started_at INTEGER NOT NULL, duration_ms INTEGER,
        success INTEGER NOT NULL DEFAULT 1, output TEXT, error TEXT
      );
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL
      );
    `);
    // Insert a v2 row
    db2.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run("existing-task", "pre-migration task", "done", 1000000, 1000001);
    db2.exec("PRAGMA user_version = 2");
    db2.close();

    // Migrate
    const db3 = initStateDb(dbPath);
    const row = db3.query("SELECT * FROM orchestration_tasks WHERE id = 'existing-task'").get() as {
      id: string; description: string; status: string; created_at: number; updated_at: number;
      parent_id: string | null; step_index: number; step_output: string | null;
      parent_goal: string | null; yaml_source: string | null;
    };
    db3.close();

    // Original data preserved
    expect(row).not.toBeNull();
    expect(row.id).toBe("existing-task");
    expect(row.description).toBe("pre-migration task");
    expect(row.status).toBe("done");
    expect(row.created_at).toBe(1000000);
    // New columns have defaults
    expect(row.parent_id).toBeNull();
    expect(row.step_index).toBe(0);
    expect(row.step_output).toBeNull();
    expect(row.parent_goal).toBeNull();
    expect(row.yaml_source).toBeNull();
  });

  test("fresh database (v0) creates schema at v3 directly", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);
    const result = db.query("PRAGMA user_version").get() as { user_version: number };

    // Verify orchestration_tasks has all v3 columns
    db.prepare(
      "INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, parent_id, step_index, step_output, parent_goal, yaml_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("fresh-task", "test", "pending", Date.now(), Date.now(), null, 0, null, "fresh goal", "/path.yaml");

    db.close();
    expect(result.user_version).toBe(3);
  });
});
