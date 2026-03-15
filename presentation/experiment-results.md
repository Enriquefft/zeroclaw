# Email Skill Experiment Results

Three rounds of experiments comparing 3 approaches across 3 models (9 total runs).

## Setup

- **Agent A**: No skill — must discover `gog` and `himalaya` CLIs via `--help` on its own
- **Agent B**: `email_cli` on PATH with `--help` only — no SKILL.md, no documentation
- **Agent C**: Full SKILL.md injected into prompt — `email_cli` on PATH, all commands documented

All agents received identical tasks:
1. Send email from `enriquefft2001@gmail.com` to `enriquefft@404tf.com`
2. Search for emails from `enriquefft@404tf.com` across all accounts
3. Read the most recent thread from search results
4. Send email with `/tmp/test.txt` attachment
5. Search, summarize 3 most recent, draft reply to latest

CLI improvements applied before rounds 2-3: compact JSON output by default, `--full` flag, `--help` support, `email_cli` on PATH.

---

# Round 1: Opus

## Summary

| Metric | A: No skill | B: CLI + `--help` | C: SKILL.md |
|--------|------------|------------------|-------------|
| Total calls | 19 | 8 | 8 |
| Discovery | 10 | 1 | 1 |
| Execution | 9 | 7 | 7 |
| Errors | 0 | 0 | 0 |
| Tokens | 21,089 | 20,792 | 40,089 |
| Duration | 85s | 65s | 62s |
| Pass rate | 5/5 | 5/5 | 5/5 |

## Opus Agent A — Step by Step (No Skill)

### Discovery Phase (10 calls)

| # | Command | Notes |
|---|---------|-------|
| 1 | `gog --help` | Discovered gog is a Google API CLI with `gmail` subcommand |
| 2 | `himalaya --help` | Discovered himalaya is an IMAP/SMTP client |
| 3 | `gog send --help` | Found top-level `send` shortcut for gmail |
| 4 | `gog gmail --help` | Found subcommands: send, search, get, thread |
| 5 | `himalaya account list` | Discovered spacemail account is configured |
| 6 | `gog gmail search --help` | Learned Gmail search query syntax |
| 7 | `gog gmail thread --help` | Found thread subcommands |
| 8 | `gog gmail thread get --help` | Learned thread retrieval syntax |
| 9 | `himalaya envelope list --help` | Learned envelope listing with query syntax |
| 10 | `himalaya message --help` | Found `message read` for reading emails |

### Execution Phase (9 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 11 | `gog send -a enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test E1" --body "Hello from experiment E"` | 1 | success |
| 12 | `gog gmail search "from:enriquefft@404tf.com" -a enriquefft2001@gmail.com --max 10` | 2 | success |
| 13 | `himalaya envelope list -a spacemail from enriquefft@404tf.com` | 2 | success |
| 14 | `gog gmail thread get 19cc4dfa09d31d6b -a enriquefft2001@gmail.com` | 3 | success |
| 15 | `gog send -a enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test E attachment" --body "See attached file" --attach /tmp/test.txt` | 4 | success |
| 16 | `gog gmail search "from:enriquefft@404tf.com" -a enriquefft2001@gmail.com --max 3 -j --results-only` | 5 | success |
| 17 | `gog gmail get 19cbc6d3f32e6cd9 -a enriquefft2001@gmail.com` | 5 | success |
| 18 | `gog gmail get 19ca9f17fa5341a3 -a enriquefft2001@gmail.com` | 5 | success |
| 19 | `gog send --dry-run (draft reply)` | 5 | success |

**Pattern**: 10 discovery calls front-loaded, then 9 flawless execution calls. Searched Gmail and SpaceMail separately (2 calls for Task 2). Re-searched for Task 5.

---

## Opus Agent B — Step by Step (CLI + `--help`)

### Discovery Phase (1 call)

| # | Command | Notes |
|---|---------|-------|
| 1 | `email_cli_nosk --help` | Got full command reference, accounts list, and flag docs in one call |

### Execution Phase (7 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 2 | `email_cli_nosk send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test F1" --body "Hello from experiment F"` | 1 | success |
| 3 | `email_cli_nosk search "from:enriquefft@404tf.com"` | 2 | success (all accounts, 1 call) |
| 4 | `email_cli_nosk thread 19cc4dfa09d31d6b --account enriquefft2001@gmail.com` | 3 | success |
| 5 | `email_cli_nosk send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test F attachment" --body "See attached file" --attachment /tmp/test.txt` | 4 | success |
| 6 | `email_cli_nosk get 19cc4dfa09d31d6b --account enriquefft2001@gmail.com` | 5 | success |
| 7 | `email_cli_nosk get 19cbc6d3f32e6cd9 --account enriquefft2001@gmail.com` | 5 | success |
| 8 | `email_cli_nosk get 19ca9f17fa5341a3 --account enriquefft2001@gmail.com` | 5 | success |

