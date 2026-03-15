#!/usr/bin/env bun
/**
 * PSN State Reconciliation — syncs state.db with PSN's Neon Postgres.
 * Program (deterministic, no LLM). Runs every 15 minutes via cron.
 *
 * Reconciles:
 * 1. Pending post status (state.db vs PSN)
 * 2. Approval timeout cascade (4h/12h/24h/72h)
 * 3. Stale entry cleanup (>48h)
 *
 * Output: JSON to stdout. Errors to stderr, exit 1.
 */

import { $ } from "bun";
import { Database } from "bun:sqlite";
import { initStateDb } from "./init-state-db.ts";
import { notify } from "./notify.ts";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const PSN_CLI = "/etc/nixos/zeroclaw/skills/psn/cli.ts";
const ENRIQUE_PHONE = "+51926689401";

const HOUR_MS = 60 * 60 * 1000;
const TIMEOUT_CASCADE = [
  { hours: 4, action: "resend" as const },
  { hours: 12, action: "reminder" as const },
  { hours: 24, action: "urgent" as const },
  { hours: 72, action: "auto_reject" as const },
];

// ─── KV Store Helpers ────────────────────────────────────────────────────────

function kvGet(db: Database, key: string): string | null {
  const row = db
    .query("SELECT value FROM kv_store WHERE key = ?")
    .get(key) as { value: string } | null;
  return row?.value ?? null;
}

function kvSet(db: Database, key: string, value: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)"
  ).run(key, value, Date.now());
}

function kvDelete(db: Database, key: string): void {
  db.prepare("DELETE FROM kv_store WHERE key = ?").run(key);
}

function kvListByPrefix(
  db: Database,
  prefix: string,
): Array<{ key: string; value: string }> {
  return db
    .query("SELECT key, value FROM kv_store WHERE key LIKE ?")
    .all(`${prefix}%`) as Array<{ key: string; value: string }>;
}

// ─── PSN CLI Wrapper ─────────────────────────────────────────────────────────

async function psnCommand(
  ...args: string[]
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const result =
      await $`bun run ${PSN_CLI} ${args}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      return { ok: false, error: result.stderr.toString().trim() };
    }
    const stdout = result.stdout.toString().trim();
    if (!stdout) return { ok: true };
    try {
      return { ok: true, data: JSON.parse(stdout) };
    } catch {
      return { ok: true, data: stdout };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Reconciliation Logic ────────────────────────────────────────────────────

interface ReconcileResult {
  pendingChecked: number;
  statusUpdated: number;
  approvalsChecked: number;
  reminders: number;
  autoRejected: number;
  cleaned: number;
  errors: string[];
}

async function reconcile(dbPath: string = DEFAULT_DB_PATH): Promise<ReconcileResult> {
  const db = initStateDb(dbPath);
  const result: ReconcileResult = {
    pendingChecked: 0,
    statusUpdated: 0,
    approvalsChecked: 0,
    reminders: 0,
    autoRejected: 0,
    cleaned: 0,
    errors: [],
  };

  try {
    const now = Date.now();

    // 1. Reconcile pending posts
    const pendingPosts = kvListByPrefix(db, "psn_pending_");
    for (const entry of pendingPosts) {
      result.pendingChecked++;
      const postId = entry.key.replace("psn_pending_", "");

      const status = await psnCommand("post", "status", "--post-id", postId);
      if (!status.ok) {
        result.errors.push(`post status ${postId}: ${status.error}`);
        continue;
      }

      const postData = status.data as Record<string, unknown> | undefined;
      const postStatus = postData?.status as string | undefined;

      if (postStatus === "published") {
        kvDelete(db, entry.key);
        result.statusUpdated++;
      } else if (postStatus === "failed") {
        kvDelete(db, entry.key);
        result.statusUpdated++;
        notify(
          `PSN post failed: ${postId}. Check psn_cli post status --post-id ${postId}`,
          ENRIQUE_PHONE,
          "urgent",
        ).catch(() => {});
      }
    }

    // 2. Approval timeout cascade
    const approvals = kvListByPrefix(db, "psn_approval_");
    for (const entry of approvals) {
      result.approvalsChecked++;
      let approval: {
        requested_at: number;
        platform: string;
        content_preview: string;
        last_reminder?: string;
      };

      try {
        approval = JSON.parse(entry.value);
      } catch {
        result.errors.push(`invalid approval entry: ${entry.key}`);
        continue;
      }

      const elapsedMs = now - approval.requested_at;
      const elapsedHours = elapsedMs / HOUR_MS;
      const postId = entry.key.replace("psn_approval_", "");

      // Find the highest applicable cascade tier
      let applicableAction: (typeof TIMEOUT_CASCADE)[number] | null = null;
      for (const tier of TIMEOUT_CASCADE) {
        if (elapsedHours >= tier.hours) {
          applicableAction = tier;
        }
      }

      if (!applicableAction) continue;

      // Skip if we already sent this tier's notification
      if (approval.last_reminder === applicableAction.action) continue;

      if (applicableAction.action === "auto_reject") {
        // 72h — auto-reject
        await psnCommand("post", "cancel", "--post-id", postId);
        kvDelete(db, entry.key);
        result.autoRejected++;
        notify(
          `Post ${postId} auto-rejected after 72h without approval.`,
          ENRIQUE_PHONE,
        ).catch(() => {});
      } else {
        // Send reminder at appropriate urgency
        const messages: Record<string, string> = {
          resend: `Reminder: Post awaiting your approval\nPlatform: ${approval.platform}\nPreview: ${approval.content_preview?.slice(0, 100)}...\nReply APPROVE ${postId} or KILL ${postId}`,
          reminder: `Post still needs your approval (${Math.round(elapsedHours)}h)\nPost ID: ${postId}\nPlatform: ${approval.platform}`,
          urgent: `URGENT: Post will expire if not reviewed (${Math.round(elapsedHours)}h)\nPost ID: ${postId}`,
        };

        const priority = applicableAction.action === "urgent" ? "urgent" : "normal";
        await notify(
          messages[applicableAction.action] ?? `Approval needed: ${postId}`,
          ENRIQUE_PHONE,
          priority as "normal" | "urgent",
        );
        result.reminders++;

        // Mark this tier as sent
        approval.last_reminder = applicableAction.action;
        kvSet(db, entry.key, JSON.stringify(approval));
      }
    }

    // 3. Clean stale entries (>48h for pending, approvals handled by cascade)
    const staleThreshold = now - 48 * HOUR_MS;
    for (const entry of pendingPosts) {
      try {
        const data = JSON.parse(entry.value);
        if (data.created_at && data.created_at < staleThreshold) {
          kvDelete(db, entry.key);
          result.cleaned++;
        }
      } catch {
        // Non-JSON entries older than 48h — clean them
        kvDelete(db, entry.key);
        result.cleaned++;
      }
    }
  } finally {
    db.close();
  }

  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  try {
    const result = await reconcile();
    console.log(JSON.stringify(result));
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (e) {
    console.error(JSON.stringify({ error: String(e) }));
    process.exit(1);
  }
}

export { reconcile };
