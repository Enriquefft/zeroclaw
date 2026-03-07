# Feature Research

**Domain:** Autonomous personal AI agent — Heartbeat crons (v2.0 milestone)
**Researched:** 2026-03-06
**Confidence:** HIGH — based on live codebase, existing skill implementations, and verified patterns from current AI agent ecosystem

---

## Scope

This document covers only the **new features in v2.0 Heartbeat**: the 11 scheduled cron jobs and the infrastructure layer that supports them. v1.x features (sentinel, email skill, calendar skill, repair-loop, self-modification, cron-sync) are already shipped and out of scope here.

---

## Feature Landscape

### Table Stakes (Kiro Needs These to Be a Real Chief-of-Staff)

These are the features that make Kiro a proactive agent rather than a reactive chatbot. Missing any of these means scheduled autonomy is broken or noisy.

| Feature | Why Expected | Complexity | Job Type | Notes |
|---------|--------------|------------|----------|-------|
| **Morning briefing** (agenda + priorities) | Any chief-of-staff starts the day with a briefing. Without it, Kiro is silent at the moment it's most needed | MEDIUM | Agent | Requires: calendar skill (agenda), email skill (overnight messages), memory_recall for pending tasks. Output: WhatsApp summary. Critical dependency: shared state DB for "pending follow-ups today" |
| **EOD summary** (daily digest + what moved) | Bookends the day. Closes loops opened in the morning briefing. Sets up tomorrow | MEDIUM | Agent | Requires: memory_recall for tasks opened today, calendar for what actually happened vs planned. Must write state for next morning's context carryover |
| **Follow-up enforcer** (commitment tracker, nudge loop) | Professionals make commitments constantly. Without tracking, they vanish into context-loss. This is the highest-ROI feature for a chief-of-staff | HIGH | Agent | Requires: shared state DB (commitments table or memory_store keys), email skill (detect replies closing the loop), WhatsApp alert. Pattern: scan open commitments, check if reply received, nudge if stale >N hours |
| **Shared state database** (SQLite, cross-job) | Without durable shared state, every cron job starts blind. Jobs can't hand off context to each other | MEDIUM | Infrastructure | Single SQLite file at `~/.zeroclaw/state.db`. All programs write/read here. Needed before any heartbeat cron goes live |
| **Centralized notification module** | Every cron sends WhatsApp alerts. Without a shared module, each job reimplements retry logic and env-var resolution | LOW | Infrastructure | Thin Bun module exporting `notify(msg)`. Reads `KAPSO_API_KEY` from `zeroclaw.env`. Used by all programs. Avoids 11x duplication |
| **Self-audit** (config/doc drift detection) | Git-first edits are the law, but drift happens (direct edits to `~/.zeroclaw/`, stale symlinks, orphaned skills). Without auditing, the system silently degrades | MEDIUM | Shell/Program | Compares `/etc/nixos/zeroclaw/` source vs `~/.zeroclaw/` deployment. Detects: broken symlinks, skills in deployment not in git, config hash mismatch. Weekly cadence. Output: WhatsApp alert if drift found |

### Differentiators (What Makes Kiro Exceptional vs a Generic Scheduler)

These features go beyond "reminder bot" into genuine intelligence amplification.

