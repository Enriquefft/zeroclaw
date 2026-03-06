#!/usr/bin/env bun
// bin/sentinel-scan.ts — Sentinel scanner
// Reads ZeroClaw memory for unresolved issues, alerts via WhatsApp.
// Scan + alert only — repairs require agent reasoning (use sentinel skill on-demand).
// Output: JSON to stdout. Errors to stderr, exit 1.

import { Database } from "bun:sqlite";
import { $ } from "bun";

const MEMORY_DB = `${Bun.env.HOME}/.zeroclaw/workspace/memory/brain.db`;
const ALERT_TO = "+51926689401";

interface Issue {
  key: string;
  content: string;
  created_at: string;
}

// Types that are silently skipped (not real issues, never alert)
const SKIP_TYPES = new Set(["test"]);
// Types that are logged in JSON but do not trigger a WhatsApp alert
const SILENT_TYPES = new Set(["status", "info"]);

function parseType(content: string): string | null {
  const match = content.match(/\|\s*type:\s*(\S+)/i);
  return match ? match[1].toLowerCase() : null;
}

try {
  const db = new Database(MEMORY_DB, { readonly: true });

  // Fetch all issue keys
  const rows = db
    .query("SELECT key, content, created_at FROM memories WHERE key LIKE 'issue:%'")
    .all() as { key: string; content: string; created_at: string }[];

  db.close();

  // Build sets of issue keys and resolved keys
  const issueKeys = new Map<string, { content: string; created_at: string }>();
  const resolvedKeys = new Set<string>();

  for (const row of rows) {
    if (row.key.endsWith(":resolved")) {
      // Extract the base issue key: "issue:2025-01-01T00:00:00Z:resolved" → "issue:2025-01-01T00:00:00Z"
      const baseKey = row.key.replace(/:resolved$/, "");
      resolvedKeys.add(baseKey);
    } else {
      issueKeys.set(row.key, {
        content: row.content,
        created_at: row.created_at,
      });
    }
  }

  // Find unresolved issues, classified by alertability
  const unresolved: Issue[] = [];
  const skipped: Issue[] = [];
  const silent: Issue[] = [];

  for (const [key, data] of issueKeys) {
    if (!resolvedKeys.has(key)) {
      const issue = { key, content: data.content, created_at: data.created_at };
      const type = parseType(data.content);
      if (type && SKIP_TYPES.has(type)) {
        skipped.push(issue); // e.g. type: test — ignored entirely
      } else if (type && SILENT_TYPES.has(type)) {
        silent.push(issue);  // e.g. type: status — logged but not alerted
      } else {
        unresolved.push(issue); // real issues — alert
      }
    }
  }

  const alertable = unresolved;
  let alerted = false;

  if (alertable.length > 0) {
    const issueBlocks = alertable
      .map((i, idx) => `[${idx + 1}] ${i.key}\n${i.content}`)
      .join("\n\n");

    const msg = `🔴 Sentinel — ${alertable.length} unresolved issue${alertable.length > 1 ? "s" : ""}\n${"─".repeat(32)}\n\n${issueBlocks}\n\n${"─".repeat(32)}\nRun sentinel skill to attempt repairs.`;
    try {
      await $`kapso-whatsapp-cli send --to ${ALERT_TO} --text ${msg}`.quiet();
      alerted = true;
    } catch {
      console.error("Warning: WhatsApp alert delivery failed");
    }
  }

  console.log(
    JSON.stringify({
      found: rows.length,
      unresolved: alertable.length,
      silent: silent.length,
      skipped: skipped.length,
      alerted,
      issues: alertable.map((i) => ({ key: i.key, content: i.content })),
      silent_issues: silent.map((i) => ({ key: i.key, content: i.content })),
    })
  );
} catch (err) {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
}
