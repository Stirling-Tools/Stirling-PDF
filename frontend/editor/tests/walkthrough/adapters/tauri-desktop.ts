/**
 * Desktop Tauri adapter: launch the real built application, wait for
 * readiness, screenshot, and record environment-identity captures.
 *
 * Fail-closed rules: a missing binary, an already-running instance, or an
 * unreadable window all abort the run — the adapter never falls back to
 * `vite`, never kills the user's app, and never touches normal app data.
 * The module imports only node builtins plus the manifest types, so it can
 * be unit-checked without a browser; scenarios pass the WDIO `browser`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { hostPlatformId, type CaptureRecord } from "../capture-manifest";

export const TAURI_BINARY_ENV = "TAURI_APP_BINARY";
const WINDOWS_EXE = "stirling-pdf.exe";
const UNIX_BIN = "stirling-pdf";
const MACOS_BUNDLE_BIN = "Stirling PDF.app/Contents/MacOS/Stirling-PDF";

/** Minimal surface the adapter needs; satisfied by the WDIO `browser`. */
export interface DesktopBrowser {
  getTitle(): Promise<string>;
  waitUntil(
    condition: () => Promise<boolean>,
    options?: { timeout?: number; timeoutMsg?: string },
  ): Promise<boolean>;
  saveScreenshot(path: string): Promise<unknown>;
  execute(script: () => unknown): Promise<unknown>;
}

export function srcTauriDir(from = __dirname): string {
  return resolve(from, "..", "..", "..", "src-tauri");
}

/** Candidate executables, debug before release; env override wins. */
export function candidateBinaries(srcTauri = srcTauriDir()): string[] {
  const override = process.env[TAURI_BINARY_ENV];
  const target = (profile: string, binary: string): string =>
    join(srcTauri, "target", profile, binary);
  // Debug first: captures are built with `cargo build --features
  // ui-walkthrough` (debug). A release binary is usually a normal build
  // without the embedded WebDriver plugin, so preferring it would hand WDIO
  // an app it cannot drive.
  const perOs =
    process.platform === "win32"
      ? [target("debug", WINDOWS_EXE), target("release", WINDOWS_EXE)]
      : process.platform === "darwin"
        ? [
            target("debug", UNIX_BIN),
            target("release", UNIX_BIN),
            join(
              srcTauri,
              "target",
              "release",
              "bundle",
              "macos",
              MACOS_BUNDLE_BIN,
            ),
          ]
        : [target("debug", UNIX_BIN), target("release", UNIX_BIN)];
  return override ? [override, ...perOs] : perOs;
}

/**
 * Marker literal `tauri-plugin-wdio-webdriver` injects into its per-platform
 * scripts (`macos.rs`, `linux.rs`, `windows.rs`), so it is linked into any
 * binary carrying the plugin. The `ui-walkthrough` feature is the only thing
 * that pulls the plugin in, so its absence means the binary hosts no
 * WebDriver server, whatever profile it was built in.
 */
const WEBDRIVER_MARKER = "__wd_el_";

