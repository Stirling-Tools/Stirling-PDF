---
name: ui-walkthrough
description: >
  Full UI investigation of the current branch's feature, not just a screenshot dump.
  Enumerates every view and state the change touches (empty, populated, loading, error,
  every dialog/menu/panel, responsive breakpoints, light + dark + RTL) across the required
  runtime/platform matrix (desktop web, mobile web, Windows/macOS/Linux Tauri, Android Tauri,
  iOS Tauri), captures them with the stubbed Playwright harness, records bounded performance and
  main-thread responsiveness evidence, runs Lighthouse desktop + mobile audits, assembles a
  self-contained HTML walkthrough with a global light/dark toggle, and runs four review passes
  (visual/consistency, UX/ease-of-use, accessibility/behavioural, performance). A missing runner
  produces an INCOMPLETE report, never a silently reduced scope. Use when asked for a UI
  walkthrough, screenshot review, design or QA pass, "find anywhere to make it easier for users",
  or before merging frontend work. Flags: --fix applies safe frontend fixes and re-captures;
  --theme limits themes; --no-rtl skips RTL; --perf/--lighthouse force the heavier evidence;
  --pr-link publishes the report and links it from the PR description.
argument-hint: "[feature/area] [--fix] [--theme light|dark|both] [--no-rtl] [--breakpoints] [--perf] [--lighthouse] [--pr-link]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# UI Walkthrough

Walk the branch's feature the way a person would: open it, use it, break it, change the theme, shrink the window. Capture what you find, judge it, and publish the evidence as one HTML file that a reviewer can click through.

`$ARGUMENTS` names the feature or area to inspect; an empty argument means "infer from the branch diff". Flags change depth, never scope: a flag that hides a required runtime makes the report incomplete, and the report says so.

## What this skill produces

1. A capture spec under `frontend/editor/src/core/tests/stubbed/` that drives the feature through the stubbed harness and dumps PNGs.
2. A manifest (JSON) describing every view, its provenance, the findings, the performance evidence and the Lighthouse audits.
3. A self-contained `walkthrough.html` built from the manifest — no external assets, so it renders through htmlpreview.
4. Optionally, with `--pr-link`: the report on the `ui-walkthrough-reports` branch plus a managed block in the PR description.

The report is built and validated by `scripts/report.py`; it is published by `scripts/publish.py`. Judgment lives in this file; mechanics live in those two scripts, and both have self-tests (`scripts/tests/`).

## Coverage: the runtime/platform matrix is mandatory

Every full walkthrough covers each required runtime/platform, and the manifest records which ones were captured:

| Category | id | Typical runner |
|---|---|---|
| Desktop web | `desktop-web` | Playwright `stubbed` project (chromium) |
| Mobile web | `mobile-web` | Playwright with a mobile viewport + touch, same stubbed project |
| Windows Tauri | `windows-tauri` | Tauri app on Windows (or a documented CI runner) |
| macOS Tauri | `macos-tauri` | Tauri app on macOS |
| Linux Tauri | `linux-tauri` | Tauri app on Linux |
| Android Tauri | `android-tauri` | Emulator or physical Android device |
| iOS Tauri | `ios-tauri` | Simulator or physical iOS device |

Android and iOS are always listed separately — a mobile viewport is not a mobile app. So is an emulator: label it as an emulator, never as a device.

`coverage.expected` is the list the feature requires; `coverage.captured` is what actually ran. Anything expected but not captured is a gap, and a gap makes the report **incomplete**: the viewer shows an "Incomplete report" banner and the missing categories as chips, and the chat summary names them. A missing runner is reported as missing — never replaced with a browser proxy, and never quietly dropped from the scope.

### Capture Tauri desktop and mobile

Run the native walkthrough adapters in addition to Playwright web captures. Desktop captures must launch the actual Tauri application; desktop-mode Vite alone does not count. Android and iOS captures must run installed applications on recorded emulators/simulators or physical devices.

The harness lives in `frontend/editor/tests/walkthrough/` (adapters per runtime, one scenario per proof, `wdio.desktop.conf.ts`, `capture-manifest.ts`); mechanics and the blocked-coverage contract are in `references/tauri-capture.md`.

