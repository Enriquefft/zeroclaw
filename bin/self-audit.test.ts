import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";

import {
  checkSymlinks,
  checkCronDrift,
  checkSkills,
  checkConfig,
} from "./self-audit.ts";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "self-audit-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────
// checkSymlinks
// ──────────────────────────────────────────────────────────────

describe("checkSymlinks", () => {
  test("returns empty array when all symlinks resolve correctly", () => {
    const source = join(tempDir, "IDENTITY.md");
    const deployed = join(tempDir, "IDENTITY-link.md");

    writeFileSync(source, "identity content");
    symlinkSync(source, deployed);

    const result = checkSymlinks([{ source, deployed }]);
    expect(result).toEqual([]);
  });

  test("returns drift item when a symlink is missing (file does not exist)", () => {
    const source = join(tempDir, "SOUL.md");
    const deployed = join(tempDir, "SOUL-link.md");
    // deployed does NOT exist

    const result = checkSymlinks([{ source, deployed }]);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("missing_symlink");
    expect(result[0].deployed).toBe(deployed);
  });

  test("returns drift item when symlink points to wrong target", () => {
    const source = join(tempDir, "AGENTS.md");
    const wrongSource = join(tempDir, "WRONG.md");
    const deployed = join(tempDir, "AGENTS-link.md");

    writeFileSync(source, "agents content");
    writeFileSync(wrongSource, "wrong content");
    symlinkSync(wrongSource, deployed);

    const result = checkSymlinks([{ source, deployed }]);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("wrong_target");
    expect(result[0].deployed).toBe(deployed);
    expect(result[0].expected).toBe(source);
  });

  test("returns drift item when deployed path is a regular file instead of symlink", () => {
    const source = join(tempDir, "TOOLS.md");
    const deployed = join(tempDir, "TOOLS-link.md");

    writeFileSync(source, "tools content");
    writeFileSync(deployed, "directly edited content"); // regular file, not symlink

    const result = checkSymlinks([{ source, deployed }]);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("not_a_symlink");
    expect(result[0].deployed).toBe(deployed);
  });

  test("handles multiple entries and returns only drifting ones", () => {
    const source1 = join(tempDir, "A.md");
    const deployed1 = join(tempDir, "A-link.md");
    const source2 = join(tempDir, "B.md");
    const deployed2 = join(tempDir, "B-link.md");

    writeFileSync(source1, "a content");
    symlinkSync(source1, deployed1); // correct

    // deployed2 does not exist — drift

    const result = checkSymlinks([
      { source: source1, deployed: deployed1 },
      { source: source2, deployed: deployed2 },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].deployed).toBe(deployed2);
  });
});

// ──────────────────────────────────────────────────────────────
// checkCronDrift
// ──────────────────────────────────────────────────────────────

function createCronDb(dir: string, names: string[]): string {
  const dbPath = join(dir, "jobs.db");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    )
  `);
  for (const name of names) {
    db.prepare("INSERT INTO cron_jobs (name) VALUES (?)").run(name);
  }
  db.close();
  return dbPath;
}

function createYamlDir(dir: string, jobs: Array<{ file: string; name: string }>): string {
  const yamlDir = join(dir, "jobs");
  mkdirSync(yamlDir);
  for (const { file, name } of jobs) {
    writeFileSync(join(yamlDir, file), `name: "${name}"\nschedule: "0 8 * * 1"\ncommand: "bun run test.ts"\n`);
  }
  return yamlDir;
}

describe("checkCronDrift", () => {
  test("returns empty when registered cron names match YAML source names exactly", () => {
    const dbPath = createCronDb(tempDir, ["Job Scanner", "Sentinel"]);
    const yamlDir = createYamlDir(tempDir, [
      { file: "job-scanner.yaml", name: "Job Scanner" },
      { file: "sentinel.yaml", name: "Sentinel" },
    ]);

    const result = checkCronDrift(dbPath, yamlDir);
    expect(result).toEqual([]);
  });

  test("returns drift items for jobs in DB but not in YAML (extra registered)", () => {
    const dbPath = createCronDb(tempDir, ["Job Scanner", "Ghost Job"]);
    const yamlDir = createYamlDir(tempDir, [
      { file: "job-scanner.yaml", name: "Job Scanner" },
    ]);

    const result = checkCronDrift(dbPath, yamlDir);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("extra_in_db");
    expect(result[0].name).toBe("Ghost Job");
  });

  test("returns drift items for YAMLs not registered in DB (missing registration)", () => {
    const dbPath = createCronDb(tempDir, ["Job Scanner"]);
    const yamlDir = createYamlDir(tempDir, [
      { file: "job-scanner.yaml", name: "Job Scanner" },
      { file: "self-audit.yaml", name: "Self-Audit" },
    ]);

    const result = checkCronDrift(dbPath, yamlDir);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("missing_in_db");
    expect(result[0].name).toBe("Self-Audit");
  });

  test("returns both extra_in_db and missing_in_db when sets diverge", () => {
    const dbPath = createCronDb(tempDir, ["Old Job", "Job Scanner"]);
    const yamlDir = createYamlDir(tempDir, [
      { file: "job-scanner.yaml", name: "Job Scanner" },
      { file: "new-job.yaml", name: "New Job" },
    ]);

    const result = checkCronDrift(dbPath, yamlDir);
    const types = result.map((r) => r.type);
    expect(types).toContain("extra_in_db");
    expect(types).toContain("missing_in_db");

    const extra = result.find((r) => r.type === "extra_in_db");
    const missing = result.find((r) => r.type === "missing_in_db");
    expect(extra?.name).toBe("Old Job");
    expect(missing?.name).toBe("New Job");
  });

  test("handles missing cron DB file gracefully — returns single drift item", () => {
    const dbPath = join(tempDir, "nonexistent.db");
    const yamlDir = createYamlDir(tempDir, [
      { file: "job-scanner.yaml", name: "Job Scanner" },
    ]);

    const result = checkCronDrift(dbPath, yamlDir);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("cron_db_missing");
  });
});

// ──────────────────────────────────────────────────────────────
// checkSkills
// ──────────────────────────────────────────────────────────────

function createSkillsDir(dir: string, skills: string[]): string {
  const skillsDir = join(dir, "skills");
  mkdirSync(skillsDir);
  for (const name of skills) {
    const skillDir = join(skillsDir, name);
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, "SKILL.md"), `# ${name} skill\n`);
  }
  return skillsDir;
}

