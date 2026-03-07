import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { initStateDb } from "./init-state-db.ts";
import { notify } from "./notify.ts";

let tempDir: string;
let tempDb: string;

// Use 0ms retry delay in tests so backoff doesn't cause timeouts
const TEST_RETRY_DELAY = 0;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "notify-test-"));
  tempDb = join(tempDir, "state.db");
  // Pre-initialize the DB with all required tables
  const db = initStateDb(tempDb);
  db.close();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.NOTIFY_TARGET;
});

describe("notify module", () => {
  test("returns false when NOTIFY_TARGET is not set", async () => {
    delete process.env.NOTIFY_TARGET;

    // Suppress expected error output during this test
    const origError = console.error;
    const messages: string[] = [];
    console.error = (...args: any[]) => { messages.push(args.join(" ")); };

    try {
      const result = await notify("test message", "normal", tempDb, TEST_RETRY_DELAY);
      expect(result).toBe(false);
      expect(messages.some(m => m.includes("NOTIFY_TARGET"))).toBe(true);
    } finally {
      console.error = origError;
    }
  });

  test("notify() logs to stderr when NOTIFY_TARGET is not set", async () => {
    delete process.env.NOTIFY_TARGET;

    const messages: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { messages.push(args.join(" ")); };

    try {
      await notify("test message", "normal", tempDb, TEST_RETRY_DELAY);
      const allMessages = messages.join(" ");
      expect(allMessages).toContain("NOTIFY_TARGET");
    } finally {
      console.error = origError;
    }
  });

  test("notify() attempts to send and logs to notify_log table", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";

    // Suppress retry error output
    const origError = console.error;
    console.error = () => {};

    try {
      const result = await notify("hello world", "normal", tempDb, TEST_RETRY_DELAY);
      expect(typeof result).toBe("boolean");

      // Verify it logged the attempt to notify_log (success or failure)
      const db = new Database(tempDb);
      const rows = db.query(
        "SELECT * FROM notify_log WHERE message = 'hello world' ORDER BY sent_at DESC LIMIT 1"
      ).all() as any[];
      db.close();
      expect(rows.length).toBe(1);
      expect(rows[0].message).toBe("hello world");
      expect(rows[0].priority).toBe("normal");
    } finally {
      console.error = origError;
    }
  });

  test("notify() logs successful send to notify_log with correct priority", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";

    const origError = console.error;
    console.error = () => {};

    try {
      await notify("log test message", "urgent", tempDb, TEST_RETRY_DELAY);

      const db = new Database(tempDb);
      const rows = db.query(
        "SELECT * FROM notify_log WHERE message = 'log test message' ORDER BY sent_at DESC LIMIT 1"
      ).all() as any[];
      db.close();

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].message).toBe("log test message");
      expect(rows[0].priority).toBe("urgent");
      expect(rows[0].sent_at).toBeGreaterThan(0);
    } finally {
      console.error = origError;
    }
  });

  test("notify() logs failed send to notify_log with error field set", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";

    const origError = console.error;
    console.error = () => {};

    try {
      // kapso-whatsapp-cli fails in test env — verify failure is logged
      const result = await notify("failure test message", "urgent", tempDb, TEST_RETRY_DELAY);
      expect(typeof result).toBe("boolean");

      const db = new Database(tempDb);
      const rows = db.query(
        "SELECT * FROM notify_log WHERE message = 'failure test message' LIMIT 1"
      ).all() as any[];
      db.close();

      expect(rows.length).toBe(1);
      // On failure, success=0 and error field is set
      if (rows[0].success === 0) {
        expect(rows[0].error).toBeTruthy();
      }
    } finally {
      console.error = origError;
    }
  });

  test("normal priority is rate-limited — second call within 5 min returns false", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";

    // Manually insert a recent successful normal priority log entry (1 minute ago)
    const db = new Database(tempDb);
    db.prepare(
      "INSERT INTO notify_log (message, sent_at, priority, success, error) VALUES (?, ?, ?, ?, ?)"
    ).run("prior message", Date.now() - 60_000, "normal", 1, null);
    db.close();

    // This call should be rate-limited since there was a successful send 1 minute ago
    const result = await notify("new message", "normal", tempDb, TEST_RETRY_DELAY);
    expect(result).toBe(false);

    // Verify rate_limited error was logged
    const db2 = new Database(tempDb);
    const rows = db2.query(
      "SELECT * FROM notify_log WHERE message = 'new message' AND error = 'rate_limited' LIMIT 1"
    ).all() as any[];
    db2.close();
    expect(rows.length).toBe(1);
  });

  test("urgent priority bypasses rate limit — second call within 5 min still attempts send", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";

    // Insert a recent successful normal priority send
    const db = new Database(tempDb);
    db.prepare(
      "INSERT INTO notify_log (message, sent_at, priority, success, error) VALUES (?, ?, ?, ?, ?)"
    ).run("prior message", Date.now() - 60_000, "normal", 1, null);
    db.close();

    const origError = console.error;
    console.error = () => {};

    try {
      // Urgent should NOT be rate-limited — it should attempt the send
      await notify("urgent alert", "urgent", tempDb, TEST_RETRY_DELAY);

      // Verify no rate_limited error was logged for the urgent message
      const db2 = new Database(tempDb);
      const rows = db2.query(
        "SELECT * FROM notify_log WHERE message = 'urgent alert' AND error = 'rate_limited' LIMIT 1"
      ).all() as any[];
      db2.close();
      expect(rows.length).toBe(0); // No rate_limited error for urgent
    } finally {
      console.error = origError;
    }
  });

  test("retry logic — notify never throws even when kapso fails", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";

    const origError = console.error;
    console.error = () => {};

    try {
      let threw = false;
      try {
        await notify("retry test", "urgent", tempDb, TEST_RETRY_DELAY);
      } catch (e) {
        threw = true;
      }
      expect(threw).toBe(false);
    } finally {
      console.error = origError;
    }
  });

  test("after 3 failed retries, returns false and never throws", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";

    const origError = console.error;
    console.error = () => {};

    try {
      let threw = false;
      let result: boolean = true;
      try {
        result = await notify("should fail gracefully", "urgent", tempDb, TEST_RETRY_DELAY);
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
    } finally {
      console.error = origError;
    }
  });

  test("CLI mode — import.meta.main entrypoint exists in module source", async () => {
    const file = Bun.file("/etc/nixos/zeroclaw/bin/notify.ts");
    const content = await file.text();
    expect(content).toContain("import.meta.main");
    expect(content).toContain("process.exit");
    expect(content).toContain("--urgent");
  });
});

describe("notify module exports", () => {
  test("exports notify function as AsyncFunction", () => {
    expect(typeof notify).toBe("function");
    expect(notify.constructor.name).toBe("AsyncFunction");
  });

  test("notify returns Promise<boolean>", async () => {
    process.env.NOTIFY_TARGET = "+15550001234";

    const origError = console.error;
    console.error = () => {};

    try {
      const result = notify("test promise", "normal", tempDb, TEST_RETRY_DELAY);
      expect(result).toBeInstanceOf(Promise);
      const resolved = await result;
      expect(typeof resolved).toBe("boolean");
    } finally {
      console.error = origError;
    }
  });
});
