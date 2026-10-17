/**
 * Lighthouse runner (desktop + mobile) for the walkthrough's web entry point.
 *
 * The binary is resolved, never assumed: Google's `lighthouse` is a project
 * dependency only if someone added one, and on a developer machine a
 * same-named unrelated tool may be first on `PATH`. When no Lighthouse CLI is
 * found the runner fails closed with a reason, and the report marks the audits
 * missing rather than inventing scores.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { appApiStubs } from "@app/tests/helpers/api-stubs";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  backendLimitations,
  errorStateNote,
  type BackendState,
} from "./backend";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { FormFactor, LighthouseRun } from "./types";

export interface LighthouseOptions {
  url: string;
  route: string;
  platform: string;
  /** How the audited build was produced; recorded verbatim. */
  mode: string;
  outDir: string;
  /** Lighthouse executable; resolved to the project binary when omitted. */
  binary?: string;
  /** Chrome binary for Lighthouse; falls back to LH's own discovery. */
  chromePath?: string;
  /** Whether the audited route's own backend answered before the audit. */
  backend: BackendState;
  /**
   * How long the trace stays open after the load event (`pauseAfterLoadMs`).
   * The app clears its i18next splash after load, so the 1000 ms Lighthouse
   * default screenshots the loading screen instead of the route.
   */
  settleMs: number;
  timeoutMs?: number;
}

export interface LighthouseResult {
  runs: LighthouseRun[];
  unavailable: string[];
  notes: string[];
}

const AUDIT_IDS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
  "interactive",
] as const;

/**
 * Why an audit of an erroring page is not a measurement. Reaching this means
 * neither a live backend nor the repo's stub backend answered the dev server.
 * The audit still runs when `--lighthouse-force` asks for it: its scores then
 * carry the error-state caveat in their diagnostics.
 */
export function backendSkipReason(backend: BackendState): string {
  return (
    `Lighthouse: skipped — ${backend.endpoint} ${backend.detail}, and the repo's ` +
    `API stubs could not stand in for it, so an audit would score the error ` +
    `screen instead of the feature (--lighthouse-force audits it anyway)`
  );
}

export const DEFAULT_SETTLE_MS = 5_000;

/**
 * Lighthouse's desktop preset, repeated because `--config-path` makes the CLI
 * ignore `--preset=desktop`. Values mirror `core/config/desktop-config.js` of
 * the installed Lighthouse.
 */
const DESKTOP_PRESET = {
  formFactor: "desktop",
  throttling: {
    rttMs: 40,
    throughputKbps: 10_240,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
  screenEmulation: {
    mobile: false,
    width: 1350,
    height: 940,
    deviceScaleFactor: 1,
    disabled: false,
  },
  emulatedUserAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
};

/**
 * The Lighthouse config an audit runs with. `pauseAfterLoadMs` is the only wait
 * the CLI offers past the load event, and it is the difference between a
 * screenshot of the route and a screenshot of the app's splash.
 */
export function settleConfigModule(
  settleMs: number,
  formFactor: FormFactor,
): string {
  const settings: Record<string, unknown> = { pauseAfterLoadMs: settleMs };
  // The mobile defaults are already Lighthouse's own: only desktop has to be
  // stated, since the preset it came from is bypassed.
  if (formFactor === "desktop") Object.assign(settings, DESKTOP_PRESET);
  const body = JSON.stringify(settings, null, 2).split("\n").join("\n  ");
  return [
    "// Generated per audit by the perf harness; see settleConfigModule.",
    "module.exports = {",
    '  extends: "lighthouse:default",',
    `  settings: ${body},`,
    "};",
    "",
  ].join("\n");
}

/** Writes the audit config for one form factor and returns its absolute path. */
export function writeSettleConfig(
  outDir: string,
  formFactor: FormFactor,
  settleMs: number,
): string {
  const path = resolve(outDir, `lighthouse-${formFactor}-config.cjs`);
  writeFileSync(path, settleConfigModule(settleMs, formFactor));
  return path;
}

/**
 * A screenshot of the audited route, taken by the harness.
 *
 * Lighthouse's `final-screenshot` comes from the trace's screenshot frames,
 * which stop in the first seconds of the load: on a dev server the app is still
 * showing its i18next splash there, so the preview was a black screen reading
 * "Loading..." however long the trace stayed open. This drives the same route
 * with the same stubs the audit's page saw and screenshots it once the splash
 * has cleared, which is the picture a reader expects beside the scores.
 *
 * Returns `undefined` when the route cannot be captured, so a caller can fall
 * back and say so.
 */
export async function captureRoutePreview(
  url: string,
  formFactor: FormFactor,
  outBasePath: string,
): Promise<string | undefined> {
  const mobile = formFactor === "mobile";
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 412, height: 823 }
        : { width: 1350, height: 940 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    for (const stub of appApiStubs()) {
      await page.route(stub.glob, (route) =>
        route.fulfill({ json: stub.body }),
      );
    }
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const root = document.getElementById("root");
        return Boolean(root && root.childElementCount > 0);
      },
      null,
      { timeout: 120_000 },
    );
    // Both the splash and a lazily loaded route's own spinner say "loading", and
    // the route is what the audit scored, so neither belongs in the preview.
    await page.waitForFunction(
      () => !/\bloading\b/i.test(document.body.innerText ?? ""),
      null,
      { timeout: 120_000 },
    );
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    const shot = await page.screenshot({ type: "jpeg", quality: 65 });
    const outPath = `${outBasePath}.jpg`;
    writeFileSync(outPath, shot);
    return outPath;
  } finally {
    await browser.close();
  }
}

