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
import { existsSync, mkdirSync } from "node:fs";
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

/** Candidate executables, release before debug; env override wins. */
export function candidateBinaries(srcTauri = srcTauriDir()): string[] {
  const override = process.env[TAURI_BINARY_ENV];
  const target = (profile: string, binary: string): string =>
    join(srcTauri, "target", profile, binary);
  const perOs =
    process.platform === "win32"
      ? [target("release", WINDOWS_EXE), target("debug", WINDOWS_EXE)]
      : process.platform === "darwin"
        ? [
            target("release", UNIX_BIN),
            target("debug", UNIX_BIN),
            join(
              srcTauri,
              "target",
              "release",
              "bundle",
              "macos",
              MACOS_BUNDLE_BIN,
            ),
          ]
        : [target("release", UNIX_BIN), target("debug", UNIX_BIN)];
  return override ? [override, ...perOs] : perOs;
}

/** First existing candidate, else throw listing every path searched. */
export function resolveTauriBinary(srcTauri = srcTauriDir()): string {
  const candidates = candidateBinaries(srcTauri);
  const hit = candidates.find((path) => existsSync(path));
  if (!hit) {
    throw new Error(
      `No Tauri binary found. Build it first ` +
        `(cd frontend/editor/src-tauri && cargo build --features ui-walkthrough) ` +
        `or set ${TAURI_BINARY_ENV}. Searched: ${candidates.join(", ")}`,
    );
  }
  return hit;
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
        throw new Error(
          "A Stirling-PDF instance is already running; close it before capturing.",
        );
      }
      return;
    }
    const out = execFileSync("pgrep", ["-af", "stirling-pdf|Stirling-PDF"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (out.trim()) {
      throw new Error(
        "A Stirling-PDF instance is already running; close it before capturing.",
      );
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
  try {
    const sample = (await browser.execute(() => ({
      nodes: document.getElementsByTagName("*").length,
      heap:
        typeof (
          performance as Performance & { memory?: { usedJSHeapSize?: number } }
        ).memory?.usedJSHeapSize === "number"
          ? (
              performance as Performance & {
                memory: { usedJSHeapSize: number };
              }
            ).memory.usedJSHeapSize
          : null,
      tasks: performance.getEntriesByType("longtask").length,
    }))) as { nodes?: unknown; heap?: unknown; tasks?: unknown } | null;
    if (sample && typeof sample.nodes === "number") domNodes = sample.nodes;
    if (sample && typeof sample.heap === "number") jsHeapBytes = sample.heap;
    else unavailable.push("JS heap (WebView exposes no memory API)");
    if (sample && typeof sample.tasks === "number") longTasks = sample.tasks;
  } catch (error) {
    unavailable.push(`WebView execute failed: ${(error as Error).message}`);
  }
  return { domNodes, jsHeapBytes, longTasks, unavailable };
}
