/**
 * Shapes shared by the performance collector, its self-test and the manifest
 * fragments it writes.
 *
 * These mirror the keys `scripts/report.py` validates for
 * `performance.interactions[]` and `lighthouse.runs[]`; the collector must emit
 * fragments that survive `report.py validate` unchanged, so the field names and
 * the "non-empty dict" requirements are a contract, not a convention.
 */

// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { DerivedFindings } from "./findings";

export const PICTURE_KEYS = [
  "timeline",
  "breakdown",
  "rendering",
  "recovery",
] as const;
export type PictureKey = (typeof PICTURE_KEYS)[number];

export type FormFactor = "desktop" | "mobile";

/** How one metric came to be, or failed to. Mirrors METRIC_STATES in report.py. */
export type MetricState =
  | "measured"
  | "unsupported"
  | "blocked"
  | "not-collected"
  | "not-applicable";

/** Whether the recorded evidence settles a claim. Mirrors CLAIM_STATUSES in report.py. */
export type ClaimStatus = "supported" | "unsupported" | "not-measured";

/**
 * A question the run was meant to answer, paired with the measurements that
 * answer it. The report prints these beside the findings, so a claim cannot be
 * asserted without the number that settles it.
 */
export interface PerfClaim {
  claim: string;
  status: ClaimStatus;
  evidence: string[];
  note: string;
}

/** One bounded, named interaction measured on one runtime/platform. */
export interface PerfInteraction {
  id: string;
  name: string;
  platform: string;
  /** The observation window, e.g. "idle 4s + 5x open/use/close". */
  window: string;
  provenance: Record<string, unknown>;
  metrics: Record<string, unknown>;
  pictures?: Partial<Record<PictureKey, string>>;
  artifacts?: string[];
}

export interface LighthouseRun {
  route: string;
  formFactor: FormFactor;
  /** How the audited build was produced, e.g. "vite preview, production, stubbed auth". */
  mode: string;
  platform: string;
  environment: Record<string, unknown>;
  scores?: Record<string, number>;
  diagnostics?: string[];
  /** Path to a PNG preview; report.py inlines it at build time. */
  preview?: string;
  artifacts?: string[];
}

/** What the collector emits; report.py consumes these two keys directly. */
export interface PerfFragment {
  performance: { interactions: PerfInteraction[] };
  lighthouse: { runs: LighthouseRun[] };
  /** Findings derived from the measurements, appended to the manifest's own. */
  findings: DerivedFindings;
  /** Claims derived from the measurements, appended to the manifest's own. */
  claims: PerfClaim[];
}

/** In-page probe state installed before the app boots. */
export interface PageProbe {
  longTasks: LongTaskEntry[];
  events: EventTimingEntry[];
  resources: ResourceEntry[];
  commits: CommitEntry[];
  errors: string[];
}

export interface LongTaskEntry {
  start: number;
  duration: number;
  name: string;
}

export interface EventTimingEntry {
  name: string;
  start: number;
  duration: number;
  processingStart: number;
}

export interface ResourceEntry {
  name: string;
  initiatorType: string;
  start: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
}

export interface CommitEntry {
  start: number;
  /** React root `actualDuration`, when the renderer exposes it. */
  duration: number | null;
}

/** A `Performance.getMetrics` snapshot reduced to the counters we report. */
export interface CdpSnapshot {
  at: number;
  nodes: number;
  /**
   * `document.querySelectorAll('*').length`, the elements actually in the
   * document. CDP's `Nodes` also counts nodes the renderer still holds outside
   * the document, so a welfare reading needs both: they disagree whenever
   * detached-but-live nodes accumulate.
   */
  attachedNodes: number | null;
  documents: number;
  frames: number;
  /**
   * `performance.timeOrigin` of the document the reading came from. It changes
   * with every navigation, so two samples with different origins are two
   * different pages and their difference is not retention.
   */
  timeOrigin: number | null;
  jsHeapUsedSize: number;
  jsHeapTotalSize: number;
  layoutCount: number;
  recalcStyleCount: number;
  scriptDuration: number;
  taskDuration: number;
  layoutDuration: number;
  recalcStyleDuration: number;
  /**
   * Taken after a forced GC. `Nodes` and `JSHeapUsedSize` include garbage the
   * renderer has not collected yet, so only a settled reading says what a cycle
   * actually kept. Counter deltas skip settled samples: the GC pause would
   * otherwise land in `taskDuration`.
   */
  settled?: boolean;
}

export interface PhaseMark {
  label: string;
  at: number;
}

export interface WorkerEvidence {
  urls: string[];
  targets: string[];
}

export interface InteractionSample {
  samples: CdpSnapshot[];
  marks: PhaseMark[];
  probe: PageProbe;
  workers: WorkerEvidence;
  /** `null` when the WebView/browser did not expose it. */
  navigationStart: number | null;
}

/**
 * A scenario drives the app the way a person would. `use` runs inside the
 * measured window and owns all waiting; the collector never sleeps on a clock.
 */
export interface Scenario {
  id: string;
  name: string;
  /** `desktop-web` / `mobile-web` — the matrix id, not a free-form label. */
  platform: string;
  fixture: string;
  /** Route the scenario starts from, e.g. `/editor`. */
  route: string;
  /** Returns a short human description of what was driven. */
  use: (page: ScenarioPage) => Promise<string>;
}

/** The subset of Playwright's `Page` / `Locator` a scenario may use. */
export interface ScenarioPage {
  goto(
    url: string,
    options?: { waitUntil?: "domcontentloaded" | "load" | "networkidle" },
  ): Promise<unknown>;
  goBack(options?: { timeout?: number }): Promise<unknown>;
  getByRole(
    role: string,
    options?: { name?: string | RegExp },
  ): ScenarioLocator;
  getByTestId(id: string): ScenarioLocator;
  /** Selector strings may use `>> nth=N` to pick among matches. */
  locator(selector: string): ScenarioLocator;
  waitForFunction(
    fn: () => boolean,
    // Playwright reads a second argument as the page-function argument, so the
    // options object only takes effect in the third position.
    arg: null,
    options?: { timeout?: number },
  ): Promise<unknown>;
  waitForSelector(
    selector: string,
    options?: { state?: "visible" | "attached" | "hidden"; timeout?: number },
  ): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  keyboard: { press(key: string): Promise<void> };
  mouse: { wheel(dx: number, dy: number): Promise<void> };
}

export interface ScenarioLocator {
  first(): ScenarioLocator;
  click(options?: { timeout?: number }): Promise<void>;
  isVisible(): Promise<boolean>;
  count(): Promise<number>;
  /** Tools load their document through a hidden input, as the app does. */
  setInputFiles(path: string): Promise<void>;
  waitFor(options?: {
    state?: "visible" | "attached" | "hidden";
    timeout?: number;
  }): Promise<void>;
}