| Feature | Value Proposition | Complexity | Job Type | Notes |
|---------|-------------------|------------|----------|-------|
| **Job board scanner** (quality-filtered leads) | Manually scanning job boards daily is 30+ minutes of noise filtering. An agent that pre-qualifies leads and surfaces only matches is a force multiplier for job search | HIGH | Agent | Pattern: search LinkedIn/Indeed/Wellfound via browser tool + web search, filter against USER.md preferences (stack, seniority, remote/hybrid), deduplicate via state DB, WhatsApp only new qualified leads. Requires: browser skill, web search, shared state for seen-job-ids |
| **Freelance gig scanner** | Same value as job scanner but for contract work. Different platforms (Upwork, Toptal, Fiverr for services), different signal (budget, duration, skills match) | HIGH | Agent | Can share most infrastructure with job scanner. Separate cron because cadence differs (more frequent) and signal threshold differs (smaller opportunities warrant faster response). Dedup via shared state |
| **Build-in-public content drafter** | Shipping in public requires consistent content. Manually drafting posts is a bottleneck. Agent that monitors git activity and generates draft posts removes the bottleneck without requiring discipline | MEDIUM | Agent | Pattern: read recent git commits/PRs (git log or GitHub API), draft 2-3 Twitter/X post variants, store draft in memory/state, WhatsApp with draft for approval. NOT auto-posting — human approves. Input: `git log --since 24h` or GitHub CLI |
| **Content scout** (RSS + trending topics) | Staying current in tech requires active monitoring. Surfacing relevant articles and threads eliminates manual RSS reading | MEDIUM | Agent | Requires: web search for trending tech topics, RSS parsing (fetch + summarize). Output: curated digest with brief rationale for each item. Scope: topics defined in USER.md or a scout-config doc. Daily cadence |
| **Academic paper scout** | ML/AI moves fast. Missing a key paper means working from stale assumptions. Weekly scout of arXiv/Semantic Scholar for relevant papers is high signal for low effort | MEDIUM | Agent | Pattern: search arXiv API (no auth required) by topic keywords from USER.md, filter by recency + citation velocity if available, summarize abstracts, WhatsApp digest. Weekly cadence. Dedup via state DB |
| **Weekly company research refresh** | Job applications need fresh company intel (recent news, fundraising, leadership changes). Stale research = weak applications | HIGH | Agent | Pattern: maintain a watch-list of target companies in state DB (or a doc), run weekly web search per company for recent news, update state, surface changes. Requires: web search + browser for deeper reads |
| **Engagement scout** (relevant threads to respond to) | Build-in-public strategy requires engaging with relevant discussions, not just posting. Finding the right threads manually is noisy | MEDIUM | Agent | Pattern: search Twitter/X, LinkedIn, Reddit for threads matching USER.md interests/expertise, filter by recency + engagement signal, surface top 3-5 for Kiro to draft response to. Human approves before sending |

### Anti-Features (Commonly Requested, Consistently Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-posting to social media** | "Just post it — I approved the draft" | One hallucinated stat or wrong tone goes live immediately. Recovery is public. The approval gate is the value, not a bottleneck | Keep human in the loop for all public-facing content. Kiro drafts + notifies, human approves via WhatsApp reply |
| **Auto-applying to jobs** | "Filter the leads, then just apply" | Applications require customization per role. Auto-apply produces generic spam that damages reputation. Rate-limiting on platforms triggers shadow-banning | Kiro surfaces qualified leads + drafts cover letter variant. Human submits |
| **Real-time engagement monitoring** (sub-minute polling) | "Don't miss anything" | API rate limits, cost, noise. Most platforms block aggressive scraping. High-frequency polling provides no meaningful value over hourly | Hourly or daily cadence is sufficient for all engagement patterns. Real-time is only needed for time-sensitive alerts (sentinel already handles those) |
| **Fully automated follow-up sending** | "Just send the nudge if they haven't replied" | Automated messages from personal accounts damage relationships. Context matters — sometimes no reply is intentional | Kiro detects stale commitments and drafts the nudge. Human sends (or explicitly approves auto-send per commitment type) |
| **Monolithic daily-digest cron** | "One job to rule them all" | One failure breaks everything. Impossible to tune cadence per job type. Job output sizes vary wildly making a single digest unreadable | Separate jobs with separate cadences. Morning briefing aggregates selectively, not by running all jobs again |
| **Storing raw email/calendar content in state DB** | "So jobs can share context" | Privacy risk, storage cost, and latency. Skills already have access to live data | Store only identifiers and metadata (job IDs, commitment status, seen-paper hashes). Fetch full content from the source skill on demand |
| **Inline LLM prompts in cron YAML** | "Faster to write" | ZeroClaw's architecture explicitly rejects this — cron jobs reference skills or programs. Inline prompts are opaque, untestable, and violate the single-source-of-truth rule | Always reference a SKILL.md or a `bin/` program. The prompt lives in the skill's identity doc |

---

## Feature Dependencies