function assertCaptureBuild(binary: string): void {
  let built: boolean;
  try {
    built = readFileSync(binary).includes(WEBDRIVER_MARKER);
  } catch (error) {
    throw new Error(
      `Could not read ${binary} to verify it is a capture build: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (!built) {
    throw new Error(
      `${binary} was not built with the ui-walkthrough feature, so it hosts ` +
        `no WebDriver server. Rebuild it ` +
        `(cd frontend/editor/src-tauri && cargo build --features ui-walkthrough) ` +
        `or point ${TAURI_BINARY_ENV} at a capture build.`,
    );
  }
}

/**
 * Explicit override, else the debug-first candidates. The resolved file must
 * exist and be a capture build: a missing override fails the run instead of
 * silently capturing some other build than the operator selected, and a
 * binary without the plugin fails here rather than inside WDIO.
 */
export function resolveTauriBinary(srcTauri = srcTauriDir()): string {
  const override = process.env[TAURI_BINARY_ENV];
  if (override) {
    if (!existsSync(override)) {
      throw new Error(
        `TAURI_APP_BINARY points at a missing file: ${override}. ` +
          `Build it first ` +
          `(cd frontend/editor/src-tauri && cargo build --features ui-walkthrough) ` +
          `or fix the path. Searched: ${override}`,
      );
    }
    assertCaptureBuild(override);
    return override;
  }
  const candidates = candidateBinaries(srcTauri);
  const hit = candidates.find((path) => existsSync(path));
  if (!hit) {
    throw new Error(
      `No Tauri binary found. Build it first ` +
        `(cd frontend/editor/src-tauri && cargo build --features ui-walkthrough) ` +
        `or set ${TAURI_BINARY_ENV}. Searched: ${candidates.join(", ")}`,
    );
  }
  assertCaptureBuild(hit);
  return hit;
}

/** Process names the app runs under; `pgrep -x` compares names, not command
 * lines, so a checkout path containing "Stirling-PDF" cannot match the WDIO
 * launcher itself. */
const APP_PROCESS_NAMES = ["stirling-pdf", "Stirling-PDF"];
const ALREADY_RUNNING =
  "A Stirling-PDF instance is already running; close it before capturing.";

/** `pgrep` exits 1 when nothing matched, which is the answer we want here. */
function processRunning(name: string): boolean {
  try {
    const out = execFileSync("pgrep", ["-x", name], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim().length > 0;
  } catch (error) {
    if ((error as { status?: number }).status === 1) return false;
    throw error;
  }
}

/**
 * Abort when an app instance is already running: the single-instance plugin
 * would route our launch into it, so any capture would show the wrong
 * session. Never kills — the user closes their app, then re-runs.
 */
export function ensureNoRunningInstance(): void {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "tasklist",
        ["/FI", "IMAGENAME eq stirling-pdf.exe"],
        {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      if (/stirling-pdf\.exe/i.test(out)) {
        throw new Error(ALREADY_RUNNING);
      }
      return;
    }
    if (APP_PROCESS_NAMES.some(processRunning)) {
      throw new Error(ALREADY_RUNNING);
    }
  } catch (error) {
    if (error instanceof Error && /already running/.test(error.message))
      throw error;
    // The check tool itself is unavailable; readiness still guards the run.
    console.warn(
      `[tauri-desktop] instance check unavailable: ${(error as Error).message}`,
    );
  }
}

/** Readiness is a titled main window, not merely a spawned process. */
export async function waitForReady(
  browser: DesktopBrowser,
  timeoutMs = 60_000,
): Promise<string> {
  await browser.waitUntil(
    async () => (await browser.getTitle()).trim().length > 0,
    {
      timeout: timeoutMs,
      timeoutMsg: "Tauri main window never gained a title",
    },
  );
  return browser.getTitle();
}

export interface DesktopCaptureOptions {
  scenarioId: string;
  outDir: string;
  theme: "light" | "dark";
  direction?: "ltr" | "rtl";
  fileName?: string;
}

/** Screenshot into `captures/tauri-<platform>/` with its identity record. */
export async function captureDesktop(
  browser: DesktopBrowser,
  options: DesktopCaptureOptions,
): Promise<CaptureRecord> {
  const { scenarioId, outDir, theme, direction = "ltr", fileName } = options;
  const platform = hostPlatformId();
  mkdirSync(outDir, { recursive: true });
  const image = join(outDir, fileName ?? `${scenarioId}-${theme}.png`);
  await browser.saveScreenshot(image);
  return {
    scenarioId,
    runtime: "tauri",
    platform: `tauri-${platform}`,
    execution: "host",
    theme,
    direction,
    backendMode: "real",
    nativeMode: "real",
    status: "captured",
    image,
  };
}

export interface WebviewPerfSnapshot {
  domNodes: number | null;
  jsHeapBytes: number | null;
  longTasks: number | null;
  unavailable: string[];
}

/** Bounded longtask observation window. Deliberate measurement, not a UI sleep. */
const LONGTASK_OBSERVE_MS = 2000;

interface LongtaskProbe {
  __wtLongtasks?: number[];
  __wtLongtaskObserver?: { disconnect(): void };
}

/**
 * Arm a `longtask` PerformanceObserver in the page. `longtask` entries are
 * observer-only: reading them back with `getEntriesByType` reports zero
 * even while the page janks, so a zero from that call is a lie. Returns
 * false when the WebView cannot observe `longtask` at all.
 */
async function startLongtaskObservation(
  browser: DesktopBrowser,
): Promise<boolean> {
  const started = await browser.execute(() => {
    const probe = window as unknown as Window & LongtaskProbe;
    try {
      if (typeof PerformanceObserver === "undefined") return false;
      const supported = (
        PerformanceObserver as unknown as {
          supportedEntryTypes?: string[];
        }
      ).supportedEntryTypes;
      if (Array.isArray(supported) && !supported.includes("longtask"))
        return false;
      probe.__wtLongtasks = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          probe.__wtLongtasks?.push(entry.duration);
      });
      // Not `buffered`: every snapshot arms a fresh array, and buffering
      // would replay each task since page load into it, counting the same
      // jank again in every later snapshot.
      observer.observe({ type: "longtask" });
      probe.__wtLongtaskObserver = observer;
      return true;
    } catch {
      return false;
    }
  });
  return started === true;
}
/**
 * One bounded WebView snapshot via plain WebDriver execute (no plugin
 * needed). Native/process memory is not visible from here and stays
 * `unavailable` — a browser number must never stand in for it.
 */
export async function snapshotWebviewPerf(
  browser: DesktopBrowser,
): Promise<WebviewPerfSnapshot> {
  const unavailable: string[] = [
    "native/process memory (not visible to WebDriver)",
  ];
  let domNodes: number | null = null;
  let jsHeapBytes: number | null = null;
  let longTasks: number | null = null;
  let observing = false;
  try {
    observing = await startLongtaskObservation(browser);
  } catch (error) {
    unavailable.push(`WebView execute failed: ${(error as Error).message}`);
    return { domNodes, jsHeapBytes, longTasks, unavailable };
  }
  if (!observing) {
    unavailable.push("long tasks (WebView reports no longtask observer)");
  } else {
    await new Promise((resolve) => setTimeout(resolve, LONGTASK_OBSERVE_MS));
  }
  try {
    const sample = (await browser.execute(() => {
      const probe = window as unknown as Window & LongtaskProbe;
      let tasks: number | null = null;
      try {
        probe.__wtLongtaskObserver?.disconnect();
      } catch {
        /* a dead observer still leaves whatever it already recorded */
      }
      if (Array.isArray(probe.__wtLongtasks))
        tasks = probe.__wtLongtasks.length;
      probe.__wtLongtasks = [];
      probe.__wtLongtaskObserver = undefined;
      return {
        nodes: document.getElementsByTagName("*").length,
        heap:
          typeof (
            performance as Performance & {
              memory?: { usedJSHeapSize?: number };
            }
          ).memory?.usedJSHeapSize === "number"
            ? (
                performance as Performance & {
                  memory: { usedJSHeapSize: number };
                }
              ).memory.usedJSHeapSize
            : null,
        tasks,
      };
    })) as { nodes?: unknown; heap?: unknown; tasks?: unknown } | null;
    if (sample && typeof sample.nodes === "number") domNodes = sample.nodes;
    if (sample && typeof sample.heap === "number") jsHeapBytes = sample.heap;
    else unavailable.push("JS heap (WebView exposes no memory API)");
    if (observing && sample && typeof sample.tasks === "number")
      longTasks = sample.tasks;
  } catch (error) {
    unavailable.push(`WebView execute failed: ${(error as Error).message}`);
  }
  return { domNodes, jsHeapBytes, longTasks, unavailable };
}
