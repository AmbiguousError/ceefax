# AGENTS.md

This file provides guidance to AI coding assistants working in this repository.

## Project state

The extension lives in `ceefax-extension/`. Phases 1-5 are done (skeleton, rendering engine, data layer, navigation, polish); only Phase 6 (test & ship) remains. See `project.md`'s phase checklists for exactly what's built vs. outstanding. `project.md` is the source of truth for scope, architecture, and phase progress; keep it in sync as work proceeds:

- Check off tasks in the phase checklists as they're completed.
- Append dated entries to the "Working notes / decisions log" section when a decision is made or changed.
- Update "Open questions" as they get resolved.
- Follow the "File structure (target)" layout in `project.md` when creating files.

Work should proceed phase by phase as laid out in `project.md` (Phase 1 to Phase 6); each phase has an explicit exit criteria to satisfy before moving to the next.

## What this project is

A Firefox extension that overrides New Tab to recreate the Ceefax teletext experience: a 40x25 character grid, 8-color palette, 3-digit page-number navigation, and periodically refreshed content (news headlines via RSS, weather, a ticker, a live clock).

## Locked-in architecture decisions

These are fixed, don't revisit without discussion:

- **Manifest V3**, using `chrome_url_overrides.newtab` to replace the New Tab page (not a popup or browser action).
- **Rendering**: CSS Grid of `<span>` cells for the 40x25 character display, not `<canvas>`, chosen for build/debug speed.
- **Palette**: exactly 8 colors (black, red, green, yellow, blue, magenta, cyan, white), defined as CSS variables.
- **Font**: a bitmap teletext font (e.g. Teletext2), not a system font, currently deferred to a `monospace`/`Consolas` fallback stack since no clearly-licensed redistributable teletext webfont was found; see `project.md` decisions log (2026-07-13) before sourcing one.
- **Article text extraction**: Mozilla's Readability.js is bundled directly and run in the background script against fetched HTML. The native browser Reader Mode API is deliberately *not* used, since it isn't scriptable from extensions.
- **Data fetching**: `background.js` service worker uses the `alarms` API on an interval, with results cached in `browser.storage.local` (not fetched live on each render).
- **Page numbering**: 100 = index, 101 = news hub (110/125/140/155/170/185 = per-topic subcategory hub, base+1..+3 = that topic's 3 subcategories, base+4..+12 = that topic's 9 articles), 200 = weather hub (210-267 = per-city forecast/day-detail), 300 = ticker, 400 = Reddit hub (401-409 = subreddits), 800 = clock. See `project.md` decisions log (2026-07-13, 2026-07-14) for the full breakdown.

## Commands

The extension lives in `ceefax-extension/`. There's no `package.json`, run `web-ext` via `npx` from that directory:

- `cd ceefax-extension && npx web-ext lint --source-dir .` - lint the manifest and source
- `cd ceefax-extension && npx web-ext build --source-dir .` - package the extension (Phase 6)
- Manual testing: `about:debugging#/runtime/this-firefox` in Firefox, "Load Temporary Add-on", select `ceefax-extension/manifest.json`. This step requires a real browser and can't be done from the CLI, verify it by hand after changes that touch `manifest.json` or the newtab page.