**Pattern**: Single `--help` gave it everything. Cross-account search in 1 call. Reused Task 2 results for Task 5.

---

## Opus Agent C — Step by Step (SKILL.md)

### Discovery Phase (1 call)

| # | Command | Notes |
|---|---------|-------|
| 1 | `ToolSearch select:Bash` | Infrastructure only — fetched Bash tool schema |

### Execution Phase (7 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 2 | `email_cli send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test G1" --body "Hello from experiment G"` | 1 | success |
| 3 | `email_cli search "from:enriquefft@404tf.com" --full` | 2+5 | success (shared across tasks) |
| 4 | `email_cli thread 19cc4dfa09d31d6b --account enriquefft2001@gmail.com` | 3 | success |
| 5 | `email_cli send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test G attachment" --body "See attached file" --attachment /tmp/test.txt` | 4 | success |
| 6 | `email_cli get 19cc4dfa09d31d6b --account enriquefft2001@gmail.com --full` | 5 | success |
| 7 | `email_cli get 19cbc6d3f32e6cd9 --account enriquefft2001@gmail.com --full` | 5 | success |
| 8 | `email_cli get 19ca9f17fa5341a3 --account enriquefft2001@gmail.com --full` | 5 | success |

**Pattern**: Zero discovery. Went straight to execution on call 2. Used `--full` flag and shared search results across Tasks 2 and 5.

---

## Opus Side-by-Side Flow

```
Step  | Agent A (no skill)                    | Agent B (CLI + help)               | Agent C (SKILL.md)
------|---------------------------------------|------------------------------------|---------------------------------
  1   | gog --help                   [DISC]   | email_cli_nosk --help     [DISC]   | ToolSearch (infra)       [DISC]
  2   | himalaya --help              [DISC]   | send (Task 1)             [EXEC] ✓ | send (Task 1)            [EXEC] ✓
  3   | gog send --help              [DISC]   | search (Task 2)           [EXEC] ✓ | search --full (Task 2+5) [EXEC] ✓
  4   | gog gmail --help             [DISC]   | thread (Task 3)           [EXEC] ✓ | thread (Task 3)          [EXEC] ✓
  5   | himalaya account list        [DISC]   | send+attach (Task 4)      [EXEC] ✓ | send+attach (Task 4)     [EXEC] ✓
  6   | gog gmail search --help      [DISC]   | get (Task 5)              [EXEC] ✓ | get --full (Task 5)      [EXEC] ✓
  7   | gog gmail thread --help      [DISC]   | get (Task 5)              [EXEC] ✓ | get --full (Task 5)      [EXEC] ✓
  8   | gog gmail thread get --help  [DISC]   | get (Task 5)              [EXEC] ✓ | get --full (Task 5)      [EXEC] ✓
  9   | himalaya envelope list help  [DISC]   |                                    |
 10   | himalaya message --help      [DISC]   |                                    |
 11   | gog send (Task 1)            [EXEC] ✓ |                                    |
 12   | gog gmail search (Task 2)    [EXEC] ✓ |                                    |
 13   | himalaya envelope (Task 2)   [EXEC] ✓ |                                    |
 14   | gog gmail thread (Task 3)    [EXEC] ✓ |                                    |
 15   | gog send+attach (Task 4)     [EXEC] ✓ |                                    |
 16   | gog gmail search (Task 5)    [EXEC] ✓ |                                    |
 17   | gog gmail get (Task 5)       [EXEC] ✓ |                                    |
 18   | gog gmail get (Task 5)       [EXEC] ✓ |                                    |
 19   | gog send dry-run (Task 5)    [EXEC] ✓ |                                    |
```

Agents B and C finished all 5 tasks while Agent A was still in its discovery phase.

---

# Round 2: Haiku

## Summary

| Metric | A: No skill | B: CLI + `--help` | C: SKILL.md |
|--------|------------|------------------|-------------|
| Total calls | 22 | 9 | 8 |
| Discovery | 12 | 1 | 0 |
| Execution | 10 | 8 | 8 |
| Errors | 1 | 0 | 0 |
| Tokens | 33,297 | 42,891 | 49,887 |
| Duration | 60s | 45s | 38s |
| Pass rate | 5/5 | 5/5 | 5/5 |