```
[Shared state DB]
    └──required-by──> [Morning briefing]     (reads pending follow-ups)
    └──required-by──> [Follow-up enforcer]   (writes/reads commitments)
    └──required-by──> [Job scanner]          (dedup seen-job-ids)
    └──required-by──> [Freelance scanner]    (dedup seen-gig-ids)
    └──required-by──> [Company research]     (stores watch-list + last-seen state)
    └──required-by──> [Paper scout]          (dedup seen-paper hashes)
    └──required-by──> [EOD summary]          (reads tasks opened today)

[Centralized notification module]
    └──required-by──> ALL 11 cron jobs      (WhatsApp delivery)

[Email skill] (already shipped)
    └──enhances──> [Morning briefing]        (overnight messages)
    └──enhances──> [Follow-up enforcer]      (scan for replies closing loops)
    └──enhances──> [EOD summary]             (unanswered emails surfaced)

[Calendar skill] (already shipped)
    └──enhances──> [Morning briefing]        (agenda for the day)
    └──enhances──> [EOD summary]             (what actually happened)

[Web search] (already configured)
    └──required-by──> [Job scanner]
    └──required-by──> [Freelance scanner]
    └──required-by──> [Content scout]
    └──required-by──> [Paper scout]
    └──required-by──> [Company research]
    └──required-by──> [Engagement scout]

[Browser tool] (already configured)
    └──enhances──> [Job scanner]             (read full job descriptions)
    └──enhances──> [Company research]        (read company pages)
    └──enhances──> [Engagement scout]        (navigate social threads)

[Morning briefing]
    └──feeds-into──> [EOD summary]           (what was planned vs completed)

[Follow-up enforcer]
    └──feeds-into──> [Morning briefing]      (stale follow-ups surfaced at start of day)

[Build-in-public drafter]
    └──feeds-into──> [Engagement scout]      (context for drafting responses)

[Self-audit]
    └──standalone──> no dependencies (reads filesystem + git)
```

### Dependency Notes

- **Shared state DB must ship before any heartbeat cron.** It is the foundation. All 11 jobs either read or write shared state. Without it, every job is stateless and will produce duplicate notifications.
- **Centralized notification module must ship before any heartbeat cron.** Without it, each program duplicates retry/auth logic. This is infrastructure, not a feature.
- **Follow-up enforcer is highest complexity** because it requires both detecting commitments (NLP/agent judgment) and tracking their resolution (email scan + state updates). Do not underestimate.
- **Job scanner and freelance scanner share ~80% of implementation.** Build job scanner first, generalize to freelance scanner. Do not build independently.
- **Content scout and paper scout share feed-aggregation logic.** Different sources, same pipeline. Build content scout first.
- **Self-audit has zero external dependencies.** Can be built at any time. Ship early to catch infrastructure drift.

---

## Shell vs Agent Classification

This is the critical build decision for each cron job. Agent jobs invoke the LLM for judgment. Shell/Program jobs are deterministic and run without LLM involvement.

| Cron Job | Classification | Rationale |
|----------|---------------|-----------|
| Morning briefing | **Agent** | Requires synthesis: pull calendar + email + pending state, write a coherent prioritized briefing. LLM judgment needed |
| EOD summary | **Agent** | Requires synthesis: what actually moved today, what's still open, what to carry to tomorrow |
| Follow-up enforcer | **Agent** | Requires judgment: is this email a closure? Is this commitment stale enough to nudge? Context-dependent |
| Job scanner | **Agent** | Requires judgment: does this role match USER.md preferences? Quality filtering is the value |
| Freelance scanner | **Agent** | Same as job scanner |
| Build-in-public drafter | **Agent** | Content generation is inherently LLM work |
| Content scout | **Agent** | Curation requires relevance judgment — not all recent articles are relevant |
| Self-audit | **Program (Shell)** | Purely deterministic: compare file hashes, check symlinks, verify git status. No LLM needed. Should be a `bin/` script |
| Weekly company research | **Agent** | Requires synthesis of web search results into actionable intelligence |
| Paper scout | **Agent** | Abstract summarization and relevance filtering requires LLM judgment |
| Engagement scout | **Agent** | Relevance filtering of social threads requires context-awareness |

**Rule:** If the job output is deterministic given the inputs, use a Program (`bin/`). If the job requires relevance judgment, synthesis, or content generation, use an Agent (ZeroClaw cron session).

---

## MVP Definition for v2.0 Heartbeat

### Phase 1: Infrastructure First (Required Before Any Cron Goes Live)

- [ ] **Shared state DB** — SQLite schema at `~/.zeroclaw/state.db`, Bun module for read/write, initialized by NixOS activation or first-run script
- [ ] **Centralized notification module** — `bin/notify.ts`, exports `notify(msg: string)`, reads Kapso env vars, handles retry
- [ ] **Cron-sync overhaul** — Agent job type support via daemon REST API (as documented in PROJECT.md). Without this, agent crons cannot be registered
- [ ] **Self-audit program** — `bin/self-audit.ts`, weekly cron, no LLM dependency, validates deployment integrity

### Phase 2: High-Value Daily Crons (Ship These First)

These 3 jobs deliver immediate daily value and validate the infrastructure.

- [ ] **Morning briefing** — calendar + email + pending follow-ups → WhatsApp digest at 07:30
- [ ] **EOD summary** — tasks opened today + what moved + unanswered emails → WhatsApp at 20:00
- [ ] **Follow-up enforcer** — scan commitments, check for replies, nudge stale → runs 3x daily (10:00, 14:00, 17:00)

