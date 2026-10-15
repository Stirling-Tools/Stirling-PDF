# Performance harness

`frontend/editor/tests/walkthrough/perf/` collects the bounded performance
evidence the walkthrough report asks for: DOM, React, memory, CPU, rendering,
network and resource measurements for one interaction, plus the desktop and
mobile Lighthouse audits. It is Node + Playwright + tsx, driven from
`frontend/editor` so the `@app/*` aliases and this repo's stubbed API helpers
resolve.

```bash
cd frontend/editor
npx tsx tests/walkthrough/perf/cli.ts \
  --out captures/perf --base-url http://localhost:5173 --route /editor \
  --scenario editor-settings-cycle --cycles 5 \
  --build-label "dev server, proprietary mode, stubbed API" \
  --manifest captures/manifest.json --validate
```

## Files

| File | Owns |
|---|---|
| `cli.ts` | Flag parsing, scenario loading, backend preflight and stub backend, collector + optional Lighthouse, derived findings, fragment writing, manifest merge, `report.py validate` |
| `backend.ts` | The preflight probe (`/api/v1/config/app-config`), the `live`/`stubbed`/`unavailable` state, and the wording of the run limitations |
| `stub-backend.ts` | The repo's `appApiStubs` table served over `node:http`, mirroring `mockAppApis` and its dead-proxy 500 |
| `scenarios/editor-cycle.ts` | The built-in scenarios: `editor-settings-cycle`, `editor-picker-scroll` |
| `scenarios/text-editor-cycle.ts` | `text-editor-raster-cycle`: load a document into the PDF text editor, zoom, scroll, leave |
| `scenarios/index.ts` | `BUILTIN_SCENARIOS`, the list `cli.ts` resolves `--scenario` ids against |
| `collect-web.ts` | Browser, context, stubs, CDP recorder, sampling cadence, artifacts |
| `probe.ts` | The in-page scripts: observers at boot, commit-hook wrap after mount, drain |
| `metrics.ts` | Pure reductions over the recorded samples (no browser) |
| `assemble.ts` | Sample sets → one `performance.interactions[]` entry, plus the pictures |
| `charts.ts` | The four SVG charts and their PNG rasteriser |
| `collect-lighthouse.ts` | The desktop/mobile Lighthouse runs, diagnostics and preview |
| `findings.ts` | The verdicts derived from the recorded numbers, grouped the way the viewer groups them |
| `types.ts` | The fragment shapes and the minimal page surface a scenario sees |
| `serialize.ts` | `assertSerializable`, for page functions |
| `selftest.ts` | Unit checks plus a real browser rasterise and a `report.py` round-trip |

## Writing a scenario

`types.ts` exports `Scenario`. A scenario performs **one** open/use/close
cycle and returns a short description of what it did; the collector repeats it
`--cycles` times and measures the whole window, so a scenario must not loop.

- Wait on real conditions (`waitForSelector`, `waitForFunction`), never on a
  timer: a sleep inside a scenario lands in the measurement it is polluting.
- `page.waitForFunction(fn, arg, options)` — Playwright reads the second
  argument as the page-function argument, so an options object in second
  position is silently ignored and the 30 s default applies. Pass `null`
  first, as the built-in scenarios do.
- Wrap every page function in `assertSerializable(...)`. Page functions are
  serialized with `Function.prototype.toString()`, and esbuild's `keepNames`
  (which tsx uses) rewrites an inner function declaration into a
  `__name(fn, "fn")` call that only exists in the bundler's scope: the
  function then dies in the page with `ReferenceError: __name is not defined`,
  often after doing part of its work, which is how a broken measurement ends
  up looking like a real zero.
- Prefer test ids and state-based selectors over positional ones. A
  `>> nth=1` in the tool picker lands on whatever `aria-disabled` row happens
  to be second.
- `--scenario <path>` loads a module exporting `scenario` (or a default
  scenario), for features whose flow is not the editor's.
- A scenario that loads a file uses `locator.setInputFiles(path)` on the same
  hidden input the app does; `text-editor-raster-cycle` reads its document from
  `WALKTHROUGH_FIXTURE`, falling back to
  `src/core/tests/test-fixtures/user-sample.pdf`.
