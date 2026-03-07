#!/usr/bin/env bun
/**
 * cli.test.ts — Orchestrate skill CLI tests
 *
 * Tests all subcommands (list, status, cancel, run, unknown)
 * using a temp DB for isolation via --db-path flag.
 */

import { test, expect, describe, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { initStateDb } from "../../bin/init-state-db.ts";

const CLI_PATH = join(import.meta.dir, "cli.ts");

// Create an isolated temp DB for all tests in this file
const TEMP_DIR = join(tmpdir(), `orchestrate-test-${Date.now()}`);
const TEMP_DB = join(TEMP_DIR, "state.db");

mkdirSync(TEMP_DIR, { recursive: true });

// Initialize the DB schema so the CLI can query it
const db = initStateDb(TEMP_DB);

// Insert a test parent row for status/cancel tests
const TEST_PARENT_ID = "test-parent-1";
db.prepare(`
  INSERT INTO orchestration_tasks (id, description, status, created_at, updated_at, step_index, parent_goal, yaml_source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(TEST_PARENT_ID, "Test goal", "completed", Date.now() - 1000, Date.now(), 0, "Test goal", "/tmp/test.yaml");

db.close();

// Helper: run the CLI with given args and --db-path
async function runCli(
  args: string[],
  extraEnv: Record<string, string> = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(
    ["bun", "run", CLI_PATH, ...args, "--db-path", TEMP_DB],
    {
      env: { ...process.env, ...extraEnv },
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { exitCode, stdout, stderr };
}

afterAll(() => {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
});

describe("orchestrate list", () => {
  test("exits 0 and returns valid JSON array", async () => {
    const { exitCode, stdout } = await runCli(["list"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
  });
});

describe("orchestrate status", () => {
  test("status with no ID exits 0 and returns valid JSON", async () => {
    const { exitCode, stdout } = await runCli(["status"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(typeof parsed).toBe("object");
    expect(Array.isArray(parsed) || typeof parsed === "object").toBe(true);
  });

  test("status with fake ID exits 0 and returns JSON with empty steps array", async () => {
    const { exitCode, stdout } = await runCli(["status", "nonexistent-id-12345"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("steps");
    expect(Array.isArray(parsed.steps)).toBe(true);
    expect(parsed.steps.length).toBe(0);
  });
});

describe("orchestrate cancel", () => {
  test("cancel with fake ID exits 0 (no-op on nonexistent)", async () => {
    const { exitCode, stdout } = await runCli(["cancel", "fake-id-99999"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("cancelled");
  });
});

describe("orchestrate run", () => {
  test("run with no target exits 1 with error JSON", async () => {
    const { exitCode, stderr } = await runCli(["run"]);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stderr);
    expect(parsed).toHaveProperty("error");
  });
});

describe("unknown subcommand", () => {
  test("unknown subcommand exits 1 with error JSON", async () => {
    const { exitCode, stderr } = await runCli(["foobar"]);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stderr);
    expect(parsed).toHaveProperty("error");
  });
});
