# Phase 9: Opportunity Scanning and System Health - Research

**Researched:** 2026-03-07
**Domain:** Agent cron jobs (job/freelance scanning), shell program (self-audit)
**Confidence:** HIGH — all findings verified against existing project source

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Data Sourcing**
- Agent-driven search via orchestrate.ts — scanners are `type: agent` cron jobs, Claude searches the web and parses results
- No scraper libraries (no ts-jobspy) — avoids rate-limit risk and scraper maintenance
- Claude picks the optimal board set from LORE.md target paths and role priorities at runtime
- Cadence: job scanner runs once daily (09:00 Lima), freelance scanner runs 2x daily (09:00 and 15:00 Lima)

**Lead Filtering and Scoring**
- LLM scoring 0-100 in-context — agent reads LORE.md criteria and scores each lead during the same claude -p call that discovered it
- Score >= 70 triggers WhatsApp notification; all leads saved to state.db regardless of score
- URL-based deduplication — same URL = duplicate, cross-board duplicates for same job are kept
- No expiry on leads — consistent with Phase 6 "keep everything, no auto-pruning" policy

**Notification Format**
- Digest summary: one WhatsApp message per scan listing all qualifying leads (title, company, score, URL)
- Silent on zero — no notification when no new qualifying leads found
- Separate messages for job leads vs freelance leads
- Leads scoring 90+ flagged with action hints aligned with LORE.md application approach