- The context is created with the collector's `--base-url`, so a scenario
  navigates with route paths (`page.goto("/pdf-text-editor")`).
- A measurement is only as good as the state it starts from. The PDF text
  editor restores the open document when the route is re-entered, so a scenario
  that needs a fresh empty state must run in its own page rather than reloading
  (this is why the capture spec splits load-outcome views into a second test).

## What is measured, and where it comes from

| Manifest key | Source |
|---|---|
| `dom.baselineNodes/peakNodes/finalNodes`, `dom.documents`, `dom.frames` | CDP `Performance.getMetrics`: `Nodes`, `Documents`, `Frames` |
| `memory.jsHeapBaselineMB/PeakMB/FinalMB`, `memory.retainedFraction` | CDP `JSHeapUsedSize`, cross-checked against `performance.memory` when the browser exposes it |
| `cpu.taskDurationMs`, `cpu.scriptDurationMs`, `cpu.scriptShareOfTask` | CDP `TaskDuration` and `ScriptDuration` deltas |
| `cpu.hotspots` | self time from the V8 profile's `nodes[].hitCount`, top eight |
| `rendering.layoutCount`, `recalcStyleCount`, `layoutMs`, `recalcStyleMs`, `framesRendered` | CDP `LayoutCount`, `RecalcStyleCount`, `LayoutDuration`, `RecalcStyleDuration`, `Frames` |
| `rendering.longTaskCount`, `longestTaskMs`, `longTaskTotalMs`, `blockingMs` | `longtask` `PerformanceObserver`; blocking is the sum of `duration - 50 ms` for tasks over 50 ms |
| `latency.*` | the longest `event` timing entry: input delay, processing and total duration |
| `react.commits`, `renderTotalMs`, `renderMaxMs` | `onCommitFiberRoot`, reading `actualDuration` off `arguments[1]` |
| `network.requests`, `knownBytes`, `unknownSizeRequests` | `resource` timing entries; a TAO-less cross-origin response reports 0 bytes and is counted as unknown rather than as free |
| `resources.workerTargets`, `workerUrls` | CDP `Target.getTargets` before and after the cycles |

Three constraints make those numbers real, and each one is the fix for a
failure that produced a plausible-looking zero:

- **Observers are armed at boot and retained.** Timing observers only see
  entries emitted after they are armed, so the init script runs before the app
  loads; and an observer nothing references is collectable, after which it
  reports nothing at all.
- **The probe never creates `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`.** The dev
  server's React refresh preamble reads the hook that exists when it runs, and
  a probe-created hook without the refresh runtime's shape breaks module
  evaluation. Commits are counted by wrapping `onCommitFiberRoot` *after* the
  app has mounted (`PROBE_COMMITS_SCRIPT`), with a property getter/setter so a
  later re-injection by refresh tooling cannot cut the probe out — React calls
  the hook as `onCommitFiberRoot(rendererID, root, priority, didError)`, so
  the root is `arguments[1]`.
- **A metric that cannot be collected is `unavailable`.** `metrics.unavailable`
  carries the reason; nothing is reported as 0 because it was not measured.
- **The same metric can be available on one route and not another.** The commit
  count works on `/editor` and came back empty on `/pdf-text-editor` with the
  same build and probe, so `react.commits` and `latency.*` were `unavailable`
  in the text-editor run. Read the list before quoting a metric; an empty
  `react.commits` is not evidence that the page did not render.

## Pictures

`charts.ts` draws the four pictures from the recorded data — interaction
timeline with phase markers, work breakdown, per-cycle rendering activity, and
resource recovery (DOM nodes and JS heap over the samples) — and rasterises
each SVG to PNG by screenshotting it in a real browser. The report template
renders raster data URIs only, so an SVG data URI would be dropped. Pictures
stay thumbnail-sized in the report; traces and CPU profiles stay on disk.

## Into the report

