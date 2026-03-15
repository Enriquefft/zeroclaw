#!/usr/bin/env bun
// bin/self-audit.ts — Deployment drift detector
// Checks that symlinks, config, cron registrations, and skills match the git source.
// Output: JSON to stdout. Notifications via WhatsApp only when drift is found.
// Exit: always 0 (audit result is the output, not an error condition).

import { Database } from "bun:sqlite";
import { existsSync, lstatSync, realpathSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { notify } from "./notify.ts";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface DriftItem {
  type: string;
  deployed?: string;
  expected?: string;
  name?: string;
  message?: string;
}

export interface SymlinkEntry {
  source: string;   // expected symlink target (in /etc/nixos/zeroclaw/...)
  deployed: string; // deployed path (in ~/.zeroclaw/...)
}

// ──────────────────────────────────────────────────────────────
// Symlink check
// ──────────────────────────────────────────────────────────────

export function checkSymlinks(map: SymlinkEntry[]): DriftItem[] {
  const drift: DriftItem[] = [];

  for (const { source, deployed } of map) {
    if (!existsSync(deployed)) {
      drift.push({ type: "missing_symlink", deployed, expected: source });
      continue;
    }

    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(deployed);
    } catch {
      drift.push({ type: "missing_symlink", deployed, expected: source });
      continue;
    }

    if (!stat.isSymbolicLink()) {
      drift.push({ type: "not_a_symlink", deployed, expected: source });
      continue;
    }

    let actualTarget: string;
    try {
      actualTarget = realpathSync(deployed);
    } catch {
      drift.push({ type: "broken_symlink", deployed, expected: source });
      continue;
    }

    const expectedTarget = realpathSync(source);
    if (actualTarget !== expectedTarget) {
      drift.push({ type: "wrong_target", deployed, expected: source, message: `points to ${actualTarget}` });
    }
  }

  return drift;
}

// ──────────────────────────────────────────────────────────────
// Cron drift check
// ──────────────────────────────────────────────────────────────

