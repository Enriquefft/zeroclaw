import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DEFAULT_DB_PATH = `${Bun.env.HOME}/.zeroclaw/workspace/state.db`;
const SCHEMA_VERSION = 1;

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

-- Orchestration task tracking
CREATE TABLE IF NOT EXISTS orchestration_tasks (
  id          TEXT PRIMARY KEY,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Notification delivery log (used for rate limiting + audit)
CREATE TABLE IF NOT EXISTS notify_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message     TEXT NOT NULL,
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
    db.exec(SCHEMA_V1_DDL);
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
