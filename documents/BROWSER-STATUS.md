# Browser Fix Status — 2026-03-11

## Summary

Two browser bugs were investigated, patched, and deployed to zeroclaw v0.1.8.

---

## Bug 1: Stale @ref after SPA re-render (FIXED)

**Root cause:** `snapshot_script()` injected `data-zc-ref="@eN"` attributes into the DOM.
When React/Vue re-rendered a page between snapshot and click, the DOM nodes were replaced
and the attributes disappeared. Click failed with "element not found".

**Fix (`fix-browser-xpath-refs.patch`):**
- `snapshot_script()` now computes a stable XPath for each element via `stableXPath()` in JS
  (no DOM mutation). The XPath is returned in the node JSON alongside `ref`.
- `NativeBrowserState` has a new `ref_map: HashMap<String, String>` field.
- After each snapshot, `ref_map` is populated: `@eN → xpath`.
- `parse_selector()` now accepts `ref_map` and resolves `@eN` to `SelectorKind::XPath(...)`.
  Falls back to the old CSS attr selector if ref is missing from map.

**XPath priority:**
1. `//*[@id="..."]` — element has an `id`
2. `//a[normalize-space(.)="..."]` or `//button[...]` — unique text for interactive elements
3. `//*[@name="..."]` — has a `name` attribute
4. Positional fallback: `//div/ul/li[2]/button`

---

## Bug 2: Session death on anchor navigation (FIXED)

**Root cause:** Clicking an `<a>` link with WebDriver's `element.click()` blocks until the
browser stabilizes. Page navigation can cause Chrome to report "invalid session id", which
the recovery logic treated as a recoverable error → `reset_session()` → retry Click with no
active client → "No active browser session" → total failure.

**Fix (also in `fix-browser-xpath-refs.patch`):**
- `click_with_recovery()` reads `element.tag_name()` after finding the element.
- If `tag == "a"`, uses `javascript_click()` (`el.click()` via JS execute) instead of
  WebDriver click. JS execute returns before navigation begins → session stays alive.
- All other elements continue to use the existing WebDriver click + recovery logic.

**Confirmed:** The agent can now click "COMIENZA TU REGISTRO AQUÍ" on
https://lideresenmovimiento.mx/ without session death.

---

## Active Patches in module.nix

```nix
patches = [
  ./patches/fix-screenshot-multimodal.patch      # screenshot → multimodal image block
  ./patches/fix-browser-xpath-refs.patch         # XPath ref-map + anchor JS click + post-nav sleep
  ./patches/fix-browser-dedup-per-turn.patch     # dedup resets per-iteration, not per-turn
];
```

Patch sources:
- `fix-browser-xpath-refs.patch` — diff of `src/tools/browser.rs`
- `fix-browser-dedup-per-turn.patch` — diff of `src/agent/loop_.rs`

Local edits are reverted after patch generation — `patches/` is the canonical source.

---

## Bug 3: Post-navigation timeout + target="_blank" tab switch (FIXED)

**Root cause:** After `javascript_click()` fires on an `<a>` element and returns immediately
(before navigation), the agent's next tool call (snapshot/wait_for_selector) arrived before
Chrome had begun loading the new page, causing timeout on slow destinations.

**Fix (added to `fix-browser-xpath-refs.patch`):**
- Before JS click: snapshot open window handles via `client.windows()`.
- After JS click + 1s sleep: compare handles again. If a new handle appeared (i.e. `target="_blank"`
  opened a new tab), call `client.switch_to_window(new_handle)` so the agent's session follows
  into the new tab.
- Same 1s sleep gives Chrome time to begin navigation before the next command.

---

## Bug 4: Dedup blocks cross-iteration retries (FIXED)

**Root cause:** `seen_tool_signatures` was declared outside the iteration loop in
`run_tool_call_loop`, so identical tool calls in different LLM iterations were silently
dropped even when they were legitimate retries (e.g., after new context was received).

**Fix (`fix-browser-dedup-per-turn.patch`):**
- Moves `let mut seen_tool_signatures` inside the `for iteration` loop.
- Dedup now resets per-LLM-response, not per-turn — prevents only intra-response loops.

---

## Files

| Path | Role |
|------|------|
| `/etc/nixos/zeroclaw/module.nix` | Build config — patches list, cargo features |
| `/etc/nixos/zeroclaw/patches/fix-browser-xpath-refs.patch` | XPath + anchor click patch |
| `/etc/nixos/zeroclaw/patches/fix-screenshot-multimodal.patch` | Screenshot patch |
| `/home/hybridz/Projects/zeroclaw/src/tools/browser.rs` | Upstream source (do not edit directly) |
| `/etc/nixos/zeroclaw/documents/BROWSER-PATCHES.md` | Detailed patch notes and next steps |
