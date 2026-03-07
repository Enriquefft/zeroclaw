import { Database } from "bun:sqlite";
import { $ } from "bun";
import { initStateDb } from "./init-state-db.ts";

export type Priority = "normal" | "urgent";

const DEFAULT_DB_PATH = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

function isRateLimited(db: Database): boolean {
  const last = db
    .query(
      "SELECT sent_at FROM notify_log WHERE success = 1 AND priority = 'normal' ORDER BY sent_at DESC LIMIT 1"
    )
    .get() as { sent_at: number } | null;
  return !!last && Date.now() - last.sent_at < RATE_LIMIT_MS;
}

function logResult(
  db: Database,
  message: string,
  recipient: string,
  priority: Priority,
  success: boolean,
  error?: string
): void {
  db.prepare(
    "INSERT INTO notify_log (message, recipient, sent_at, priority, success, error) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(message, recipient, Date.now(), priority, success ? 1 : 0, error ?? null);
}

async function sendWithRetry(
  to: string,
  text: string,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await $`kapso-whatsapp-cli send --to ${to} --text ${text}`.quiet();
      return true;
    } catch (e) {
      if (attempt < maxAttempts) {
        await Bun.sleep(baseDelayMs * Math.pow(2, attempt - 1)); // 1s, 2s, 4s (or scaled for tests)
      } else {
        console.error(
          `notify: delivery failed after ${maxAttempts} attempts:`,
          e
        );
      }
    }
  }
  return false;
}

/**
 * Send a WhatsApp notification via kapso-whatsapp-cli.
 *
 * @param message - The message to send
 * @param recipient - Phone number to send to (e.g., "+51926689401")
 * @param priority - "normal" (rate-limited, 5-min gap) or "urgent" (bypasses rate limit)
 * @param dbPath - Optional DB path override (for testing)
 * @param _retryDelayMs - Optional retry base delay in ms (for testing — default 1000ms)
 * @returns true on successful send, false on failure or rate-limit (never throws)
 */
export async function notify(
  message: string,
  recipient: string,
  priority: Priority = "normal",
  dbPath: string = DEFAULT_DB_PATH,
  _retryDelayMs: number = 1000
): Promise<boolean> {
  if (!recipient) {
    console.error("notify: recipient phone number is required");
    return false;
  }

  const db = initStateDb(dbPath);
  try {
    if (priority === "normal" && isRateLimited(db)) {
      logResult(db, message, recipient, priority, false, "rate_limited");
      return false;
    }

    const success = await sendWithRetry(recipient, message, 3, _retryDelayMs);
    logResult(
      db,
      message,
      recipient,
      priority,
      success,
      success ? undefined : "delivery_failed"
    );
    return success;
  } catch (e) {
    console.error("notify: unexpected error:", e);
    try {
      logResult(db, message, recipient, priority, false, String(e));
    } catch {
      // If logging itself fails, don't throw
    }
    return false;
  } finally {
    db.close();
  }
}

// CLI entrypoint — only runs when invoked directly
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.error("Usage: notify.ts --to <phone> [--urgent] <message>");
    process.exit(1);
  }

  const toIdx = args.indexOf("--to");
  const recipient = toIdx !== -1 ? args[toIdx + 1] : undefined;
  if (!recipient) {
    console.error("Usage: notify.ts --to <phone> [--urgent] <message>");
    process.exit(1);
  }

  const priority: Priority = args.includes("--urgent") ? "urgent" : "normal";
  const message = args
    .filter((_, i) => i !== toIdx && i !== toIdx + 1 && !args[i].startsWith("--"))
    .join(" ");

  if (!message) {
    console.error("Usage: notify.ts --to <phone> [--urgent] <message>");
    process.exit(1);
  }

  const ok = await notify(message, recipient, priority);
  process.exit(ok ? 0 : 1);
}
