# ZeroClaw Overhaul Roadmap

Source of truth: GOALS.md. Everything below serves those goals.

---

## Resolved Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Target company size | No filter -- size doesn't matter |
| 2 | Freelance tracker format | SQLite (state.db) -- more powerful, already designed |
| 3 | Runway date | 2-month clock starts March 15, 2026 |
| 4 | Reference files | Stay as on-demand reference (saves context window) |
| 5 | Genera status | In name only -- background context, not active |
| 6 | Agent Orchestration / LLM Gladiators | Orchestration removed (absorbed into ZeroClaw). LLM Gladiators paused only. |
| 7 | Job scan times | 9am + 3pm Lima time |
| 8 | Build-in-public frequency | Daily (per GOALS.md) |
| 9 | O-1 / SF focus | Hybrid -- SF/O-1 scored as bonus, don't filter out good opportunities elsewhere |
| 10 | Gateway escalation | Resolved: `orchestrate run` IS the escalation path. GLM-5 calls it when it needs Opus. |

No open questions remain. All phases are unblocked.

---

## Architecture: Orchestrate as Universal Opus Escalation

### Philosophy

- **Orchestrate is not cron-specific.** It's the universal path to Opus for any task that needs it -- scheduled (cron), interactive (chat), or on-demand (CLI).
- **Opus (max effort)** is the orchestrator. It decomposes goals, spawns sub-agents, reviews results, iterates. Only max effort can do this.
- **Opus (high effort)** handles medium-complexity sub-tasks spawned by the orchestrator.
- **GLM-5** handles interactive chat (gateway) and simple sub-tasks delegated by Opus via `fast_run`.
- **GLM-5 escalates to Opus by calling `orchestrate run`.** This resolves gateway escalation -- no special proxy, no dual instances, no user commands needed.

### Effort tiers

| Tier | Model | Who decides | Used for |
|------|-------|-------------|----------|
| Max | Opus | Orchestrator system prompt | Orchestration itself: decompose, plan, review, iterate, spawn sub-agents |
| High | Opus | Orchestrator at runtime | Medium+ sub-tasks: scoring, analysis, creative drafting |
| Fast | GLM-5 | Orchestrator at runtime via `fast_run` | Simple sub-tasks: fetch, extract, query, tool-heavy grunt work |

### Entry points

```
1. CRON (scheduled)
   cron trigger -> orchestrate.ts <yaml> -> claude -p --max (Opus orchestrator)

2. CHAT (interactive escalation)
   user message -> ZeroClaw gateway (GLM-5)
     -> GLM-5 thinks: "this is complex, I need orchestration"
     -> calls orchestrate skill: orchestrate run "prep me for interview at Anthropic"
     -> orchestrate.ts launches claude -p --max (Opus orchestrator)
     -> result returned to GLM-5 -> relayed to user

3. CLI (on-demand)
   orchestrate run "research these 5 companies and rank them"
   -> same Opus orchestrator path
```

All three paths converge on the same orchestrate.ts launcher and the same Opus orchestrator prompt.

### Orchestrator execution model

```
orchestrate.ts (thin launcher)
  -> claude -p --max (Opus orchestrator)
       |
       |-- reads goal + hints
       |-- decomposes into sub-tasks
       |-- for each sub-task:
       |     |-- plan (itself or planning sub-agent at high effort)
       |     |-- review plan
       |     |-- execute (sub-agent at high effort, or fast_run for simple work)
       |     |-- review result -> iterate or proceed
       |
       |-- delegates simple work DOWN to GLM-5 via fast_run
       |-- does complex reasoning itself (scoring, analysis, creative)
       |-- uses tools directly (browser, email, calendar, sqlite)
       |-- checkpoints progress via orchestrate skill
```

### YAML format change: `steps` -> `hints`

Old (rigid, linear):
```yaml
steps:
  - "Read LORE.md and extract criteria"
  - "Search 5 job boards"
  - "Score leads 0-100"
  - "Insert to DB and send digest"
```

