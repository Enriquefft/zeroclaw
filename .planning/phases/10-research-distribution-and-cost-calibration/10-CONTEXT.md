# Phase 10: Research, Distribution, and Cost Calibration - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire four research/distribution crons (build-in-public drafter, paper scout, engagement scout, weekly company refresh), calibrate `max_cost_per_day_cents` from measured spend, and update bin/README.md with all v2.0 programs.

Requirements: DIST-01, DIST-02, DIST-03, DIST-04, FIX-07, DOCS-05

</domain>

<decisions>
## Implementation Decisions

### Build-in-Public Drafter (DIST-01)
- Source material: git activity + state.db activity — commits, PRs, diffs, job hunt progress, lead counts, milestones
- Target platforms: X/Twitter + LinkedIn — two versions per draft (punchy for X, longer professional for LinkedIn, per LORE.md platform strategy)
- Approval flow: WhatsApp delivery for review — draft sent via WhatsApp, user copy-paste-edits and posts manually. No auto-posting.
- Cadence: 3x per week (Mon/Wed/Fri) — accumulates 1-2 days of activity per draft, meatier content than daily
- Silent when no meaningful activity to post about

### Paper Scout (DIST-03)
- Differentiation from content scout: filters by LORE.md research interests (multi-agent systems, algorithmic fairness, LLM reasoning, compilers+LLMs, spec-driven dev) — NOT content pillars
- Provides 2-3 sentence summary per paper (deeper than content scout's 1-line)
- arXiv categories: cs.AI, cs.LG, cs.CL + cs.MA (multi-agent systems) + cs.SE (software engineering)
- Cadence: weekly (Monday), separate from daily content scout
- Delivery: WhatsApp digest — title + authors + 1-line takeaway + link per paper (consistent with other crons)
- Volume: top 5 papers per week (curated and focused)

### Engagement Scout (DIST-02)
- Source: search X, Reddit, HN for threads about AI agents, build-in-public, LLM engineering — conversations where Enrique's expertise adds value
- Output: threads + draft replies — each thread comes with a suggested reply in Enrique's voice (from LORE.md personality). User edits and posts.
- Silent when no relevant threads found
- Cadence: daily

### Weekly Company Refresh (DIST-04)
- Discovery: both combined — mine state.db job_applications/freelance_leads for companies already seen, supplement with web research for gaps in each Target Path category (remote-global, US sponsor, relocation)
- Data per company: name + category (which Target Path) + recent news/hiring signals — lightweight, not full profiles
- Updates LORE.md Target Companies section directly (live-editable via symlink)
- Cadence: weekly
- Uses orchestrate.ts for multi-source synthesis

### Cost Calibration (FIX-07)
- Measurement method: manual sampling — run all crons for 3+ days, check ZAI dashboard/billing, record daily spend
- Budget ceiling: set to 2x measured average daily spend — enough headroom without waste
- Priority cuts if over budget: cut engagement scout and company refresh first (nice-to-have), keep daily essentials (briefing, EOD, enforcer, scanners)
- One-time calibration — measure, set the value, done. Revisit manually if costs change.

### Documentation (DOCS-05)
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

</decisions>

<specifics>
## Specific Ideas

- Build-in-public drafter should use LORE.md platform strategy: X is "short, punchy, opinionated. Technical hot takes." LinkedIn is "longer posts, professional framing."
- Paper scout research interests from LORE.md: multi-agent systems in adversarial environments, algorithmic fairness in public systems, LLM reasoning over structured data, compilers + LLMs, spec-driven development
- Content scout already covers arXiv daily at 08:00 — paper scout should run on a different day/time to avoid overlap
- Company refresh populates the currently empty "Target Companies" section in LORE.md — categories are Remote-Global, US Sponsors (H-1B/O-1), Relocation-Friendly
- Engagement scout should reference LORE.md: "Reddit — Technical depth in relevant subreddits. Not promotional. Genuinely helpful." and "HackerNews — Only for genuinely interesting technical content. Don't force it."
- All four new crons follow established patterns: type: agent, tz: America/Lima, silent on zero results

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orchestrate.ts` (`bin/orchestrate.ts`): Orchestration engine for multi-step agent tasks — all four crons will be type: agent jobs
- `notify()` (`bin/notify.ts`): Shared notification module — WhatsApp delivery with retry and rate limiting
- `initStateDb()` (`bin/init-state-db.ts`): State DB with job_applications, freelance_leads, daily_state, content_log tables
- Content scout YAML (`cron/jobs/content-scout.yaml`): Pattern for RSS + web search agent cron — paper scout and engagement scout follow same structure
- Morning briefing YAML: Pattern for state.db queries + notification in agent steps

### Established Patterns
- Agent cron jobs: `type: agent` in YAML with `goal:`, `steps:[]`, `notify:` fields
- cron-sync auto-generates command: `bun run orchestrate.ts <yaml-path>`
- All cron YAMLs include `tz: America/Lima`
- Headline-only WhatsApp format (Phase 8) — compact, scannable
- Silent on zero results — no "all clear" messages (Phase 8-9)
- LORE.md read at runtime by agent via file access (Phase 9)
- Programs: TypeScript (bun), JSON stdout, stderr errors, exit 0/1

### Integration Points
- `cron/jobs/` needs 4 new YAML files: build-in-public-drafter.yaml, paper-scout.yaml, engagement-scout.yaml, company-refresh.yaml
- `config.toml` needs `max_cost_per_day_cents` updated from 500 to calibrated value
- `bin/README.md` needs all v2.0 programs documented
- `documents/LORE.md` Target Companies section is written to by company-refresh cron
- `state.db` tables already exist — no schema changes needed

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-research-distribution-and-cost-calibration*
*Context gathered: 2026-03-07*
