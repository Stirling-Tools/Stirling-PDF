/**
 * iOS Tauri adapter: verify-what-exists, capture nothing yet.
 *
 * Same contract as the Android adapter: check host prerequisites — Appium
 * server, `xcrun simctl`, a target UDID — and emit a `blocked` record with
 * the precise gap. Simulator/device identity is recorded, never emulated
 * by a desktop browser; an unverified mobile launch keeps the walkthrough
 * partial by design.
 */
import { execFileSync } from "node:child_process";
import { get } from "node:http";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { CaptureRecord } from "../capture-manifest";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { APPIUM_ENV } from "./tauri-android";

export const IOS_UDID_ENV = "IOS_SIMULATOR_UDID";
const DEFAULT_APPIUM_URL = "http://127.0.0.1:4723";

export interface IosPrereqs {
  appiumUrl: string;
  appiumReachable: boolean;
  simctlPresent: boolean;
  udid: string | null;
}

function probeUrl(url: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const request = get(url, (response) => {
      response.resume();
      resolvePromise(true);
    });
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

/** Host-side prerequisites; never touches a simulator on its own. */
export async function checkIosPrereqs(): Promise<IosPrereqs> {
  const appiumUrl = process.env[APPIUM_ENV] ?? DEFAULT_APPIUM_URL;
  const [appiumReachable, simctlPresent] = await Promise.all([
    probeUrl(`${appiumUrl}/status`),
    Promise.resolve(toolPresent("xcrun", ["simctl", "help"])),
  ]);
  return {
    appiumUrl,
    appiumReachable,
    simctlPresent,
    udid: process.env[IOS_UDID_ENV] ?? null,
  };
}

/**
 * The install/launch/WebView-attach flow lands with the mobile proof; until
 * then every scenario maps to this record so `coverage.expected` keeps
 * `ios-tauri` visible as a gap instead of silently dropping it.
 */
export async function planIosCapture(
  scenarioId: string,
  theme: "light" | "dark" = "light",
): Promise<CaptureRecord> {
  const prereqs = await checkIosPrereqs();
  const missing: string[] = [];
  if (!prereqs.appiumReachable)
    missing.push(`Appium server unreachable at ${prereqs.appiumUrl}`);
  if (!prereqs.simctlPresent) missing.push("xcrun simctl unavailable");
  if (!prereqs.udid)
    missing.push(`${IOS_UDID_ENV} unset (simulator or device UDID)`);
  const reason = missing.length
    ? `iOS adapter scaffolded; mobile launch unverified: ${missing.join("; ")}`
    : "iOS adapter scaffolded; Appium session code lands with the mobile proof";
  return {
    scenarioId,
    runtime: "tauri",
    platform: "ios-tauri",
    execution: prereqs.udid ?? "unresolved-target",
    theme,
    backendMode: "real",
    nativeMode: "real",
    status: "blocked",
    reason,
  };
}