### Phase 3: Opportunity Scanners (Ship After Daily Crons Validated)

- [ ] **Job scanner** — qualified lead filtering, dedup, WhatsApp alert → runs 2x daily
- [ ] **Freelance scanner** — shares job scanner infrastructure → runs 3x daily
- [ ] **Content scout** — RSS + trending → morning digest supplement → daily

### Phase 4: Research & Build-in-Public (Ship Last, Lowest Urgency)

- [ ] **Build-in-public drafter** — git activity → draft posts → WhatsApp for approval → daily
- [ ] **Engagement scout** — relevant threads for response → daily
- [ ] **Weekly company research** — target company news refresh → weekly Sunday
- [ ] **Paper scout** — arXiv/Semantic Scholar digest → weekly Saturday
- [ ] **Orchestration engine** (if complex multi-step decomposition is needed for any of the above)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shared state DB | HIGH | LOW | P1 |
| Centralized notification module | HIGH | LOW | P1 |
| Cron-sync agent job support | HIGH | MEDIUM | P1 |
| Self-audit | HIGH | LOW | P1 |
| Morning briefing | HIGH | MEDIUM | P1 |
| EOD summary | HIGH | MEDIUM | P1 |
| Follow-up enforcer | HIGH | HIGH | P1 |
| Job scanner | HIGH | HIGH | P2 |
| Freelance scanner | HIGH | MEDIUM | P2 — shares job scanner infra |
| Content scout | MEDIUM | MEDIUM | P2 |
| Build-in-public drafter | MEDIUM | MEDIUM | P2 |
| Weekly company research | MEDIUM | HIGH | P3 |
| Paper scout | MEDIUM | MEDIUM | P3 |
| Engagement scout | MEDIUM | HIGH | P3 |
| Orchestration engine | LOW | HIGH | P3 — defer unless a cron requires it |

**Priority key:**
- P1: Required for v2.0 milestone, must ship together
- P2: High value, ship immediately after P1 is validated
- P3: Defer to v2.x unless infrastructure makes them cheap

---

## Existing Skills Reuse Map

| Cron Job | Email Skill | Calendar Skill | Notes |
|----------|-------------|----------------|-------|
| Morning briefing | `list --since 480` (overnight) | `events --from today --to today` | Both used directly |
| EOD summary | `list --since 720` (day) + search unanswered | `events --from today --to today` | Cross-reference planned vs actual |
| Follow-up enforcer | `search` (looking for replies to tracked threads) | None | Track thread IDs in state DB, search for replies |
| Job scanner | None | None | Web search + browser primary |
| Freelance scanner | None | None | Web search + browser primary |
| Build-in-public drafter | None | None | git log + GitHub CLI primary |
| Content scout | None | None | Web search + RSS fetch primary |
| Self-audit | None | None | Filesystem only |
| Company research | None | None | Web search + browser primary |
| Paper scout | None | None | arXiv API (no auth) primary |
| Engagement scout | None | None | Web search + browser primary |

---

## Sources

- `/etc/nixos/zeroclaw/.planning/PROJECT.md` — Milestone scope and confirmed constraints (HIGH confidence)
- `/etc/nixos/zeroclaw/skills/email/cli.ts` — Email skill capabilities, confirmed live (HIGH confidence)
- `/etc/nixos/zeroclaw/skills/calendar/SKILL.md` — Calendar skill capabilities, confirmed live (HIGH confidence)
- `/etc/nixos/zeroclaw/skills/email/SKILL.md`, `/etc/nixos/zeroclaw/skills/calendar/SKILL.md` — Tool signatures (HIGH confidence)
- [GitHub: MCP-Personal-Assistant — autonomous morning briefing with Gemini + Calendar + Gmail](https://github.com/paddumelanahalli/MCP-Personal-Assistant) — reference implementation pattern (MEDIUM confidence)
- [Agents at Work: 2026 Playbook for Reliable Agentic Workflows](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/) — industry pattern confirmation (MEDIUM confidence)
- [tmgthb/Autonomous-Agents — daily-updated paper tracking pattern](https://github.com/tmgthb/Autonomous-Agents) — paper scout pattern reference (MEDIUM confidence)
- [AI Agent Trends 2026 — MachineLearningMastery](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/) — micro-specialization pattern confirmation (MEDIUM confidence)

---
*Feature research for: ZeroClaw v2.0 Heartbeat crons + infrastructure*
*Researched: 2026-03-06*
