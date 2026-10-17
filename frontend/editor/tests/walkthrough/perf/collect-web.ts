/**
 * Chromium performance collector for `desktop-web` / `mobile-web`.
 *
 * It is a bounded measurement, not a benchmark suite: an idle baseline, N
 * open/use/close cycles driven by the scenario, and a recovery window, with
 * cheap CDP counters sampled throughout and heavy collectors (CPU profile,
 * short trace) confined to the interaction window and stopped immediately
 * after. Every number is labelled with the build and instrumentation that
 * produced it; anything a browser cannot see is reported as unavailable.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  chromium,
  devices,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "playwright";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  bypassOnboarding,
  fulfillUnstubbedApis,
  mockAppApis,
  seedCookieConsent,
  type MockAppApiOptions,
} from "@app/tests/helpers/api-stubs";
import { suppressNativeFilePicker } from "@app/tests/helpers/ui-helpers";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  emptyProbe,
  probeDrainScript,
  probeInstalledScript,
  PROBE_COMMITS_SCRIPT,
  PROBE_SCRIPT,
} from "./probe";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { assertSerializable } from "./serialize";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type {
  CdpSnapshot,
  InteractionSample,
  PageProbe,
  PhaseMark,
  Scenario,
  WorkerEvidence,
} from "./types";

/** Cheap counter cadence. Within the 500–1,000 ms budget the skill requires. */
export const SAMPLE_INTERVAL_MS = 750;
/** Hard cap so a long scenario cannot turn sampling into continuous profiling. */
export const MAX_SAMPLES = 40;

export interface CollectOptions {
  scenario: Scenario;
  baseUrl: string;
  cycles: number;
  /** Idle window before and after the cycles, in ms. */
  idleBaselineMs: number;
  /** Record a short Chromium trace inside the interaction window. */
  trace: boolean;
  /** Record a CPU profile inside the interaction window. */
  cpuProfile: boolean;
  artifactDir: string;
  stubOptions?: MockAppApiOptions;
  onProgress?: (message: string) => void;
}

export interface CollectResult {
  sample: InteractionSample;
  /** What the scenario reported it drove. */
  drivenBy: string;
  artifacts: string[];
  unavailable: string[];
}

/** Chromium only reports precise JS heap with this switch. */
const PRECISE_MEMORY_ARG = "--enable-precise-memory-info";

export function launchCollectorBrowser(): Promise<Browser> {
  return chromium.launch({ args: [PRECISE_MEMORY_ARG] });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function contextOptions(
  scenario: Scenario,
): Parameters<Browser["newContext"]>[0] {
  if (scenario.platform === "mobile-web") {
    return {
      ...devices["Pixel 7"],
      hasTouch: true,
      isMobile: true,
      // The report must not claim device pixels it never rendered.
      deviceScaleFactor: 2,
    };
  }
  return { viewport: { width: 1600, height: 900 } };
}

function toSnapshot(
  at: number,
  metrics: { name: string; value: number }[],
  attachedNodes: number | null,
  timeOrigin: number | null,
): CdpSnapshot {
  const read = (name: string): number =>
    metrics.find((metric) => metric.name === name)?.value ?? 0;
  return {
    at,
    nodes: read("Nodes"),
    attachedNodes,
    timeOrigin,
    documents: read("Documents"),
    frames: read("Frames"),
    jsHeapUsedSize: read("JSHeapUsedSize"),
    jsHeapTotalSize: read("JSHeapTotalSize"),
    layoutCount: read("LayoutCount"),
    recalcStyleCount: read("RecalcStyleCount"),
    scriptDuration: read("ScriptDuration"),
    taskDuration: read("TaskDuration"),
    layoutDuration: read("LayoutDuration"),
    recalcStyleDuration: read("RecalcStyleDuration"),
  };
}

interface CdpRecorder {
  snapshot(): Promise<CdpSnapshot>;
  workers(): Promise<WorkerEvidence>;
  startCpuProfile(): Promise<void>;
  stopCpuProfile(outPath: string): Promise<void>;
  startTrace(outPath: string): Promise<void>;
  stopTrace(): Promise<void>;
}

function makeRecorder(cdp: CDPSession, tracePath: string): CdpRecorder {
  const events: object[] = [];
  cdp.on("Tracing.dataCollected", (payload) => {
    events.push(...payload.value);
  });
  return {
    async snapshot(): Promise<CdpSnapshot> {
      const result = await cdp.send("Performance.getMetrics");
      const evaluated = await cdp.send("Runtime.evaluate", {
        expression:
          "({ at: performance.now(), attachedNodes: document.querySelectorAll('*').length, timeOrigin: performance.timeOrigin })",
        returnByValue: true,
      });
      const value = evaluated.result.value as
        | { at?: number; attachedNodes?: number; timeOrigin?: number }
        | undefined;
      return toSnapshot(
        typeof value?.at === "number" ? value.at : 0,
        result.metrics,
        typeof value?.attachedNodes === "number" ? value.attachedNodes : null,
        typeof value?.timeOrigin === "number" ? value.timeOrigin : null,
      );
    },
    async workers(): Promise<WorkerEvidence> {
      const result = await cdp.send("Target.getTargets");
      const workerTypes = new Set([
        "worker",
        "service_worker",
        "shared_worker",
      ]);
      const targets = result.targetInfos.filter((info) =>
        workerTypes.has(info.type),
      );
      return {
        targets: targets.map((info) => info.type),
        urls: targets.map((info) => info.url).filter((url) => url.length > 0),
      };
    },
    async startCpuProfile(): Promise<void> {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
      await cdp.send("Profiler.start");
    },
    async stopCpuProfile(outPath: string): Promise<void> {
      const { profile } = await cdp.send("Profiler.stop");
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(profile));
      await cdp.send("Profiler.disable");
    },
    async startTrace(outPath: string): Promise<void> {
      events.length = 0;
      mkdirSync(dirname(outPath), { recursive: true });
      await cdp.send("Tracing.start", {
        categories: [
          "devtools.timeline",
          "disabled-by-default-devtools.timeline",
          "v8.execute",
          "blink.user_timing",
        ].join(","),
        transferMode: "ReportEvents",
      });
    },
    async stopTrace(): Promise<void> {
      const done = new Promise<void>((resolve) => {
        cdp.once("Tracing.tracingComplete", () => resolve());
      });
      await cdp.send("Tracing.end");
      await done;
      // Written as a standard traceEvents file Chrome DevTools can open, so the
      // raw artifact is inspectable rather than a shape only this code reads.
      writeFileSync(tracePath, JSON.stringify({ traceEvents: events }));
    },
  };
}