## Haiku Agent A — Step by Step (No Skill)

### Discovery Phase (12 calls)

| # | Command | Notes |
|---|---------|-------|
| 1 | `gog --help` | Discovered gog CLI |
| 2 | `himalaya --help` | Discovered himalaya CLI |
| 3 | `gog gmail --help` | Found gmail subcommands |
| 4 | `himalaya message --help` | Found message subcommands |
| 5 | `gog gmail send --help` | Learned send syntax |
| 6 | `himalaya message write --help` | Explored himalaya send |
| 7 | `himalaya account list` | Found spacemail account |
| 8 | `gog auth status` | Checked auth status |
| 9 | `gog gmail search --help` | Learned search syntax |
| 10 | `himalaya envelope --help` | Found envelope subcommands |
| 11 | `himalaya envelope list --help` | Learned query syntax |
| 12 | `himalaya message send --help` | Explored send via himalaya |

### Execution Phase (10 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 13 | `gog gmail send (Task 1)` | 1 | success |
| 14 | `gog gmail search "from:enriquefft@404tf.com"` | 2 | success |
| 15 | `himalaya envelope list from enriquefft@404tf.com` | 2 | **FAIL** (syntax error) |
| 16 | `himalaya envelope list (retry with fixed syntax)` | 2 | success |
| 17 | `gog gmail thread get (Task 3)` | 3 | success |
| 18 | `gog gmail send --attach /tmp/test.txt (Task 4)` | 4 | success |
| 19 | `gog gmail search (Task 5)` | 5 | success |
| 20 | `gog gmail get (email 1)` | 5 | success |
| 21 | `gog gmail get (email 2)` | 5 | success |
| 22 | `gog gmail get (email 3)` | 5 | success |

**Pattern**: 12 discovery calls (more than Opus). 1 error on himalaya syntax, self-corrected with retry. More exploratory — checked auth status, explored multiple send approaches.

---

## Haiku Agent B — Step by Step (CLI + `--help`)

### Discovery Phase (1 call)

| # | Command | Notes |
|---|---------|-------|
| 1 | `email_cli_nosk --help` | Full command reference in one call |

### Execution Phase (8 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 2 | `email_cli_nosk send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test I1" --body "Hello from haiku experiment"` | 1 | success |
| 3 | `email_cli_nosk search "from:enriquefft@404tf.com"` | 2 | success |
| 4 | `email_cli_nosk thread 19cc4dfa09d31d6b --account enriquefft2001@gmail.com` | 3 | success |
| 5 | `email_cli_nosk send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test I attachment" --body "See attached file" --attachment /tmp/test.txt` | 4 | success |
| 6 | `email_cli_nosk search "from:enriquefft@404tf.com" --full` | 5 | success |
| 7 | `email_cli_nosk get 19cc4dfa09d31d6b --account enriquefft2001@gmail.com --full` | 5 | success |
| 8 | `email_cli_nosk get 19cbc6d3f32e6cd9 --account enriquefft2001@gmail.com --full` | 5 | success |
| 9 | `email_cli_nosk get 19ca9f17fa5341a3 --account enriquefft2001@gmail.com` | 5 | success |

**Pattern**: 1 help call, then 8 execution calls. Used `--full` for some reads. Did a second search for Task 5 instead of reusing Task 2 results.

---

## Haiku Agent C — Step by Step (SKILL.md)

### Discovery Phase (0 calls)

No discovery needed — all documentation was in the prompt.

### Execution Phase (8 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 1 | `email_cli send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test J1" --body "Hello from haiku experiment"` | 1 | success |
| 2 | `email_cli search "from:enriquefft@404tf.com"` | 2 | success |
| 3 | `email_cli thread 19cc4dfa09d31d6b --account enriquefft2001@gmail.com` | 3 | success |
| 4 | `email_cli send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test J attachment" --body "See attached file" --attachment /tmp/test.txt` | 4 | success |
| 5 | `email_cli search "from:enriquefft@404tf.com" --full` | 5 | success |
| 6 | `email_cli get 19cc4dfa09d31d6b --account enriquefft2001@gmail.com --full` | 5 | success |
| 7 | `email_cli get 19cbc6d3f32e6cd9 --account enriquefft2001@gmail.com --full` | 5 | success |
| 8 | `email_cli get 19ca9f17fa5341a3 --account enriquefft2001@gmail.com --full` | 5 | success |

