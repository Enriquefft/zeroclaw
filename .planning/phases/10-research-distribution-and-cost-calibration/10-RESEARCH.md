# Phase 10: Research, Distribution, and Cost Calibration - Research

**Researched:** 2026-03-07
**Domain:** Agent cron jobs (build-in-public drafter, paper scout, engagement scout, company refresh), config calibration, documentation
**Confidence:** HIGH — all findings verified against existing project source

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Build-in-Public Drafter (DIST-01)**
- Source material: git activity + state.db activity — commits, PRs, diffs, job hunt progress, lead counts, milestones
- Target platforms: X/Twitter + LinkedIn — two versions per draft (punchy for X, longer professional for LinkedIn, per LORE.md platform strategy)
- Approval flow: WhatsApp delivery for review — draft sent via WhatsApp, user copy-paste-edits and posts manually. No auto-posting.
- Cadence: 3x per week (Mon/Wed/Fri) — accumulates 1-2 days of activity per draft, meatier content than daily
- Silent when no meaningful activity to post about

**Paper Scout (DIST-03)**
- Differentiation from content scout: filters by LORE.md research interests (multi-agent systems, algorithmic fairness, LLM reasoning, compilers+LLMs, spec-driven dev) — NOT content pillars
- Provides 2-3 sentence summary per paper (deeper than content scout's 1-line)
- arXiv categories: cs.AI, cs.LG, cs.CL + cs.MA (multi-agent systems) + cs.SE (software engineering)
- Cadence: weekly (Monday), separate from daily content scout
- Delivery: WhatsApp digest — title + authors + 1-line takeaway + link per paper (consistent with other crons)
- Volume: top 5 papers per week (curated and focused)

**Engagement Scout (DIST-02)**
- Source: search X, Reddit, HN for threads about AI agents, build-in-public, LLM engineering — conversations where Enrique's expertise adds value
- Output: threads + draft replies — each thread comes with a suggested reply in Enrique's voice (from LORE.md personality). User edits and posts.
- Silent when no relevant threads found
- Cadence: daily

**Weekly Company Refresh (DIST-04)**
- Discovery: both combined — mine state.db job_applications/freelance_leads for companies already seen, supplement with web research for gaps in each Target Path category (remote-global, US sponsor, relocation)
- Data per company: name + category (which Target Path) + recent news/hiring signals — lightweight, not full profiles
- Updates LORE.md Target Companies section directly (live-editable via symlink)
- Cadence: weekly
- Uses orchestrate.ts for multi-source synthesis

**Cost Calibration (FIX-07)**
- Measurement method: manual sampling — run all crons for 3+ days, check ZAI dashboard/billing, record daily spend
- Budget ceiling: set to 2x measured average daily spend — enough headroom without waste
- Priority cuts if over budget: cut engagement scout and company refresh first (nice-to-have), keep daily essentials (briefing, EOD, enforcer, scanners)
- One-time calibration — measure, set the value, done. Revisit manually if costs change.

**Documentation (DOCS-05)**
- bin/README.md updated with all programs added in v2.0: init-state-db.ts, notify.ts, orchestrate.ts, self-audit.ts, sentinel-scan.ts, zai-proxy.ts
- Each entry includes: purpose, cron schedule (if any), inputs, output contract

### Claude's Discretion
- Exact YAML step decomposition for each cron job
- Prompt engineering for build-in-public drafts (voice, tone, length per platform)
- Engagement scout search queries and relevance filtering
- Company refresh web search queries and data extraction
- Paper scout ranking criteria (recency vs relevance)
- Which day/time for weekly crons (company refresh, paper scout)
- bin/README.md formatting and structure

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIST-01 | Build-in-public drafter cron generates draft posts from git activity for human approval | Agent YAML pattern; git log command for activity gathering; content_log table exists for storing drafts; LORE.md platform strategy defines X vs LinkedIn voice |
| DIST-02 | Engagement scout cron finds relevant threads/discussions to respond to | Agent YAML pattern; web search via Brave API; LORE.md platform/voice guide for reply drafts; silent-on-zero pattern from content-scout.yaml |
| DIST-03 | Paper scout cron delivers weekly arXiv digest filtered by research interests | Agent YAML pattern; arXiv RSS feeds already partially in content-scout (cs.AI, cs.LG, cs.CL); LORE.md research interests section specifies filter criteria; cs.MA and cs.SE are additive |
| DIST-04 | Weekly company refresh cron updates target company watch-list with recent news | Agent YAML pattern; orchestrate.ts multi-source synthesis; LORE.md Target Companies section is symlinked (live-editable); state.db job_applications/freelance_leads have company field |
| FIX-07 | max_cost_per_day_cents raised to calibrated value after measuring agent cron costs | config.toml located, current value is 500; sed-based placeholder system documented; manual measurement process defined by user |
| DOCS-05 | bin/README.md updated with all new programs | Current README lists only sentinel-scan.ts and repair-loop.sh; all new programs identified: init-state-db.ts, notify.ts, orchestrate.ts, self-audit.ts, zai-proxy.ts |
</phase_requirements>

---

## Summary

Phase 10 adds four agent cron jobs (build-in-public drafter, engagement scout, paper scout, weekly company refresh), calibrates the daily cost cap in config.toml from measured spend, and completes bin/README.md documentation for all v2.0 programs. All infrastructure is in place from Phases 6-9: `orchestrate.ts` handles agent execution, `notify.ts` handles WhatsApp delivery, `initStateDb()` manages state, and `cron-sync` picks up new YAML files automatically. No new dependencies are required.

The four new crons all follow the `type: agent` YAML pattern established in Phases 7-9. The key new patterns are: reading recent `git log` output to source build-in-public content, reading/writing LORE.md (via symlink) to update the Target Companies section, and searching X/Reddit/HN for engagement opportunities. The paper scout extends the arXiv pattern already in content-scout.yaml with two additional categories and deeper summaries.

Cost calibration (FIX-07) is an operational task, not a code task: run all crons for 3+ days, check the ZAI billing dashboard, set `max_cost_per_day_cents` to 2x the measured average. The config.toml value is a plain number (no placeholder token) and can be edited directly in the file; no NixOS rebuild is required for live-editable files like documents/, but config.toml IS rebuilt at activation. The correction path is: edit config.toml, rebuild, done.

**Primary recommendation:** Build four YAML files following the established agent cron pattern, update config.toml after measurement, and rewrite bin/README.md as a complete program index. No new libraries or infrastructure needed.

---

## Standard Stack

### Core (already installed, no additions needed)

| Library / Tool | Version | Purpose | Source |
|----------------|---------|---------|--------|
| `orchestrate.ts` | project | Reads agent YAML, executes steps via `claude -p` with checkpointing | `/etc/nixos/zeroclaw/bin/orchestrate.ts` |
| `notify.ts` | project | WhatsApp delivery with 3-attempt retry and 5-min rate limiting | `/etc/nixos/zeroclaw/bin/notify.ts` |
| `initStateDb()` | project | Opens state.db with WAL + busy_timeout, schema v3 | `/etc/nixos/zeroclaw/bin/init-state-db.ts` |
| `kapso-whatsapp-cli` | system PATH | WhatsApp message delivery (used directly in agent steps) | Nix package |
| `claude -p` | system PATH | Per-step LLM execution in orchestrate.ts runner | `~/.local/bin/claude` via orchestrate.ts |
| `bun` | system | TypeScript runtime for all bin/ programs | Nix package |
| `git log` | system | Extract recent commit activity for build-in-public drafter | System PATH |
| `sqlite3` | system | Used by agent steps for state.db queries | Nix package |

### Existing arXiv RSS Feeds (already in content-scout.yaml)

| Feed | URL | Already Used |
|------|-----|-------------|
| arXiv cs.AI | `https://arxiv.org/rss/cs.AI` | Yes (content-scout) |
| arXiv cs.LG | `https://arxiv.org/rss/cs.LG` | Yes (content-scout) |
| arXiv cs.CL | `https://arxiv.org/rss/cs.CL` | Yes (content-scout) |
| arXiv cs.MA | `https://arxiv.org/rss/cs.MA` | No — new for paper scout |
| arXiv cs.SE | `https://arxiv.org/rss/cs.SE` | No — new for paper scout |

### No New Dependencies

All required capabilities are already available. Do not install additional npm/bun packages.

---

## Architecture Patterns

### Recommended File Layout (new files for this phase)

```
cron/jobs/
├── build-in-public-drafter.yaml   # DIST-01: Mon/Wed/Fri, type: agent
├── engagement-scout.yaml          # DIST-02: daily, type: agent
├── paper-scout.yaml               # DIST-03: weekly (Monday), type: agent
└── company-refresh.yaml           # DIST-04: weekly, type: agent

bin/
└── README.md                      # DOCS-05: complete program index rewrite

zeroclaw/
└── config.toml                    # FIX-07: max_cost_per_day_cents updated
```

### Pattern 1: Build-in-Public Drafter (DIST-01)

**What:** Agent YAML that runs git log since the last draft day, reads state.db for job hunt metrics, then drafts two posts — one for X (short/punchy) and one for LinkedIn (longer/professional). Sends both via WhatsApp for review. Silent when activity is too sparse to be interesting.

**Schedule:** `0 9 * * 1,3,5` (Mon/Wed/Fri at 09:00 Lima)

**Key step sequence:**
1. Run `git log --since='2 days ago' --oneline` in `/etc/nixos/zeroclaw` to gather recent commits. Also query `state.db` job_applications for any new status changes (applied, interview, offer) in the last 2 days. Query content_log for posts sent this week to avoid repetition. Output a structured activity summary.
2. Read `/etc/nixos/zeroclaw/documents/LORE.md` for platform strategy and voice guide. Map the activity to content pillars. Determine if there is enough meaningful activity to post (at least 1 substantive commit or 1 job hunt milestone). If nothing meaningful, output SILENT and stop.
3. Draft the X version (short, punchy, opinionated, max 280 chars, no hashtag spam) and the LinkedIn version (longer, professional framing, can include technical detail). Reference LORE.md voice guide for each platform.
4. Send both drafts via WhatsApp: `kapso-whatsapp-cli send --to +51926689401 --text` with a clear "DRAFT FOR X:" and "DRAFT FOR LINKEDIN:" separator. Include which commits/milestones each draft covers.

**Critical YAML formatting rules (from Phase 08/09 learnings):**
- No inner double-quotes in step strings — parseYaml regex truncates at first inner quote
- No `key: value` colon-space patterns in step descriptions — Go YAML parser rejects them
- Use `row N is content` phrasing instead of `Line N: content`

**Example YAML skeleton:**
```yaml
name: "Build-in-Public Drafter"
schedule: "0 9 * * 1,3,5"
tz: "America/Lima"
type: agent
goal: "Draft two social media posts (X and LinkedIn) from recent git activity and job hunt progress, deliver via WhatsApp for human approval"
steps:
  - Run git log --since=2.days.ago --oneline in /etc/nixos/zeroclaw to list recent commits. Query state.db at ~/.zeroclaw/workspace/state.db for job_applications with status changes in the last 2 days using last_updated >= unixepoch() - 172800. Output commit list and job status changes as a structured summary.
  - Read /etc/nixos/zeroclaw/documents/LORE.md content pillars and platform strategy. Assess if the activity from step 1 is substantive enough to post about -- at least 1 meaningful commit or 1 job hunt milestone. If not enough content, output SILENT and stop.
  - Draft the X version using the LORE.md voice guide for X/Twitter -- short punchy opinionated max 280 chars. Draft the LinkedIn version -- longer professional framing same events. Label each draft clearly.
  - Send the drafts to +51926689401 via kapso-whatsapp-cli send --to +51926689401 --text with both drafts separated by DRAFT FOR X and DRAFT FOR LINKEDIN labels.
notify: "+51926689401"
```

### Pattern 2: Engagement Scout (DIST-02)

**What:** Agent YAML that searches X, Reddit, and HN for threads about AI agents, build-in-public, and LLM engineering. For each relevant thread found, drafts a reply in Enrique's voice. Delivers the threads + draft replies via WhatsApp. Silent when no relevant threads found.

**Schedule:** `0 10 * * *` (daily at 10:00 Lima — after morning briefing)

**Key step sequence:**
1. Search the web for recent (last 24h) threads and posts mentioning AI agents, build-in-public developer, LLM engineering, orchestration systems. Focus on X, Reddit (r/MachineLearning, r/LocalLLaMA, r/programming), and HackerNews. Collect top 3-5 threads with title, URL, and brief context.
2. Read `/etc/nixos/zeroclaw/documents/LORE.md` platform strategy and Enrique's voice guide. Filter threads: keep only those where a technical reply from an AI engineer/CTO-founder adds genuine value. Discard promotional threads or threads where Enrique has nothing unique to contribute. If none qualify, output SILENT and stop.
3. For each qualifying thread, draft a reply in Enrique's voice — based on LORE.md: genuine technical depth, not promotional, references concrete experience. Keep replies under 280 chars for X, longer for Reddit/HN.
4. Send the qualifying threads and their draft replies via WhatsApp: `kapso-whatsapp-cli send --to +51926689401 --text`. Format each as URL on one line followed by the draft reply.

**Note on LORE.md voice references:**
- Reddit: "Technical depth in relevant subreddits. Not promotional. Genuinely helpful."
- HackerNews: "Only for genuinely interesting technical content. Don't force it."
- X: "Short, punchy, opinionated."

### Pattern 3: Paper Scout (DIST-03)

**What:** Agent YAML that fetches arXiv feeds from 5 categories (cs.AI, cs.LG, cs.CL, cs.MA, cs.SE), filters against LORE.md research interests, and delivers a curated top-5 weekly digest with 2-3 sentence summaries.

**Schedule:** `0 9 * * 1` (Monday 09:00 Lima — same day as content-scout which runs at 08:00, different purpose)

**Key step sequence:**
1. Fetch the arXiv RSS feeds: cs.AI (`https://arxiv.org/rss/cs.AI`), cs.LG (`https://arxiv.org/rss/cs.LG`), cs.CL (`https://arxiv.org/rss/cs.CL`), cs.MA (`https://arxiv.org/rss/cs.MA`), cs.SE (`https://arxiv.org/rss/cs.SE`). Extract title, authors, abstract, and URL for each paper. Collect from the last 7 days.
2. Read `/etc/nixos/zeroclaw/documents/LORE.md` research interests section. Filter all collected papers against these interests -- multi-agent systems in adversarial environments, algorithmic fairness in public systems, LLM reasoning over structured data, compilers and LLMs, spec-driven development. Rank by relevance to these interests. Select the top 5 papers.
3. For each of the top 5 papers, write a 2-3 sentence summary covering the main contribution, key result, and why it is relevant to the research interests. Format as title -- authors -- 2-3 sentence summary -- URL.
4. If no papers pass the filter, output SILENT and stop. Otherwise send the digest to +51926689401 via kapso-whatsapp-cli send --to +51926689401 --text with a header line followed by the 5 paper entries.

**Differentiation from content-scout:** Content scout includes arXiv but only does 1-line summaries and filters by content pillars (build-in-public, AI engineering). Paper scout filters by research interests (academic, narrower), covers cs.MA and cs.SE, and provides deeper 2-3 sentence summaries. These serve different purposes.

### Pattern 4: Weekly Company Refresh (DIST-04)

**What:** Agent YAML using orchestrate.ts multi-source synthesis. Mines state.db for companies already encountered in job/freelance tracking, does web research to fill gaps in each Target Path category, and writes results directly to the LORE.md Target Companies section (which is symlinked, live-editable).

**Schedule:** `0 10 * * 3` (Wednesday 10:00 Lima — mid-week, separate from Monday paper scout)

**Key step sequence:**
1. Query state.db at `~/.zeroclaw/workspace/state.db` for all company names in job_applications and freelance_leads tables. Group by company. Output a deduplicated company list with their target path category if known.
2. Read `/etc/nixos/zeroclaw/documents/LORE.md` Target Companies section and Target Paths section. Identify gaps -- which categories (Remote-Global, US Sponsors H-1B/O-1, Relocation-Friendly) have fewer than 5 companies listed. Search the web for companies in underrepresented categories: remote-first companies hiring engineers at $100K+ LATAM-friendly, known H-1B sponsors for software engineers, relocation-friendly EU/CA/SG companies. Collect name, category, and 1-2 recent hiring signals per company.
3. Merge the state.db companies and web-researched companies into a consolidated list. For each company note its Target Path category and any recent news or hiring signals. Limit to 10-15 companies total across all categories.
4. Write the updated Target Companies section to `/etc/nixos/zeroclaw/documents/LORE.md`. The section starts with `## Target Companies` and has three subsections -- Remote-Global, US Sponsors (H-1B / O-1), Relocation-Friendly. Replace the TBD placeholders with the company entries. Each entry on its own line starting with `- `. Send a brief WhatsApp summary of how many companies were added per category via kapso-whatsapp-cli send --to +51926689401 --text.
notify: "+51926689401"

**Critical for LORE.md write:** The file is at `/etc/nixos/zeroclaw/documents/LORE.md` (git source), which is symlinked to `~/.zeroclaw/documents/LORE.md`. Writes to the git source path are the correct approach — the symlink makes changes visible immediately. The `claude -p` subprocess has write access via `allowed_roots = ["/etc/nixos/"]` in config.toml. Step 4 should instruct the agent to use the file write tool (or sed) to replace the Target Companies section content.

### Pattern 5: Cost Calibration Process (FIX-07)

**What:** Operational task, not a code task. After all Phase 10 crons are live, measure 3+ days of actual spend, then update `config.toml`.

**Measurement method:**
1. Run all crons for 3+ consecutive days
2. Check ZAI dashboard/billing for daily token spend
3. Record daily spend in cents
4. Calculate average, multiply by 2 for safety margin
5. Update `max_cost_per_day_cents` in `config.toml` directly

**config.toml location:** `/etc/nixos/zeroclaw/config.toml`

**Current value:** `max_cost_per_day_cents = 500` (line 48 of config.toml)

**Critical note on config.toml deployment model:** Per zeroclaw/CLAUDE.md, config.toml requires a rebuild to take effect (`sudo nixos-rebuild switch ...`). It is rendered via sops at activation. Direct edits to the template are correct; the rebuild propagates the change.

**The updated line:**
```toml
max_cost_per_day_cents = <measured_2x_average>
```

This is a plain integer (no `@PLACEHOLDER@` token). Direct edit of the numeric value, then rebuild.

### Anti-Patterns to Avoid

- **Auto-posting to social platforms:** Architecture violation per project out-of-scope rules. Build-in-public drafter delivers drafts for human review only.
- **Inner double-quotes in YAML step strings:** parseYaml regex `^\s+-\s+"?(.+?)"?\s*$` lazy matches — truncates at first inner quote. Use single quotes or rephrase.
- **`key: value` colon-space in step strings:** Go YAML parser rejects them in plain block scalars (established Phase 08 pitfall). Use dashes or plain prose.
- **Writing to `~/.zeroclaw/documents/LORE.md` via symlink path:** Safe to write to the source `/etc/nixos/zeroclaw/documents/LORE.md` directly. Do not instruct agent to resolve symlink path — use the git source path.
- **Overwriting all of LORE.md when updating Target Companies:** Only the Target Companies section should be replaced. The agent step must use a targeted file edit (read, replace section, write) not a full overwrite.
- **Guessing cost cap:** FIX-07 explicitly requires empirical measurement. Do not set `max_cost_per_day_cents` without 3+ days of real data.
- **No command: field on agent YAMLs:** `type: agent` YAMLs must NOT include a `command:` field — cron-sync auto-generates it. Adding both causes a conflict.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WhatsApp delivery | Custom HTTP client or new module | `notify()` from notify.ts (or direct `kapso-whatsapp-cli` in steps) | Already has retry, rate limiting, audit log |
| DB connection | Raw `Database()` calls | `initStateDb()` | WAL + busy_timeout + migrations already handled |
| Multi-step agent execution | New runner or inline claude calls | `orchestrate.ts` YAML | Checkpointing, resume, failure handling, cron_log |
| YAML parsing for cron files | Full YAML library (yq, js-yaml) | Regex line matching (existing parseYaml pattern) | yq not available in bin/ execution context |
| arXiv paper fetching | Custom RSS parser | Agent step with web fetch | Agent can read RSS URLs natively via claude -p tools |
| Social media API | Twitter/LinkedIn SDK | Draft-only WhatsApp delivery | No auto-posting — user copy-pastes |
| Company data scraping | Puppeteer/playwright | Agent web search via claude -p | Consistent with established scanner pattern |

**Key insight:** Phase 10 is pure assembly. Every building block exists. New files needed: 4 YAML files, 1 README.md update, and 1 config.toml line change.

---

## Common Pitfalls

### Pitfall 1: Step Strings With Inner Double-Quotes
**What goes wrong:** `parseYaml` regex `^\s+-\s+"?(.+?)"?\s*$` uses lazy match — stops at the first `"` inside the string. Step content gets silently truncated.
**Why it happens:** Regex was designed for simple quoted strings, not embedded quotes.
**How to avoid:** Never use double quotes inside step strings. Use single quotes or rephrase away from quoting.
**Warning signs:** Agent step runs but produces partial/incomplete results.

### Pitfall 2: YAML Plain Block Scalars With `key: value` Patterns
**What goes wrong:** Go YAML parser rejects `key: value` patterns inside unquoted multi-line step strings.
**Why it happens:** Established in Phase 08 — same parseYaml and Go parser.
**How to avoid:** Use dash separators (`key -- value`) or restructure phrasing. Example: `DRAFT FOR X -- content` not `DRAFT FOR X: content`.
**Warning signs:** `cron-sync` errors, or orchestrate.ts fails to parse steps.

### Pitfall 3: Company Refresh Overwriting LORE.md
**What goes wrong:** Agent step that says "update LORE.md Target Companies" writes the entire file with only the Target Companies section, destroying all other LORE.md content.
**Why it happens:** Simple file write tools replace the whole file content.
**How to avoid:** Step 4 of company-refresh.yaml must explicitly instruct: "Read the entire LORE.md first, then replace only the content between `## Target Companies` heading and the next `##` heading. Write the complete file back."
**Warning signs:** LORE.md loses job search strategy, products, distribution strategy sections.

### Pitfall 4: config.toml Requires Rebuild
**What goes wrong:** Developer edits config.toml, sees no change in ZeroClaw behavior, assumes the edit is live.
**Why it happens:** config.toml uses sops-rendered activation. Per CLAUDE.md deployment model: "config.toml requires rebuild".
**How to avoid:** After editing config.toml, run `sudo nixos-rebuild switch --impure --option eval-cache false --flake /etc/nixos#nixos`.
**Warning signs:** `max_cost_per_day_cents` appears unchanged in running config after direct file edit.

### Pitfall 5: Build-in-Public Drafter Sending Drafts in Platform-Inappropriate Format
**What goes wrong:** X draft exceeds 280 chars, or LinkedIn draft is too terse/punchy.
**Why it happens:** Agent doesn't know the character limits unless steps explicitly specify them.
**How to avoid:** Step 3 must specify: X version max 280 chars (single tweet), LinkedIn version can be multi-paragraph (400-800 chars). Reference LORE.md platform voice guide explicitly.

### Pitfall 6: Paper Scout Overlapping With Content Scout
**What goes wrong:** Monday 08:00 content-scout already fetches cs.AI, cs.LG, cs.CL arXiv. Paper scout at 09:00 same day fetches same feeds. Duplicate content across two WhatsApp messages confuses user.
**Why it happens:** Content scout already includes arXiv in its feed list.
**How to avoid:** Paper scout is differentiated by (1) two additional categories (cs.MA, cs.SE), (2) deeper 2-3 sentence summaries, (3) filtering by research interests NOT content pillars. Step 1 should label this as the "weekly deep-dive" vs the daily content scan. The timing is fine (08:00 vs 09:00) — they serve different purposes.

### Pitfall 7: Engagement Scout Rate-Limiting With Other Notifications
**What goes wrong:** Engagement scout fires at 10:00, same as follow-up enforcer. Both try to send WhatsApp notifications. The `notify()` rate limiter suppresses the second send.
**Why it happens:** Agent step WhatsApp sends use `kapso-whatsapp-cli` directly (not notify.ts) — so in-step sends bypass rate limiting. The `notify:` field at YAML root uses notify.ts — this is for failure alerts only.
**How to avoid:** Both engagement scout and follow-up enforcer use in-step `kapso-whatsapp-cli` sends — they bypass notify.ts rate limiting. No actual conflict. This is consistent with established scanner pattern.

---

## Code Examples

Verified patterns from existing project source:

### Agent YAML With Silent-on-Zero Pattern
```yaml
# Source: /etc/nixos/zeroclaw/cron/jobs/content-scout.yaml
steps:
  - If no relevant items remain after filtering, exit silently without sending -- output SILENT. Otherwise compose a compact WhatsApp digest...
```

### Agent Step -- git log for Recent Activity
```yaml
# Pattern for build-in-public-drafter.yaml step 1
steps:
  - Run git log --since=2.days.ago --oneline in /etc/nixos/zeroclaw to list recent commits. Query state.db at ~/.zeroclaw/workspace/state.db for job_applications with last_updated >= unixepoch() - 172800. Output commit list and job status changes as a structured summary.
```

### Agent Step -- SQLite Read for Company Names
```yaml
# Pattern for company-refresh.yaml step 1
steps:
  - Query state.db at ~/.zeroclaw/workspace/state.db. Run sqlite3 ~/.zeroclaw/workspace/state.db 'SELECT DISTINCT company FROM job_applications WHERE company IS NOT NULL UNION SELECT DISTINCT company FROM freelance_leads WHERE company IS NOT NULL'. Output the company list.
```

### Agent Step -- File Section Replace Pattern
```yaml
# Pattern for company-refresh.yaml step 4 (safe LORE.md update)
steps:
  - Read the complete contents of /etc/nixos/zeroclaw/documents/LORE.md. Identify the section starting with '## Target Companies' and ending at the next '## ' heading. Replace only that section with the updated content from step 3. Write the complete modified file back to /etc/nixos/zeroclaw/documents/LORE.md. Send a WhatsApp summary via kapso-whatsapp-cli send --to +51926689401 --text with count of companies added per category.
```

### Agent YAML -- arXiv RSS with Research Filter
```yaml
# Pattern for paper-scout.yaml
steps:
  - Fetch arXiv RSS feeds -- cs.AI at https://arxiv.org/rss/cs.AI, cs.LG at https://arxiv.org/rss/cs.LG, cs.CL at https://arxiv.org/rss/cs.CL, cs.MA at https://arxiv.org/rss/cs.MA, cs.SE at https://arxiv.org/rss/cs.SE. Extract title, authors, abstract, and URL for papers from the last 7 days. Output a list of collected papers.
  - Read /etc/nixos/zeroclaw/documents/LORE.md research interests section. Filter collected papers against these interests -- multi-agent systems in adversarial environments, algorithmic fairness in public systems, LLM reasoning over structured data, compilers and LLMs, spec-driven development. Rank by relevance and select the top 5 papers. If none qualify, output SILENT and stop.
```

### config.toml Cost Cap Line
```toml
# Source: /etc/nixos/zeroclaw/config.toml line 48
# Current value (default placeholder):
max_cost_per_day_cents = 500

# After calibration (example — replace with measured 2x average):
max_cost_per_day_cents = 1200
```

### bin/README.md Program Entry Format
```markdown
| `init-state-db.ts` | Initialize SQLite state.db with WAL mode and v3 schema | — (called by other programs at startup) | `bun run init-state-db.ts [db-path]` | `{"schema_version": 3}` to stdout |
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON trackers in `~/zeroclaw-data/` | SQLite state.db with WAL at `~/.zeroclaw/workspace/state.db` | Phase 6 | content_log table exists for draft tracking |
| Direct cron CLI calls | YAML files + cron-sync | Phase 7 | New jobs added by creating YAML files only |
| repair-loop.sh (orphaned) | Removed | Phase 6 | bin/README.md should NOT list it as current |
| NOTIFY_TARGET env var | Caller passes recipient directly | Phase 6 | All crons pass +51926689401 explicitly |
| Auto-decomposition deferred | Still deferred | Phase 7 | Agent YAMLs must always include explicit `steps:` array |
| Config managed by NixOS sops | Same — requires rebuild | Ongoing | max_cost_per_day_cents change needs nixos-rebuild |

**Programs that exist but are not in bin/README.md:**
All six v2.0 programs need documentation: `init-state-db.ts`, `notify.ts`, `orchestrate.ts`, `self-audit.ts`, `sentinel-scan.ts`, `zai-proxy.ts`. Current README only lists `sentinel-scan.ts` and the removed `repair-loop.sh`.

---

## Open Questions

1. **Does `claude -p` have file write access to `/etc/nixos/zeroclaw/documents/LORE.md`?**
   - What we know: config.toml `allowed_roots` includes `"/etc/nixos/"`. The `claude -p` subprocess inherits these constraints.
   - What's unclear: Whether allowed_roots applies to file writes or only to bash commands.
   - Recommendation: Step 4 of company-refresh.yaml should instruct the agent to use the file write tool directly on `/etc/nixos/zeroclaw/documents/LORE.md`. If the write fails due to permissions, the step should fall back to `bash` with `cat > /etc/nixos/zeroclaw/documents/LORE.md`. Test with a dry-run during Wave 0.

2. **ZAI billing dashboard — how to read daily spend in cents**
   - What we know: ZAI proxy is running at `http://127.0.0.1:5100`. The `zai-proxy.ts` program is in bin/.
   - What's unclear: Whether the ZAI dashboard exposes per-day cost totals, and the URL/format for reading them.
   - Recommendation: FIX-07 task should include a step to read `bin/zai-proxy.ts` source to understand available endpoints. If no billing endpoint exists, fall back to counting `orchestration_tasks` rows × estimated cost per step as a proxy.

3. **content_log table usage for draft deduplication**
   - What we know: `content_log` table exists in state.db with columns: platform, content, status (draft/posted), created_at, posted_at.
   - What's unclear: Whether build-in-public drafter should store drafts there for deduplication (avoid drafting the same commits twice).
   - Recommendation: Step 1 of build-in-public drafter should query `content_log` for recent entries to avoid repeating covered commits. Store sent drafts in content_log after delivery (`status='draft'`).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — bun discovers `*.test.ts` automatically |
| Quick run command | `cd /etc/nixos/zeroclaw && bun test bin/` |
| Full suite command | `cd /etc/nixos/zeroclaw && bun test bin/` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIST-01 | YAML parses correctly (goal, steps, schedule) | unit | `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts` | Partial — parseYaml tested, new YAMLs not yet |
| DIST-01 | Silent when no meaningful git activity | manual smoke | `bun run orchestrate.ts cron/jobs/build-in-public-drafter.yaml --db-path /tmp/test.db` | No — Wave 0 |
| DIST-02 | YAML parses correctly | unit | `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts` | Partial |
| DIST-02 | Silent when no relevant threads | manual smoke | `bun run orchestrate.ts cron/jobs/engagement-scout.yaml --db-path /tmp/test.db` | No — Wave 0 |
| DIST-03 | YAML parses correctly | unit | `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts` | Partial |
| DIST-03 | Paper digest delivered Monday 09:00 | manual smoke | `cron-sync --dry-run` | No — Wave 0 |
| DIST-04 | YAML parses correctly | unit | `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts` | Partial |
| DIST-04 | LORE.md Target Companies section updated correctly (not full overwrite) | manual smoke | Read LORE.md after test run | No — Wave 0 |
| FIX-07 | max_cost_per_day_cents updated from 500 to calibrated value | manual | `grep max_cost_per_day_cents /etc/nixos/zeroclaw/config.toml` | N/A — operational |
| DOCS-05 | bin/README.md lists all 6 v2.0 programs with cron, inputs, output contract | manual | `cat /etc/nixos/zeroclaw/bin/README.md` | Partial — needs rewrite |

Note: All four cron YAMLs execute via `claude -p` — agent steps are not unit-testable. Validation is via manual smoke testing with `bun run orchestrate.ts <yaml> --db-path /tmp/test.db` and inspecting output. The YAML structure (parseability, required fields) IS testable via the existing `parseYaml` tests in `orchestrate.test.ts`.

### Sampling Rate
- **Per task commit:** `cd /etc/nixos/zeroclaw && bun test bin/orchestrate.test.ts`
- **Per wave merge:** `cd /etc/nixos/zeroclaw && bun test bin/`
- **Phase gate:** Full suite green + manual smoke of each YAML before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers YAML structural validation. New YAML files will be smoke-tested manually (not unit-tested) since step content runs via `claude -p`. The `parseYaml` tests in `orchestrate.test.ts` already cover the parsing logic.

---

## Sources

### Primary (HIGH confidence)
- `/etc/nixos/zeroclaw/bin/orchestrate.ts` — YAML parsing rules, step format constraints, parseYaml regex, runner pattern
- `/etc/nixos/zeroclaw/bin/init-state-db.ts` — state.db schema v3, content_log table, all table schemas
- `/etc/nixos/zeroclaw/bin/notify.ts` — rate limiting behavior, priority system, recipient parameter
- `/etc/nixos/zeroclaw/config.toml` — current max_cost_per_day_cents value (500), deployment model, allowed_roots
- `/etc/nixos/zeroclaw/cron/README.md` — YAML schema, agent vs shell type, cron DB location
- `/etc/nixos/zeroclaw/cron/jobs/content-scout.yaml` — arXiv RSS URLs, silent-on-zero step pattern
- `/etc/nixos/zeroclaw/cron/jobs/morning-briefing.yaml` — state.db query pattern in steps
- `/etc/nixos/zeroclaw/cron/jobs/job-scanner.yaml` — sqlite3 CLI insert pattern, LORE.md read pattern
- `/etc/nixos/zeroclaw/cron/jobs/eod-summary.yaml` — git log in agent step, established phrasing constraints
- `/etc/nixos/zeroclaw/documents/LORE.md` — Target Companies section structure, platform strategy, research interests, voice guide
- `/etc/nixos/zeroclaw/bin/README.md` — current state (only sentinel-scan.ts + repair-loop.sh documented)
- `/etc/nixos/zeroclaw/.planning/STATE.md` — Phase 08/09 YAML formatting decisions

### Secondary (MEDIUM confidence)
- `/etc/nixos/zeroclaw/.planning/phases/10-research-distribution-and-cost-calibration/10-CONTEXT.md` — locked decisions and specifics from user discussion

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified in existing source files
- Architecture patterns: HIGH — verified against working Phase 8-9 agent YAMLs and established pitfalls
- YAML formatting constraints: HIGH — directly from STATE.md Phase 08/09 decisions and orchestrate.ts source
- LORE.md write safety: MEDIUM — allowed_roots supports it, but file write tool access in claude -p subprocess unverified
- Cost calibration process: HIGH — config.toml structure verified, deployment model from CLAUDE.md confirmed
- Documentation gaps: HIGH — README.md current state verified by direct read

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable internal stack — no external library dependencies)
