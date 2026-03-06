#!/usr/bin/env bash
# repair-loop.sh — emit structured output markers for issue filing
# The calling Kiro session reads these markers and calls memory_store with its agent tool.
# memory_store is an agent tool, NOT a CLI subcommand — this script cannot call it directly.
#
# Usage: repair-loop.sh "<issue_description>"
# Output: REPAIR_LOOP_KEY and REPAIR_LOOP_ISSUE markers on stdout

set -euo pipefail

# Emit existing open issues so the agent can check for duplicates before filing a new one.
MEMORY_DB="${HOME}/.zeroclaw/workspace/memory/brain.db"
if [ -f "$MEMORY_DB" ]; then
  EXISTING=$(bun -e "
    const { Database } = require('bun:sqlite');
    const db = new Database('$MEMORY_DB', { readonly: true });
    const all = db.query(\"SELECT key, content FROM memories WHERE key LIKE 'issue:%'\").all();
    const resolved = new Set(all.filter(r => r.key.endsWith(':resolved')).map(r => r.key.replace(/:resolved\$/, '')));
    const open = all.filter(r => !r.key.endsWith(':resolved') && !resolved.has(r.key));
    console.log(JSON.stringify(open));
    db.close();
  " 2>/dev/null || echo "[]")
  echo "EXISTING_OPEN_ISSUES=${EXISTING}"
  echo "ACTION_REQUIRED_DEDUP: Before filing, check EXISTING_OPEN_ISSUES for a semantically equivalent open issue. If one exists, do not file a new one — reference the existing key instead."
  echo ""
fi

ISSUE_DESC="${1:-unknown issue}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
KEY="issue:${TIMESTAMP}"

echo "REPAIR_LOOP_KEY=${KEY}"
echo "REPAIR_LOOP_ISSUE=${ISSUE_DESC}"
echo "REPAIR_LOOP_FILED=pending"
echo ""
echo "ACTION_REQUIRED: Call memory_store(\"${KEY}\", \"${ISSUE_DESC} | filed: ${TIMESTAMP} | status: repair-attempted\") using your agent memory_store tool."
echo "When repair is complete: Call memory_store(\"${KEY}:resolved\", \"Fixed by <what>\") to close the record."
