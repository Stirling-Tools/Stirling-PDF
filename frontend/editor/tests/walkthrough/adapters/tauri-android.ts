/**
 * Android Tauri adapter: verify-what-exists, capture nothing yet.
 *
 * Mobile launch, backend and plugin compatibility are unverified for this
 * repo (the Tauri config is desktop-oriented), so this adapter checks host
 * prerequisites — Appium server, `adb`, a target serial — and emits a
 * `blocked` record with the precise gap. Chrome mobile emulation and
 * Playwright WebKit are never substitutes; when this adapter cannot launch
 * the installed app, the walkthrough stays partial by design.
 */
import { execFileSync } from "node:child_process";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { CaptureRecord } from "../capture-manifest";

export const APPIUM_ENV = "APPIUM_SERVER_URL";
export const ANDROID_SERIAL_ENV = "ANDROID_SERIAL";
const DEFAULT_APPIUM_URL = "http://127.0.0.1:4723";

export interface MobilePrereqs {
  appiumUrl: string;
  appiumReachable: boolean;
  adbPresent: boolean;
  serial: string | null;
}

function probeUrl(url: string, timeoutMs = 3000): Promise<boolean> {
  let get: typeof httpGet;
  try {
    get = new URL(url).protocol === "https:" ? httpsGet : httpGet;
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolvePromise) => {
    let request: ReturnType<typeof httpGet>;
    try {
      request = get(url, (response) => {
        response.resume();
        resolvePromise(true);
      });
    } catch {
      resolvePromise(false);
      return;
    }
    request.on("error", () => resolvePromise(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolvePromise(false);
    });
  });
}

function toolPresent(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Host-side prerequisites; never launches anything on its own. */
export async function checkAndroidPrereqs(): Promise<MobilePrereqs> {
  const appiumUrl = process.env[APPIUM_ENV] ?? DEFAULT_APPIUM_URL;
  const [appiumReachable, adbPresent] = await Promise.all([
    probeUrl(`${appiumUrl}/status`),
    Promise.resolve(toolPresent("adb", ["version"])),
  ]);
  return {
    appiumUrl,
    appiumReachable,
    adbPresent,
    serial: process.env[ANDROID_SERIAL_ENV] ?? null,
  };
}

/**
 * The launch/install/WebView-attach flow lands with the mobile proof; until
 * then every scenario maps to this record so `coverage.expected` keeps
 * `android-tauri` visible as a gap instead of silently dropping it.
 */
export async function planAndroidCapture(
  scenarioId: string,
  theme: "light" | "dark" = "light",
): Promise<CaptureRecord> {
  const prereqs = await checkAndroidPrereqs();
  const missing: string[] = [];
  if (!prereqs.appiumReachable)
    missing.push(`Appium server unreachable at ${prereqs.appiumUrl}`);
  if (!prereqs.adbPresent) missing.push("adb not on PATH");
  if (!prereqs.serial)
    missing.push(`${ANDROID_SERIAL_ENV} unset (emulator or device serial)`);
  const reason = missing.length
    ? `Android adapter scaffolded; mobile launch unverified: ${missing.join("; ")}`
    : "Android adapter scaffolded; Appium session code lands with the mobile proof";
  return {
    scenarioId,
    runtime: "tauri",
    platform: "android-tauri",
    execution: prereqs.serial ?? "unresolved-target",
    theme,
    backendMode: "real",
    nativeMode: "real",
    status: "blocked",
    reason,
  };
}