**Self-Audit Scope**
- Full deployment check: symlinked paths (documents/, skills/, bin/), config.toml rendering, and cron job registration vs YAML source
- Cron drift detection: compare registered cron jobs (zeroclaw cron list) against cron/jobs/*.yaml definitions
- Report only — generates a report listing drifted files/entries, no auto-fix
- WhatsApp notification only when drift is detected — silent on clean audits
- Weekly cadence as a shell cron job (not agent type)

### Claude's Discretion
- Scanner architecture (separate programs vs unified with flags)
- Board set selection logic and search query formulation
- Self-audit comparison method (checksums, diff, stat comparison)
- Exact notification message formatting and emoji usage
- Self-audit cron schedule (which day/time weekly)
- How orchestration YAML steps are structured for scanning tasks

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCAN-01 | Job scanner cron searches job boards daily, filters by target roles/criteria from LORE.md, deduplicates via state.db | Agent YAML pattern established; job_applications table exists; URL-dedup pattern researched |
| SCAN-02 | Freelance scanner cron searches gig platforms, shares infrastructure with job scanner, higher cadence | Same YAML/orchestrate pattern; freelance_leads table exists; separate YAML for separate cadence |
| SCAN-03 | Job and freelance leads persisted to state.db with status tracking (new/applied/interview/offer/rejected) | Tables fully schematized in v1 DDL; INSERT pattern with dedup lookup documented |
| HEALTH-01 | Self-audit program detects config/doc drift between git source and deployed state | Shell program pattern (sentinel-scan.ts); deployment path map from module.nix activation scripts |
| HEALTH-02 | Self-audit runs weekly as a shell cron job | Shell YAML schema established; `command:` points to bun run absolute path |
</phase_requirements>

---

## Summary

Phase 9 adds three deliverables to the ZeroClaw heartbeat system: a job scanner agent cron, a freelance scanner agent cron, and a self-audit shell program wired to its own cron. All infrastructure needed is already in place from Phases 6-8: `orchestrate.ts` handles agent jobs, `initStateDb()` has both target tables, `notify.ts` handles WhatsApp, and `cron-sync` will pick up new YAML files automatically.

The scanners follow the exact pattern established by `morning-briefing.yaml`, `content-scout.yaml`, and `follow-up-enforcer.yaml`. Each scanner is a `type: agent` YAML with a goal and explicit steps array. The key new behavior is reading `LORE.md` at runtime (Claude can access it via the symlinked documents path), querying state.db to find known URLs before INSERTing, and conditionally sending a digest notification.

The self-audit program follows the `sentinel-scan.ts` shell program pattern: TypeScript/bun, JSON to stdout, exits 0/1, accepts `--notify <phone>`. It compares the known deployment mappings (defined in module.nix activation scripts) against actual filesystem state, then compares `zeroclaw cron list` output against YAML source files. A clean audit is completely silent; drift triggers a WhatsApp alert.

**Primary recommendation:** Build two agent YAML files and one TypeScript program. Wire all three to `cron/jobs/*.yaml`. No new libraries needed — every dependency already exists in the project.

---

## Standard Stack

### Core (already installed, no additions needed)

| Library / Tool | Version | Purpose | Source |
|----------------|---------|---------|--------|
| `bun:sqlite` (Database) | Bun built-in | Read/write state.db | `init-state-db.ts` |
| `bun` (shell $) | Bun built-in | Run child processes (kapso-whatsapp-cli, zeroclaw cron list) | `orchestrate.ts`, `notify.ts` |
| `orchestrate.ts` | project | Multi-step agent execution engine for scanner YAMLs | `bin/orchestrate.ts` |
| `notify.ts` | project | WhatsApp delivery with retry and rate limiting | `bin/notify.ts` |
| `initStateDb()` | project | Opens state.db with WAL + busy_timeout, handles migrations | `bin/init-state-db.ts` |
| `kapso-whatsapp-cli` | system PATH | WhatsApp message delivery | Nix package |
| `zeroclaw cron list` | system PATH | Read registered cron jobs for drift comparison | Nix package |

### No New Dependencies

All required capabilities are already available. Do not install additional npm/bun packages.

---

## Architecture Patterns

### Pattern 1: Agent Scanner YAML (job-scanner.yaml, freelance-scanner.yaml)

**What:** `type: agent` YAML files in `cron/jobs/`. `cron-sync` auto-generates the orchestrate.ts command. Steps execute sequentially via `claude -p` with context chaining.

**Critical constraint:** Steps must use no inner double-quotes (parseYaml regex lazy matching truncates at first inner quote). Use single quotes or rephrase. Colons inside step strings must be avoided in `key: value` patterns — use "row N is content" phrasing instead of "Line N: content".

**When to use:** Task requires LLM reasoning — reading LORE.md criteria, scoring leads, deciding which boards to search, formatting a digest.

**Scanner YAML template:**
```yaml
name: "Job Scanner"
schedule: "0 9 * * *"
tz: "America/Lima"
type: agent
goal: "Search job boards for new leads matching LORE.md criteria, score them, deduplicate via state.db, and send a WhatsApp digest for qualifying leads"
steps:
  - Read /etc/nixos/zeroclaw/documents/LORE.md and extract target roles, target paths (remote-global priority), and job boards to monitor. Output a compact JSON summary of search criteria.
  - Search the web for job listings matching the criteria from step 1. Query 3-5 boards from the list (Wellfound, RemoteOK, WeWorkRemotely, HN Who Is Hiring on the 1st, YC Work at a Startup). For each result collect title, company, url, approximate salary if visible, location/remote status.
  - For each discovered lead, query state.db at ~/.zeroclaw/workspace/state.db to check if the URL already exists in job_applications. Discard known URLs. For new leads, score each 0-100 against LORE.md criteria (role fit, path priority, salary range, remote status). Output list of new leads with scores.
  - Insert all new leads into job_applications in state.db (status=new, found_date=unixepoch(), source_platform=board name, match_score=score). If any leads scored 70 or above, compose a WhatsApp digest listing title, company, score, and URL for each qualifying lead. Leads scoring 90+ should include an action hint (cold outreach > ATS per LORE.md). Send digest to +51926689401 via kapso-whatsapp-cli send --to +51926689401 --text. If no qualifying leads, exit silently without sending.
notify: "+51926689401"
```

**Freelance YAML differences:**
- `name: "Freelance Scanner"`, schedule `"0 9,15 * * *"` (twice daily)
- Boards: Toptal, Upwork, Contra (from LORE.md)
- Table: `freelance_leads` instead of `job_applications`
- Goal language: "gig platforms" instead of "job boards"

### Pattern 2: Shell Program (self-audit.ts)

**What:** TypeScript/bun deterministic program. Logic expressible as if-statements: stat each symlink path, compare outputs from `zeroclaw cron list` vs YAML directory. No LLM reasoning at runtime.

**When to use:** Deterministic check — filesystem comparison, process output diff.

**Shell program structure (following sentinel-scan.ts pattern):**
```typescript
#!/usr/bin/env bun
// bin/self-audit.ts — Deployment drift detector
// Checks symlinked docs, skills, config.toml, and cron registration vs git source.
// Output: JSON to stdout. Errors to stderr, exit 0 always (audit result, not error).

import { Database } from "bun:sqlite";
import { $ } from "bun";
import { existsSync, realpathSync, statSync } from "fs";
import { notify } from "./notify.ts";

// Parse --notify <phone> from CLI args
const args = process.argv.slice(2);
const notifyIdx = args.indexOf("--notify");
const NOTIFY_RECIPIENT = notifyIdx !== -1 ? args[notifyIdx + 1] : undefined;

// ... audit logic ...

// Collect drift items
// If drift found and NOTIFY_RECIPIENT set: notify() with urgent priority
// Always output JSON result to stdout
```

**Cron YAML for self-audit:**
```yaml
name: "Self-Audit"
schedule: "0 8 * * 1"
tz: "America/Lima"
command: "bun run /etc/nixos/zeroclaw/bin/self-audit.ts --notify +51926689401"
```
Note: No `type: agent` — this is a shell job with a deterministic `command:` field.

### Pattern 3: URL Deduplication Query

Scanners must check state.db before inserting. The step prompt instructs the agent to run SQLite:

```sql
SELECT url FROM job_applications WHERE url = '<discovered_url>';
```

If no row returned: lead is new, INSERT. If row returned: skip silently.

Agent steps phrase this as: "query state.db... check if the URL already exists... discard known URLs."

### Pattern 4: Digest Notification (conditional send)

Follows the content-scout pattern — exit silently when nothing qualifies:

```
If no qualifying leads, exit silently without sending -- output SILENT.
Otherwise compose WhatsApp digest...
```

The `notify:` field at YAML top level is still set (orchestrate.ts uses it for failure alerts). The in-step conditional send handles the success-path digest independently.

### Deployment Path Map (for self-audit.ts)

From module.nix activation scripts, these are the known symlinks:

| Git Source | Deployed Path | Check Method |
|-----------|--------------|-------------|
| `/etc/nixos/zeroclaw/documents/IDENTITY.md` | `~/.zeroclaw/documents/IDENTITY.md` | symlink target matches |
| `/etc/nixos/zeroclaw/documents/SOUL.md` | `~/.zeroclaw/documents/SOUL.md` | symlink target matches |
| `/etc/nixos/zeroclaw/documents/AGENTS.md` | `~/.zeroclaw/documents/AGENTS.md` | symlink target matches |
| `/etc/nixos/zeroclaw/documents/TOOLS.md` | `~/.zeroclaw/documents/TOOLS.md` | symlink target matches |
| `/etc/nixos/zeroclaw/documents/USER.md` | `~/.zeroclaw/documents/USER.md` | symlink target matches |
| `/etc/nixos/zeroclaw/documents/LORE.md` | `~/.zeroclaw/documents/LORE.md` | symlink target matches |
| `/etc/nixos/zeroclaw/documents/SOUL.md` | `~/.zeroclaw/workspace/SOUL.md` | symlink target matches |
| `/etc/nixos/zeroclaw/documents/AGENTS.md` | `~/.zeroclaw/workspace/AGENTS.md` | symlink target matches |
| `config.toml` (rendered) | `~/.zeroclaw/config.toml` | file exists and is non-empty |
| `cron/jobs/*.yaml` names | `zeroclaw cron list` names | set difference |
| `skills/*/` directories | `~/.zeroclaw/workspace/skills/` | directory exists per skill |

**Symlink check logic:** Use `fs.realpathSync()` to resolve the symlink and compare against the expected source path. If the file is a regular file instead of a symlink, flag drift (someone edited `~/.zeroclaw/` directly).

**Cron drift check logic:**
```typescript
// Get registered job names from zeroclaw cron list (parse JSON or text output)
const cronOutput = await $`zeroclaw cron list`.text();
// Get expected names from YAML files
const yamlNames = readdirSync('/etc/nixos/zeroclaw/cron/jobs/')
  .filter(f => f.endsWith('.yaml'))
  .map(f => /* parse name field from yaml */);