**Pattern**: Pure execution from the start. 0 discovery calls. Used `search --full` for Task 5. Still needed individual `get` calls because `search --full` doesn't return full bodies from Gmail API.

---

## Haiku Side-by-Side Flow

```
Step  | Agent A (no skill)                    | Agent B (CLI + help)               | Agent C (SKILL.md)
------|---------------------------------------|------------------------------------|---------------------------------
  1   | gog --help                   [DISC]   | email_cli_nosk --help     [DISC]   | send (Task 1)            [EXEC] ✓
  2   | himalaya --help              [DISC]   | send (Task 1)             [EXEC] ✓ | search (Task 2)          [EXEC] ✓
  3   | gog gmail --help             [DISC]   | search (Task 2)           [EXEC] ✓ | thread (Task 3)          [EXEC] ✓
  4   | himalaya message --help      [DISC]   | thread (Task 3)           [EXEC] ✓ | send+attach (Task 4)     [EXEC] ✓
  5   | gog gmail send --help        [DISC]   | send+attach (Task 4)      [EXEC] ✓ | search --full (Task 5)   [EXEC] ✓
  6   | himalaya message write help  [DISC]   | search --full (Task 5)    [EXEC] ✓ | get --full (Task 5)      [EXEC] ✓
  7   | himalaya account list        [DISC]   | get --full (Task 5)       [EXEC] ✓ | get --full (Task 5)      [EXEC] ✓
  8   | gog auth status              [DISC]   | get --full (Task 5)       [EXEC] ✓ | get --full (Task 5)      [EXEC] ✓
  9   | gog gmail search --help      [DISC]   | get (Task 5)              [EXEC] ✓ |
 10   | himalaya envelope --help     [DISC]   |                                    |
 11   | himalaya envelope list help  [DISC]   |                                    |
 12   | himalaya message send help   [DISC]   |                                    |
 13   | gog gmail send (Task 1)      [EXEC] ✓ |                                    |
 14   | gog gmail search (Task 2)    [EXEC] ✓ |                                    |
 15   | himalaya envelope (Task 2)   [EXEC] ✗ |                                    |
 16   | himalaya envelope (retry)    [EXEC] ✓ |                                    |
 17   | gog gmail thread (Task 3)    [EXEC] ✓ |                                    |
 18   | gog gmail send+att (Task 4)  [EXEC] ✓ |                                    |
 19   | gog gmail search (Task 5)    [EXEC] ✓ |                                    |
 20   | gog gmail get (Task 5)       [EXEC] ✓ |                                    |
 21   | gog gmail get (Task 5)       [EXEC] ✓ |                                    |
 22   | gog gmail get (Task 5)       [EXEC] ✓ |                                    |
```

Agent C finished all 5 tasks at step 8. Agent A was still exploring `--help` at that point.

---

# Round 3: Sonnet

## Summary

| Metric | A: No skill | B: CLI + `--help` | C: SKILL.md |
|--------|------------|------------------|-------------|
| Total calls | 16 | 9 | 7 |
| Discovery | 9 | 1 | 0 |
| Execution | 7 | 8 | 7 |
| Errors | 0 | 0 | 0 |
| Tokens | 18,665 | 26,775 | 31,318 |
| Duration | 94s | 73s | 67s |
| Pass rate | 5/5 | 5/5 | 5/5 |

## Sonnet Agent A — Step by Step (No Skill)

### Discovery Phase (9 calls)

| # | Command | Notes |
|---|---------|-------|
| 1 | `himalaya --help` | Discovered himalaya CLI |
| 2 | `gog --help` | Discovered gog CLI |
| 3 | `himalaya message --help` | Found message subcommands |
| 4 | `gog send --help` | Found send syntax and `--attach` flag |
| 5 | `himalaya account list` | Found spacemail account |
| 6 | `himalaya envelope --help` | Found envelope subcommands |
| 7 | `himalaya envelope list --help` | Learned query syntax |
| 8 | `gog gmail --help` | Found gmail subcommands |
| 9 | `gog gmail search --help` | Learned search syntax |

### Execution Phase (7 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 10 | `gog send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test K1" --body "Hello from sonnet experiment"` | 1 | success |
| 11 | `gog gmail search "from:enriquefft@404tf.com" --account enriquefft2001@gmail.com` | 2 | success |
| 12 | `himalaya envelope list from enriquefft@404tf.com` | 2 | success |
| 13 | `gog gmail thread get 19cc4dfa09d31d6b --account enriquefft2001@gmail.com` | 3 | success |
| 14 | `gog send --attach /tmp/test.txt --subject "Test K attachment" --body "See attached file"` | 4 | success |
| 15 | `gog gmail search "from:enriquefft@404tf.com" -j` | 5 | success |
| 16 | `gog gmail thread get (2 threads for summaries)` | 5 | success |

