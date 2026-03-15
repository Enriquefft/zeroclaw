#!/usr/bin/env bun
/**
 * PSN Voice Sync — one-way sync from SOUL.md to PSN voice profile.
 * Program (deterministic, no LLM). Extracts voice identity fields from SOUL.md
 * and merges them into PSN's voice profile, preserving PSN-owned calibration data.
 *
 * Output: JSON to stdout. Errors to stderr, exit 1.
 */

import { $ } from "bun";
import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { initStateDb } from "./init-state-db.ts";

// ─── Constants ───────────────────────────────────────────────────────────────

const SOUL_PATH = "/etc/nixos/zeroclaw/documents/SOUL.md";
const PSN_CLI = "/etc/nixos/zeroclaw/skills/psn/cli.ts";
const DEFAULT_DB_PATH = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;

// ─── SOUL.md Parser ──────────────────────────────────────────────────────────

interface SoulExtract {
  killList: string[];
  xTone: string | null;
  linkedinTone: string | null;
  formality: number;
  extraAvoids: string[];
}

function parseSoulMd(content: string): SoulExtract {
  const lines = content.split("\n");
  const killList: string[] = [];
  const extraAvoids: string[] = [];
  let xTone: string | null = null;
  let linkedinTone: string | null = null;
  let formality = 3; // casual, direct, concise = low formality

  let inKillList = false;
  let inPlatformAdaptation = false;
  let currentPlatform: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.startsWith("### Kill List")) {
      inKillList = true;
      inPlatformAdaptation = false;
      currentPlatform = null;
      continue;
    }
    if (trimmed.startsWith("### Platform Adaptation")) {
      inKillList = false;
      inPlatformAdaptation = true;
      currentPlatform = null;
      continue;
    }
    if (trimmed.startsWith("### Core Rules")) {
      inKillList = false;
      inPlatformAdaptation = false;
      currentPlatform = null;
      // Parse core rules for avoid items
      continue;
    }
    if (trimmed.startsWith("### ") || trimmed.startsWith("## ")) {
      inKillList = false;
      inPlatformAdaptation = false;
      currentPlatform = null;
      continue;
    }

    // Kill List items
    if (inKillList && trimmed.startsWith("- ")) {
      const item = trimmed
        .slice(2)
        .replace(/^["']|["']$/g, "")
        .replace(/^"(.+)"$/, "$1");
      if (item) killList.push(item);
      continue;
    }

    // Platform Adaptation
    if (inPlatformAdaptation) {
      if (trimmed.startsWith("- **X/Twitter:**") || trimmed.startsWith("- **X:**")) {
        const tone = trimmed.replace(/^- \*\*X(?:\/Twitter)?:\*\*\s*/, "").trim();
        if (tone) xTone = tone;
        continue;
      }
      if (trimmed.startsWith("- **LinkedIn:**")) {
        const tone = trimmed.replace(/^- \*\*LinkedIn:\*\*\s*/, "").trim();
        if (tone) linkedinTone = tone;
        continue;
      }
    }

    // Core Rules — detect "no em dashes" style rules
    if (trimmed.startsWith("- Never use em dashes") || trimmed.includes("no em dashes")) {
      extraAvoids.push("\u2014"); // em dash character
    }
  }

  return { killList, xTone, linkedinTone, formality, extraAvoids };
}

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Read SOUL.md and compute hash
  if (!existsSync(SOUL_PATH)) {
    console.log(JSON.stringify({ synced: false, reason: "SOUL.md not found" }));
    return;
  }

  const soulContent = readFileSync(SOUL_PATH, "utf-8");
  const soulHash = createHash("sha256").update(soulContent).digest("hex");

  // 2. Check if changed since last sync
  const db = initStateDb(DEFAULT_DB_PATH);
  try {
    const lastHash = kvGet(db, "psn_soul_hash");
    if (lastHash === soulHash) {
      console.log(JSON.stringify({ synced: false, reason: "no changes" }));
      return;
    }

    // 3. Parse SOUL.md
    const extract = parseSoulMd(soulContent);

    // 4. Build tweaks array
    const tweaks: Array<Record<string, unknown>> = [];
    const changes: string[] = [];

    // Add kill list items as banned words
    const allAvoids = [...extract.killList, ...extract.extraAvoids];
    for (const word of allAvoids) {
      tweaks.push({ type: "add_banned_word", word });
    }
    if (allAvoids.length > 0) {
      changes.push(`updated avoid list (+${allAvoids.length})`);
    }

    // Set platform tones
    if (extract.xTone) {
      tweaks.push({ type: "set_platform_tone", platform: "x", tone: extract.xTone });
      changes.push(`set x tone to "${extract.xTone.slice(0, 40)}..."`);
    }
    if (extract.linkedinTone) {
      tweaks.push({
        type: "set_platform_tone",
        platform: "linkedin",
        tone: extract.linkedinTone,
      });
      changes.push(`set linkedin tone to "${extract.linkedinTone.slice(0, 40)}..."`);
    }

    // Set formality
    tweaks.push({ type: "adjust_formality", value: extract.formality });
    changes.push(`set formality to ${extract.formality}`);

    // 5. Apply tweaks via PSN CLI
    if (tweaks.length > 0) {
      const tweaksJson = JSON.stringify(tweaks);
      const result =
        await $`bun run ${PSN_CLI} voice tweak ${tweaksJson}`.quiet().nothrow();

      if (result.exitCode !== 0) {
        const stderr = result.stderr.toString().trim();
        console.error(`PSN voice tweak failed: ${stderr}`);
        console.log(
          JSON.stringify({
            synced: false,
            reason: "PSN CLI error",
            error: stderr,
          }),
        );
        process.exit(1);
      }
    }

    // 6. Verify SOUL.md didn't change during sync (idempotent re-run)
    const postSyncContent = readFileSync(SOUL_PATH, "utf-8");
    const postSyncHash = createHash("sha256").update(postSyncContent).digest("hex");
    if (postSyncHash !== soulHash) {
      // SOUL.md changed during sync — re-run will be triggered by next execution
      console.log(
        JSON.stringify({
          synced: true,
          changes,
          warning: "SOUL.md changed during sync — re-run recommended",
        }),
      );
    } else {
      console.log(JSON.stringify({ synced: true, changes }));
    }

    // 7. Update hash in kv_store
    kvSet(db, "psn_soul_hash", postSyncHash);
    kvSet(db, "psn_voice_synced_at", new Date().toISOString());
  } finally {
    db.close();
  }
}

await main();
