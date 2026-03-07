# Sentinel Protocol (On-Demand)

This protocol is for **on-demand** use when Kiro or a user wants a full scan+repair cycle with agent reasoning. The scheduled cron job runs `bin/sentinel-scan.ts` (deterministic scan+alert, no agent) every 2 hours.

Use this protocol when:
- You want to actively attempt repairs on unresolved issues (not just detect them)
- The cron sentinel alert identified issues that need agent reasoning to fix
- You're doing a manual system health check

## Steps

### Step 1: Scan for Unresolved Issues

Call `memory_recall("issue:")` to retrieve all keys prefixed with "issue:".

From the results, identify **unresolved** issues: entries that have a key matching `issue:<timestamp>` but do NOT have a corresponding `issue:<timestamp>:resolved` entry in the same recall results.

If no issue keys are found at all: exit silently. No message needed.

### Step 2: For Each Unresolved Issue

For each unresolved `issue:<timestamp>` key:

1. File a repair attempt via `memory_store("issue:<timestamp>:repair:<current_timestamp>", "Attempting repair: <issue description>")`.
2. Attempt to resolve the issue based on the description. Use available tools (shell commands, file edits, service restarts).

### Step 3: On Successful Repair

After the issue is resolved:

Call `memory_store("issue:<timestamp>:resolved", "Auto-resolved by sentinel at <current_timestamp>. Method: <what was done>")`.

No message to Enrique needed for successful repairs.

### Step 4: On Repair Failure

If the repair attempt fails or the issue cannot be fixed:

Send an immediate WhatsApp message to Enrique using:
```
kapso-whatsapp-cli send --to +51926689401 --text "Sentinel alert: repair attempted for [issue key]. Issue: [issue description]. Attempted: [what was tried]. Result: failed. Your input needed."
```

Do NOT defer this to the EOD summary. Send immediately.

### Step 5: If Nothing to Do

If Step 1 found no unresolved issues: exit. Do not send a "nothing found" message. Silent exit is correct behavior.

## Issue Lifecycle Rules

These rules govern how issues are opened and closed. Violating them causes orphaned issues that Sentinel reports indefinitely.

**Opening an issue:**
- Use `memory_store("issue:<timestamp-or-slug>", "<description>")` to file an issue.
- The key MUST be unique and identify the problem (e.g., `issue:20260305-btc-missing-shell`).
- Never file a "FIXED" or "resolved" message as a new `issue:` key. That is a misuse of the pattern — it creates an orphaned issue that can never be auto-resolved.
- **Dedup rule:** Before filing a new issue, call `memory_recall("issue:")` and check if an open issue already covers the same problem. If yes: do not file a new one — reference the existing key in your repair attempt.
- **Namespace contract:** Only file under `issue:` for actionable, agent-fixable problems. Status updates ("waiting for X"), summaries of other issues, and informational notes must not be filed under `issue:`. They are noise that sentinel will alert on indefinitely.

**Resolving an issue:**
- Always resolve by storing: `memory_store("issue:<original-key>:resolved", "Resolved at <timestamp>. Method: <what was done>")`.
- The `:resolved` suffix on the *exact same base key* is what marks it closed.

**Manual fix rule (critical):**
When you manually fix something that had sentinel issues filed — removing a cron job, deleting a script, disabling a service — you MUST:
1. Call `memory_recall("issue:")` to find all open issues.
2. Identify any issues related to what you just fixed.
3. Store `:resolved` keys for each of them before considering the task complete.

Skipping this step is the root cause of stale sentinel alerts. The cron job removal is not done until its issues are closed.

## Test Verification Teardown

If you seed an `issue:` entry (e.g., `| type: test |`) to verify sentinel is working, you MUST resolve it in the same session immediately after confirming the alert arrived:

```
memory_store("issue:<key>:resolved", "Test seed — verified sentinel alert at <timestamp>. Closing.")
```

Never leave test seeds open. The cron scanner cannot distinguish test entries from real ones. The `type: test` field suppresses alerts in the scanner, but the resolved entry is still required to keep the memory namespace clean.

## Constraints

- Never skip Step 1 — always scan memory first before assuming there is nothing to do.
- Never trigger repair for an issue that already has a `:resolved` record — check both sides of the pair.
- Never defer escalation to the EOD summary when a repair fails — immediate WhatsApp only.
- Enrique's WhatsApp number is +51 926 689 401. Cross-check with USER.md if needed.
