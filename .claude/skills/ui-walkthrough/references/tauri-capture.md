# Tauri capture adapters

Native execution is the point: `vite --mode desktop` tests desktop frontend
code, but does not establish that the Tauri application works. Desktop
captures must launch the actual Tauri application; Android and iOS captures
must run installed applications on recorded emulators/simulators or devices.
A missing runner produces blocked coverage and a partial report — never a
browser proxy passed off as native evidence.

## Responsibilities

| Part | Responsibility |
|---|---|
| Skill | Decide scenarios, run captures, review evidence |
| Adapter | Launch, interact, screenshot, collect logs, clean up |
| Scenario | Preconditions, actions, expected result |
| Manifest | Runtime/platform provenance and evidence |
| Report builder | Display web/native captures without substitution |

`frontend/editor/tests/walkthrough/` holds the harness. Scenario files use
the `.scenario.ts` suffix (not `.spec.ts`) so neither vitest nor the
Playwright projects pick them up; only `wdio.desktop.conf.ts` runs them.

## Desktop: WebdriverIO with the embedded provider

Pinned versions (do not mix major lines): the WDIO v9 line — `@wdio/cli`,
`@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter` at
9.x — because `@wdio/tauri-service` 1.x declares `webdriverio: ^9.0.0` as a
peer. WDIO 10 exists but breaks that peer range. Verified against the
[Tauri service docs](https://webdriver.io/docs/desktop-testing/tauri/) and
the [configuration reference](https://webdriver.io/docs/desktop-testing/tauri/configuration/).

Only the embedded WebDriver plugin is installed:

```toml
[features]
ui-walkthrough = ["dep:tauri-plugin-wdio-webdriver"]

[dependencies]
tauri-plugin-wdio-webdriver = { version = "1", optional = true }
```

```rust
#[cfg(feature = "ui-walkthrough")]
let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
```

The richer `tauri-plugin-wdio` / `@wdio/tauri-plugin` pair (execute API,
mocking, log forwarding) is deliberately NOT installed: it needs
`wdio:default` permissions, `withGlobalTauri`, and a frontend import, which
expands the permission surface of every build that carries it. Basic
WebDriver operations — launch, click, type, screenshot — work without it.
Prove the minimum setup with the pinned versions before adding anything.

Its automation permission (`wdio-webdriver:default`, which grants no IPC
permissions — the plugin is an in-process HTTP server, not a command
surface) does NOT live in the committed tree: Tauri resolves every file in
`capabilities/` for every build, so listing it unconditionally breaks
normal builds once the optional dependency is compiled out (verified:
`cargo check` fails with `Permission wdio-webdriver:default not found`).
`capabilities/ui-walkthrough.json` therefore ships with empty permissions;
a capture build adds the one line locally (never committed):

```json
"permissions": ["wdio-webdriver:default"]
```

then builds with the feature:

```bash
cd frontend/editor/src-tauri && cargo build --features ui-walkthrough
```

The service launches `%TAURI_APP_BINARY%` (or the per-OS default the
adapter resolves) with `driverProvider: "embedded"`. Build the app first
(after the one-line permission edit above):

```bash
cd frontend/editor/src-tauri && cargo build --features ui-walkthrough
```

## Launch rules (all desktop adapters)

- Resolve the executable from the real Cargo target directory
  (`target/{release,debug}/stirling-pdf[.exe]`, macOS bundle second); a
  missing binary fails the run before launch — never fall back to `vite`.
- Account for Windows/macOS/Linux paths in the adapter, not in the scenario.
- Use the existing desktop frontend build hook (`vite build --mode desktop`).
- Wait for application readiness (a titled main window), not process spawn.
- Never kill a running user instance: the adapter fails closed when one is
  detected, because the single-instance plugin would route the launch into
  it. Close the app first, then re-run.
- Never touch the user's normal application data.

## Scenario rules

One end-to-end proof first: launch → open the fixture → open the changed
feature → assert state → screenshot → close cleanly. Before each shot: seed
the known fixture, assert the expected document and settings, wait for
rendering/fonts, clear stray tooltips and onboarding overlays, capture, then
record environment and result. Separate fresh sessions for light/dark/RTL.
`page.route()` and init-script fixtures do not transfer to WDIO — re-seed
per runtime. Native dialogs need OS-level screenshots or a native automation
layer; a WebView capture alone does not establish what the OS sheet showed.

## Mobile: Appium, separate adapters

The desktop service is not a mobile solution. Android uses an installed app
plus emulator/device plus Appium UiAutomator2; iOS uses an installed app
plus simulator/device plus Appium XCUITest. The mobile adapters verify what
they can today — Appium server reachability, `adb` / `simctl` presence,
target identity — and emit `blocked` records otherwise. The repo's Tauri
config is desktop-oriented (desktop bundle targets, JAR/JRE resources,
desktop deep links), so mobile launch, backend and plugin compatibility must
be verified before any mobile capture is claimed. Chrome mobile emulation
and Playwright WebKit are never substitutes.

## Manifest records

Every capture carries its environment identity; web views keep their
`light`/`dark` fields and gain a `captures[]` list:

```json
{
  "scenarioId": "print-dialog-standard",
  "runtime": "tauri",
  "platform": "macos",
  "execution": "host",
  "theme": "dark",
  "direction": "ltr",
  "backendMode": "real",
  "nativeMode": "real",
  "status": "captured",
  "image": "captures/tauri-macos/standard-dark.webp"
}
```

`status` is `captured`, `missing`, or `blocked` (with `reason`). The viewer
groups Web / Tauri desktop / Tauri mobile, shows build/source identity and
blocked indicators, and never substitutes across runtimes, platforms, or
themes. `coverage.expected` lists every required runtime; anything without a
`captured` entry renders the report incomplete.

## Performance evidence

One bounded representative interaction per platform, recorded separately
from screenshot encoding: DOM baseline/peak/recovery, scoped React
commit/render cost where supported, JS heap where supported, native/process
memory separately, CPU observations, main-thread long tasks with a short
hotspot trace, IPC/file-operation spans, and cleanup after repeated cycles.
Unavailable metrics are `unavailable`, never `0`. Lighthouse stays in the
web section; it does not replace native evidence.