New (adaptive, agent-driven):
```yaml
goal: "Search job boards for new leads, score them, deduplicate, send digest"
hints:
  - "Check Wellfound, RemoteOK, WeWorkRemotely, HN Who Is Hiring, YC Work at a Startup"
  - "Score against LORE.md rubric -- role fit, remote, salary, path alignment"
  - "Deduplicate against state.db job_applications"
  - "Only notify for leads scoring 70+, flag 90+ for cold outreach"
```

Hints guide the orchestrator. It decides order, parallelism, whether to skip, and when to delegate.

For interactive/on-demand use, there's no YAML -- just a goal string:
```
orchestrate run "prep me for interview at Anthropic"
```

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| `orchestrate.ts` | bin (rewrite) | Thin launcher: reads YAML or goal string, constructs Opus orchestrator prompt, calls `claude -p --max` |
| `orchestrate` | skill (rewrite) | `run` (launch Opus for any goal), `checkpoint`, `status`, `list`, `cancel` |
| `fast_run` | skill (new) | Opus delegates simple sub-tasks to GLM-5 via `zeroclaw run` |

### Model routing -- no declarations needed

Opus decides at runtime:

| Situation | What Opus does |
|-----------|---------------|
| Read a file, extract data | Delegates to GLM-5 via `fast_run` |
| Web search + collection | Delegates to GLM-5 via `fast_run` |
| Query SQLite | Does it directly (tool call) |
| Score leads against rubric | Does it itself or spawns high-effort sub-agent |
| Draft creative content | Does it itself (needs SOUL.md voice) |
| Send notification | Does it directly (tool call) |
| Review sub-agent output | Does it itself |

---

## Phase 1: Foundation (unblocks everything else)

Everything downstream depends on these. Do first.

### 1.1 -- Create state.db

state.db doesn't exist. 5+ cron jobs depend on it. All tracking is broken.

- Run `bun run /etc/nixos/zeroclaw/bin/init-state-db.ts` once
- Wire it into module.nix activation so it auto-creates on every rebuild:
  ```
  home.activation.zeroclawStateDb = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    $DRY_RUN_CMD ${pkgs.bun}/bin/bun run /etc/nixos/zeroclaw/bin/init-state-db.ts
  '';
  ```
- Verify: `sqlite3 ~/.zeroclaw/workspace/state.db ".tables"` shows 8 tables

### 1.2 -- Fix config.toml permissions

API keys world-readable after activation.

- Add `chmod 600 "$HOME/.zeroclaw/config.toml"` after the sed command in `home.activation.zeroclawConfig`
- Verify: `stat -c '%a' ~/.zeroclaw/config.toml` returns `600`

### 1.3 -- Symlink missing documents

SENTINEL.md, SKILL-CREATOR.md, TASK-ROUTING.md invisible to ZeroClaw.

- Update the `for doc in ...` loop in module.nix `zeroclawDocuments` activation:
  ```
  for doc in IDENTITY SOUL AGENTS TOOLS USER LORE SENTINEL SKILL-CREATOR TASK-ROUTING; do
  ```
- Verify: `ls -la ~/.zeroclaw/documents/` shows 9 symlinks

### 1.4 -- Rebuild and test

- `sudo nixos-rebuild switch --impure --option eval-cache false --flake /etc/nixos#nixos`
- Verify state.db exists, config permissions correct, all 9 documents symlinked

---

## PSN Integration (parallel track)

PSN (post-shit-now) is near production. It integrates as a skill -- just like email and calendar. The heavy lifting is on the PSN side (bridge CLI, Kapso adapter, voice sync, reconciliation).

### PSN Phases 1-3, 5 -- parallel with ROADMAP Phase 2

No dependency on the orchestration rewrite. Can start immediately after ROADMAP Phase 1:

- **PSN Phase 1:** Bridge skill (`psn` skill wrapping psn-bridge CLI)
- **PSN Phase 2:** Kapso adapter (WhatsApp delivery for scheduled posts)
- **PSN Phase 3:** Voice sync (SOUL.md <-> PSN voice profile alignment)
- **PSN Phase 5:** Reconciliation program (psn-bridge state vs PSN API consistency)

