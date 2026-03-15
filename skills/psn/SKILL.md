---
name: psn
description: Social media content lifecycle — draft, schedule, publish, and analyze posts across X, LinkedIn, Instagram, TikTok with voice matching.
---

# PSN Skill

Post Shit Now — social media growth engine. Handles voice-matched content creation, scheduling, publishing, engagement, and analytics across all platforms.

## Intelligence Split

PSN CLI provides voice context, scored opportunities, and raw analytics data. **YOU** (Claude Code / Opus) write the actual content, evaluate engagement quality, and reason about strategy. Do NOT ask PSN to generate final content — use `build-context` to load voice data, then write in Enrique's voice yourself using SOUL.md rules.

## Hard Rules

- **NEVER** call `post now` or `post schedule` without explicit APPROVE from Enrique
- **NEVER** call `engage execute` without approval per reply
- Draft autonomously, publish only with approval
- On auth errors, notify Enrique urgently and stop — do not retry
- On rate limits, record and defer to next session

## CLI Reference

All output is JSON. Pass `--help` to any command for details.

### post

```
psn_cli post create --platform x --content "..." [--schedule-at "2026-03-20T09:00:00"]
psn_cli post schedule --post-id <id> --at "2026-03-20T09:00:00-05:00"
psn_cli post now --post-id <id>
psn_cli post cancel --post-id <id>
psn_cli post status --post-id <id>
psn_cli post failures [--since 24h]
psn_cli post list [--status draft|scheduled|published|failed] [--limit 10]
```

### plan

```
psn_cli plan generate [--week "2026-W12"]
psn_cli plan show [--week "2026-W12"]
psn_cli plan finalize --week "2026-W12"
```

### capture

```
psn_cli capture "Build a CLI for X #pillar:build-in-public #platform:x"
psn_cli capture list [--status spark|seed|ready]
psn_cli capture stats
psn_cli capture search "topic query"
```

### engage

```
psn_cli engage session
psn_cli engage triage --opportunity-id <id> --decision approve|skip|defer
psn_cli engage draft --opportunity-id <id> --content "..."
psn_cli engage execute --opportunity-id <id>
psn_cli engage stats [--days 7]
```

### voice

```
psn_cli voice show
psn_cli voice tweak "add-banned:synergy"
psn_cli voice calibrate
psn_cli voice apply --tweaks '<JSON array of tweaks>'
```

### series

```
psn_cli series create --name "Weekly Build Log" --platform x --cadence weekly
psn_cli series list [--status active|paused|retired]
psn_cli series pause --id <id>
psn_cli series resume --id <id>
psn_cli series retire --id <id>
psn_cli series due
```

### content

```
psn_cli content build-context --platform x [--persona personal]
psn_cli content generate --platform x --topic "..." [--format short-post]
psn_cli content suggest-topics --platform x
```

Timeout: 120s (content generation can be slow).

### analytics

```
psn_cli analytics collect
psn_cli analytics summary [--days 7]
```

Timeout: 120s.

### review

```
psn_cli review weekly
psn_cli review monthly
```

Timeout: 120s.

### drafts

```
psn_cli drafts list [--status draft|review|approved]
psn_cli drafts show --id <id>
psn_cli drafts approve --id <id>
psn_cli drafts delete --id <id>
```

## Error Handling

The bridge classifies PSN errors into categories returned in the JSON output:

| errorClass | Meaning | Action |
|-----------|---------|--------|
| `TRANSIENT_NETWORK` | Connection/timeout | Auto-retried 3x by bridge |
| `RATE_LIMITED` | Platform rate limit | Defer, try later |
| `AUTH_EXPIRED` | Token expired | Notify Enrique urgently, stop |
| `VALIDATION` | Missing/invalid args | Fix input |
| `CONTENT_POLICY` | Duplicate/policy violation | Permanent, skip |
| `UNKNOWN` | Unclassified | Report to Enrique |

On timeout (30s default, 120s for content/analytics/review), the bridge returns `exitCode: 124`.