Reuse logical scenarios and fixtures, but keep runtime-specific launch, interaction, native-dialog capture, and cleanup in adapters. Assert the intended state before screenshots. Record source/build identity, runtime, platform, theme, direction, backend/native mock status, and capture outcome.

Include native handoffs, cancellation/recovery, and relevant mobile keyboard/back/background behavior. Collect bounded performance evidence with separate pictures, emphasizing main-thread responsiveness and resource recovery.

Missing native infrastructure must produce blocked coverage and a partial report. Never substitute browser captures for native evidence. Automation plugins, permissions, and endpoints must be excluded from normal production builds.

## Requirement: bounded performance evidence

Every full walkthrough records lightweight performance evidence for representative critical interactions on each required runtime/platform: DOM growth and recovery, scoped React commits and render cost, available memory and CPU metrics, request/IPC activity, and relevant resource lifetimes. Use bounded sampling and short recording windows; collect deep CPU/allocation/heap profiles only when warranted. Generate separate performance pictures showing the interaction timeline, measured work attribution, rendering activity and resource recovery. Preserve raw measurements, identify instrumentation overhead and unavailable metrics, and never infer a leak or hotspot solely from screenshots, counters or rerender counts.

Default recording policy — one representative critical interaction plus a short resource-lifetime check per runtime/platform:

- Capture an idle baseline, perform the primary interaction, then record completion and recovery.
- Repeat the relevant open/use/close cycle five times.
- Sample inexpensive counters at roughly 500–1,000 ms; keep detailed tracing inside a short window and stop collectors immediately afterwards.
- These are configurable capture budgets, not universal benchmarks. Never run continuous profiling across the whole screenshot matrix.
- Record performance separately from screenshot capture and image encoding, and always record the instrumentation and build mode so numbers are not mistaken for uninstrumented production performance.

Metrics to record, and how to read them:

| Area | Record | Interpretation |
|---|---|---|
| DOM | baseline, peak, final node count; documents/frames where supported | growth during use and recovery after closing |
| React | profiled subtree commit count and render duration | rendering frequency and cost |
| Memory | JS heap where supported; native/process memory separately | peak footprint and post-operation retention |
| CPU | available CPU samples and a short CPU trace | busy periods and identified execution hotspots |
| Rendering | layout/style recalculation; long tasks and frame timing where supported | main-thread work and responsiveness |
| Network/IPC | request count, bytes, timings, native handoff spans | repeated work and transfer overhead |
| Resources | active URLs, workers, subscriptions, temporary files where instrumented | ownership and cleanup |

Chrome's Performance Monitor exposes CPU, JS heap, DOM nodes, documents, frames, listeners, layouts and style recalculations — a useful low-effort collection option on compatible targets. Metrics are not uniformly available across WebViews; a metric you cannot collect is `unavailable`, never `0`.

For React, distinguish commits from per-component render counts. A scoped React Profiler measures render work for its own subtree: do not label its duration "total interaction time" or "CPU usage". Profiling adds overhead and needs an appropriate profiling build.

Attribution has two levels. Default: counters, named timing spans, scoped React profiling, resource counts. Escalation, only when the lightweight evidence needs explanation: CPU flame chart, allocation analysis, heap snapshots, detailed native profiler. A CPU spike shows *when* work happened, not which function caused it — read a trace before naming a hotspot. Increasing memory is a retention observation, not automatically a leak; a high rerender count is not automatically expensive; a larger DOM is not automatically a regression; a lower JS heap does not prove lower total application memory. Browser memory tools separate JS memory from OS memory, and DOM/native/PDF resources cannot be judged from the JS heap alone.

Performance findings carry their own provenance: scenario and environment, build/instrumentation mode, fixture size and identity, observation window, baseline/peak/recovered values, repeated-cycle behaviour, measured hotspot or suspected cause, the separate picture, a raw evidence reference, a suggested improvement, and confidence plus limitations. For before/after comparisons keep hardware, fixture, scenario, build mode and instrumentation comparable; if they differ, label the comparison descriptive rather than a verified regression.