/**
 * Samples counters on a cadence while `run` drives one open/use/close cycle.
 * Waits inside `run` belong to the scenario: the collector samples, it never
 * sleeps to make the app look settled.
 */
async function sampleDuring(
  recorder: CdpRecorder,
  samples: CdpSnapshot[],
  run: () => Promise<void>,
): Promise<void> {
  let keepSampling = true;
  const sampler = (async (): Promise<void> => {
    while (keepSampling && samples.length < MAX_SAMPLES) {
      await delay(SAMPLE_INTERVAL_MS);
      if (!keepSampling || samples.length >= MAX_SAMPLES) return;
      try {
        samples.push(await recorder.snapshot());
      } catch {
        // A navigation can invalidate a CDP snapshot; the next tick retries.
      }
    }
  })();
  try {
    await run();
  } finally {
    keepSampling = false;
    await sampler;
  }
}

async function mark(
  page: Page,
  label: string,
  marks: PhaseMark[],
): Promise<void> {
  const at = await page
    .evaluate<number>(assertSerializable(() => performance.now()))
    .catch(() => 0);
  marks.push({ label, at: typeof at === "number" ? at : 0 });
}

/**
 * Forces a collection so the next counter read is the renderer's retained
 * state. Without it `Nodes` and `JSHeapUsedSize` answer with the garbage the
 * cycle produced as readily as with what it kept, and every run reports growth.
 */
async function settleHeap(
  cdp: CDPSession,
  unavailable: string[],
): Promise<boolean> {
  try {
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    return true;
  } catch {
    unavailable.push(
      "forced GC (HeapProfiler domain unavailable, so the final heap and node counts include uncollected garbage)",
    );
    return false;
  }
}

/** Installs the same stub environment the screenshot specs use. */
async function preparePage(
  context: BrowserContext,
  page: Page,
  options: CollectOptions,
): Promise<void> {
  await fulfillUnstubbedApis(context);
  suppressNativeFilePicker(page);
  await seedCookieConsent(page);
  await bypassOnboarding(page);
  await mockAppApis(page, options.stubOptions ?? {});
  await context.addInitScript({ content: PROBE_SCRIPT });
}