/** Console errors the audit itself recorded, first line only. */
function consoleFailures(report: LighthouseReport): string[] {
  const items =
    (
      report.audits?.["errors-in-console"]?.details as
        | { items?: unknown }
        | undefined
    )?.items ?? [];
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 3)
    .map((item) => {
      const description = (item as { description?: unknown })?.description;
      if (typeof description !== "string") return null;
      const [first = ""] = description.split("\n");
      return `Page error during the audit: ${first.slice(0, 200)}`;
    })
    .filter((line): line is string => line !== null);
}

interface LighthouseAudit {
  id?: string;
  title?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  description?: string;
  details?: { data?: string };
}

interface LighthouseReport {
  lighthouseVersion?: string;
  finalUrl?: string;
  userAgent?: string;
  configSettings?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  categories?: Record<string, { score?: number | null }>;
  audits?: Record<string, LighthouseAudit>;
  runtimeError?: { code?: string; message?: string };
}

/** `null` means "no usable Lighthouse CLI on this machine". */
export function resolveLighthouse(frontendDir: string): string | null {
  const override = process.env.LIGHTHOUSE_BIN;
  if (override) return existsSync(override) ? override : null;
  const local = join(frontendDir, "node_modules", ".bin", "lighthouse");
  return existsSync(local) ? local : null;
}

function scoreOf(report: LighthouseReport, category: string): number | null {
  const value = report.categories?.[category]?.score;
  return typeof value === "number" ? Math.round(value * 100) : null;
}

function diagnostics(report: LighthouseReport): string[] {
  const audits = report.audits ?? {};
  const lines: string[] = [];
  for (const id of AUDIT_IDS) {
    const audit = audits[id];
    if (audit?.displayValue) {
      lines.push(`${audit.title ?? id}: ${audit.displayValue}`);
    }
  }
  const failing = Object.values(audits)
    .filter(
      (audit) =>
        typeof audit.score === "number" &&
        audit.score < 0.9 &&
        // The metric audits are already listed above with their display
        // values; repeating them here buries the actual findings.
        !(AUDIT_IDS as readonly string[]).includes(audit.id ?? "") &&
        audit.scoreDisplayMode !== "informative" &&
        audit.scoreDisplayMode !== "notApplicable",
    )
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))
    .slice(0, 8);
  for (const audit of failing) {
    lines.push(
      `${audit.title ?? audit.id} (${audit.scoreDisplayMode ?? "audit"}, score ${audit.score})${audit.displayValue ? `: ${audit.displayValue}` : ""}`,
    );
  }
  if (lines.length === 0)
    lines.push("No failing audits below the 0.9 threshold were reported.");
  return lines;
}
/** The audit's screenshot is a JPEG as often as a PNG; both are renderable. */
const PREVIEW_MIME = /^data:image\/(png|jpeg);base64,(.+)$/;

function previewFrom(
  report: LighthouseReport,
  basePath: string,
): string | undefined {
  const data = report.audits?.["final-screenshot"]?.details?.data;
  if (typeof data !== "string") return undefined;
  const match = PREVIEW_MIME.exec(data);
  if (!match) return undefined;
  const outPath = `${basePath}.${match[1] === "png" ? "png" : "jpg"}`;
  writeFileSync(outPath, Buffer.from(match[2], "base64"));
  return outPath;
}

