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
import { join } from "node:path";
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
  /** Validity caveat prepended to every run's diagnostics. */
  stateNote?: string;
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

/** The app fetches this before it renders; a failure leaves it in its error state. */
const CONFIG_PATH = "/api/v1/config/app-config";

/**
 * A page-load audit only describes the feature if the feature rendered.
 * Lighthouse brings its own browser, so the capture harness's request stubs
 * do not apply: against a dev server with no backend behind it the audit
 * scores the app's error screen, which reads as an extremely slow page.
 */
async function auditedStateNote(url: string): Promise<string | null> {
  const endpoint = new URL(CONFIG_PATH, url).toString();
  let reason: string;
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return null;
    reason = `answered ${response.status}`;
  } catch (error) {
    reason = `did not answer (${(error as Error).message})`;
  }
  return (
    `${endpoint} ${reason}: the audited page rendered its error state, so these ` +
    `scores describe that state and not the feature. Serve the audited route ` +
    `with a backend (or a build that does not need one) before trusting them.`
  );
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

function runOne(
  binary: string,
  options: LighthouseOptions,
  formFactor: FormFactor,
): LighthouseRun | string {
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
  if (formFactor === "desktop") args.push("--preset=desktop");
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

  const preview = previewFrom(report, previewPath);
  const artifacts = [jsonPath, htmlPath].filter((path) => existsSync(path));
  // The validity caveat and the page's own console errors lead the
  // diagnostics: a score list that starts with a metric hides both.
  const diagnosticLines = [
    ...(options.stateNote ? [options.stateNote] : []),
    ...consoleFailures(report),
    ...diagnostics(report),
  ];

  return {
    route: options.route,
    formFactor,
    mode: options.mode,
    platform: options.platform,
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
      limitations:
        "a Lighthouse run is a browser page-load audit: it is not a Tauri, Android or iOS test, and page-load timing does not describe responsiveness during printing, editing or export",
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
  const stateNote = options.stateNote ?? (await auditedStateNote(options.url));
  const scoped = stateNote ? { ...options, stateNote } : options;
  const runs: LighthouseRun[] = [];
  const unavailable: string[] = [];
  for (const formFactor of ["desktop", "mobile"] as FormFactor[]) {
    const outcome = runOne(binary, scoped, formFactor);
    if (typeof outcome === "string") unavailable.push(outcome);
    else runs.push(outcome);
  }
  return { runs, unavailable, notes: stateNote ? [stateNote] : [] };
}
