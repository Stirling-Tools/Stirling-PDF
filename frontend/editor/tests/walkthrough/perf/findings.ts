/**
 * Turns recorded evidence into the findings the report's Findings tab shows.
 *
 * The numbers already exist in `metrics` and in the Lighthouse runs; what is
 * missing is the verdict, and a verdict written by hand at the end of a long
 * walkthrough is the first thing to get skipped. Every rule here reads a
 * measurement, quotes it as `evidence`, and states what it does not prove: no
 * rule fires on a number that was not recorded, and a rule that cannot see its
 * measurement emits nothing.
 *
 * Findings are grouped the way the viewer groups them, because a Lighthouse
 * accessibility score belongs beside the visual findings, not in a section
 * labelled Performance.
 */

// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { BackendState } from "./backend";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { round } from "./metrics";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { LighthouseRun, PerfInteraction } from "./types";

export type FindingSeverity = "high" | "med" | "low";
/** How the finding got here; the report renders it as a chip. */
export type FindingKind = "regression" | "budget" | "gap" | "observation";

export interface PerfFinding {
  severity: FindingSeverity;
  kind: FindingKind;
  title: string;
  detail: string;
  fix?: string;
  /** The measurement this finding is read from; the report prints it verbatim. */
  evidence: string;
  confidence: string;
  source: string;
  picture?: string;
}

/** Keyed by viewer group, so a Lighthouse score lands in the right block. */
export interface DerivedFindings {
  perf: PerfFinding[];
  a11y: PerfFinding[];
  behavior: PerfFinding[];
}

export type FindingGroup = keyof DerivedFindings;

/**
 * What the audited page's API calls were answered by. The interaction run
 * always stubs them, so only an audit can be described here; `stubbed` means the
 * scores came from the UI rendered with the repo's fixture data.
 */
export interface FindingContext {
  interaction: PerfInteraction;
  cycles: number;
  lighthouse: LighthouseRun[];
  backend: BackendState;
}

/** A retention curve this large is worth a look; it is not a leak verdict. */
export const HEAP_RETAINED_MB = 5;
export const DOM_NODE_GROWTH = 150;
/** web-vitals' "needs improvement" and "poor" boundaries for INP. */
export const INP_MS = 200;
export const INP_POOR_MS = 500;
/** A page-load audit under the budget has something worth naming. */
export const SCORE_BUDGET = 90;
export const SCORE_POOR = 75;
export const SCORE_BAD = 50;

const CATEGORY_GROUP: Record<string, FindingGroup> = {
  performance: "perf",
  accessibility: "a11y",
  "best-practices": "behavior",
};