describe("checkSkills", () => {
  test("returns empty when git skills and deployed skills match", () => {
    const gitDir = createSkillsDir(tempDir, ["email", "calendar"]);
    const deployedDir = join(tempDir, "deployed-skills");
    mkdirSync(deployedDir);
    // deployed skills are flat dirs matching git skill names
    mkdirSync(join(deployedDir, "email"));
    mkdirSync(join(deployedDir, "calendar"));

    const result = checkSkills(gitDir, deployedDir);
    expect(result).toEqual([]);
  });

  test("returns drift items for skills in git but not deployed", () => {
    const gitDir = createSkillsDir(tempDir, ["email", "calendar", "new-skill"]);
    const deployedDir = join(tempDir, "deployed-skills");
    mkdirSync(deployedDir);
    mkdirSync(join(deployedDir, "email"));
    mkdirSync(join(deployedDir, "calendar"));
    // new-skill not in deployed

    const result = checkSkills(gitDir, deployedDir);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("skill_not_deployed");
    expect(result[0].name).toBe("new-skill");
  });

  test("returns drift items for skills deployed but not in git", () => {
    const gitDir = createSkillsDir(tempDir, ["email"]);
    const deployedDir = join(tempDir, "deployed-skills");
    mkdirSync(deployedDir);
    mkdirSync(join(deployedDir, "email"));
    mkdirSync(join(deployedDir, "orphan-skill")); // extra deployed skill

    const result = checkSkills(gitDir, deployedDir);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("skill_extra_deployed");
    expect(result[0].name).toBe("orphan-skill");
  });

  test("git skills only includes dirs containing SKILL.md", () => {
    const gitDir = join(tempDir, "skills");
    mkdirSync(gitDir);
    // email has SKILL.md
    const emailDir = join(gitDir, "email");
    mkdirSync(emailDir);
    writeFileSync(join(emailDir, "SKILL.md"), "# email");
    // README.md dir (no SKILL.md) — should be excluded
    const notASkill = join(gitDir, "README.md");
    writeFileSync(notASkill, "not a skill dir");

    const deployedDir = join(tempDir, "deployed-skills");
    mkdirSync(deployedDir);
    mkdirSync(join(deployedDir, "email"));

    const result = checkSkills(gitDir, deployedDir);
    expect(result).toEqual([]);
  });

  test("handles missing deployed skills directory gracefully", () => {
    const gitDir = createSkillsDir(tempDir, ["email"]);
    const deployedDir = join(tempDir, "nonexistent-skills");

    const result = checkSkills(gitDir, deployedDir);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("deployed_skills_dir_missing");
  });
});

// ──────────────────────────────────────────────────────────────
// checkConfig
// ──────────────────────────────────────────────────────────────

describe("checkConfig", () => {
  test("returns no drift when config file exists and is non-empty", () => {
    const configPath = join(tempDir, "config.toml");
    writeFileSync(configPath, "[agent]\nname = \"kiro\"\n");

    const result = checkConfig(configPath);
    expect(result).toEqual([]);
  });

  test("returns drift when config file is missing", () => {
    const configPath = join(tempDir, "config.toml");
    // file does not exist

    const result = checkConfig(configPath);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("config_missing");
  });

  test("returns drift when config file is empty (size = 0)", () => {
    const configPath = join(tempDir, "config.toml");
    writeFileSync(configPath, "");

    const result = checkConfig(configPath);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("config_empty");
  });
});

// ──────────────────────────────────────────────────────────────
// Main audit function integration
// ──────────────────────────────────────────────────────────────

describe("self-audit main output", () => {
  test("main audit file exports check functions and has correct shebang", async () => {
    const file = Bun.file("/etc/nixos/zeroclaw/bin/self-audit.ts");
    const content = await file.text();
    expect(content).toContain("#!/usr/bin/env bun");
    expect(content).toContain("export function checkSymlinks");
    expect(content).toContain("export function checkCronDrift");
    expect(content).toContain("export function checkSkills");
    expect(content).toContain("export function checkConfig");
    expect(content).toContain("import { notify }");
    expect(content).toContain("--notify");
  });

  test("drift_count in JSON equals total number of drift items across all checks", () => {
    // Integration test: multiple checks returning drift items
    const source = join(tempDir, "A.md");
    const deployed = join(tempDir, "A-link.md");
    // deployed missing — 1 symlink drift

    const symlinkDrift = checkSymlinks([{ source, deployed }]);
    const configPath = join(tempDir, "missing-config.toml");
    const configDrift = checkConfig(configPath);

    const allItems = [...symlinkDrift, ...configDrift];
    expect(allItems.length).toBe(2);
  });
});