async function runOne(
  binary: string,
  options: LighthouseOptions,
  formFactor: FormFactor,
): Promise<LighthouseRun | string> {
  // Lighthouse appends its own extension when more than one output format is
  // requested, so this is a base path: the files land as <base>.report.json and
  // <base>.report.html, and asking for the bare path finds nothing.
  const base = join(options.outDir, `lighthouse-${formFactor}`);
  const jsonPath = `${base}.report.json`;
  const htmlPath = `${base}.report.html`;
  const previewPath = join(options.outDir, `lighthouse-${formFactor}-preview`);
  mkdirSync(options.outDir, { recursive: true });

  const args = [
    options.url,
    "--quiet",
    "--output=json,html",
    `--output-path=${base}`,
    "--only-categories=performance,accessibility,best-practices,seo",
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
  ];
  // A requested settle needs a config file, and a config file replaces the
  // preset, so the desktop settings travel in the config instead.
  if (options.settleMs > 0) {
    args.push(
      `--config-path=${writeSettleConfig(options.outDir, formFactor, options.settleMs)}`,
    );
  } else if (formFactor === "desktop") args.push("--preset=desktop");
  if (options.chromePath) {
    args.push(`--chrome-path=${options.chromePath}`);
  }

  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: options.timeoutMs ?? 180_000,
    env: process.env,
  });
  if (result.error) {
    return `Lighthouse ${formFactor}: ${result.error.message}`;
  }
  if (result.status !== 0) {
    const tail = (result.stderr || result.stdout || "")
      .trim()
      .split("\n")
      .slice(-3)
      .join(" ");
    return `Lighthouse ${formFactor}: exit ${result.status}${tail ? ` — ${tail}` : ""}`;
  }
  if (!existsSync(jsonPath)) {
    return `Lighthouse ${formFactor}: no JSON report was written`;
  }

  let report: LighthouseReport;
  try {
    report = JSON.parse(readFileSync(jsonPath, "utf8")) as LighthouseReport;
  } catch (error) {
    return `Lighthouse ${formFactor}: unreadable JSON report (${String(error)})`;
  }
  if (report.runtimeError) {
    return `Lighthouse ${formFactor}: runtime error ${report.runtimeError.code ?? ""} ${report.runtimeError.message ?? ""}`.trim();
  }

  const settings = report.configSettings ?? {};

  const scores: Record<string, number> = {};
  for (const category of [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ]) {
    const score = scoreOf(report, category);
    if (score !== null) scores[category] = score;
  }

  const captured = await captureRoutePreview(
    options.url,
    formFactor,
    previewPath,
  ).catch(() => undefined);
  const preview = captured ?? previewFrom(report, previewPath);
  const artifacts = [jsonPath, htmlPath].filter((path) => existsSync(path));
  // A forced audit of an erroring page has to say so in the run's own numbers;
  // every other backend state is already recorded in the limitations.
  const stateNote =
    options.backend.source === "unavailable"
      ? errorStateNote(options.backend)
      : null;
  // The validity caveats and the page's own console errors lead the
  // diagnostics: a score list that starts with a metric hides both.
  const diagnosticLines = [
    ...(stateNote ? [stateNote] : []),
    ...consoleFailures(report),
    ...diagnostics(report),
  ];

  return {
    route: options.route,
    formFactor,
    mode: options.mode,
    // A mobile form factor is a mobile-web audit: labelling it with the
    // scenario's desktop platform hides the missing mobile evidence.
    platform: formFactor === "mobile" ? "mobile-web" : options.platform,
    environment: {
      lighthouse: `lighthouse ${report.lighthouseVersion ?? "unknown"}`,
      chrome: report.userAgent ?? "chrome version not reported",
      throttling: String((settings.throttlingMethod as string) ?? "unknown"),
      network: String(
        (settings.throttling as Record<string, unknown> | undefined)?.rttMs
          ? `RTT ${(settings.throttling as Record<string, number>).rttMs} ms`
          : "not reported",
      ),
      settings: Object.fromEntries(
        Object.entries(settings).filter(([key]) =>
          [
            "formFactor",
            "screenEmulation",
            "emulatedFormFactor",
            "onlyCategories",
            "channel",
          ].includes(key),
        ),
      ),
      limitations: [
        "a Lighthouse run is a browser page-load audit: it is not a Tauri, Android or iOS test, and page-load timing does not describe responsiveness during printing, editing or export",
        captured
          ? "the preview image is the harness's own capture of the audited route after the app finished booting, not Lighthouse's screenshot, which the trace takes while a dev server is still showing the app's splash"
          : "the preview image is Lighthouse's own screenshot: the harness could not capture the route itself, and Lighthouse takes that screenshot before a dev server renders the route",
        ...(options.settleMs > 0
          ? [
              `the trace stayed open ${options.settleMs} ms past the load event (pauseAfterLoadMs) so the app's own boot could finish; Lighthouse stops gathering 1000 ms after load by default`,
            ]
          : []),
        ...backendLimitations(options.backend),
      ].join("; "),
    },
    scores,
    diagnostics: diagnosticLines,
    preview,
    artifacts,
  };
}

export async function runLighthouse(
  options: LighthouseOptions,
): Promise<LighthouseResult> {
  const frontendDir = process.env.LIGHTHOUSE_FRONTEND_DIR ?? process.cwd();
  const binary = options.binary ?? resolveLighthouse(frontendDir);
  if (!binary) {
    return {
      runs: [],
      unavailable: [
        "Lighthouse (no CLI found: set LIGHTHOUSE_BIN or install lighthouse; a missing audit is reported, never estimated)",
      ],
      notes: [],
    };
  }
  const runs: LighthouseRun[] = [];
  const unavailable: string[] = [];
  for (const formFactor of ["desktop", "mobile"] as FormFactor[]) {
    const outcome = await runOne(binary, options, formFactor);
    if (typeof outcome === "string") unavailable.push(outcome);
    else runs.push(outcome);
  }
  return {
    runs,
    unavailable,
    notes: backendLimitations(options.backend).map(
      (line) => `Lighthouse: ${line}`,
    ),
  };
}