### PSN Phase 4 -- after ROADMAP Phase 2

Depends on the new orchestrate.ts (hints format). Adds PSN-aware cron jobs:

- `psn-analytics.yaml` (type: shell) -- daily analytics collection
- `psn-weekly-review.yaml` (type: agent) -- weekly performance review via Opus orchestrator

---

## Phase 2: Orchestration Rewrite

The centerpiece. Transforms orchestrate from a cron-only sequential executor into the universal Opus escalation path.

### 2.1 -- Design orchestrator prompt

The orchestrator system prompt is the brain of the system. It determines how Opus decomposes tasks, when it delegates vs acts directly, how it reviews sub-agent work, and how it handles failures.

Design and optimize:
- **Orchestrator system prompt** -- role, decomposition strategy, effort routing rules, review/iterate protocol, failure handling, tool/skill awareness
- **fast_run delegation prompt** -- how Opus frames sub-tasks for GLM-5, what context to include, expected output format
- **Cron job hint format** -- how hints in YAML translate into orchestrator context (not instructions, but guidance)

Test against real jobs (job-scanner, morning-briefing) to verify the prompt produces good decomposition and correct delegation decisions.

### 2.2 -- Rewrite orchestrate.ts (bin)

Replace the current 437-line sequential executor with a thin launcher:

1. Accept either a YAML path or an inline goal string
2. If YAML: parse with proper YAML parser (not regex), extract goal + hints + notify
3. If inline goal: use directly, no hints
4. Load the orchestrator system prompt (from 2.1)
5. Call `claude -p` with max effort and the constructed prompt
6. Parse result, log to state.db cron_log
7. Handle notification on completion/failure (if notify field present)

What to keep:
- CLI interface: `orchestrate.ts <yaml-path-or-goal-string>`
- `--db-path` for test isolation
- cron_log dual-logging
- Notification via notify.ts

What to drop:
- `parseYaml()` regex parser -> use `yaml` package
- Sequential step execution loop
- Per-step checkpointing (Opus manages its own flow)
- Context accumulation logic
- Resume window logic

### 2.3 -- Rewrite orchestrate skill (cli.ts)

The skill keeps `run` as the primary subcommand -- this is how GLM-5 escalates to Opus:

- `orchestrate run <goal-or-yaml>` -- launch Opus orchestrator for any task
- `orchestrate checkpoint <id> <note>` -- save progress marker
- `orchestrate complete <id>` / `orchestrate fail <id> <error>` -- finalize
- `orchestrate status [id]` -- show task status
- `orchestrate list` -- list recent runs
- `orchestrate cancel <id>` -- cancel running job

The `run` subcommand calls orchestrate.ts (the bin), which launches `claude -p`. This is the universal Opus entry point for cron, chat, and CLI.

### 2.4 -- Build fast_run skill

New skill for Opus to delegate simple sub-tasks to GLM-5:

```
fast_run "Search Wellfound for founding engineer roles, return title/company/url/salary for each"
```

Implementation: calls `zeroclaw run --prompt <task>` which runs GLM-5 with full tool access (browser, email, calendar, etc.). Returns output to Opus.

Skill anatomy:
- `skills/fast-run/SKILL.md` -- describes when/how Opus should delegate
- `skills/fast-run/cli.ts` -- wraps `zeroclaw run --prompt`
- `skills/fast-run/SKILL.toml` -- metadata

### 2.5 -- Migrate all agent YAML files

Convert all 8 `type: agent` cron jobs from `steps:` to `hints:` format:

