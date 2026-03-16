#!/usr/bin/env bun
/**
 * PSN Bridge CLI for ZeroClaw
 * Routes subcommands to PSN CLI entry points with secret injection.
 *
 * Usage:
 *   cli.ts <command> <subcommand> [args...]
 *
 * Commands:
 *   post, plan, capture, engage, voice, series, content,
 *   analytics, review, drafts, setup
 *
 * Output: JSON on stdout, errors on stderr.
 */

import { $ } from "bun";
import { existsSync } from "fs";

// ─── Constants ───────────────────────────────────────────────────────────────

const PSN_ROOT = "/home/hybridz/Projects/psn-enrique";

const ROUTE_MAP: Record<string, string> = {
  post: "src/cli/post.ts",
  plan: "src/cli/plan.ts",
  capture: "src/cli/capture.ts",
  engage: "src/cli/engage.ts",
  voice: "src/cli/voice-config.ts",
  series: "src/cli/series.ts",
  content: "src/content/generate.ts",
  analytics: "src/analytics/collector.ts",
  review: "src/analytics/review.ts",
  drafts: "src/content/drafts.ts",
  setup: "src/cli/setup.ts",
};

const LONG_TIMEOUT_COMMANDS = new Set(["content", "analytics", "review"]);
const DEFAULT_TIMEOUT_MS = 30_000;
const LONG_TIMEOUT_MS = 120_000;

// ─── Error Classification ────────────────────────────────────────────────────

type ErrorClass =
  | "TRANSIENT_NETWORK"
  | "RATE_LIMITED"
  | "AUTH_EXPIRED"
  | "VALIDATION"
  | "CONTENT_POLICY"
  | "UNKNOWN";

function classifyError(stderr: string): ErrorClass {
  const lower = stderr.toLowerCase();
  if (
    lower.includes("rate_limit") ||
    lower.includes("429") ||
    lower.includes("too many requests")
  )
    return "RATE_LIMITED";
  if (
    lower.includes("auth_expired") ||
    lower.includes("token_expired") ||
    lower.includes("requiresreauth") ||
    lower.includes("unauthorized") ||
    lower.includes("401")
  )
    return "AUTH_EXPIRED";
  if (
    lower.includes("connection") ||
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed")
  )
    return "TRANSIENT_NETWORK";
  if (
    lower.includes("duplicate") ||
    lower.includes("policy") ||
    lower.includes("content_policy")
  )
    return "CONTENT_POLICY";
  if (
    lower.includes("missing") ||
    lower.includes("invalid") ||
    lower.includes("required")
  )
    return "VALIDATION";
  return "UNKNOWN";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function err(msg: string): never {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runPsnCommand(
  script: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fullPath = `${PSN_ROOT}/${script}`;
  if (!existsSync(fullPath)) {
    err(`PSN script not found: ${fullPath}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result =
      await $`bun run ${fullPath} ${args}`.cwd(PSN_ROOT).quiet().nothrow();
    return {
      stdout: result.stdout.toString().trim(),
      stderr: result.stderr.toString().trim(),
      exitCode: result.exitCode,
    };
  } catch (e) {
    if (controller.signal.aborted) {
      return {
        stdout: "",
        stderr: `Timeout after ${timeoutMs}ms`,
        exitCode: 124,
      };
    }
    return {
      stdout: "",
      stderr: e instanceof Error ? e.message : String(e),
      exitCode: 1,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runWithRetry(
  script: string,
  args: string[],
  timeoutMs: number,
): Promise<void> {
  const result = await runPsnCommand(script, args, timeoutMs);

  if (result.exitCode === 0) {
    // Success — pass through stdout as-is (already JSON from PSN)
    if (result.stdout) {
      console.log(result.stdout);
    }
    return;
  }

  // Classify the error
  const errorClass = classifyError(result.stderr);

  // Retry transient network errors once
  if (errorClass === "TRANSIENT_NETWORK") {
    await Bun.sleep(2000);
    const retry = await runPsnCommand(script, args, timeoutMs);
    if (retry.exitCode === 0) {
      if (retry.stdout) {
        console.log(retry.stdout);
      }
      return;
    }
    // Second retry with longer backoff
    await Bun.sleep(4000);
    const retry2 = await runPsnCommand(script, args, timeoutMs);
    if (retry2.exitCode === 0) {
      if (retry2.stdout) {
        console.log(retry2.stdout);
      }
      return;
    }
    // All retries exhausted
    console.log(
      JSON.stringify({
        error: retry2.stderr || result.stderr,
        errorClass,
        exitCode: retry2.exitCode,
        retries: 2,
      }),
    );
    process.exit(1);
  }

  // Non-retryable — return classified error
  console.log(
    JSON.stringify({
      error: result.stderr,
      errorClass,
      exitCode: result.exitCode,
    }),
  );
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const command = argv[0];
const subArgs = argv.slice(1);

if (!command || command === "help" || command === "--help") {
  const help = `psn_cli — PSN bridge for ZeroClaw

Usage: psn_cli <command> [subcommand] [args...]

Commands:
  post <sub> [args]       Post lifecycle (create, schedule, now, cancel, status, failures, list)
  plan <sub> [args]       Weekly content planning (generate, show, finalize)
  capture <text>          Idea bank capture and management (add, list, stats, search)
  engage <sub> [args]     Engagement sessions (session, triage, draft, execute, stats)
  voice <sub> [args]      Voice profile (show, tweak, calibrate, apply)
  series <sub> [args]     Series management (create, list, pause, resume, retire, due)
  content <sub> [args]    Content generation (build-context, generate, suggest-topics)
  analytics <sub>         Analytics (collect, summary)
  review <sub>            Performance review (weekly, monthly)
  drafts <sub> [args]     Draft management (list, show, approve, delete)
  setup <sub> [args]      Hub setup and configuration

Output: JSON to stdout. Errors: JSON to stderr with errorClass field.`;
  console.log(help);
  process.exit(0);
}

const script = ROUTE_MAP[command];
if (!script) {
  err(
    `Unknown command: ${command}. Use: ${Object.keys(ROUTE_MAP).join(", ")}`,
  );
}

const timeoutMs = LONG_TIMEOUT_COMMANDS.has(command)
  ? LONG_TIMEOUT_MS
  : DEFAULT_TIMEOUT_MS;

await runWithRetry(script, subArgs, timeoutMs);