**Pattern**: Most efficient no-skill agent — only 9 discovery calls (vs Opus 10, Haiku 12). Interleaved discovery with execution. 0 errors. Lowest token usage of any agent across all experiments (18,665).

---

## Sonnet Agent B — Step by Step (CLI + `--help`)

### Discovery Phase (1 call)

| # | Command | Notes |
|---|---------|-------|
| 1 | `email_cli_nosk --help` | Full command reference in one call |

### Execution Phase (8 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 2 | `email_cli_nosk send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test L1" --body "Hello from sonnet experiment"` | 1 | success |
| 3 | `email_cli_nosk search "from:enriquefft@404tf.com"` | 2 | success |
| 4 | `email_cli_nosk get 19cc4dfa09d31d6b --account enriquefft2001@gmail.com --full` | 3 | success (got threadId) |
| 5 | `email_cli_nosk thread 19cc4dfa09d31d6b --account enriquefft2001@gmail.com` | 3 | success |
| 6 | `email_cli_nosk send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test L attachment" --body "See attached file" --attachment /tmp/test.txt` | 4 | success |
| 7 | `email_cli_nosk search "from:enriquefft@404tf.com"` | 5 | success |
| 8 | `email_cli_nosk get 19cbc6d3f32e6cd9 --account enriquefft2001@gmail.com` | 5 | success |
| 9 | `email_cli_nosk get 19ca9f17fa5341a3 --account enriquefft2001@gmail.com` | 5 | success |

**Pattern**: Did a `get` before `thread` on Task 3 (extra call). Re-searched for Task 5 instead of reusing. 8 execution calls — 1 more than optimal.

---

## Sonnet Agent C — Step by Step (SKILL.md)

### Discovery Phase (0 calls)

No discovery needed.

### Execution Phase (7 calls)

| # | Command | Task | Result |
|---|---------|------|--------|
| 1 | `email_cli send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test M1" --body "Hello from sonnet experiment"` | 1 | success |
| 2 | `email_cli search "from:enriquefft@404tf.com"` | 2 | success |
| 3 | `email_cli get 19cc4dfa09d31d6b --account enriquefft2001@gmail.com --full` | 3 | success |
| 4 | `email_cli thread 19cc4dfa09d31d6b --account enriquefft2001@gmail.com` | 3 | success |
| 5 | `email_cli send --account enriquefft2001@gmail.com --to enriquefft@404tf.com --subject "Test M attachment" --body "See attached file" --attachment /tmp/test.txt` | 4 | success |
| 6 | `email_cli search "from:enriquefft@404tf.com" --full` | 5 | success |
| 7 | `email_cli get 19cbc6d3f32e6cd9 --account enriquefft2001@gmail.com --full` | 5 | success |

**Pattern**: Fewest calls of any agent in any experiment (7). Reused knowledge from Task 3's get for Task 5 summary of email 1. Only fetched 2 additional emails. Noted that `search --full` didn't return bodies inline (bug identified).

---

## Sonnet Side-by-Side Flow

```
Step  | Agent A (no skill)                    | Agent B (CLI + help)               | Agent C (SKILL.md)
------|---------------------------------------|------------------------------------|---------------------------------
  1   | himalaya --help              [DISC]   | email_cli_nosk --help     [DISC]   | send (Task 1)            [EXEC] ✓
  2   | gog --help                   [DISC]   | send (Task 1)             [EXEC] ✓ | search (Task 2)          [EXEC] ✓
  3   | himalaya message --help      [DISC]   | search (Task 2)           [EXEC] ✓ | get --full (Task 3)      [EXEC] ✓
  4   | gog send --help              [DISC]   | get --full (Task 3)       [EXEC] ✓ | thread (Task 3)          [EXEC] ✓
  5   | himalaya account list        [DISC]   | thread (Task 3)           [EXEC] ✓ | send+attach (Task 4)     [EXEC] ✓
  6   | himalaya envelope --help     [DISC]   | send+attach (Task 4)      [EXEC] ✓ | search --full (Task 5)   [EXEC] ✓
  7   | himalaya envelope list help  [DISC]   | search (Task 5)           [EXEC] ✓ | get --full (Task 5)      [EXEC] ✓
  8   | gog gmail --help             [DISC]   | get (Task 5)              [EXEC] ✓ |
  9   | gog gmail search --help      [DISC]   | get (Task 5)              [EXEC] ✓ |
 10   | gog send (Task 1)            [EXEC] ✓ |                                    |
 11   | gog gmail search (Task 2)    [EXEC] ✓ |                                    |
 12   | himalaya envelope (Task 2)   [EXEC] ✓ |                                    |
 13   | gog gmail thread (Task 3)    [EXEC] ✓ |                                    |
 14   | gog send+attach (Task 4)     [EXEC] ✓ |                                    |
 15   | gog gmail search (Task 5)    [EXEC] ✓ |                                    |
 16   | gog gmail thread (Task 5)    [EXEC] ✓ |                                    |
```

