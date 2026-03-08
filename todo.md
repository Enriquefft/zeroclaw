# TODO: Phase 10 Cost Calibration

## Pending Task

**Status:** Pending - Manual calibration (not blocking Phase 10 execution)

### What needs to happen

1. Let all Phase 10 crons run for **3+ consecutive days** to accumulate real token spend
   - Build-in-public drafter: Mon/Wed/Fri 09:00
   - Engagement scout: Daily 10:00
   - Paper scout: Weekly Monday 09:00
   - Company refresh: Weekly Wednesday 10:00

2. Check your ZAI dashboard or billing for **average daily token cost in cents**

3. Calculate: `average_daily_spend_cents × 2 = new max_cost_per_day_cents`

4. Resume Phase 10 execution with the measured value:
   ```
   /gsd:execute-phase 10
   ```
   Then provide the cost cap value when prompted at the checkpoint.

### Why 2x multiplier?

Headroom for spikes without hitting the hard limit on normal days.

### Current default

`max_cost_per_day_cents = 500` (in `/etc/nixos/zeroclaw/config.toml`)

### Files to check

- `/etc/nixos/zeroclaw/config.toml` — where the value lives (requires NixOS rebuild to apply)
- `.planning/phases/10-research-distribution-and-cost-calibration/10-02-PLAN.md` — plan checkpoint details
