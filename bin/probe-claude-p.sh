#!/usr/bin/env bash
# Probe test: validates claude -p works outside Claude Code sessions.
# Run this manually (NOT from inside Claude Code) to confirm cron compatibility.
# Expected output: a simple answer (e.g., "4") followed by "PROBE: OK"

set -euo pipefail

CLAUDE_BIN="$HOME/.local/bin/claude"

if [[ ! -x "$CLAUDE_BIN" ]]; then
  echo "PROBE: FAIL — claude binary not found at $CLAUDE_BIN" >&2
  exit 1
fi

result=$(env -u CLAUDECODE HOME="$HOME" "$CLAUDE_BIN" -p \
  --dangerously-skip-permissions \
  --output-format text \
  "What is 2+2? Reply with just the number." 2>&1)

echo "claude -p output: $result"

if [[ "$result" == *"cannot be launched inside another"* ]]; then
  echo "PROBE: FAIL — CLAUDECODE guard triggered (are you running inside Claude Code?)" >&2
  exit 1
fi

echo "PROBE: OK"