| Job | Current steps | New hints |
|-----|--------------|-----------|
| job-scanner | 4 rigid steps | Search criteria, boards, scoring rubric, threshold |
| freelance-scanner | 4 rigid steps | Platforms, criteria, scoring, threshold |
| morning-briefing | 4 rigid steps | Data sources, format constraints, dedup |
| eod-summary | 3 rigid steps | What to summarize, format, delivery |
| build-in-public-drafter | 3 rigid steps | Content sources, voice rules, platforms. Use psn_cli for voice context + post creation. Write content yourself. |
| content-scout | 3 rigid steps | Topic areas, relevance criteria. Capture relevant items into PSN idea bank via psn_cli capture. |
| engagement-scout | 3 rigid steps | Platforms, engagement criteria, voice rules. Use psn_cli engage for scored opportunities + triage + draft registration. |
| paper-scout | 3 rigid steps | Research areas, relevance criteria |

Also update frequencies:
- job-scanner: `"0 9 * * *"` -> `"0 9,15 * * *"` (2x daily)
- build-in-public-drafter: `"0 9 * * 1,3,5"` -> `"0 9 * * *"` (daily)

### 2.6 -- Fix company-refresh source mutation

company-refresh currently writes directly to LORE.md source. Change to:
- Write draft to `~/.zeroclaw/workspace/state/company-refresh-draft.md`
- Notify Enrique with diff for approval

### 2.7 -- Test all paths

Test each entry point:
1. **Cron path:** `bun run orchestrate.ts /path/to/job-scanner.yaml` -- verify Opus orchestrates
2. **Skill path:** `orchestrate run "summarize my last 5 emails"` -- verify skill launches Opus
3. **Interactive path:** send WhatsApp message requiring complex analysis -- verify GLM-5 escalates via orchestrate

---

## Phase 3: Document Alignment

Align all documents with GOALS.md as source of truth.

### 3.1 -- LORE.md overhaul