Keep the report lightweight too: compact JSON/CSV measurements, thumbnail-sized performance pictures with full-size on demand, large traces and heap dumps kept outside the standalone HTML, detailed artifacts only for the findings that need them, capped collection duration and artifact size, and bounded scalar samples rather than a whole DOM tree on every poll. A Playwright trace explains actions and UI state; it is not a CPU or memory profile.

## Requirement: main-thread responsiveness and web audits

Every full walkthrough records main-thread responsiveness for representative critical interactions on each required runtime/platform: bounded evidence of busy periods, long tasks, rendering work, interaction latency where supported, and responsiveness during expensive operations. Generate separate main-thread timeline and hotspot pictures linked to raw evidence, and distinguish WebView main-thread work from workers, native processing and backend execution. Additionally, run Lighthouse desktop and mobile web audits against the affected entry point using a reproducible production-like setup: preserve Performance, Accessibility and Best Practices reports (plus SEO where applicable) as HTML/JSON artifacts, include separate visual summaries and actionable findings in the walkthrough, and record audit mode and limitations. Lighthouse results never substitute for actual desktop/mobile Tauri execution, interaction profiling, or manual accessibility verification.

Responsiveness recording, per interaction:

| Metric | Required observation |
|---|---|
| Main-thread activity | busy periods aligned with user actions |
| Long tasks | count, duration, longest task, attribution where available |
| Blocking | blocking contribution within the recorded interaction window |
| Rendering work | style recalculation, layout, paint and scripting breakdown |
| Interaction latency | input → handler → visible result, where instrumentation supports it |
| Responsiveness | ability to cancel, scroll, type or navigate during preparation |
| Thread attribution | WebView main thread vs workers vs native work vs backend work |

Tasks over 50 ms are long tasks; their blocking portion is the time beyond 50 ms. Lighthouse's Total Blocking Time uses a particular page-load measurement window — never label an arbitrary interaction-window sum "Lighthouse TBT".

Scenarios to cover for document processing: opening the feature/dialog, changing an expensive setting, starting export/preparation, cancelling while work is underway, switching documents where supported, and repeated open/use/close cycles. Look for expensive synchronous work — PDF serialization, large array conversion, JSON/base64 encoding, excessive component rendering, layout thrash — and name a culprit only when a trace or direct instrumentation supports it.

Pictures to add alongside the DOM/React/memory/CPU ones: a main-thread timeline (named actions, busy tasks, long-task markers, visible completion), a hotspot breakdown (measured scripting/rendering categories or a focused flame-chart capture, linked to the trace), and a responsiveness comparison (comparable before/after interaction durations and blocking observations when a baseline exists). Do not turn a CPU-percentage graph into a main-thread graph, and do not combine worker/backend time with WebView main-thread work. Keep capture bounded: one short representative trace per runtime/platform, escalating only when the evidence shows a problem.

Lighthouse, run against the affected web entry point in both desktop and mobile configurations:

- Use a production-like build; audit one representative affected route per form factor by default.
- Seed authentication and fixture state reproducibly.
- Run it separately from React profiling, screenshots and other collectors.
- Record Lighthouse/Chrome versions, throttling, cache/storage policy, route and build identity.
- Repeat when diagnosing a regression or when results are inconsistent, and preserve the variation instead of picking the best score.
- Store the original HTML and JSON reports outside the main walkthrough HTML.
- Never reload away from the feature and then claim the audit assessed its modal or populated state — use a state-preserving audit workflow, or label the audit as page-entry coverage.

The report gets a dedicated Lighthouse section: audit summary (category scores, environment, route, audit mode), performance diagnostics (LCP, CLS, TBT and the highest-impact findings), accessibility findings (failed checks, affected elements, evidence) and a comparison when base/head conditions are comparable. Embed small previews and link the full artifacts; a score alone is not a finding.