// Compare sets — report jobs in DB but not in YAML, and YAMLs not registered
```

For YAML name extraction in self-audit.ts: use regex `^name:\s*["']?(.+?)["']?\s*$` (same approach as orchestrate.ts parseYaml, without the full yq dependency).

### Anti-Patterns to Avoid

- **Inline LLM prompts in cron YAML:** Architecture violation — prompts belong in steps array of agent YAMLs or skill definitions.
- **Hardcoded job board URLs in program code:** LORE.md is the single source of truth for boards, roles, and criteria. Agent reads it at runtime.
- **Auto-pruning leads:** Phase 6 decision — keep everything. No DELETE or status-downgrade logic.
- **Expiry-based dedup:** URL-only dedup (not title+company). Same URL from different boards = same job, skip.
- **zeroclaw cron add/remove/update in code:** Blocked by wrapper. Drift detection is read-only.
- **Inner double-quotes in step strings:** parseYaml truncates at first inner quote. Use single quotes or rephrase.
- **key: value patterns in step strings:** Go YAML parser rejects them in plain block scalars. Use "row N is content" phrasing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WhatsApp delivery | Custom HTTP client | `notify()` from notify.ts | Already has retry, rate limiting, audit log |
| DB connection | Raw Database() calls | `initStateDb()` | Already sets WAL + busy_timeout, handles migrations |
| Multi-step agent execution | New runner | `orchestrate.ts` YAML | Handles checkpointing, resume, failure, cron_log |
| Web scraping job boards | puppeteer/ts-jobspy | claude -p web search | Locked decision — avoids rate-limit risk |
| YAML parsing in self-audit | Full YAML library | Regex line matching | Already established pattern in orchestrate.ts; avoids yq dependency |

**Key insight:** Every building block is already implemented. Phase 9 is assembly, not construction.

---

## Common Pitfalls

### Pitfall 1: Step Strings With Inner Double-Quotes
**What goes wrong:** `parseYaml` regex `^\s+-\s+"?(.+?)"?\s*$` uses lazy match — stops at the first `"` inside the string. Step content gets silently truncated.
**Why it happens:** Regex was designed for simple quoted strings, not embedded quotes.
**How to avoid:** Never use double quotes inside step strings. Use single quotes or rephrase. Example: instead of `send to "+51926689401"` write `send to +51926689401`.
**Warning signs:** Agent runs but produces partial/wrong results on a specific step.

### Pitfall 2: YAML Plain Block Scalars With Colon-Space
**What goes wrong:** Go YAML parser rejects `key: value` patterns inside unquoted multi-line step strings.
**Why it happens:** Established in Phase 08 — same parseYaml and same Go parser.
**How to avoid:** Use "row N is content" phrasing. Avoid `: ` in step descriptions.
**Warning signs:** `cron-sync` errors on the new YAML files, or orchestrate.ts fails to parse steps.

### Pitfall 3: Rate Limiting on Digest Send
**What goes wrong:** Job scanner (09:00) and freelance scanner (09:00) both fire at the same time. Both want to send WhatsApp. The `notify()` rate limiter (5-min gap on normal priority) may suppress the second digest.
**Why it happens:** Rate limiter checks all recent `success=1 AND priority='normal'` sends, not per-recipient.
**How to avoid:** Use `"urgent"` priority for scanner digests (they are time-sensitive job leads), OR stagger the morning freelance scanner to 09:30. The `notify:` field on the YAML is for failure alerts (orchestrate.ts uses it). The in-step send is the digest — use `kapso-whatsapp-cli` directly in the step, bypassing notify.ts rate limiting.
**Recommendation (Claude's discretion):** Stagger freelance scanner to `"0 9,15 * * *"` — use 09:30 for morning run if rate limiting becomes an issue, or use the direct `kapso-whatsapp-cli` invocation in steps (as all other agent jobs do) to bypass notify.ts entirely.

### Pitfall 4: Self-Audit Reading Stale Cron List
**What goes wrong:** `zeroclaw cron list` output format may vary (JSON vs table). Parsing assumptions break silently.
**Why it happens:** ZeroClaw CLI output format not documented in this project's files.
**How to avoid:** Use SQLite directly against the cron DB (`~/.zeroclaw/workspace/cron/jobs.db`) instead of `zeroclaw cron list` — more reliable and matches the pattern used in `cron-sync` itself.
**Recommended approach:** `bun:sqlite` read-only open on `~/.zeroclaw/workspace/cron/jobs.db`, query `SELECT name FROM cron_jobs WHERE name IS NOT NULL`.

### Pitfall 5: Self-Audit Failing on Missing config.toml
**What goes wrong:** If config.toml was never rendered (fresh system), self-audit reports drift on every run.
**How to avoid:** Check for file existence, not content correctness. Report `config.toml missing` as a drift item, not an error. Exit 0 always — report is the output, not the drift.

### Pitfall 6: Agent Steps Writing to state.db Directly
**What goes wrong:** Agent steps that say "insert into state.db" expect the agent to run sqlite3 CLI. The `claude -p` subprocess has access to the shell but not the project's TypeScript imports.
**How to avoid:** Step prompts should reference the SQLite CLI: `sqlite3 ~/.zeroclaw/workspace/state.db 'INSERT INTO...'`. This is consistent with how other agent steps query state.db (e.g., morning-briefing step 3 uses SQLite directly in the step description).

---

## Code Examples

### Agent YAML Step — SQLite Dedup Check
```yaml
steps:
  - Query state.db at ~/.zeroclaw/workspace/state.db using SQLite to find known job URLs. Run: sqlite3 ~/.zeroclaw/workspace/state.db 'SELECT url FROM job_applications'. Store these as the known-URL set for deduplication in subsequent steps.
```

### Agent YAML Step — Conditional Digest Send
```yaml
steps:
  - If no leads scored 70 or above were found, exit silently -- output SILENT. Otherwise compose a WhatsApp message listing each qualifying lead as: title at company (score/100) -- URL. Leads scoring 90 or above get an appended note: cold outreach recommended. Send to +51926689401 via kapso-whatsapp-cli send --to +51926689401 --text followed by the message.
```

### Agent YAML Step — SQLite Insert
```yaml
steps:
  - Insert all new leads into state.db job_applications table. For each lead run: sqlite3 ~/.zeroclaw/workspace/state.db 'INSERT INTO job_applications (title, company, url, status, found_date, match_score, source_platform, last_updated) VALUES (title_value, company_value, url_value, new, unixepoch(), score_value, platform_value, unixepoch())'. Output count of leads inserted.
```

### self-audit.ts — Symlink Verification
```typescript
// Source: module.nix zeroclawDocuments activation block
const SYMLINK_MAP: Array<{ source: string; deployed: string }> = [
  { source: "/etc/nixos/zeroclaw/documents/IDENTITY.md", deployed: `${HOME}/.zeroclaw/documents/IDENTITY.md` },
  { source: "/etc/nixos/zeroclaw/documents/SOUL.md",     deployed: `${HOME}/.zeroclaw/documents/SOUL.md` },
  { source: "/etc/nixos/zeroclaw/documents/AGENTS.md",   deployed: `${HOME}/.zeroclaw/documents/AGENTS.md` },
  { source: "/etc/nixos/zeroclaw/documents/TOOLS.md",    deployed: `${HOME}/.zeroclaw/documents/TOOLS.md` },
  { source: "/etc/nixos/zeroclaw/documents/USER.md",     deployed: `${HOME}/.zeroclaw/documents/USER.md` },
  { source: "/etc/nixos/zeroclaw/documents/LORE.md",     deployed: `${HOME}/.zeroclaw/documents/LORE.md` },
  { source: "/etc/nixos/zeroclaw/documents/SOUL.md",     deployed: `${HOME}/.zeroclaw/workspace/SOUL.md` },
  { source: "/etc/nixos/zeroclaw/documents/AGENTS.md",   deployed: `${HOME}/.zeroclaw/workspace/AGENTS.md` },
];

function checkSymlink(source: string, deployed: string): string | null {
  if (!existsSync(deployed)) return `missing: ${deployed}`;
  try {
    const real = realpathSync(deployed);
    if (real !== source) return `wrong target: ${deployed} -> ${real} (expected ${source})`;
    return null; // clean
  } catch {
    return `unresolvable: ${deployed}`;
  }
}
```

### self-audit.ts — Cron Drift via SQLite
```typescript
// Read-only open of ZeroClaw cron DB (same DB that cron-sync writes)
const cronDb = new Database(`${HOME}/.zeroclaw/workspace/cron/jobs.db`, { readonly: true });
const registeredNames = new Set(
  (cronDb.query("SELECT name FROM cron_jobs WHERE name IS NOT NULL AND length(name) > 0").all() as { name: string }[])
    .map(r => r.name)
);
cronDb.close();

// Read YAML sources
const JOBS_DIR = "/etc/nixos/zeroclaw/cron/jobs";
const yamlNames = new Set(
  readdirSync(JOBS_DIR)
    .filter(f => f.endsWith(".yaml"))
    .map(f => {
      const content = readFileSync(join(JOBS_DIR, f), "utf-8");
      const match = content.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean) as string[]
);

// Drift: in DB but not in YAML
const extraInDb = [...registeredNames].filter(n => !yamlNames.has(n));
// Drift: in YAML but not in DB
const missingFromDb = [...yamlNames].filter(n => !registeredNames.has(n));
```

### self-audit.ts — Skills Drift
```typescript
// Skills installed in workspace
const WORKSPACE_SKILLS = `${HOME}/.zeroclaw/workspace/skills`;
const GIT_SKILLS_DIR = "/etc/nixos/zeroclaw/skills";

const gitSkills = new Set(
  readdirSync(GIT_SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(GIT_SKILLS_DIR, d.name, "SKILL.md")))
    .map(d => d.name)
);

const deployedSkills = existsSync(WORKSPACE_SKILLS)
  ? new Set(readdirSync(WORKSPACE_SKILLS, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name))
  : new Set<string>();

const extraDeployed = [...deployedSkills].filter(s => !gitSkills.has(s));
const missingDeployed = [...gitSkills].filter(s => !deployedSkills.has(s));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON trackers in `~/zeroclaw-data/` | SQLite state.db with WAL | Phase 6 | Tables job_applications and freelance_leads already exist at schema v1 |
| Direct cron CLI calls | YAML files + cron-sync | Phase 7 | New jobs added by creating YAML files only |
| Inline WhatsApp CLI in programs | `notify()` module import | Phase 6 | Rate limiting + audit log for all sends |
| NOTIFY_TARGET env var | Caller passes recipient | Phase 6 | `--notify <phone>` CLI flag pattern |

---

## Open Questions

1. **zeroclaw cron list output format**
   - What we know: `zeroclaw cron list` works (used in CLAUDE.md examples). Output format undocumented.
   - What's unclear: JSON vs human-readable table — affects parsing strategy in self-audit.
   - Recommendation: Use direct SQLite read on `~/.zeroclaw/workspace/cron/jobs.db` instead — same data, fully controlled, matches cron-sync's own approach.

2. **Rate limiting between job scanner (09:00) and freelance scanner (09:00) digests**
   - What we know: notify.ts rate limiter blocks second normal-priority send within 5 minutes.
   - What's unclear: Both agent YAML steps send via `kapso-whatsapp-cli` directly (not notify.ts). This bypasses rate limiting. Only the `notify:` field at YAML root uses notify.ts (for failure alerts).
   - Recommendation: No issue — in-step sends use `kapso-whatsapp-cli` directly. Stagger schedules anyway (job: 09:00, freelance AM: 09:30) for cleaner UX.

3. **Agent's access to LORE.md at runtime**
   - What we know: `~/.zeroclaw/documents/LORE.md` is a symlink to `/etc/nixos/zeroclaw/documents/LORE.md` (set in module.nix zeroclawDocuments activation). Agent runs via `claude -p` which has shell access.
   - What's unclear: Whether `claude -p` automatically has the document in context or the step must explicitly instruct reading it.
   - Recommendation: Step 1 explicitly instructs `Read /etc/nixos/zeroclaw/documents/LORE.md` — direct path, no ambiguity. The content-scout pattern already does explicit URL access in steps.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — bun discovers `*.test.ts` automatically |
| Quick run command | `cd /etc/nixos/zeroclaw && bun test bin/self-audit.test.ts` |
| Full suite command | `cd /etc/nixos/zeroclaw && bun test bin/` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAN-01 | Job scanner YAML is valid (parseable, has required fields) | unit | `bun test bin/orchestrate.test.ts` (parseYaml) | Partial — parseYaml tested, new YAML content not yet |
| SCAN-01 | URL dedup logic — known URL skipped, new URL accepted | integration (mock) | `bun test bin/job-scanner.test.ts` | No — Wave 0 |
| SCAN-02 | Freelance scanner YAML parses correctly | unit | `bun test bin/orchestrate.test.ts` | Partial |
| SCAN-03 | INSERT populates job_applications with correct fields | unit | `bun test bin/job-scanner.test.ts` | No — Wave 0 |
| SCAN-03 | INSERT populates freelance_leads with correct fields | unit | `bun test bin/freelance-scanner.test.ts` | No — Wave 0 |
| HEALTH-01 | Clean system reports no drift | unit | `bun test bin/self-audit.test.ts` | No — Wave 0 |
| HEALTH-01 | Missing symlink detected as drift | unit | `bun test bin/self-audit.test.ts` | No — Wave 0 |
| HEALTH-01 | Wrong symlink target detected as drift | unit | `bun test bin/self-audit.test.ts` | No — Wave 0 |
| HEALTH-01 | Extra cron job in DB (not in YAML) detected as drift | unit | `bun test bin/self-audit.test.ts` | No — Wave 0 |
| HEALTH-01 | YAML not registered in DB detected as drift | unit | `bun test bin/self-audit.test.ts` | No — Wave 0 |
| HEALTH-02 | Self-audit cron YAML is valid shell type (has command: field) | manual/smoke | `cron-sync --dry-run` | No — Wave 0 |

Note: Scanner agent YAMLs (SCAN-01, SCAN-02) are integration-tested via manual `bun run orchestrate.ts <yaml> --db-path /tmp/test.db` with a mock runner. Unit tests for the YAML structure use the existing `parseYaml` tests in `orchestrate.test.ts`. The scanner steps themselves run via `claude -p` — not unit-testable, validated by dry-run inspection.

### Sampling Rate
- **Per task commit:** `cd /etc/nixos/zeroclaw && bun test bin/self-audit.test.ts`
- **Per wave merge:** `cd /etc/nixos/zeroclaw && bun test bin/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `/etc/nixos/zeroclaw/bin/self-audit.test.ts` — covers HEALTH-01 (symlink check, cron drift, skills drift, clean audit, notify trigger)
- [ ] `/etc/nixos/zeroclaw/bin/job-scanner.test.ts` — covers SCAN-01, SCAN-03 (URL dedup logic if extracted, INSERT validation)
- [ ] `/etc/nixos/zeroclaw/bin/freelance-scanner.test.ts` — covers SCAN-02, SCAN-03 (freelance_leads INSERT)

Note: Scanner test files are low value unless URL dedup or INSERT logic is extracted into a testable TypeScript helper imported by the YAML step descriptions. If all logic stays in agent steps (fully within `claude -p`), test files are skipped and validation is manual smoke testing only.

---

## Sources

### Primary (HIGH confidence)
- `/etc/nixos/zeroclaw/bin/orchestrate.ts` — YAML parsing rules, step format constraints, runner pattern, DB schema
- `/etc/nixos/zeroclaw/bin/init-state-db.ts` — job_applications and freelance_leads table schemas, PRAGMA setup
- `/etc/nixos/zeroclaw/bin/sentinel-scan.ts` — shell program pattern (--notify flag, JSON stdout, exit 0/1)
- `/etc/nixos/zeroclaw/bin/notify.ts` — rate limiting behavior, priority system, recipient parameter
- `/etc/nixos/zeroclaw/module.nix` — deployment symlink map (zeroclawDocuments activation), cron DB path, skills workspace path
- `/etc/nixos/zeroclaw/cron/README.md` — YAML schema, agent vs shell type distinction, cron DB location
- `/etc/nixos/zeroclaw/documents/LORE.md` — job boards, target roles, target paths, application approach (action hints source)
- `/etc/nixos/zeroclaw/cron/jobs/morning-briefing.yaml` — established step formatting patterns
- `/etc/nixos/zeroclaw/cron/jobs/content-scout.yaml` — conditional silent exit pattern in steps
- `/etc/nixos/zeroclaw/.planning/STATE.md` — Phase 08 decisions on YAML formatting constraints

### Secondary (MEDIUM confidence)
- `/etc/nixos/zeroclaw/.planning/phases/09-opportunity-scanning-and-system-health/09-CONTEXT.md` — locked decisions and specifics from user discussion

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified in existing source files
- Architecture patterns: HIGH — verified against working Phase 8 agent YAMLs
- Pitfalls: HIGH — YAML formatting pitfalls directly from Phase 08 STATE.md decisions; rate limiting from notify.ts source
- Self-audit deployment map: HIGH — read directly from module.nix activation scripts
- Test framework: HIGH — bun:test pattern confirmed in existing *.test.ts files

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable stack — no external library changes)
