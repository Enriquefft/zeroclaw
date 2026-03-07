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

  test("PRAGMA user_version returns 2 after init", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);
    const result = db.query("PRAGMA user_version").get() as { user_version: number };
    db.close();
    expect(result.user_version).toBe(2);
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

  test("all 4 indexes exist", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;
    const db = initStateDb(dbPath);

    const expectedIndexes = [
      "idx_job_status",
      "idx_freelance_status",
      "idx_notify_sent_at",
      "idx_cron_job_name",
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

  test("running initStateDb on existing v2 DB skips schema creation", async () => {
    const mod = await import("./init-state-db.ts");
    initStateDb = mod.initStateDb;

    // First run — creates schema at v2
    const db1 = initStateDb(dbPath);
    db1.close();

    // Second run — user_version still 2, schema not re-applied
    const db2 = initStateDb(dbPath);
    const result = db2.query("PRAGMA user_version").get() as { user_version: number };
    db2.close();

    expect(result.user_version).toBe(2);
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
});
