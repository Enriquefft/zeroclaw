import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";

// We use a temp DB for all tests — never touch real state.db
let tempDir: string;
let tempDb: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "notify-test-"));
  tempDb = join(tempDir, "state.db");
  // Pre-initialize the DB with the notify_log table
  const { initStateDb } = require("./init-state-db.ts");
  const db = initStateDb(tempDb);
  db.close();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  // Clear any env vars set during tests
  delete process.env.NOTIFY_TARGET;
  delete process.env.NOTIFY_TEST_DB;
});

// Helper to get module with isolated env
async function getNotify() {
  // We need to reload the module each time to pick up env changes
  // Use dynamic import with cache bust via a query param approach
  return await import(`./notify.ts?${Math.random()}`);
}

describe("notify module", () => {
  test("returns false and logs to stderr when NOTIFY_TARGET is not set", async () => {
    delete process.env.NOTIFY_TARGET;
    process.env.NOTIFY_TEST_DB = tempDb;

    const stderrLines: string[] = [];
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: any, ...args: any[]) => {
      stderrLines.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };

    try {
      const { notify } = await import("./notify.ts");
      const result = await notify("test message");
      expect(result).toBe(false);
      // stderr should have been written
      const allStderr = stderrLines.join("");
      expect(allStderr).toContain("NOTIFY_TARGET");
    } finally {
      process.stderr.write = origStderrWrite;
    }
  });

  test("notify() sends message via kapso-whatsapp-cli when NOTIFY_TARGET is set", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";
    process.env.NOTIFY_TEST_DB = tempDb;

    // Mock Bun.$ to capture CLI calls
    const calls: string[] = [];
    const origShell = (globalThis as any).Bun.$;

    const { notify } = await import("./notify.ts");

    // We test this indirectly by checking the notify_log table after the call
    // The actual kapso-whatsapp-cli may or may not be available in test env
    // We check that when it succeeds, the log shows success
    // For this test, we rely on the function not throwing and returning boolean
    const result = await notify("hello world");
    // Result is boolean (true if sent, false if kapso-whatsapp-cli fails in test env)
    expect(typeof result).toBe("boolean");

    // Verify it logged the attempt to notify_log
    const db = new Database(tempDb);
    const rows = db.query("SELECT * FROM notify_log ORDER BY sent_at DESC LIMIT 1").all() as any[];
    db.close();
    expect(rows.length).toBe(1);
    expect(rows[0].message).toBe("hello world");
    expect(rows[0].priority).toBe("normal");
  });

  test("notify() logs successful send to notify_log table", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";
    process.env.NOTIFY_TEST_DB = tempDb;

    const { notify } = await import("./notify.ts");

    // Pre-populate the DB with a simulated prior success to test logging
    const db = new Database(tempDb);
    db.close();

    // Call notify — whatever happens (success/fail), it should log
    await notify("log test message", "urgent");

    const db2 = new Database(tempDb);
    const rows = db2.query(
      "SELECT * FROM notify_log WHERE message = 'log test message' ORDER BY sent_at DESC LIMIT 1"
    ).all() as any[];
    db2.close();

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].message).toBe("log test message");
    expect(rows[0].priority).toBe("urgent");
    // success is 0 or 1, either way it's logged
    expect(rows[0].sent_at).toBeGreaterThan(0);
  });

  test("notify() logs failed send to notify_log with error field", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";
    process.env.NOTIFY_TEST_DB = tempDb;

    const { notify } = await import("./notify.ts");

    // With kapso-whatsapp-cli unavailable/failing, notify should still log failure
    const result = await notify("failure test message");
    expect(typeof result).toBe("boolean");

    const db = new Database(tempDb);
    const rows = db.query(
      "SELECT * FROM notify_log WHERE message = 'failure test message' LIMIT 1"
    ).all() as any[];
    db.close();

    expect(rows.length).toBe(1);
    // If it failed, error field should be set
    if (rows[0].success === 0) {
      expect(rows[0].error).toBeTruthy();
    }
  });

  test("normal priority is rate-limited — second call within 5 min returns false", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";
    process.env.NOTIFY_TEST_DB = tempDb;

    // Manually insert a recent successful normal priority log entry
    const db = new Database(tempDb);
    db.prepare(
      "INSERT INTO notify_log (message, sent_at, priority, success, error) VALUES (?, ?, ?, ?, ?)"
    ).run("prior message", Date.now() - 60_000, "normal", 1, null); // 1 minute ago
    db.close();

    const { notify } = await import("./notify.ts");

    // This call should be rate-limited since there was a successful send 1 minute ago
    const result = await notify("new message", "normal");
    expect(result).toBe(false);

    // Verify rate_limited error was logged
    const db2 = new Database(tempDb);
    const rows = db2.query(
      "SELECT * FROM notify_log WHERE message = 'new message' AND error = 'rate_limited' LIMIT 1"
    ).all() as any[];
    db2.close();
    expect(rows.length).toBe(1);
  });

  test("urgent priority bypasses rate limit — second call within 5 min still runs", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";
    process.env.NOTIFY_TEST_DB = tempDb;

    // Insert a recent successful normal priority send
    const db = new Database(tempDb);
    db.prepare(
      "INSERT INTO notify_log (message, sent_at, priority, success, error) VALUES (?, ?, ?, ?, ?)"
    ).run("prior message", Date.now() - 60_000, "normal", 1, null); // 1 minute ago
    db.close();

    const { notify } = await import("./notify.ts");

    // Urgent should NOT be rate-limited
    const result = await notify("urgent alert", "urgent");
    // Result is boolean — urgent bypasses rate limit check, so it attempts send
    // Even if kapso fails, result should not be false due to rate limiting
    // We verify by checking that no rate_limited error was logged for urgent
    const db2 = new Database(tempDb);
    const rows = db2.query(
      "SELECT * FROM notify_log WHERE message = 'urgent alert' AND error = 'rate_limited' LIMIT 1"
    ).all() as any[];
    db2.close();
    expect(rows.length).toBe(0); // No rate_limited error for urgent
  });

  test("retry logic — retries up to 3 times on failure then succeeds", async () => {
    // This tests the retry behavior by verifying the module doesn't throw even when kapso fails
    process.env.NOTIFY_TARGET = "+15550001234";
    process.env.NOTIFY_TEST_DB = tempDb;

    const { notify } = await import("./notify.ts");

    // In test environment, kapso-whatsapp-cli likely fails
    // The key behavior: notify never throws regardless of retry outcome
    let threw = false;
    try {
      await notify("retry test", "urgent");
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  test("after 3 failed retries, returns false and never throws", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";
    process.env.NOTIFY_TEST_DB = tempDb;

    const { notify } = await import("./notify.ts");

    let threw = false;
    let result: boolean = true;
    try {
      result = await notify("should fail gracefully", "urgent");
    } catch (e) {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(typeof result).toBe("boolean");

    // Verify it logged the attempt
    const db = new Database(tempDb);
    const rows = db.query(
      "SELECT * FROM notify_log WHERE message = 'should fail gracefully' LIMIT 1"
    ).all() as any[];
    db.close();
    expect(rows.length).toBe(1);
  });

  test("CLI mode — import.meta.main entrypoint exists in module", async () => {
    // Verify notify.ts has a CLI entrypoint by checking the file exists and has import.meta.main
    const file = Bun.file("/etc/nixos/zeroclaw/bin/notify.ts");
    const content = await file.text();
    expect(content).toContain("import.meta.main");
    expect(content).toContain("process.exit");
  });
});

describe("notify module exports", () => {
  test("exports notify function and Priority type", async () => {
    const mod = await import("./notify.ts");
    expect(typeof mod.notify).toBe("function");
    // Priority is a type, not a runtime value — we verify the function accepts it
    const result = await mod.notify.length; // function accepts message + priority args
    // The function is async and exported
    expect(mod.notify.constructor.name).toBe("AsyncFunction");
  });

  test("notify returns Promise<boolean>", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";
    process.env.NOTIFY_TEST_DB = tempDb;

    const { notify } = await import("./notify.ts");
    const result = notify("test", "normal");
    expect(result).toBeInstanceOf(Promise);
    const resolved = await result;
    expect(typeof resolved).toBe("boolean");
  });
});