Tauri targets use platform-appropriate collectors and are never substituted with Chromium-only metrics: separate WebView, app/native and backend measurements where available; record emulator/simulator versus physical device; capture native IPC and file-operation spans; include background/resume in mobile resource-lifetime checks; mark unsupported metrics explicitly; escalate to native profiling only when the lightweight evidence needs explaining. Do not compare emulator CPU percentages with physical-device results, or unrelated hosts as before/after.

Limitations to state plainly in the report: a Lighthouse mobile configuration is not an Android/iOS Tauri test; a browser audit of a desktop-mode build is not native desktop profiling; page-load TBT does not establish responsiveness during printing, editing or export; automated accessibility results do not replace keyboard, VoiceOver/TalkBack, focus or native-dialog verification; unavailable native metrics are marked unavailable, not substituted with browser results.

## What this repo gives you (use it, don't reinvent)

- **The stubbed harness.** `frontend/editor/src/core/tests/stubbed/files-page-screenshots.spec.ts` is the reference: light/dark/RTL passes, JWT seeding, IndexedDB seeding, PNGs written to `screenshots/<area>/`. Read it before writing a new spec.
- **Helpers.** `frontend/editor/src/core/tests/helpers/ui-helpers.ts` exports `uploadFiles`, `openSettings`, `waitForModalOpen`, `dismissTourTooltip`; `stub-test-base` provides the `autoGoto`, `seedJwt` and `viewport` fixtures. There is no shared `settle` export — the reference spec defines its own local `settle(page)` for Mantine portals, and so should yours.
- **Config.** `frontend/editor/playwright.config.ts` defines the `stubbed`, `stubbed-desktop`, `stubbed-firefox`, `stubbed-webkit`, `live-setup`, `live` and `enterprise` projects. There is no mobile project: mobile web is the same stubbed project with a mobile viewport and touch enabled.
- **The report template.** `report-template.html` next to this file — self-contained, keyboard navigable, no external assets.
- **The mechanics.** `scripts/report.py` (validate/build/self-test) and `scripts/publish.py` (publish/link), with tests in `scripts/tests/`.
- **Capture output is gitignored.** Root `.gitignore` ignores `frontend/editor/screenshots/`, so generated PNGs never reach a commit.

## Process

### 1. Scope the feature

`git diff --name-only main...HEAD`, then read the changed components. Enumerate every view and state the change touches — not just the happy path: empty, populated, loading, error, each dialog/menu/panel, each breakpoint, both themes, RTL. Write the list down before capturing; it becomes `views[]` and `coverage.expected`.

### 2. Fix the coverage matrix

For each category in the matrix above, decide whether this branch can run it. Record the decision in `coverage.expected`; record the runner you actually used per view in `views[].platform` and `views[].runner`. If a runner is unavailable, say so in the chat summary and leave the category in `expected` without a `captured` entry — the report will mark itself incomplete. Do not silently narrow the scope to desktop web.

### 3. Prepare the harness (worktree-safe)

