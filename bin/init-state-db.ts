import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DEFAULT_DB_PATH = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const SCHEMA_VERSION = 4;

const SCHEMA_V1_DDL = `
-- Job application tracking
CREATE TABLE IF NOT EXISTS job_applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  company     TEXT NOT NULL,
  url         TEXT,
  status      TEXT NOT NULL DEFAULT 'new',
  found_date  INTEGER NOT NULL,
  salary_range TEXT,
  location    TEXT,
  match_score REAL,
  source_platform TEXT,
  notes       TEXT,
  applied_date INTEGER,
  last_updated INTEGER NOT NULL
);

-- Freelance lead tracking
CREATE TABLE IF NOT EXISTS freelance_leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  company     TEXT,
  url         TEXT,
  status      TEXT NOT NULL DEFAULT 'new',
  found_date  INTEGER NOT NULL,
  salary_range TEXT,
  location    TEXT,
  match_score REAL,
  source_platform TEXT,
  notes       TEXT,
  applied_date INTEGER,
  last_updated INTEGER NOT NULL
);

-- Daily planner state (one row per day)
CREATE TABLE IF NOT EXISTS daily_state (
  date        TEXT PRIMARY KEY,
  briefing_sent INTEGER NOT NULL DEFAULT 0,
  eod_sent    INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  updated_at  INTEGER NOT NULL
);

-- Content pipeline log
CREATE TABLE IF NOT EXISTS content_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  platform    TEXT NOT NULL,
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  INTEGER NOT NULL,
  posted_at   INTEGER
);

-- Orchestration task tracking (v4: includes subtask + queue columns)
CREATE TABLE IF NOT EXISTS orchestration_tasks (
  id          TEXT PRIMARY KEY,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  parent_id   TEXT,
  step_index  INTEGER NOT NULL DEFAULT 0,
  step_output TEXT,
  parent_goal TEXT,
  yaml_source TEXT,
  pid         INTEGER,
  queued_at   INTEGER,
  started_work_at INTEGER
);

-- Notification delivery log (used for rate limiting + audit)
CREATE TABLE IF NOT EXISTS notify_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message     TEXT NOT NULL,
  recipient   TEXT NOT NULL,
  sent_at     INTEGER NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'normal',
  success     INTEGER NOT NULL DEFAULT 1,
  error       TEXT
);

-- Cron job execution log
CREATE TABLE IF NOT EXISTS cron_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name    TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  duration_ms INTEGER,
  success     INTEGER NOT NULL DEFAULT 1,
  output      TEXT,
  error       TEXT
);

-- Ad-hoc key-value store
CREATE TABLE IF NOT EXISTS kv_store (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  INTEGER NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_job_status     ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_freelance_status ON freelance_leads(status);
CREATE INDEX IF NOT EXISTS idx_notify_sent_at ON notify_log(sent_at);
CREATE INDEX IF NOT EXISTS idx_cron_job_name  ON cron_log(job_name, started_at);
CREATE INDEX IF NOT EXISTS idx_orch_parent    ON orchestration_tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_orch_status    ON orchestration_tasks(status);
`;

export function initStateDb(dbPath: string = DEFAULT_DB_PATH): Database {
  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Set WAL mode FIRST (before any DDL) to prevent race conditions
  db.exec("PRAGMA journal_mode=WAL");
  // Set busy_timeout SECOND to handle concurrent access
  db.exec("PRAGMA busy_timeout=5000");

  // Check schema version — skip DDL if already initialized
  const currentVersion = (
    db.query("PRAGMA user_version").get() as { user_version: number }
  ).user_version;

  if (currentVersion === 0) {
    // Fresh database — create schema at v3 directly
    db.exec(SCHEMA_V1_DDL);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (currentVersion === 1) {
    // v1 → v2: add recipient column to notify_log
    db.exec("BEGIN");
    db.exec("ALTER TABLE notify_log ADD COLUMN recipient TEXT NOT NULL DEFAULT ''");
    db.exec("COMMIT");
    // v2 → v3: add orchestration subtask columns
    db.exec("BEGIN");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN parent_id TEXT");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN step_index INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN step_output TEXT");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN parent_goal TEXT");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN yaml_source TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_orch_parent ON orchestration_tasks(parent_id)");
    db.exec("COMMIT");
    // Fall through to v3→v4
  } else if (currentVersion === 2) {
    // v2 → v3: add orchestration subtask tracking columns
    db.exec("BEGIN");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN parent_id TEXT");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN step_index INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN step_output TEXT");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN parent_goal TEXT");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN yaml_source TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_orch_parent ON orchestration_tasks(parent_id)");
    db.exec("COMMIT");
    // Fall through to v3→v4
  }

  // v3 → v4: add queue/worker columns, clean orphans
  if (currentVersion >= 2 && currentVersion <= 3) {
    db.exec("BEGIN");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN pid INTEGER");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN queued_at INTEGER");
    db.exec("ALTER TABLE orchestration_tasks ADD COLUMN started_work_at INTEGER");
    db.exec("CREATE INDEX IF NOT EXISTS idx_orch_status ON orchestration_tasks(status)");
    db.exec(
      `UPDATE orchestration_tasks SET status = 'failed',
        step_output = 'orphaned: pre-v4 migration cleanup',
        updated_at = ${Date.now()}
      WHERE status = 'running'`
    );
    db.exec("COMMIT");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  return db;
}

// CLI entrypoint — only runs when invoked directly
if (import.meta.main) {
  const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;
  const db = initStateDb(dbPath);
  const version = (
    db.query("PRAGMA user_version").get() as { user_version: number }
  ).user_version;
  db.close();
  console.log(`state.db initialized at ${dbPath} (schema v${version})`);
}
