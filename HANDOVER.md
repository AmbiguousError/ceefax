# Handover

You're picking up Ceefax: a Firefox New Tab override that recreates the Ceefax teletext service. This document is a fast-orientation guide, not the source of truth. For that, see:

- **`project.md`** - the full chronological build log. Every decision, every bug found and fixed, every "not yet done" is dated and explained there. When in doubt, that's the real record.
- **`AGENTS.md`** - locked architecture decisions and rules for AI coding assistants working in this repo. Worth reading even if you're human; it's a concise list of "don't revisit this without discussion."
- **`README.md`** - the public-facing pitch and install instructions.

This document exists to get you oriented in ten minutes, not to duplicate any of the above.

## Where things actually stand

All six planned phases (skeleton, rendering, data layer, navigation, polish, test & ship) are functionally done, plus a substantial amount of feature work beyond the original plan (expanded weather, Reddit, arrow-key nav). `web-ext lint` passes with 0 errors. But:

- **Nothing has been manually verified in a real Firefox profile.** Every single piece of this was built and verified through `web-ext lint`, Node syntax checks, and jsdom-based dry runs against live APIs, because there was never a way to launch an actual browser from the environment this was built in. That means: things that *should* work based on correct logic and real API responses have never actually been eyeballed running in a real New Tab page. This is the single most important gap. Load it via `about:debugging` and just use it for a while before doing anything else.
- **It is not signed or published.** It only runs as a temporary add-on (unloads when Firefox closes). Publishing is a deliberate not-yet: see "Open decisions" below.
- **It has never been load-tested from a real residential IP.** Reddit's `.rss` endpoints rate-limited the sandbox IP this was built from repeatedly during testing. A real browser on a real network should fare better, but nobody has confirmed that a full 15-minute refresh cycle (21 external fetches: 1 RSS + 5 articles + 6 weather cities + 9 subreddits) reliably completes without tripping something.

## How data flows (the one diagram you need)

```
background.js (runs on browser.alarms, every 15 min)
  -> fetches Guardian RSS, Open-Meteo (x6 cities), old.reddit.com (x9 subs)
  -> runs article HTML through Readability.js for clean text
  -> calls page-builder functions in data.js to turn all of that into
     { page: N, lines: [...25 rows of colored text runs...], footerTargets, ... }
  -> writes everything into browser.storage.local under a single `pages` object

newtab.html -> app.js -> nav.js (runs in the actual New Tab page, a separate
  execution context from background.js - see "Two worlds" below)
  -> on load and on every navigation, reads browser.storage.local.pages
  -> paints the 40x25 character grid via render.js
  -> handles keyboard/numpad/arrow-key/click input to change pages
```

The New Tab page **never fetches anything itself** - it only ever reads what `background.js` already cached. If content looks stale or missing, the bug is almost certainly in `background.js`/`data.js`, not `nav.js`.

## File map

| File | Runs in | Responsibility |
|---|---|---|
| `manifest.json` | - | MV3 manifest: permissions, host permissions, background scripts list |
| `background.js` | background context | Fetches everything on a timer, writes `browser.storage.local` |
| `js/data.js` | background context | RSS/Atom parsing, all page-object builders, the shared footer/header helpers |
| `js/vendor/readability.js` | background context | Mozilla's unmodified upstream Readability.js (Apache-2.0) - never hand-edit this |
| `newtab.html` | New Tab page | Loads `app.js` as an ES module |
| `js/app.js` | New Tab page | Thin bootstrap: builds the grid, calls `initNav` |
| `js/nav.js` | New Tab page | All navigation/input handling, plus the locally-built pages that don't come from storage (100, 800, loading, not-found) |
| `js/render.js` | New Tab page | `buildGrid`/`renderPage` - the actual 40x25 grid painter, nothing else |
| `css/*.css` | New Tab page | Palette variables, grid layout, on-screen controls |

## The two worlds, and why some code is duplicated