- Dependencies: `task frontend:install`, or reuse the main checkout's `node_modules` when this is a worktree.
- Dev server: start an **owned** server on an available port (`PORT=<free> task frontend:dev`, or let Playwright's `webServer` do it) and pass that URL to the harness. Never kill whatever happens to own port 5173 — another checkout may be using it, and killing it is destructive.
- This repo's rules still apply: no fixed sleeps in tests, and no committed generated output.

### 4. Write the capture spec

Create `frontend/editor/src/core/tests/stubbed/<feature>-walkthrough.spec.ts` modeled on the reference spec:

- Stub the APIs the feature calls, seed the fixtures, then drive the UI the way a user would.
- Wait for a real condition (`expect(locator)`, `expect.poll`, `waitForFunction`) rather than a timeout; use the local `settle(page)` helper before shooting a Mantine portal.
- Prefer stable test-ids over translated accessible names.
- Shoot each view in `light` and `dark` (and RTL unless `--no-rtl`), naming files `NN_<view>_<theme>.png`.
- Add `--project=stubbed-firefox` / `-webkit` only when cross-browser layout matters.
- Run it: `npx playwright test --project=stubbed <feature>-walkthrough.spec.ts`.

### 5. Record provenance

For every view record what produced the pixels: build mode (`dev`/`production`), whether the build was instrumented, the fixture identity and size, viewport, the runner, the runtime/platform id, and emulator-versus-device where applicable. Unrecorded provenance turns a measurement into an anecdote, and performance numbers in particular are worthless without it.

### 6. Record the performance evidence

Follow the bounded policy above: per runtime/platform, one representative critical interaction plus a short resource-lifetime check, five open/use/close cycles, cheap counters at 500–1,000 ms, a short detailed trace, collectors stopped afterwards. Record the results under `performance.interactions[]` with `metrics` for the seven areas, `provenance`, and one picture per question — timeline, work breakdown, React rendering, resource recovery. Missing metrics stay `unavailable`.

Generate the pictures from the recorded data or capture real profiler views; never synthesize a decorative heatmap that is not backed by measurements. For the work breakdown, show wall-clock phases and CPU attribution separately and never stack overlapping spans into a misleading 100 % chart.

### 7. Record main-thread responsiveness

Record the responsiveness table for the document-processing scenarios above, per runtime/platform, and add the main-thread timeline, hotspot breakdown and responsiveness-comparison pictures. Keep worker, native and backend work out of the WebView main-thread numbers.

### 8. Run the Lighthouse audits

Audit the affected web entry point in desktop and mobile configurations against a production-like build, with auth and fixture state seeded reproducibly. Store the original HTML/JSON reports outside the walkthrough HTML, then add the audit summary, diagnostics, accessibility findings and comparability caveats to the manifest under `lighthouse.runs[]`. State the audit mode and the limitations; a Lighthouse score is never the finding.

### 9. Review pass 1 — visual and consistency

Read every capture and judge: alignment and spacing, control placement, button hierarchy, typography, light/dark parity, text truncation, RTL correctness, focus visibility, icon consistency, general polish. Each finding gets `{severity, view, title, detail, fix}`.

### 10. Review pass 2 — UX, behaviour, accessibility

Judge discoverability, step count, affordances, empty states, error recovery, destructive-action confirmation, defaults, loading feedback, mobile reachability, accessible names, and whether the feature does what it promises. Add behavioural and accessibility findings (`findings.behavior`, `findings.a11y`) — note that automated checks complement, never replace, manual keyboard and screen-reader verification.

### 11. Review pass 3 — performance and native

Turn the recorded evidence into findings under `findings.perf` (and `findings.native` for Tauri-specific evidence). Each one needs its provenance block and a picture or raw-evidence reference — the validator rejects a performance finding without evidence.

### 12. If `--fix`

Apply only safe, self-contained frontend fixes, mark them `fixed: true`, re-run the spec, re-capture the affected views, regenerate the report, and run `task frontend:check`. Never "fix" a finding by editing the report or widening an assertion.

### 13. Build the report

Write the manifest next to the captures, then build and check it:

```bash
python3 .claude/skills/ui-walkthrough/scripts/report.py validate screenshots/<area>/manifest.json
python3 .claude/skills/ui-walkthrough/scripts/report.py build \
  --manifest screenshots/<area>/manifest.json \
  --out screenshots/<area>/walkthrough.html
python3 .claude/skills/ui-walkthrough/scripts/report.py self-test screenshots/<area>/walkthrough.html
```

The builder inlines every image as a `data:` URI and derives rail thumbnails, so the result is one portable file. Image paths in the manifest resolve relative to the manifest itself; `cwebp` or Pillow are used when available to compress, and the builder says so when they are not. `validate` reports missing theme variants, duplicate view ids, findings pointing at views that do not exist, performance findings without evidence, coverage gaps and unprovenanced runs; `self-test` re-reads the built file the way the browser will (one data binding, every required element id, no relative or remote assets, parseable scripts).

The viewer never substitutes one theme for another: if a view has no dark capture it shows an explicit "coverage gap" message, and the rail marks the view. Findings are rendered as text, so quotes and angle brackets in review prose cannot break the report.

### 14. Publish and link (only with `--pr-link`)

```bash
python3 .claude/skills/ui-walkthrough/scripts/publish.py publish \
  --report screenshots/<area>/walkthrough.html --feature "<feature>"
python3 .claude/skills/ui-walkthrough/scripts/publish.py link --pr <n> --raw-url <raw-url>
```

- The report lives on the `ui-walkthrough-reports` branch, which upstream keeps on `origin` in the main checkout but on **`upstream`** in this fork layout — the script takes `--remote` (default `upstream`) and resolves the repository from that remote.
- Publishing is immutable and idempotent: identical bytes reuse the same path and change nothing; different bytes get a content-addressed `-<hash>.html` name instead of overwriting a published file. The script works in a per-run temporary worktree and removes it in a `finally` block — there are no shared `/tmp/ui-wt` or `/tmp/pr-body.md` paths to collide with another run.
- The PR description is only ever touched inside the managed block:

  ```html
  <!-- ui-walkthrough:start -->
  ## UI walkthrough

  - View it rendered: https://htmlpreview.github.io/?<raw-url>
  - Download: <raw-url>
  <!-- ui-walkthrough:end -->
  ```

  Linking upserts that block: it appends when absent, replaces it when it exists, and leaves every other byte of the description alone, so re-running never duplicates the section. The body is read null-safely (`--jq '.body // ""'` — a null body must not be written back as the literal `null`), the body is re-read before the PATCH and the script aborts if someone else edited it in between, and the PATCH is verified by reading the body back.
- Before linking, confirm an open PR exists (`gh pr view --json number -q .number`) and that the raw URL answers 200 and htmlpreview renders.
- **Write policy.** The only permitted writes are the report artifact on the reports branch and the managed block in the intended PR description. Never commit artifacts to the feature branch, and never post a comment, review or reply to the PR — if a bot raises something, fix it in code and stay quiet.

### 15. Deliver

Report the walkthrough path, the coverage status (complete or the exact gaps), the findings by severity, and the published URLs when linked. Keep it short; the report carries the detail.

## Findings schema

Findings live under `findings.{visual,ux,behavior,a11y,perf,native}`:

```json
{
  "severity": "high | med | low",
  "view": "01_empty",
  "title": "short label",
  "detail": "what is wrong and why it matters",
  "fix": "the suggested change",
  "fixed": false,
  "environment": "desktop web, chromium 1xx, 1600x900",
  "build": "production, instrumented",
  "fixture": "12-page PDF, 4.2 MB",
  "window": "idle 5 s + open + close",
  "baseline": "…", "peak": "…", "recovered": "…",
  "repeatedCycles": "…", "cause": "measured hotspot or suspected cause",
  "evidence": "path or URL to the raw measurement",
  "picture": "mainThread",
  "confidence": "high | medium | low",
  "limitations": "what this evidence cannot show"
}
```

Only `severity`, `view` and `title` are always required; the provenance fields are what make a performance, accessibility or native finding usable, and the validator rejects performance findings with neither evidence nor a picture.

## Gotchas

- **Never kill port 5173.** Start an owned dev server on a free port and hand its URL to the harness; another checkout may own 5173.
- **`settle` is local.** The reference spec defines it; `ui-helpers.ts` does not export it. Copy the pattern, don't import what isn't there.
- **Wait for conditions, not clocks.** No `page.waitForTimeout` anywhere — the repo treats fixed waits as flakes.
- **Always `settle(page)` before shooting** a Mantine overlay, or you capture the animation.
- **Don't commit generated output.** `screenshots/` is gitignored; keep it that way, and don't commit the throwaway capture spec unless asked.
- **Never commit the report to the feature branch** — it belongs on `ui-walkthrough-reports` only.
- **A report with relative `<img src>` renders blank through htmlpreview.** Build with inlining (the default) before publishing.
- **An incomplete report must say so.** A missing runner, theme or metric is reported as missing; substituting a proxy (mobile viewport for mobile Tauri, JS heap for total memory, a browser audit for native profiling) is a reporting error, not a shortcut.
- **Photo evidence is not performance evidence.** Screenshots and counters can suggest a problem; only a trace or direct instrumentation can name it.
