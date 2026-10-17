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
import type { LighthouseRun, PerfClaim, PerfInteraction } from "./types";

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
  // A reload cannot retain heap: a run that navigated has its baseline and its
  // closing reading in different documents, and reporting the difference as
  // retention would be reporting two page loads.
  if (metrics["memory.retentionComparable"] === false) return null;
  const baseline = metricNumber(metrics, "memory.jsHeapBaselineMB");
  const settled = metricNumber(metrics, "memory.jsHeapSettledMB");
  const final = settled ?? metricNumber(metrics, "memory.jsHeapFinalMB");
  if (baseline === null || final === null) return null;
  const retained = round(final - baseline, 1);
  if (retained < HEAP_RETAINED_MB) return null;
  const peak = metricNumber(metrics, "memory.jsHeapPeakMB");
  const perCycle = round(retained / Math.max(1, cycles), 2);
  const basis =
    settled === null
      ? "the recovery window, before any forced GC"
      : "the recovery window, after a forced GC";
  return {
    severity: retained >= 15 || perCycle >= 3 ? "high" : "med",
    kind: "regression",
    title: `JS heap keeps ${retained} MB above baseline after ${cycles} cycle(s)`,
    detail:
      `baseline ${baseline} MB → peak ${peak ?? "?"} MB → final ${final} MB read at ${basis}, ` +
      `about ${perCycle} MB kept per cycle. The recovery curve settles ` +
      `without returning to baseline.`,
    evidence: evidenceOf(metrics, [
      "memory.jsHeapBaselineMB",
      "memory.jsHeapPeakMB",
      "memory.jsHeapFinalMB",
      "memory.jsHeapSettledMB",
      "memory.retainedFraction",
      "memory.settledRetainedFraction",
    ]),
    picture: interaction.pictures?.recovery,
    confidence:
      "same browser and window, CDP counters; a heap that does not fall back after a forced GC is retention, not proof of a leak - attributing it needs a heap snapshot",
    source: "performance harness",
  };
}

