// WebdriverIO config for the desktop E2E suite.
//
// tauri-driver is a WebDriver shim: it speaks W3C WebDriver to us, launches the
// real Tauri binary, and proxies to the platform's native webview driver
// (WebKitWebDriver on Linux, msedgedriver on Windows). macOS has no WebDriver
// for WKWebView, so this suite is Linux + Windows only.
//
// Playwright cannot drive these webviews - it speaks CDP/its own protocol, not
// WebDriver classic - which is why the desktop suite uses WebdriverIO while the
// browser suites stay on Playwright.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isWindows, resolveAppBinary } from "./lib/app-binary.mjs";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const exe = isWindows ? ".exe" : "";
const appBinary = resolveAppBinary();

// Spawned without a shell so the returned pid is tauri-driver itself. Going
// through cmd.exe on Windows would give us the shell's pid, and killing that
// leaves tauri-driver (and the webview driver it owns) running forever - which
// hangs the run at teardown. `cargo install` puts it in the cargo bin dir;
// fall back to PATH for anyone who installed it elsewhere.
function resolveTauriDriver() {
  const cargoBin = join(
    process.env.CARGO_HOME || join(homedir(), ".cargo"),
    "bin",
    `tauri-driver${exe}`,
  );
  return existsSync(cargoBin) ? cargoBin : `tauri-driver${exe}`;
}

let tauriDriver;

export const config = {
  runner: "local",
  // tauri-driver is already running as a plain WebDriver server on this port,
  // so wdio must attach to it rather than manage a browser driver itself.
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",

  // Nested array = one session shared by both specs, run in this order. That
  // is required, not just an optimisation: the app registers
  // tauri-plugin-single-instance, so a second launch while the first is still
  // shutting down hands off to the old instance and exits immediately. Sharing
  // a session also means we pay the Spring Boot cold start only once.
  // Order matters: backend-sidecar blocks until the bundled backend reports a
  // port, so the UI spec after it can assume the backend is reachable instead
  // of racing Spring Boot's cold start.
  specs: [
    [
      join(e2eDir, "specs", "app-boot.e2e.js"),
      join(e2eDir, "specs", "backend-sidecar.e2e.js"),
      join(e2eDir, "specs", "frontend-tool-run.e2e.js"),
    ],
  ],

  // The app owns a single OS window and a single bundled backend; running
  // sessions concurrently would have them fight over both.
  maxInstances: 1,
  capabilities: [
    {
      browserName: "wry",
      "tauri:options": {
        application: appBinary,
      },
      // WebdriverIO prefers WebDriver BiDi where the driver advertises it
      // (msedgedriver does). BiDi evaluates scripts in its own realm, and
      // Tauri's IPC rejects invokes from there with "Origin header is not a
      // valid URL" - so every window.__TAURI_INTERNALS__.invoke() fails. The
      // classic executeScript endpoint runs in the page's real realm and works.
      // WebKitWebDriver has no BiDi anyway, so this also keeps Linux and
      // Windows on the same code path.
      "wdio:enforceWebDriverClassic": true,
    },
  ],

  // Per-worker logs on disk so a CI failure can be inspected after the fact.
  outputDir: join(e2eDir, "logs"),
  logLevel: "info",
  bail: 0,
  waitforTimeout: 30_000,
  connectionRetryTimeout: 180_000,
  connectionRetryCount: 3,

  // Jasmine rather than Mocha: same describe/it surface, but Mocha's tree
  // carries unpatched advisories (serialize-javascript) that dependency-review
  // fails the PR on, and its only "fix" is a major downgrade of the wdio
  // framework adapter.
  framework: "jasmine",
  reporters: ["spec"],
  jasmineOpts: {
    // The bundled JRE + Spring Boot cold start dominates: on a cold CI runner
    // the backend can take well over a minute to report its port.
    defaultTimeoutInterval: 240_000,
  },

  onPrepare: () => {
    const args = ["--port", "4444"];
    // Windows runners ship msedgedriver at a fixed path but do not put it on
    // PATH; Linux gets WebKitWebDriver on PATH from the webkit2gtk-driver
    // package, so the override is optional there.
    if (process.env.TAURI_DRIVER_NATIVE) {
      args.push("--native-driver", process.env.TAURI_DRIVER_NATIVE);
    }

    const bin = resolveTauriDriver();
    console.log(`Launching ${bin} ${args.join(" ")}`);
    console.log(`Application under test: ${appBinary}`);

    tauriDriver = spawn(bin, args, {
      stdio: ["ignore", "inherit", "inherit"],
    });

    tauriDriver.on("error", (error) => {
      console.error("tauri-driver failed to start:", error);
      process.exit(1);
    });
  },

  onComplete: () => {
    // Without this the driver keeps the webview driver (and the app) alive and
    // the run never exits after the last spec.
    if (!tauriDriver?.pid) return;

    if (isWindows) {
      // tauri-driver spawns msedgedriver as a child; a plain kill() leaves it
      // orphaned and holding the port, so tear down the whole tree.
      spawnSync("taskkill", ["/pid", String(tauriDriver.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      tauriDriver.kill();
    }
  },
};