The fragment is
`{performance: {interactions: [...]}, lighthouse: {runs: [...]}, findings: {perf: [...], a11y: [...], behavior: [...]}}`,
which is the shape `report.py validate` checks and the template's Performance,
Lighthouse and Findings tabs read. `--manifest` merges the fragment into a
capture manifest so one report carries the screenshots and the measurements —
appending the derived findings to `manifest.findings`, per group, without
replacing an author finding that carries the same title;
`--validate` runs `report.py validate` on the merge and fails the run when the
merge does not validate. `npx tsx tests/walkthrough/perf/selftest.ts` covers
the reductions, the probe's sandbox behaviour, the derived findings, the chart
rasteriser and a manifest round-trip through `report.py`.

## Derived findings

The numbers already exist; what is missing at the end of a long walkthrough is
the verdict. `findings.ts` reads the recorded metrics and the Lighthouse runs
and emits findings with `severity`, `kind` (`regression` / `budget` / `gap` /
`observation`), the `evidence` it was read from, a picture where one exists, and
a `confidence` that states what the measurement cannot prove:

| Measured | Finding |
|---|---|
| `memory.jsHeapFinalMB` at least 5 MB over its baseline | retention, `regression`, high at 15 MB or 3 MB per cycle, pointing at the recovery curve |
| `dom.finalNodes` 150+ over baseline | DOM growth, `observation` — a modal left open explains it as easily as a leak |
| `rendering.blockingMs` over zero | long tasks, `observation`, med at 200 ms |
| `latency.durationMs` at or over 200 ms | the slowest interaction, citing web-vitals' INP boundary |
| `metrics.unavailable` | one `gap` per unmeasured area |
| Lighthouse category under 90 | `budget` in that category's viewer group (a11y and best-practices included) |
| an audit served by the repo's stubs | `observation`: the UI was scored with fixture data |
| no Lighthouse run because nothing answered | `gap`, with the reason the audit was skipped |

Nothing fires on a number that was not recorded, and a rule that cannot see its
measurement stays silent rather than guessing. The Findings tab prints the
`kind` chip and the evidence line with every finding and rolls the totals up
above the groups, so a regression is never visible only on another tab.

## Budget, honestly stated

Sampling runs at 750 ms with a hard cap of 40 samples; the idle baseline and
recovery windows default to 4 s each; the CPU profile and the Chrome trace, if
requested, cover the cycle window only. Counters and the profile are collected
by the same browser that drives the UI, so the numbers include instrumentation
overhead — the `provenance.note` says so, and a dev server is not a production
build. Compare runs within the same build mode and instrumentation, or label
the comparison descriptive.

## Giving the measured pages a backend

The app blocks its first paint on `app-config`, so a page with no API behind it
renders an error state and every number collected from it measures that state.
Two different consumers need an answer:

- The interaction run installs this repo's Playwright route stubs, which is why
  the plain `--cycles` run works without a backend at all. It records only that
  fact (`metrics["harness.api"]`); it makes no claim about a live API.
- Lighthouse launches its own browser (`--chrome-flags=--headless=new`), so those
  route handlers do not exist there. `cli.ts` probes `/api/v1/config/app-config`
  through the dev server before it measures anything: a live backend wins, and
  with none answering it serves the repo's own stub table (`appApiStubs`, the
  same one `mockAppApis` registers) over HTTP on the port the dev server already
  proxies to (`BACKEND_URL`, default 8080). The audit is then a real audit of the
  UI with fixture data, marked `stubbed` and caveated in its limitations — not an
  audit of an error screen, and not silence.

The state is `live`, `stubbed` or `unavailable`, recorded on the run and used by
the derived findings: a stubbed audit is a low `observation`, an `unavailable`
one is a `gap` for every run that did not happen. `--no-stub-backend` keeps the
harness out of the dev server's proxy port entirely and `--stub-backend-port`
moves it; the second probe goes through the dev server, so a proxy pointed
somewhere else fails honestly instead of producing numbers from a screen nobody
looked at. `--lighthouse-force` still audits when nothing answered, and those
runs carry the error-state caveat in their diagnostics. Treat that caveat as a
blocker for using the scores: fix the API route and re-run.
