# Desktop E2E

Tests that run the **real built desktop app** - the Tauri shell, its webview,
and the bundled JRE running the Stirling JAR.

Two suites, because tauri-driver has no macOS backend:

| Suite     | Command              | Runs on              | What it drives                                             |
| --------- | -------------------- | -------------------- | ---------------------------------------------------------- |
| **smoke** | `task desktop:smoke` | Linux, Windows, macOS | Launches the binary, reads the backend port off its stdout, runs real tools over HTTP |
| **ui**    | `task desktop:e2e`   | Linux, Windows        | Drives the real webview through `tauri-driver`               |

## What each one is for

**smoke** is where per-platform *runtime* bugs surface, and it is the only
desktop coverage macOS can have. Everything it calls goes through the bundled
jlink JRE running the bundled JAR, so it catches a runtime missing a module (the
`jdk.dynalink` regression), a JRE older than the JAR's class-file version, and
JPDFium natives that were never published for this OS/arch. It needs no npm
install - the runner is plain Node.

- `rotate-pdf` - a pure-PDFBox tool: proves an ordinary server tool works end to end.
- `merge-pdfs` - goes through `stirling.software.jpdfium.PdfMerge`, which
  rethrows any native failure rather than falling back to PDFBox, so a 200 here
  means the platform's JPDFium native loaded and ran.

**ui** covers what only breaks in the packaged webview: the window opens, the
frontend actually mounts (rather than the blank window of #6878), the navigation
guard holds, Tauri IPC answers, and a tool runs end to end from the UI -
workbench → IndexedDB → the bundled backend → review panel.

## How this fits the rest of the suite

| Layer                 | Where                             | What it proves                         |
| --------------------- | --------------------------------- | -------------------------------------- |
| Rust unit/integration | `editor/src-tauri/{src,tests}`    | Rust command logic                     |
| Desktop TS units      | `editor/src/desktop/**/*.test.ts` | The frontend's desktop seams           |
| **Desktop E2E**       | `frontend/desktop-e2e`            | The bundle actually launches and works |
| Browser E2E           | `editor/src/core/tests`           | Product UI in a browser (Playwright)   |

Keep specs here focused on things that can only break in the packaged app.
Product behaviour belongs in the Playwright suites, which run far faster.

## Why WebdriverIO and not Playwright

Playwright cannot attach to WebKitGTK or WebView2 as embedded in a Tauri app -
it speaks CDP and its own protocols, not WebDriver classic.
[`tauri-driver`](https://v2.tauri.app/develop/tests/webdriver/) is a WebDriver
server that launches the app binary and proxies to the platform's native webview
driver, so the UI suite has to use a WebDriver client.

| Platform | UI suite | Native driver                              |
| -------- | -------- | ------------------------------------------ |
| Linux    | yes      | `WebKitWebDriver` (`webkit2gtk-driver`)    |
| Windows  | yes      | `msedgedriver` matching the WebView2 build |
| macOS    | **no**   | Apple ships no WebDriver for WKWebView     |

## Running locally

```bash
task desktop:build:dev
task desktop:smoke
task desktop:e2e
```

`desktop:build:dev` produces a non-bundled release binary under
`editor/src-tauri/target/release/` with the jlink runtime and JAR staged
alongside it - enough to launch, without paying for MSI/dmg packaging.

On Windows, point the UI suite at a matching Edge driver if it is not on `PATH`:

```bash
TAURI_DRIVER_NATIVE="C:/SeleniumWebDrivers/EdgeDriver/msedgedriver.exe" task desktop:e2e
```

Other environment variables:

- `STIRLING_APP_BINARY` - test a specific binary instead of the discovered one.
- `SMOKE_TIMEOUT_MS` - how long the smoke runner waits for the backend port.

## Adding specs

UI specs share a single WebDriver session, and therefore a single app process,
because the app registers `tauri-plugin-single-instance` - a second launch hands
off to the first and exits. Add new files to the spec group in `wdio.conf.mjs`
rather than relying on a glob; the group order matters, since
`backend-sidecar.e2e.js` is what blocks until the backend is reachable.

## Why this lives here and not under `editor/`

Tauri resolves its "app directory" by recursively searching under `src-tauri`'s
parent for a `package.json`. A `package.json` anywhere below `frontend/editor`
therefore wins that search, and `tauri build` runs `beforeBuildCommand` from it -
so the vite build dies with `Could not resolve entry module "index.html"`.
Keeping this package a sibling of `editor/` avoids that entirely.
