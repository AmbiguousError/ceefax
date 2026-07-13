# Ceefax

A Firefox New Tab override that recreates the [Ceefax](https://en.wikipedia.org/wiki/Ceefax) teletext experience: a 40×25 character grid, an 8-color palette, and 3-digit page-number navigation - backed by real, periodically refreshed content instead of static test pages.

> **Status:** actively in development, not yet published or signed. Load it as a temporary add-on to try it (see below). See [`project.md`](project.md) for the full build log and decisions.

## Features

- **News** - headlines from The Guardian, full article text extracted with Mozilla's Readability.js
- **Weather** - 6 cities (Auckland, Toronto, London, Santa Barbara, Sydney, Wellington), 7-day forecasts, and a Morning/Day/Night breakdown per day
- **A scrolling news ticker**
- **Reddit** - 9 subreddits, pulled from `old.reddit.com`'s Atom feeds
- **A live clock**, both a dedicated page and a ticking readout in every page's header
- **Navigation** three ways: type a 3-digit page number, click the on-screen number pad, or use arrow keys + Enter to move through any list page
- Auto-rotating news carousel with pause/next-page controls
- Page history (back), favorites, an optional page-change beep, and a CRT-style scanline overlay

## Installing (temporary add-on)

This isn't signed or published yet, so it can only be loaded temporarily:

1. Open `about:debugging#/runtime/this-firefox` in Firefox
2. Click **Load Temporary Add-on**
3. Select `ceefax-extension/manifest.json`
4. Open a new tab

It unloads when Firefox closes - you'll need to redo this each session until it's signed (see the "Open questions" in `project.md`).

## Development

```sh
cd ceefax-extension
npx web-ext lint --source-dir .    # lint the manifest and source
npx web-ext build --source-dir .   # package into a .zip
```

There's no `package.json` / build step beyond that - it's plain JS/CSS/HTML, no bundler.

## How it's built

- **Manifest V3**, using `chrome_url_overrides.newtab` to replace the New Tab page
- **Rendering**: a CSS Grid of 1000 `<span>` cells (40×25), not `<canvas>`
- **Data fetching**: `background.js` runs on an `alarms` interval, caching everything in `browser.storage.local`; the New Tab page (`app.js`/`nav.js`) only ever reads from storage, never fetches directly
- **Page numbers**: `100` index, `101`–`106` news, `200` weather hub (`210`–`267` per-city forecasts), `300` ticker, `400` Reddit hub (`401`–`409` subreddits), `800` clock - the full breakdown is in `project.md`'s decisions log

See [`AGENTS.md`](AGENTS.md) for the locked-in architecture decisions and more detail on the code layout, or [`HANDOVER.md`](HANDOVER.md) if you're picking this project up fresh.

## License

Not yet decided for this repo's own code. Mozilla's [Readability.js](https://github.com/mozilla/readability) is bundled under Apache-2.0 (see `ceefax-extension/js/vendor/READABILITY_LICENSE.md`).
