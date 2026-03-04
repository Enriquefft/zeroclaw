# Roadmap: ZeroClaw Infrastructure

## Overview

Three phases to deliver a robust, extensible foundation for the Kiro agent. Phase 1 wires the complete gateway configuration and symlink deployment model — without it nothing is verifiable. Phase 2 builds the scaffolding, CLAUDE.md, and audited identity documents Kiro reads at runtime. Phase 3 establishes the behavioral constitution and self-repair protocol that govern how Kiro self-modifies without human oversight.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Config Foundation** - Wire the complete config.toml and module.nix deployment model so the gateway passes zero-warning validation (completed 2026-03-04)
- [ ] **Phase 2: Scaffolding and Identity** - Build directory structure, CLAUDE.md, and audited identity documents accessible at runtime via symlinks
- [ ] **Phase 3: Self-Modification and Resilience** - Establish the behavioral constitution and self-repair protocol that govern Kiro's autonomous operation

## Phase Details

### Phase 1: Config Foundation
**Goal**: The ZeroClaw gateway is fully configured, passes zero-warning health checks, and all live-editable paths are wired via mkOutOfStoreSymlink
**Depends on**: Nothing (first phase)
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04, CFG-05, DIR-04, IPC-01, IPC-02, MOD-02
**Success Criteria** (what must be TRUE):
  1. `zeroclaw doctor` reports at most 3 warnings (api_key env, no channels, no channel-components — non-eliminatable with kapso-whatsapp bridge architecture) after a clean `nixos-rebuild switch`
  2. `zeroclaw agent -m "hello"` returns a successful response from the Z.AI model (not a 404 or auth error)
  3. Kiro can execute an approved shell command (e.g., `git status`) in a live session without permission errors
  4. Changes made to files in `documents/` source directory are immediately visible at `~/.zeroclaw/documents/` without a rebuild
  5. The `reference/upstream-docs/` symlink resolves to `~/Projects/zeroclaw/docs` and ZeroClaw docs are readable
**Plans**: 1 plan

Plans:
- [ ] 01-01-PLAN.md — Add 5 TOML config sections + wire workspace symlinks and reference dir, rebuild to verify

### Phase 2: Scaffolding and Identity
**Goal**: The skills and cron directories exist with documented conventions, CLAUDE.md provides complete agent guidance, and all six identity documents are audited and ZeroClaw-compatible
**Depends on**: Phase 1
**Requirements**: DIR-01, DIR-02, DIR-03, IDN-01, IDN-02, MOD-03
**Success Criteria** (what must be TRUE):
  1. `zeroclaw skills list` resolves successfully and shows the skills directory (validates symlink security is not blocking it)
  2. Any agent opening this repo can read CLAUDE.md and immediately know which files require rebuild vs live-edit
  3. All six identity documents (IDENTITY, SOUL, AGENTS, TOOLS, USER, LORE) contain no stale OpenClaw references and load correctly when Kiro starts
  4. The skills/ and cron/ READMEs document conventions clearly enough that Kiro can create a new skill or cron job by reading them without human guidance
**Plans**: TBD

### Phase 3: Self-Modification and Resilience
**Goal**: Kiro's behavioral constitution is documented and tested — git-first self-modification is demonstrated end-to-end, and the self-repair mandate is unconditional and durable
**Depends on**: Phase 2
**Requirements**: MOD-01, MOD-04, RPR-01, RPR-02, RPR-03, IPC-03
**Success Criteria** (what must be TRUE):
  1. Kiro edits a test identity document in `/etc/nixos/zeroclaw/documents/`, commits it, and `git log` shows the commit without human intervention
  2. AGENTS.md explicitly distinguishes what Kiro can change autonomously vs what requires user approval, with no ambiguous cases
  3. When Kiro encounters any failure (config, runtime, or infrastructure), it files a durable record and attempts repair before asking the user
  4. An additional ZeroClaw agent instance can be described and configured using the IPC documentation in CLAUDE.md
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Config Foundation | 1/1 | Complete    | 2026-03-04 |
| 2. Scaffolding and Identity | 0/TBD | Not started | - |
| 3. Self-Modification and Resilience | 0/TBD | Not started | - |