`background.js`/`data.js` run as classic (non-module) scripts sharing one global scope (see `manifest.json`'s `background.scripts` array - load order matters, `data.js` must come before `background.js`). `app.js`/`nav.js`/`render.js` run as ES modules inside the New Tab page. **These are two separate JS execution contexts that cannot share a module.** A few constants exist identically in both `data.js` and `nav.js`, each with a comment cross-referencing the other:

- `HEADER_CLOCK_WIDTH` (8) - trailing columns of row 0 reserved for the live clock
- `NAV_SECTIONS` / `buildFooterRow()` - the dynamic 4-of-6 footer logic
- The weather-city bases and Reddit page numbers (as a set, in `nav.js`'s `KNOWN_DYNAMIC_PAGES`)

If you change one, grep for the other. There's no build step to keep them in sync automatically.

## The page-number map

| Range | What |
|---|---|
| 100 | Index (built locally in `nav.js`, not fetched) |
| 101 | News headlines list |
| 102-106 | One article each (top 5 Guardian stories, full text via Readability) |
| 200 | Weather hub (lists the 6 cities) |
| 210, 220, 230, 240, 250, 260 | Auckland / Toronto / London / Santa Barbara / Sydney / Wellington - 7-day overview |
| *city base* +1 to +7 | That city's day-detail pages (Morning/Day/Night) |
| 300 | Ticker |
| 400 | Reddit hub (lists the 9 subreddits) |
| 401-409 | One subreddit each |
| 800 | Live clock (built locally in `nav.js`, not fetched) |

## Testing approach (there is no automated test suite)

Every feature in this project was verified with a throwaway Node script in a scratch directory: copy the relevant source file(s), stub `browser.storage`/`document`/`DOMParser` with jsdom, drive the actual functions, assert on the output, then delete the scratch dir. None of these scripts are committed - they're one-shot verification, not a regression suite. If you want real regression tests, that's a legitimate gap to fill, not something that already exists somewhere you haven't found.

One quirk if you write your own: Node's `eval()` doesn't leak `const`/`let` declarations into the calling scope (only `function` declarations do, in sloppy mode). If you `eval()` a copy of `data.js` to test it, you can call its functions directly but can't reference its top-level `const`s (like `WEATHER_CITIES`) by name afterward. Not a bug, just a JS scoping quirk that will confuse you for a minute the first time.

## Non-obvious gotchas

- **`background.js` runs its fetch pipeline unconditionally at top-level script scope**, not inside `onInstalled`/`onStartup`. This was a deliberate fix (see project.md, 2026-07-13) - those events don't reliably fire on every way the script can restart, and a version that only fetched inside them would silently stop working after certain reload paths in `about:debugging`.
- **The header clock overlay always wins.** `nav.js` repaints row 0's last 8 columns every second regardless of what the page itself put there. Any new page builder that puts content past column 31 on row 0 will have it silently overwritten - keep titles short or truncate them (see `HEADER_SAFE_WIDTH` in both files).
- **Reddit's `.json` API is blocked (403) but `.rss` works** and is Atom format, not RSS 2.0 (`<entry>`, not `<item>`; `<link href="...">` is an attribute). There's a separate `parseRedditFeed()` for this reason - don't try to reuse `parseRssFeed()` for it.
- **No custom `User-Agent` is set on fetches**, deliberately. Firefox's own `fetch()` sends a legitimate browser UA automatically; a custom one is usually stripped anyway.
- **The bundled font is a placeholder.** No licensed redistributable teletext bitmap font was found; it currently falls back to `Consolas`/monospace. The `font-family` stack already lists `'Teletext2'` first, so dropping in a real licensed `.woff2` later is a one-file change, not a rearchitecture.

## Open decisions (someone needs to actually decide these)

1. **AMO publishing.** Listed (public/searchable), unlisted (signed but not searchable, share the `.xpi` directly), or stay unsigned/personal-use only. Blocks: whether Guardian's and Reddit's feed reuse terms need a closer look first.
2. **Reddit rate-limiting in production** - untested at real-world scale. If it becomes a problem, options include spacing requests out further, fetching fewer subreddits per cycle, or refreshing that section less often than every 15 minutes.
3. **Whether to rewrite the earliest git commits.** They still contain an AI-assistant co-author trailer that later commits don't. Fixing it means rewriting history and force-pushing over what's already public - deliberately left alone pending an explicit decision, since that's a destructive, one-way operation.
4. **A real bitmap teletext font**, if you want full visual authenticity rather than the monospace fallback.

## If you only do one thing next

Load it in a real Firefox profile (`about:debugging#/runtime/this-firefox` -> Load Temporary Add-on -> `ceefax-extension/manifest.json`) and actually use it for fifteen minutes: navigate everywhere, wait for a background refresh to land, listen for the beep, watch the clock. Every prior verification was automated and API-level; nobody has confirmed it *feels* right yet.