export async function collectWebInteraction(
  browser: Browser,
  options: CollectOptions,
): Promise<CollectResult> {
  const progress = options.onProgress ?? ((): void => undefined);
  const artifacts: string[] = [];
  const unavailable: string[] = [];
  mkdirSync(options.artifactDir, { recursive: true });

  const context = await browser.newContext({
    ...contextOptions(options.scenario),
    // Scenarios navigate with route paths, so the origin has to be on the
    // context rather than repeated in every goto.
    baseURL: options.baseUrl,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  const samples: CdpSnapshot[] = [];
  const marks: PhaseMark[] = [];
  let probe = emptyProbe();
  let workers: WorkerEvidence = { urls: [], targets: [] };
  let drivenBy = "";

  const tracePath = join(options.artifactDir, "interaction-trace.json");
  const cpuProfilePath = join(options.artifactDir, "cpu-profile.cpuprofile");
  const recorder = makeRecorder(cdp, tracePath);

  try {
    await preparePage(context, page, options);

    await mark(page, "navigate", marks);
    await page.goto(
      new URL(options.scenario.route, options.baseUrl).toString(),
      {
        waitUntil: "domcontentloaded",
      },
    );
    const installed =
      (await page.evaluate(probeInstalledScript()).catch(() => false)) === true;
    if (!installed) unavailable.push("in-page probe (init script did not run)");

    await page.waitForFunction(
      assertSerializable(() => {
        const root = document.getElementById("root");
        return Boolean(root && root.childElementCount > 0);
      }),
      null,
      { timeout: 120_000 },
    );
    progress("app mounted");

    // Playwright reads a second argument as the page-function argument, not an
    // options object, so the timeout has to be passed as the third.
    // react-refresh installs the devtools hook lazily, so give it a bounded
    // window of attempts before reporting the commit count unavailable.
    let countingCommits = false;
    for (let attempt = 0; attempt < 20 && !countingCommits; attempt += 1) {
      countingCommits =
        (await page.evaluate(PROBE_COMMITS_SCRIPT).catch(() => false)) === true;
      if (!countingCommits) await delay(250);
    }
    if (!countingCommits) {
      unavailable.push(
        "React commit count (no devtools hook to wrap on the page)",
      );
    }

    // Deliberate measurement windows, sampled on a cadence; not test waits.
    await mark(page, "baseline", marks);
    await settleHeap(cdp, unavailable);
    const windowSamples = Math.max(
      1,
      Math.round(options.idleBaselineMs / SAMPLE_INTERVAL_MS),
    );
    for (let index = 0; index < windowSamples; index += 1) {
      samples.push(await recorder.snapshot());
      if (index < windowSamples - 1) await delay(SAMPLE_INTERVAL_MS);
    }

    workers = await recorder.workers();

    if (options.cpuProfile) {
      await recorder
        .startCpuProfile()
        .catch(() =>
          unavailable.push("CPU profile (Profiler domain unavailable)"),
        );
    }
    if (options.trace) {
      await recorder
        .startTrace(tracePath)
        .catch(() =>
          unavailable.push("Chromium trace (Tracing domain unavailable)"),
        );
    }

    await mark(page, "cycles", marks);
    for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
      let reported = "";
      await sampleDuring(recorder, samples, async () => {
        reported = await options.scenario.use(page);
      });
      if (reported) drivenBy = reported;
      await mark(page, `cycle ${cycle}`, marks);
      progress(`cycle ${cycle}/${options.cycles}`);
    }

    if (options.trace) {
      const stopped = await recorder.stopTrace().then(
        () => true,
        () => false,
      );
      if (stopped) artifacts.push(tracePath);
      else unavailable.push("Chromium trace (stopped without completing)");
    }
    if (options.cpuProfile) {
      const stopped = await recorder.stopCpuProfile(cpuProfilePath).then(
        () => true,
        () => false,
      );
      if (stopped) artifacts.push(cpuProfilePath);
      else unavailable.push("CPU profile (Profiler.stop failed)");
    }

    await mark(page, "recovery", marks);
    for (let index = 0; index < windowSamples; index += 1) {
      samples.push(await recorder.snapshot());
      if (index < windowSamples - 1) await delay(SAMPLE_INTERVAL_MS);
    }
    // Closes the window on a settled reading: retention is judged on what the
    // renderer still holds, not on what it has not got round to collecting.
    const settled = await settleHeap(cdp, unavailable);
    samples.push({ ...(await recorder.snapshot()), settled });
    await mark(page, "end", marks);

    const drained = (await page
      .evaluate(probeDrainScript(0))
      .catch(() => null)) as (PageProbe & { total: number }) | null;
    if (drained) {
      probe = {
        longTasks: drained.longTasks,
        events: drained.events,
        resources: drained.resources,
        commits: drained.commits,
        errors: drained.errors,
      };
      for (const error of drained.errors) {
        unavailable.push(`in-page probe: ${error}`);
      }
    } else {
      unavailable.push(
        "in-page probe state (page closed or evaluation failed)",
      );
    }
  } finally {
    await context.close().catch(() => undefined);
  }

  if (probe.longTasks.length === 0) {
    unavailable.push(
      "long tasks (none observed in this window; not proof of an idle main thread outside it)",
    );
  }
  if (probe.commits.length === 0) {
    unavailable.push(
      "React commit count (no devtools hook observed on the app root)",
    );
  }

  return {
    sample: {
      samples,
      marks,
      probe,
      workers,
      navigationStart: samples.length ? samples[0].at : null,
    },
    drivenBy,
    artifacts,
    unavailable,
  };
}