function domFinding(interaction: PerfInteraction): PerfFinding | null {
  const metrics = interaction.metrics;
  if (metrics["dom.retentionComparable"] === false) return null;
  const baseline = metricNumber(metrics, "dom.baselineNodes");
  const settled = metricNumber(metrics, "dom.settledNodes");
  const final = settled ?? metricNumber(metrics, "dom.finalNodes");
  if (baseline === null || final === null) return null;
  const attachedBaseline = metricNumber(metrics, "dom.baselineAttachedNodes");
  const attachedEnd = metricNumber(metrics, "dom.attachedNodes");
  // The attached count is the honest one: CDP's node counter also holds nodes
  // the renderer kept outside the document, so it grows for reasons a reader of
  // the page never sees. Fall back to it only when the page could not be asked.
  const measured = attachedBaseline !== null && attachedEnd !== null;
  const from = measured ? attachedBaseline : baseline;
  const to = measured ? attachedEnd : final;
  const growth = to - from;
  if (growth < DOM_NODE_GROWTH) return null;
  const unit = measured ? "attached elements" : "nodes";
  const nodeNote =
    !measured || (measured && baseline !== null && final !== null)
      ? ` CDP counts ${baseline} → ${final} nodes over the same window, which includes anything the renderer holds outside the document.`
      : "";
  return {
    severity: "low",
    kind: "observation",
    title: `DOM keeps ${growth} ${unit} above the baseline it started from`,
    detail: measured
      ? `${from} attached elements at the baseline, ${to} at the end of the recovery ` +
        `window${settled === null ? "" : " after a forced GC"} (peak ${metricNumber(metrics, "dom.peakNodes") ?? "?"} nodes).${nodeNote}`
      : `${baseline} nodes at the baseline, ${final} at the end of the recovery ` +
        `window${settled === null ? "" : " after a forced GC"} (peak ${metricNumber(metrics, "dom.peakNodes") ?? "?"}).`,
    evidence: evidenceOf(metrics, [
      "dom.baselineAttachedNodes",
      "dom.attachedNodes",
      "dom.baselineNodes",
      "dom.peakNodes",
      "dom.finalNodes",
      "dom.settledNodes",
      "dom.documents",
    ]),
    picture: interaction.pictures?.rendering,
    confidence: measured
      ? "the attached count is queried from the page itself; a modal or a menu left open by the scenario explains growth as easily as a leak does"
      : "node counts come from CDP; a modal or a menu left open by the scenario explains growth as easily as a leak does",
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

/**
 * The metric keys a claim quotes, as `key=value` entries. A key that was never
 * recorded is written `key=absent` rather than dropped, so a claim with nothing
 * behind it still names what was missing instead of reading as evidence-free.
 */
function evidenceList(
  metrics: Record<string, unknown>,
  keys: string[],
): string[] {
  return keys.map((key) =>
    metrics[key] === undefined || metrics[key] === null
      ? `${key}=absent`
      : `${key}=${format(metrics[key])}`,
  );
}

function claimOf(
  claim: string,
  values: (number | null)[],
  settle: (measured: number[]) => boolean,
  evidence: string[],
  note: string,
): PerfClaim {
  const measured = values.filter((value): value is number => value !== null);
  return {
    claim,
    status:
      measured.length !== values.length
        ? "not-measured"
        : settle(measured)
          ? "supported"
          : "unsupported",
    evidence,
    note,
  };
}

/**
 * The claims these measurements do and do not settle.
 *
 * A claim is `supported` or `unsupported` only when the number that answers it
 * was recorded; otherwise it is `not-measured`, because the difference between
 * "the evidence says no" and "nothing answered this" is the whole point of the
 * table. The last claim is deliberately unsettleable here: reuse is a property
 * of the renderer's pool, and this harness observes the heap, not the alloy.
 */
export function deriveClaims(context: FindingContext): PerfClaim[] {
  const metrics = context.interaction.metrics;
  const runs = context.lighthouse;
  const heapKeys = [
    "memory.jsHeapBaselineMB",
    "memory.jsHeapFinalMB",
    "memory.jsHeapSettledMB",
    "memory.retainedFraction",
    "memory.settledRetainedFraction",
  ];
  const baseline = metricNumber(metrics, "memory.jsHeapBaselineMB");
  const settled = metricNumber(metrics, "memory.jsHeapSettledMB");
  const unsettled = metricNumber(metrics, "memory.jsHeapFinalMB");
  const final = settled ?? unsettled;
  const retained =
    baseline === null || final === null ? null : round(final - baseline, 1);
  const heapBasis =
    settled === null
      ? "before any forced GC, so this is an upper bound"
      : "after a forced GC, so this is what the renderer kept";
  const performance = runs
    .map((run) => metricNumber(run.scores ?? {}, "performance"))
    .filter((score): score is number => score !== null);
  const comparable =
    metrics["memory.retentionComparable"] !== false &&
    metrics["dom.retentionComparable"] !== false;

  return [
    claimOf(
      "Retained JS heap returns to its baseline after the cycles",
      comparable ? [retained] : [null],
      ([value]) => value < HEAP_RETAINED_MB,
      evidenceList(metrics, heapKeys),
      !comparable
        ? "the run reloaded the page, so the baseline and the closing reading are two different documents; a reload cannot retain heap, so this run cannot answer the claim"
        : retained === null
          ? "no heap counter was recorded in this window"
          : `${retained} MB kept across ${context.cycles} cycle(s), read ${heapBasis}; a warm cache keeps memory by design, so this bounds the retention rather than naming its owner`,
    ),
    claimOf(
      "The slowest recorded interaction stays inside the INP budget",
      [metricNumber(metrics, "latency.durationMs")],
      ([value]) => value <= INP_MS,
      evidenceList(metrics, [
        "latency.event",
        "latency.inputDelayMs",
        "latency.processingMs",
        "latency.durationMs",
      ]),
      `the budget is ${INP_MS} ms; one interaction in one window is not a field-data percentile`,
    ),
    claimOf(
      "The main thread is not blocked during the cycle",
      [metricNumber(metrics, "rendering.blockingMs")],
      ([value]) => value <= 0,
      evidenceList(metrics, [
        "rendering.longTaskCount",
        "rendering.longestTaskMs",
        "rendering.longTaskTotalMs",
        "rendering.blockingMs",
      ]),
      "blocking is the observed long-task total for tasks over 50 ms in this window",
    ),
    claimOf(
      "The audited route meets the Lighthouse performance budget",
      runs.length === 0 ? [null] : performance,
      (values) => values.every((value) => value >= SCORE_BUDGET),
      runs.length === 0
        ? ["lighthouse.runs=absent"]
        : runs.map(
            (run) =>
              `lighthouse.runs[${run.route}].scores.performance=${String(
                run.scores?.performance ?? "not scored",
              )}`,
          ),
      runs.length === 0
        ? "no audit ran, so nothing answers this"
        : `the budget is ${SCORE_BUDGET}; a single dev-server audit bounds this build, not the deployed one`,
    ),
    {
      claim: "Raster storage is reused across cycles rather than reallocated",
      status: "not-measured",
      evidence: evidenceList(metrics, [
        "memory.jsHeapPeakMB",
        "memory.jsHeapFinalMB",
      ]),
      note:
        "reuse is a property of the renderer's raster pool: it needs allocation " +
        "counters or pool instrumentation after warm-up, and this harness records " +
        "only heap and DOM counters, so the heap figures bound the outcome without " +
        "showing the mechanism",
    },
  ];
}
