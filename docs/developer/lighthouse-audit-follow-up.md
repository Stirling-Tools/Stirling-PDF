# Lighthouse audit follow-up

Findings from the reviewed audit report, and what closed them. Regenerate the numbers with
`npx vite build` in `frontend/editor`, `node editor/tests/walkthrough/perf/audit-serve.mjs 4181 8081`,
then `$T/lh/node_modules/.bin/lighthouse http://localhost:4181/ --only-categories=performance`.

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 1.1 | Non-`xx-YY` browser locales got a blank page (raw lookup, `drop()` without booting) | fixed | `pick()` normalises `_`, matches case-insensitively then by subtag then the base; `drop()` calls `window.__spdfBoot()` |
| 1.2 | `shell-critical` missed `html`/`body` rules and shipped duplicates | fixed | `documentElement` + `body` scanned, rules deduped, unreferenced custom properties pruned; CLS probe now reports no shifts |
| 1.3 | File hand-off re-entered itself, hijacked later inputs, polled forever | fixed | listener removed on use and in `boot()`, `pending` cleared before dispatch, waits for the shell to leave, 200×50 ms bound |
| 1.4 | Boot-on-intent swallowed the first click, wiped typed text, ignored drop/paste | fixed | `dragenter`/`paste` triggers, typed value + focus restored after mount, shell anchors boot then `pushState` |
| 1.5 | OG/SaaS builds skipped the shell (crawlable copy already inside `#root`) | fixed | `replaceRoot()` replaces the whole root element; hints written to every top-level page; a failed capture fails the build unless `PRERENDER_SHELL_SKIP=1`; the phone capture is fatal |
| 1.6 | Deep routes flashed the landing shell and lost their preload hints | fixed | deep routes empty the root, boot at parse time through `document.write` and rebuild the hints first; `/index.html` and trailing slashes normalise |
| 1.7 | Brand images and the startup dictionary were fetched before any gesture | fixed | four shell SVGs inlined as data URIs at capture; dictionary preload now runs from `boot()` |
| 1.8 | Thumbnail cache spun when every entry shared a millisecond; over-counted bytes on overwrite | fixed | `oldestTime` starts at `Infinity`; a replaced entry's bytes are subtracted |
| 1.9 | Duplicate `super-search-input` id; `icon-lint` failed on a test's mock svg | fixed | the inactive shell loses its ids at localisation; `icon-lint` exempts test files |
| 3.1 | Shell-critical CSS, images and dictionary on the critical path | fixed | rows 1.2 and 1.7; measured below |
| 3.2 | `shell-strings` payload was ~48 % of the compressed document | fixed | only the base language's words ride the document; the other 41 live in `dist/shells/<language>.json` and are fetched before the shell is unhidden (document 615,336 → 515,058 B) |
| 3.3 | `boot()` rediscovered the graph serially | fixed | hint URLs ride the entry payload and `restore()` rebuilds them before the entry loads |
| 3.4 | Icon codegen cost ~483 net LOC for a boot the score no longer measures | fixed | reverted: the landing's 73 svgs are per-file components again and `icon-lint` lets the startup subset import them, which removes the generator, the table and the wrapper |

## Measured

| Build | Mobile | Desktop |
|-------|--------|---------|
| before these fixes | 100 (FCP 778, LCP 1201, 9 requests, 64,302 B, CLS 0) | 100 (FCP 205, LCP 281) |
| findings 1.1–1.9, 3.1, 3.3 | 100 (FCP 921–943, LCP 1201, 8 requests, 53,100 B, CLS 0) | 100 (FCP 247–251, LCP 321) |
| 3.2 (words per language) | 100 (FCP 777–779, LCP 1065–1066, 9 requests, 35,888 B, CLS 0) | 100 (FCP 207–211, LCP 285) |
| final build (3.2 + icon revert) | 100 (FCP 777–799, LCP 1064–1068, 9 requests, 35,984 B, CLS 0) | 100 (FCP 207–212, LCP 285) |