function metricNumber(
  metrics: Record<string, unknown>,
  key: string,
): number | null {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function format(value: unknown): string {
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function evidenceOf(metrics: Record<string, unknown>, keys: string[]): string {
  return keys
    .filter((key) => metrics[key] !== undefined && metrics[key] !== null)
    .map((key) => `${key}=${format(metrics[key])}`)
    .join(", ");
}

function severityForScore(score: number): FindingSeverity {
  if (score < SCORE_BAD) return "high";
  if (score < SCORE_POOR) return "med";
  return "low";
}

function heapFinding(
  interaction: PerfInteraction,
  cycles: number,
): PerfFinding | null {
  const metrics = interaction.metrics;
  const baseline = metricNumber(metrics, "memory.jsHeapBaselineMB");
  const final = metricNumber(metrics, "memory.jsHeapFinalMB");
  if (baseline === null || final === null) return null;
  const retained = round(final - baseline, 1);
  if (retained < HEAP_RETAINED_MB) return null;
  const peak = metricNumber(metrics, "memory.jsHeapPeakMB");
  const perCycle = round(retained / Math.max(1, cycles), 2);
  return {
    severity: retained >= 15 || perCycle >= 3 ? "high" : "med",
    kind: "regression",
    title: `JS heap ends ${retained} MB above baseline after ${cycles} cycle(s)`,
    detail:
      `baseline ${baseline} MB → peak ${peak ?? "?"} MB → final ${final} MB, ` +
      `about ${perCycle} MB retained per cycle. The recovery curve settles ` +
      `without returning to baseline.`,
    evidence: evidenceOf(metrics, [
      "memory.jsHeapBaselineMB",
      "memory.jsHeapPeakMB",
      "memory.jsHeapFinalMB",
      "memory.retainedFraction",
    ]),
    picture: interaction.pictures?.recovery,
    confidence:
      "same browser and window, CDP counters; a heap that does not fall back is retention, not proof of a leak - attributing it needs a heap snapshot",
    source: "performance harness",
  };
}

function domFinding(interaction: PerfInteraction): PerfFinding | null {
  const metrics = interaction.metrics;
  const baseline = metricNumber(metrics, "dom.baselineNodes");
  const final = metricNumber(metrics, "dom.finalNodes");
  if (baseline === null || final === null) return null;
  const growth = final - baseline;
  if (growth < DOM_NODE_GROWTH) return null;
  return {
    severity: "low",
    kind: "observation",
    title: `DOM ends ${growth} nodes above the baseline it started from`,
    detail:
      `${baseline} nodes at the baseline, ${final} at the end of the recovery ` +
      `window (peak ${metricNumber(metrics, "dom.peakNodes") ?? "?"}).`,
    evidence: evidenceOf(metrics, [
      "dom.baselineNodes",
      "dom.peakNodes",
      "dom.finalNodes",
      "dom.documents",
    ]),
    picture: interaction.pictures?.rendering,
    confidence:
      "node counts come from CDP; a modal or a menu left open by the scenario explains growth as easily as a leak does",
    source: "performance harness",
  };
}

function longTaskFinding(interaction: PerfInteraction): PerfFinding | null {
  const metrics = interaction.metrics;
  const blocking = metricNumber(metrics, "rendering.blockingMs");
  const count = metricNumber(metrics, "rendering.longTaskCount");
  if (blocking === null || blocking <= 0 || !count) return null;
  const longest = metricNumber(metrics, "rendering.longestTaskMs");
  return {
    severity: blocking >= 200 ? "med" : "low",
    kind: "observation",
    title: `${count} long task(s) blocked the main thread for ${blocking} ms in total`,
    detail:
      `longest task ${longest ?? "?"} ms. Blocking is the sum of ` +
      `(duration - 50 ms) for tasks over 50 ms, which is not Lighthouse's Total Blocking Time.`,
    evidence: evidenceOf(metrics, [
      "rendering.longTaskCount",
      "rendering.longestTaskMs",
      "rendering.longTaskTotalMs",
      "rendering.blockingMs",
    ]),
    picture: interaction.pictures?.timeline,
    confidence:
      "counted by PerformanceObserver in the measured window while the same browser drove the UI, so the observer's own overhead is inside the numbers",
    source: "performance harness",
  };
}

function latencyFinding(interaction: PerfInteraction): PerfFinding | null {
  const metrics = interaction.metrics;
  const duration = metricNumber(metrics, "latency.durationMs");
  if (duration === null || duration < INP_MS) return null;
  const event = metrics["latency.event"] ?? "an interaction";
  return {
    severity: duration >= INP_POOR_MS ? "high" : "med",
    kind: "observation",
    title: `Slowest interaction (${format(event)}) took ${duration} ms`,
    detail:
      `input delay ${metricNumber(metrics, "latency.inputDelayMs") ?? "?"} ms, ` +
      `processing ${metricNumber(metrics, "latency.processingMs") ?? "?"} ms; ` +
      `web-vitals treats ${INP_MS} ms as the needs-improvement boundary for INP.`,
    evidence: evidenceOf(metrics, [
      "latency.event",
      "latency.inputDelayMs",
      "latency.processingMs",
      "latency.durationMs",
    ]),
    confidence:
      "the slowest input in this window, not a percentile over real users",
    source: "performance harness",
  };
}

function unavailableFinding(interaction: PerfInteraction): PerfFinding | null {
  const unavailable = interaction.metrics.unavailable;
  if (!Array.isArray(unavailable) || unavailable.length === 0) return null;
  return {
    severity: "low",
    kind: "gap",
    title: `${unavailable.length} area(s) had no measurement`,
    detail: unavailable.map((item) => format(item)).join("; "),
    evidence: `metrics.unavailable=${format(unavailable)}`,
    confidence:
      "the browser reported nothing for these areas; the report leaves them out rather than estimating",
    source: "performance harness",
  };
}

function lighthouseFindings(
  context: FindingContext,
  findings: DerivedFindings,
): void {
  for (const run of context.lighthouse) {
    const label = [run.formFactor, run.route].filter(Boolean).join(" ");
    const scores = run.scores ?? {};
    const entries = Object.entries(scores).filter(
      ([category]) => category in CATEGORY_GROUP,
    );
    if (entries.length === 0) {
      findings.perf.push({
        severity: "low",
        kind: "gap",
        title: `Lighthouse produced no category scores (${label})`,
        detail:
          (run.diagnostics ?? []).slice(0, 2).join(" ") ||
          "the run recorded no diagnostics",
        evidence: `lighthouse.runs ${label}: scores=${format(scores)}`,
        confidence:
          "a report without scores is a missing measurement, not a zero",
        source: "Lighthouse",
      });
      continue;
    }
    for (const [category, score] of entries) {
      if (typeof score !== "number" || score >= SCORE_BUDGET) continue;
      findings[CATEGORY_GROUP[category]].push({
        severity: severityForScore(score),
        kind: "budget",
        title: `Lighthouse ${category} ${score} (${label})`,
        detail:
          `below the ${SCORE_BUDGET} budget for a page-load audit of ${run.route}; ` +
          `the audits scoring under 0.9 are listed on the Lighthouse tab.`,
        evidence: `scores=${format(scores)}; lighthouse ${
          run.environment?.lighthouse ?? "version not reported"
        }`,
        picture: run.preview,
        confidence:
          format(run.environment?.limitations) ||
          "a page-load audit, not a measurement of the app on a device",
        source: "Lighthouse",
      });
    }
    const pageErrors = (run.diagnostics ?? []).filter((line) =>
      line.startsWith("Page error during the audit"),
    );
    if (pageErrors.length > 0) {
      findings.perf.push({
        severity: "low",
        kind: "observation",
        title: `${pageErrors.length} page error(s) during the audit (${label})`,
        detail: pageErrors.join("; "),
        evidence: `lighthouse.runs ${label}: ${pageErrors.length} errors-in-console item(s)`,
        confidence: "reported by the audit's own errors-in-console audit",
        source: "Lighthouse",
      });
    }
    if (!context.backend.ok) {
      findings.perf.push({
        severity: "low",
        kind: "gap",
        title: `These scores describe the app's error state (${label})`,
        detail:
          `${context.backend.endpoint} ${context.backend.detail} before the audit, ` +
          `so the page Lighthouse loaded was the error screen.`,
        fix: "start the backend (task backend:dev) and re-run the audit",
        evidence: `scores=${format(scores)}; ${context.backend.endpoint} ${context.backend.detail}`,
        confidence:
          "the endpoint is probed immediately before the audit; a backend that fails mid-audit is not caught",
        source: "Lighthouse",
      });
    }
  }
}

/**
 * Findings the harness can prove from what it measured, ready to append to
 * `manifest.findings`. Author-written findings for the same group are kept
 * alongside these, not replaced.
 */
export function deriveFindings(context: FindingContext): DerivedFindings {
  const findings: DerivedFindings = { perf: [], a11y: [], behavior: [] };
  const interaction = context.interaction;
  if (context.backend.source === "stubbed") {
    findings.perf.push({
      severity: "low",
      kind: "observation",
      title: "The audit ran against the repo's API stubs, not a live backend",
      detail:
        `${context.backend.endpoint} ${context.backend.detail}, so the audited ` +
        `route rendered with fixture data. The shape of the UI is what was scored; ` +
        `a real backend's data was not.`,
      evidence: `${context.backend.endpoint} ${context.backend.detail}`,
      confidence:
        "the stub backend binds the port the dev server already proxies to; a live backend takes precedence when one answers",
      source: "Lighthouse",
    });
  }
  if (!context.backend.ok && context.lighthouse.length === 0) {
    findings.perf.push({
      severity: "low",
      kind: "gap",
      title: "No Lighthouse run was recorded",
      detail:
        `Lighthouse was skipped: ${context.backend.endpoint} ${context.backend.detail}, ` +
        `and the repo's stub backend could not stand in for it either. An audit of ` +
        `the error screen would not be a measurement.`,
      fix: "check the dev server's BACKEND_URL proxy target (or pass --stub-backend-port) and re-run with --lighthouse",
      evidence: `lighthouse.runs=0; ${context.backend.endpoint} ${context.backend.detail}`,
      confidence:
        "recorded by the harness that skipped the audit, not inferred from a failed run",
      source: "performance harness",
    });
  }
  for (const finding of [
    heapFinding(interaction, context.cycles),
    domFinding(interaction),
    longTaskFinding(interaction),
    latencyFinding(interaction),
    unavailableFinding(interaction),
  ]) {
    if (finding) findings.perf.push(finding);
  }
  lighthouseFindings(context, findings);
  return findings;
}