**Products section:** Replace entirely with GOALS.md product list:
- ZQ (github.com/Enriquefft/zq)
- post-shit-now (github.com/Enriquefft/post-shit-now)
- Mere (github.com/Enriquefft/Mere)
- Yap (github.com/Enriquefft/yap)
- Zeroclaw job/grant autofill (waitlist phase)
- Move Genera to "Background" subsection (CTO in name only)
- Remove "Agent Orchestration System" (absorbed into ZeroClaw)
- Remove "Kapso WhatsApp Bridge" as product (it's infrastructure)

**Research section:** Align with GOALS.md:
- Keep "Who Gets Missed?" and "ENSO AIR" as active
- Mark "LLM Gladiators" as paused
- Add ENSO AIR timeline: "3-4 week timeline, targets arXiv -> NeurIPS Climate+AI -> ERL"

**Target companies:** Remove size filter. Add SF/O-1 scoring bonus. Keep remote-global as primary.

**Lessons Learned:** Populate with actual findings. Add note that cron jobs should append here.

**"Not yet migrated" labels:** Remove. Reference files stay as on-demand (not symlinked).

**Freelance tracker reference:** Point to state.db (SQLite).

### 3.2 -- AGENTS.md updates

- Replace "post-shit-now and other builds" with actual product list from GOALS
- Remove or update CRN-01 task-queue reference
- Document the Opus orchestrator architecture and how GLM-5 escalates via `orchestrate run`

### 3.3 -- TOOLS.md updates

- Add form-filler, orchestrate, fast-run, and psn to skills table (6 skills total)
- Add SENTINEL.md, SKILL-CREATOR.md, TASK-ROUTING.md to documents list
- Fix Web Reader description
- Document the three-tier model routing (Opus max / Opus high / GLM-5 fast)

### 3.4 -- USER.md updates

- Add date to runway: "~2 month runway as of 2026-03-15"
- Remove "not yet migrated" label
- Update Genera: "CTO in name only, cofounders managing ops"

### 3.5 -- SOUL.md updates

- Remove "not yet migrated" label

---

## Phase 4: Skill & Config Cleanup

### 4.1 -- Remove skills/email/.claude/ directory

### 4.2 -- Update email SKILL.md

Add missing subcommands: `thread`, `label`, `mark`, `trash`. Update SKILL.toml description.

### 4.3 -- Move form-filler demo.ts out

```bash
mkdir -p /etc/nixos/zeroclaw/presentation/form-filler
mv /etc/nixos/zeroclaw/skills/form-filler/demo.ts /etc/nixos/zeroclaw/presentation/form-filler/
```

### 4.4 -- Move orchestrate cli.test.ts out

```bash
mkdir -p /etc/nixos/zeroclaw/tests
mv /etc/nixos/zeroclaw/skills/orchestrate/cli.test.ts /etc/nixos/zeroclaw/tests/orchestrate-cli.test.ts
```

### 4.5 -- Re-sync skills

```bash
skills-sync --remove-missing
```

### 4.6 -- Update self-audit.ts symlink map

Add SENTINEL, SKILL-CREATOR, TASK-ROUTING to the hardcoded symlink map in `bin/self-audit.ts`.

---

## Phase 5: Missing Capabilities

New skills/crons needed to fully serve GOALS.md. All use the Opus orchestrator via `orchestrate run` -- both as cron jobs and available on-demand via chat.

### 5.1 -- Interview prep automation (Goal 1)

GOALS: "Prep me for interviews. Company research, likely questions mapped to my experience."

Cron job `interview-prep.yaml` watches state.db for applications with status "interview". Opus orchestrator runs company deep-dive, generates prep doc, sends via WhatsApp.

Also available on-demand: "prep me for [company]" in chat -> GLM-5 calls `orchestrate run` -> Opus handles it.

### 5.2 -- Cold outreach drafting (Goal 1)

GOALS: "Prioritize cold outreach to hiring managers over ATS submissions."

Integrated into job-scanner hints: for leads scoring 90+, Opus auto-drafts a cold DM using SOUL.md voice and LORE.md positioning. Draft sent to Enrique via WhatsApp for approval.

### 5.3 -- Application drafting (Goal 1)

GOALS: "Draft tailored applications. Every outreach message references something specific about the company."

Extend form-filler skill or new `application-drafter` skill. Takes company + role, pulls from full-profile.md and LORE.md, drafts cover letter + specific answers.

Available both as cron integration (when Enrique approves a lead) and on-demand via chat.

### 5.4 -- Research-to-content pipeline (Goal 2)

Collapsed -- not a standalone capability. Add a hint to build-in-public-drafter: "Check paper repos for recent commits. Use PSN content generation for research-to-content." One line in an existing YAML.

### 5.5 -- Product monitoring (Goal 3)

GOALS: "Be the first power user of my tools once functional."

Cron job: check GitHub repos (ZQ, post-shit-now, Mere, Yap) for releases, issues, CI status. Alert on breaks.

Note: Content performance tracking (old 5.5) is handled entirely by PSN -- `psn-analytics.yaml` (daily shell cron) and `psn-weekly-review.yaml` (weekly agent cron). No ZeroClaw capability needed.

---

## Execution Order

```
Phase 1 (foundation)        <- do first, unblocks everything
  1.1 state.db
  1.2 config permissions
  1.3 symlinks
  1.4 rebuild + verify

PSN Phases 1-3, 5           <- parallel with Phase 2, no dependency on orchestration rewrite
  PSN 1: bridge skill (psn_cli)
  PSN 2: Kapso adapter (WhatsApp delivery)
  PSN 3: voice sync (SOUL.md <-> PSN voice profile)
  PSN 5: reconciliation program

Phase 2 (orchestration)     <- centerpiece: universal Opus escalation
  2.1 design orchestrator prompt (brain of the system)
  2.2 rewrite orchestrate.ts (thin launcher, accepts YAML or inline goal)
  2.3 rewrite orchestrate skill (run + checkpoint + status)
  2.4 build fast_run skill (Opus -> GLM-5 delegation)
  2.5 migrate 8 agent YAMLs (steps -> hints + frequency fixes + psn_cli refs)
  2.6 fix company-refresh mutation
  2.7 test all three paths (cron, skill, interactive)

PSN Phase 4                 <- after Phase 2 (needs new orchestrate.ts for hints format)
  PSN 4: cron jobs with hints (psn-analytics, psn-weekly-review)

Phase 3 (documents)         <- align with GOALS.md, includes psn in TOOLS.md
  3.1-3.5 document edits

Phase 4 (cleanup)           <- independent, parallel with Phase 3
  4.1-4.6 skill cleanup

Phase 5 (new caps)          <- after Phase 1-4 stable
  5.1 interview prep
  5.2 cold outreach
  5.3 application drafting
  5.4 research-to-content (collapsed to a hint in build-in-public-drafter)
  5.5 product monitoring
```

---

## Test Plan

### After Phase 1

```bash
# T1: state.db exists and has correct schema
sqlite3 ~/.zeroclaw/workspace/state.db ".tables" | grep -q "job_applications" && echo "PASS" || echo "FAIL"
sqlite3 ~/.zeroclaw/workspace/state.db ".tables" | grep -q "orchestration_tasks" && echo "PASS" || echo "FAIL"

# T2: config permissions
[ "$(stat -c '%a' ~/.zeroclaw/config.toml)" = "600" ] && echo "PASS" || echo "FAIL"

# T3: all 9 documents symlinked
for doc in IDENTITY SOUL AGENTS TOOLS USER LORE SENTINEL SKILL-CREATOR TASK-ROUTING; do
  [ -L "$HOME/.zeroclaw/documents/$doc.md" ] && echo "PASS: $doc" || echo "FAIL: $doc"
done

# T4: services still running after rebuild
systemctl --user is-active zeroclaw-gateway && echo "PASS" || echo "FAIL"
systemctl --user is-active zai-proxy && echo "PASS" || echo "FAIL"
systemctl --user is-active kapso-whatsapp-bridge && echo "PASS" || echo "FAIL"

# T5: state.db auto-creates on rebuild (idempotent)
# Run rebuild again, verify no errors and db still has tables
```

### After PSN Phases 1-3, 5

```bash
# T-PSN1: psn skill installed
zeroclaw skills list 2>&1 | grep -q "psn" && echo "PASS" || echo "FAIL"

# T-PSN2: psn_cli accessible
which psn-bridge && echo "PASS" || echo "FAIL"

# T-PSN3: voice profile sync
# Verify SOUL.md voice markers match PSN voice profile (manual check)

# T-PSN4: reconciliation runs clean
bun run /etc/nixos/zeroclaw/bin/psn-reconcile.ts 2>&1 | tail -1
```

### After Phase 2

```bash
# T6: orchestrate.ts uses proper YAML parser (not regex)
grep -q "parseYaml" /etc/nixos/zeroclaw/bin/orchestrate.ts && echo "FAIL: still regex" || echo "PASS"

# T7: orchestrate.ts calls claude -p
grep -q "claude.*-p" /etc/nixos/zeroclaw/bin/orchestrate.ts && echo "PASS" || echo "FAIL"

# T8: orchestrate.ts accepts inline goal (not just YAML)
bun run /etc/nixos/zeroclaw/bin/orchestrate.ts "list my calendar events for today"
echo $?  # Expected: 0

# T9: fast_run skill installed
zeroclaw skills list 2>&1 | grep -q "fast-run" && echo "PASS" || echo "FAIL"

# T10: all agent YAMLs use hints (not steps)
for yaml in /etc/nixos/zeroclaw/cron/jobs/*.yaml; do
  if grep -q "type: agent" "$yaml"; then
    grep -q "^steps:" "$yaml" && echo "FAIL: $yaml still has steps" || echo "PASS: $(basename $yaml)"
  fi
done

# T11: PSN-aware YAMLs reference psn_cli
for yaml in build-in-public-drafter content-scout engagement-scout; do
  grep -q "psn" /etc/nixos/zeroclaw/cron/jobs/$yaml.yaml && echo "PASS: $yaml" || echo "FAIL: $yaml missing psn"
done

# T12: cron path -- manual trigger of job-scanner
bun run /etc/nixos/zeroclaw/bin/orchestrate.ts /etc/nixos/zeroclaw/cron/jobs/job-scanner.yaml
echo $?  # Expected: 0

# T13: cron-sync clean after YAML migration
cron-sync --dry-run 2>&1 | tail -1

# T14: all cron jobs registered, 0 in error
zeroclaw cron list 2>&1 | grep -c "(error)"
# Expected: 0
```

### After PSN Phase 4

```bash
# T-PSN5: PSN cron jobs registered
zeroclaw cron list 2>&1 | grep -q "psn-analytics" && echo "PASS" || echo "FAIL"
zeroclaw cron list 2>&1 | grep -q "psn-weekly-review" && echo "PASS" || echo "FAIL"

# T-PSN6: manual trigger of psn-analytics
bun run /etc/nixos/zeroclaw/bin/psn-analytics.ts
echo $?  # Expected: 0
```

### After Phase 3

```bash
# T15: LORE.md products match GOALS.md
for product in "ZQ" "post-shit-now" "Mere" "Yap" "autofill"; do
  grep -q "$product" /etc/nixos/zeroclaw/documents/LORE.md && echo "PASS: $product" || echo "FAIL: $product"
done

# T16: TOOLS.md lists all 6 skills
for skill in "calendar" "email" "form-filler" "orchestrate" "fast-run" "psn"; do
  grep -q "$skill" /etc/nixos/zeroclaw/documents/TOOLS.md && echo "PASS: $skill" || echo "FAIL: $skill"
done

# T17: no "not yet migrated" labels remain
count=$(grep -c "not yet migrated" /etc/nixos/zeroclaw/documents/*.md)
[ "$count" -eq 0 ] && echo "PASS" || echo "FAIL: $count remaining"

# T18: USER.md has runway date
grep -q "2026-03-15" /etc/nixos/zeroclaw/documents/USER.md && echo "PASS" || echo "FAIL"
```

### After Phase 4

```bash
# T19: no .claude directory in skills
[ ! -d /etc/nixos/zeroclaw/skills/email/.claude ] && echo "PASS" || echo "FAIL"

# T20: no demo.ts in form-filler
[ ! -f /etc/nixos/zeroclaw/skills/form-filler/demo.ts ] && echo "PASS" || echo "FAIL"

# T21: no test files in skill dirs
find /etc/nixos/zeroclaw/skills/ -name "*.test.ts" | wc -l
# Expected: 0

# T22: skills-sync clean
skills-sync --dry-run 2>&1 | tail -1

# T23: self-audit reports zero drift
bun run /etc/nixos/zeroclaw/bin/self-audit.ts 2>&1 | jq '.drift_count // .symlinks.missing + .cron.extra + .skills.extra'
# Expected: 0
```

### After Phase 5 (per capability)

Each new skill/cron gets:
1. Dry-run via cron path: `bun run orchestrate.ts <yaml>`
2. Dry-run via interactive path: `orchestrate run "<goal>"` from chat
3. Verify Opus decomposes and delegates correctly (check sub-agent spawning)
4. Verify WhatsApp delivery (send test to +51926689401)
5. Verify state.db writes if applicable
6. Run for 2 days, check for silent failures in `zeroclaw cron list`

---

## Commit Strategy

One commit per phase, conventional commit format:

```
Phase 1: fix(zeroclaw): foundation -- state.db, config perms, document symlinks
PSN 1-3,5: feat(zeroclaw): psn integration -- bridge skill, kapso adapter, voice sync, reconciliation
Phase 2: feat(zeroclaw): universal opus orchestrator -- rewrite orchestrate, fast_run, YAML migration
PSN 4: feat(zeroclaw): psn cron jobs -- analytics, weekly review
Phase 3: docs(zeroclaw): align documents with GOALS.md
Phase 4: chore(zeroclaw): skill cleanup -- remove artifacts, update docs
Phase 5: feat(zeroclaw): [capability name] -- [what it does]
```