Sonnet C completed everything in 7 steps — the most efficient run across all 9 experiments.

---

# Cross-Model Analysis

## Master Comparison Table

| Model | Agent | Calls | Discovery | Execution | Errors | Tokens | Duration |
|-------|-------|-------|-----------|-----------|--------|--------|----------|
| **Opus** | A (no skill) | 19 | 10 | 9 | 0 | 21,089 | 85s |
| **Opus** | B (help) | 8 | 1 | 7 | 0 | 20,792 | 65s |
| **Opus** | C (SKILL.md) | 8 | 1 | 7 | 0 | 40,089 | 62s |
| **Haiku** | A (no skill) | 22 | 12 | 10 | 1 | 33,297 | 60s |
| **Haiku** | B (help) | 9 | 1 | 8 | 0 | 42,891 | 45s |
| **Haiku** | C (SKILL.md) | 8 | 0 | 8 | 0 | 49,887 | 38s |
| **Sonnet** | A (no skill) | 16 | 9 | 7 | 0 | 18,665 | 94s |
| **Sonnet** | B (help) | 9 | 1 | 8 | 0 | 26,775 | 73s |
| **Sonnet** | C (SKILL.md) | 7 | 0 | 7 | 0 | 31,318 | 67s |

## Highlights

### Best in each category
- **Fewest calls**: Sonnet C — 7 calls
- **Fewest tokens**: Sonnet A — 18,665 tokens
- **Fastest**: Haiku C — 38s
- **Most reliable**: All agents except Haiku A — 0 errors

### The `--help` flag is the best ROI
Across all models, adding `--help` to the CLI:
- Reduced discovery from 9-12 calls to exactly **1 call** (every model, every time)
- Reduced total calls by 44-59%
- Added zero errors
- Cost less tokens than SKILL.md in every model

### SKILL.md's diminishing returns
SKILL.md saves 1 call over `--help` (the help call itself) but costs significantly more tokens:
- Opus: +19,297 tokens (+93%) for 0 fewer calls
- Haiku: +6,996 tokens (+16%) for 1 fewer call
- Sonnet: +4,543 tokens (+17%) for 0 fewer calls

### Model personality differences
- **Opus**: Most consistent execution count (7 across B and C), moderate discovery (10)
- **Sonnet**: Most token-efficient overall, fewest discovery calls (9), achieved the absolute minimum (7 calls for C)
- **Haiku**: Fastest wall-clock but most exploratory (12 discovery calls), most token-hungry, only model to make an error

### The skill gap matters MORE for weaker models
Discovery overhead without the skill:
- Opus: 10 discovery calls
- Sonnet: 9 discovery calls
- Haiku: 12 discovery calls + 1 error

Haiku benefits the most from skills/help because it needs more exploration and is more error-prone without guidance.

## Bug Found

Sonnet C identified that `search --full` does not return message bodies inline for Gmail results. The `gog gmail search` API returns metadata only — full bodies require individual `get` calls. This should be fixed by having `search --full` automatically fetch bodies for each result.

---

## Conclusions

1. **Add `--help` to every CLI tool** — it's the single highest-impact improvement. 1 call gives the agent everything SKILL.md does, without the token overhead.

2. **SKILL.md is worth it only when `--help` isn't available** — the token cost of injecting docs into every prompt is significant (16-93% more tokens depending on model).

3. **Compact output matters** — the CLI improvements (compact JSON, essential fields only) kept token usage reasonable across all experiments.

4. **Haiku benefits most from skills** — it's the fastest model but also the most error-prone and exploratory without guidance. Skills/help are essential for Haiku.

5. **Sonnet is the efficiency king** — lowest tokens in every category, fewest calls when given SKILL.md, and most efficient discovery when given nothing.