export function checkCronDrift(cronDbPath: string, yamlDir: string): DriftItem[] {
  const drift: DriftItem[] = [];

  // Read DB names
  if (!existsSync(cronDbPath)) {
    return [{ type: "cron_db_missing", message: `Cron DB not found: ${cronDbPath}` }];
  }

  let dbNames: Set<string>;
  try {
    const db = new Database(cronDbPath, { readonly: true });
    const rows = db
      .query("SELECT name FROM cron_jobs WHERE name IS NOT NULL AND length(name) > 0")
      .all() as { name: string }[];
    db.close();
    dbNames = new Set(rows.map((r) => r.name.trim()));
  } catch (e) {
    return [{ type: "cron_db_error", message: String(e) }];
  }

  // Read YAML names
  let yamlNames: Set<string>;
  try {
    const files = readdirSync(yamlDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    yamlNames = new Set<string>();
    for (const file of files) {
      const text: string = readFileSync(join(yamlDir, file), "utf8");
      const match = text.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      if (match) {
        yamlNames.add(match[1].trim());
      }
    }
  } catch (e) {
    return [{ type: "cron_yaml_error", message: String(e) }];
  }

  // Compare
  for (const name of dbNames) {
    if (!yamlNames.has(name)) {
      drift.push({ type: "extra_in_db", name });
    }
  }
  for (const name of yamlNames) {
    if (!dbNames.has(name)) {
      drift.push({ type: "missing_in_db", name });
    }
  }

  return drift;
}

// ──────────────────────────────────────────────────────────────
// Skills check
// ──────────────────────────────────────────────────────────────

export function checkSkills(gitSkillsDir: string, deployedSkillsDir: string): DriftItem[] {
  const drift: DriftItem[] = [];

  // Read git skills (dirs containing SKILL.md)
  let gitSkills: Set<string>;
  try {
    const entries = readdirSync(gitSkillsDir);
    gitSkills = new Set(
      entries.filter((entry) => {
        const skillMd = join(gitSkillsDir, entry, "SKILL.md");
        try {
          return statSync(join(gitSkillsDir, entry)).isDirectory() && existsSync(skillMd);
        } catch {
          return false;
        }
      })
    );
  } catch (e) {
    return [{ type: "git_skills_dir_error", message: String(e) }];
  }

  // Read deployed skills
  if (!existsSync(deployedSkillsDir)) {
    return [{ type: "deployed_skills_dir_missing", message: `Skills dir not found: ${deployedSkillsDir}` }];
  }

  let deployedSkills: Set<string>;
  try {
    const entries = readdirSync(deployedSkillsDir);
    deployedSkills = new Set(
      entries.filter((entry) => {
        try {
          return statSync(join(deployedSkillsDir, entry)).isDirectory();
        } catch {
          return false;
        }
      })
    );
  } catch (e) {
    return [{ type: "deployed_skills_dir_error", message: String(e) }];
  }

  // Compare
  for (const name of gitSkills) {
    if (!deployedSkills.has(name)) {
      drift.push({ type: "skill_not_deployed", name });
    }
  }
  for (const name of deployedSkills) {
    if (!gitSkills.has(name)) {
      drift.push({ type: "skill_extra_deployed", name });
    }
  }

  return drift;
}

// ──────────────────────────────────────────────────────────────
// Config check
// ──────────────────────────────────────────────────────────────

export function checkConfig(configPath: string): DriftItem[] {
  if (!existsSync(configPath)) {
    return [{ type: "config_missing", message: `Config not found: ${configPath}` }];
  }

  try {
    const stat = statSync(configPath);
    if (stat.size === 0) {
      return [{ type: "config_empty", message: `Config is empty: ${configPath}` }];
    }
  } catch (e) {
    return [{ type: "config_error", message: String(e) }];
  }

  return [];
}

// ──────────────────────────────────────────────────────────────
// CLI entrypoint
// ──────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const notifyIdx = args.indexOf("--notify");
  const NOTIFY_RECIPIENT = notifyIdx !== -1 ? args[notifyIdx + 1] : undefined;

  const HOME = Bun.env.HOME ?? "/root";

  // Deployment path map from module.nix activation scripts
  const symlinkMap: SymlinkEntry[] = [
    {
      source: "/etc/nixos/zeroclaw/documents/IDENTITY.md",
      deployed: `${HOME}/.zeroclaw/documents/IDENTITY.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/SOUL.md",
      deployed: `${HOME}/.zeroclaw/documents/SOUL.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/AGENTS.md",
      deployed: `${HOME}/.zeroclaw/documents/AGENTS.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/TOOLS.md",
      deployed: `${HOME}/.zeroclaw/documents/TOOLS.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/USER.md",
      deployed: `${HOME}/.zeroclaw/documents/USER.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/LORE.md",
      deployed: `${HOME}/.zeroclaw/documents/LORE.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/SENTINEL.md",
      deployed: `${HOME}/.zeroclaw/documents/SENTINEL.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/SKILL-CREATOR.md",
      deployed: `${HOME}/.zeroclaw/documents/SKILL-CREATOR.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/TASK-ROUTING.md",
      deployed: `${HOME}/.zeroclaw/documents/TASK-ROUTING.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/SOUL.md",
      deployed: `${HOME}/.zeroclaw/workspace/SOUL.md`,
    },
    {
      source: "/etc/nixos/zeroclaw/documents/AGENTS.md",
      deployed: `${HOME}/.zeroclaw/workspace/AGENTS.md`,
    },
  ];

  const CRON_DB = `${HOME}/.zeroclaw/workspace/cron/jobs.db`;
  const YAML_DIR = "/etc/nixos/zeroclaw/cron/jobs";
  const GIT_SKILLS = "/etc/nixos/zeroclaw/skills";
  const DEPLOYED_SKILLS = `${HOME}/.zeroclaw/workspace/skills`;
  const CONFIG_PATH = `${HOME}/.zeroclaw/config.toml`;

  const symlinkDrift = checkSymlinks(symlinkMap);
  const cronDrift = checkCronDrift(CRON_DB, YAML_DIR);
  const skillsDrift = checkSkills(GIT_SKILLS, DEPLOYED_SKILLS);
  const configDrift = checkConfig(CONFIG_PATH);

  const allItems = [...symlinkDrift, ...cronDrift, ...skillsDrift, ...configDrift];
  const driftCount = allItems.length;

  const result = {
    drift_count: driftCount,
    checks: {
      symlinks: symlinkDrift.length,
      cron: cronDrift.length,
      skills: skillsDrift.length,
      config: configDrift.length,
    },
    items: allItems,
  };

  if (driftCount > 0 && NOTIFY_RECIPIENT) {
    const itemLines = allItems
      .map((item) => {
        const parts = [item.type];
        if (item.name) parts.push(item.name);
        if (item.deployed) parts.push(item.deployed);
        if (item.message) parts.push(item.message);
        return `- ${parts.join(": ")}`;
      })
      .join("\n");

    const msg = `Self-Audit -- ${driftCount} drift item${driftCount > 1 ? "s" : ""} detected\n${itemLines}`;
    await notify(msg, NOTIFY_RECIPIENT, "urgent");
  }

  console.log(JSON.stringify(result));
  process.exit(0);
}
