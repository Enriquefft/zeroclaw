# Phase 5: Publication and Release Readiness — Context

**Gathered:** 2026-03-05
**Status:** Ready for planning
**Source:** User description (direct requirements)

<domain>
## Phase Boundary

Prepare the zeroclaw repo (`github.com/Enriquefft/zeroclaw`) for public release as a standalone ZeroClaw configuration reference. This repo will be shared on social media — it must look polished, professional, and ready for anyone to analyze or try out. Target audience: ZeroClaw users and NixOS enthusiasts who want a reference implementation of a ZeroClaw config.

</domain>

<decisions>
## Implementation Decisions

### Required Files
- README.md — must explain what this is, who it's for, and how to try it (install/use steps)
- LICENSE — user hasn't specified; Claude's discretion (MIT is standard for NixOS configs)
- GitHub Release v1.0 — polished release notes describing what shipped

### Presentation Quality
- Must be social-media-ready — first impression counts
- Repo description, topics/tags on GitHub must be set
- README should be visually clean (badges optional but nice)

### Sanitization
- Personal paths (e.g., `/home/hybridz/`, `~/Projects/`) must be clearly marked as user-specific
- API keys, secrets: already handled by agenix — just needs documentation
- WhatsApp/Kapso bridge config: document as personal infrastructure, not required to try ZeroClaw

### Scope Constraint
- Do NOT restructure the repo or refactor module.nix — this is polish only
- Do NOT remove openclaw/ directory — keep as reference/migration example
- Keep documents/ as-is — they're Kiro's actual identity docs (that's the point)

### Claude's Discretion
- README structure (sections, ordering, level of detail)
- Whether to include a CONTRIBUTING.md
- Badge choices (NixOS, license, etc.)
- Exact license (MIT assumed unless user specifies otherwise)
- Whether to add a .github/ISSUE_TEMPLATE or keep it simple

</decisions>

<specifics>
## Specific Requirements

- "people can analyze and potentially try it out" → README needs a Getting Started / Prerequisites section
- "post on social media" → repo must have a clear one-liner description and look complete at a glance
- "must appear ready as a v1" → GitHub release v1.0 with proper notes, not just a tag
- "polish before release" → no draft files, no TODO comments left in shipped docs

</specifics>

<deferred>
## Deferred Ideas

- CONTRIBUTING.md — probably out of scope for initial release, can add later
- Automated CI (nix flake check on PR) — future work
- Docker/VM demo environment — out of scope

</deferred>

---

*Phase: 05-publication-and-release-readiness*
*Context gathered: 2026-03-05 via user description*
