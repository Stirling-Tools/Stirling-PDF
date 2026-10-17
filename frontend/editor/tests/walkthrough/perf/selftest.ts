/**
 * Self-checks for the performance harness.
 *
 * Two things can go quietly wrong here and both would poison every future
 * walkthrough: a reduction that misreports a recorded sample, and a fragment
 * that `report.py` rejects only after a real measurement has been thrown away.
 * So this checks the arithmetic on synthetic input, rasterises a real chart,
 * round-trips a fragment through `report.py validate/build/self-test`, and
 * confirms the Lighthouse resolver fails closed when nothing is installed.
 *
 * Run from `frontend/`:
 *   npx tsx editor/tests/walkthrough/perf/selftest.ts
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { createContext, runInContext } from "node:vm";
import { chromium } from "playwright";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { CONFIG_PATH, stubbedState, type BackendState } from "./backend";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  breakdownChart,
  rasterise,
  recoveryChart,
  renderingChart,
  timelineChart,
} from "./charts";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  captureRoutePreview,
  DEFAULT_SETTLE_MS,
  resolveLighthouse,
  writeSettleConfig,
} from "./collect-lighthouse";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { deriveClaims, deriveFindings } from "./findings";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  domStats,
  heapStats,
  interactionLatency,
  longTaskStats,
  reactStats,
  round,
  sameDocument,
  snapshotDelta,
} from "./metrics";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  probeDrainScript,
  probeInstalledScript,
  PROBE_COMMITS_SCRIPT,
  PROBE_KEY,
  PROBE_SCRIPT,
  splitResourceSizes,
} from "./probe";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { BUILTIN_SCENARIOS, resolveRoute } from "./scenarios";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { assertSerializable } from "./serialize";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { matchStubPath, startStubBackend, stubFor } from "./stub-backend";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type {
  CdpSnapshot,
  LighthouseRun,
  PageProbe,
  PerfInteraction,
} from "./types";

const HERE = import.meta.dirname;
const REPORT_PY = resolve(
  HERE,
  "../../../../../.claude/skills/ui-walkthrough/scripts/report.py",
);

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    process.stdout.write(`ok   ${name}\n`);
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  process.stdout.write(`FAIL ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function equal(name: string, actual: unknown, expected: unknown): void {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
  );
}

function snapshot(overrides: Partial<CdpSnapshot> = {}): CdpSnapshot {
  return {
    at: 0,
    nodes: 0,
    attachedNodes: null,
    timeOrigin: null,
    documents: 0,
    frames: 0,
    jsHeapUsedSize: 0,
    jsHeapTotalSize: 0,
    layoutCount: 0,
    recalcStyleCount: 0,
    scriptDuration: 0,
    taskDuration: 0,
    layoutDuration: 0,
    recalcStyleDuration: 0,
    ...overrides,
  };
}

function probe(overrides: Partial<PageProbe> = {}): PageProbe {
  return {
    longTasks: [],
    events: [],
    resources: [],
    commits: [],
    errors: [],
    ...overrides,
  };
}

/** Minimal but valid 8x8 RGB PNG; enough for report.py to sniff and decode. */
function writePng(
  path: string,
  rgb: [number, number, number] = [10, 20, 30],
): void {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crcTable: number[] = [];
    let crc = 0xffffffff;
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1)
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, body, crcBuffer]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc(8 * (1 + 24));
  for (let y = 0; y < 8; y += 1) {
    const offset = y * 25;
    rows[offset] = 0;
    for (let x = 0; x < 8; x += 1) {
      rows[offset + 1 + x * 3] = rgb[0];
      rows[offset + 2 + x * 3] = rgb[1];
      rows[offset + 3 + x * 3] = rgb[2];
    }
  }
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function reductions(): void {
  equal(
    "longTaskStats separates total, longest and blocking",
    longTaskStats([
      { start: 0, duration: 30, name: "longtask" },
      { start: 100, duration: 120, name: "longtask" },
      { start: 300, duration: 60, name: "longtask" },
    ]),
    { count: 3, totalMs: 210, longestMs: 120, blockingMs: 80 },
  );
  equal("longTaskStats on no entries stays zero", longTaskStats([]), {
    count: 0,
    totalMs: 0,
    longestMs: 0,
    blockingMs: 0,
  });

  const samples = [
    snapshot({
      at: 0,
      nodes: 5,
      attachedNodes: 4,
      documents: 1,
      frames: 2,
      jsHeapUsedSize: 1000,
    }),
    snapshot({
      at: 750,
      nodes: 9,
      attachedNodes: 8,
      documents: 1,
      frames: 2,
      jsHeapUsedSize: 3000,
    }),
    snapshot({
      at: 1500,
      nodes: 7,
      attachedNodes: 6,
      documents: 1,
      frames: 2,
      jsHeapUsedSize: 2500,
    }),
  ];
  equal("domStats reports baseline/peak/final", domStats(samples), {
    baselineNodes: 5,
    peakNodes: 9,
    finalNodes: 7,
    settledNodes: null,
    baselineAttachedNodes: 4,
    finalAttachedNodes: 6,
    settledAttachedNodes: null,
    documents: 1,
    frames: 2,
    comparable: true,
  });
  equal("heapStats reports growth against baseline", heapStats(samples), {
    baselineBytes: 1000,
    peakBytes: 3000,
    finalBytes: 2500,
    retainedFraction: 1.5,
    settledBytes: null,
    settledRetainedFraction: null,
    comparable: true,
  });
  // A run that reloaded the page has its baseline and its closing reading in
  // two documents; a reload cannot retain heap, so the reduction must say so
  // instead of handing the report a delta it would read as retention.
  const reloaded = [
    snapshot({ at: 0, nodes: 5, attachedNodes: 4, timeOrigin: 1000, jsHeapUsedSize: 1000 }),
    snapshot({ at: 900, nodes: 7, attachedNodes: 6, timeOrigin: 500_000, jsHeapUsedSize: 3000, settled: true }),
  ];
  equal("domStats flags a run that reloaded the page", domStats(reloaded).comparable, false);
  equal("heapStats flags a run that reloaded the page", heapStats(reloaded).comparable, false);
  equal("sameDocument reads the document identity", sameDocument(reloaded), false);
  equal(
    "an unknown document identity is not called a reload",
    sameDocument([snapshot({ at: 0 }), snapshot({ at: 10 })]),
    true,
  );
  // The last reading of a real run is taken after a forced GC; the reduction
  // must prefer it, or the report answers with uncollected garbage.
  const withSettled = [
    ...samples,
    { ...samples[samples.length - 1], at: 2250, nodes: 6, attachedNodes: 5, jsHeapUsedSize: 1500, settled: true },
  ];
  equal("domStats reads the settled node count after a forced GC", domStats(withSettled).settledNodes, 6);
  equal(
    "domStats reads the settled attached count after a forced GC",
    domStats(withSettled).settledAttachedNodes,
    5,
  );
  equal("heapStats reads the settled heap after a forced GC", heapStats(withSettled).settledBytes, 1500);
  equal(
    "the settled fraction is measured against the same baseline",
    heapStats(withSettled).settledRetainedFraction,
    0.5,
  );
  equal(
    "an unsettled run reports no settled heap rather than reusing the final one",
    heapStats([samples[0]]).settledBytes,
    null,
  );
  check(
    "heapStats on no samples does not invent a baseline",
    heapStats([]).baselineBytes === null,
  );

  equal(
    "snapshotDelta converts seconds to ms and never mixes units",
    snapshotDelta(
      snapshot({
        layoutCount: 1,
        recalcStyleCount: 2,
        scriptDuration: 0.5,
        taskDuration: 1,
        layoutDuration: 0.01,
        recalcStyleDuration: 0.02,
        frames: 10,
      }),
      snapshot({
        layoutCount: 4,
        recalcStyleCount: 9,
        scriptDuration: 0.8,
        taskDuration: 1.6,
        layoutDuration: 0.05,
        recalcStyleDuration: 0.11,
        frames: 40,
      }),
    ),
    {
      layout: 3,
      recalcStyle: 7,
      script: 0.3,
      task: 0.6,
      layoutDurationMs: 40,
      recalcStyleDurationMs: 90,
      scriptDurationMs: 300,
      taskDurationMs: 600,
      frames: 30,
    },
  );

  check("reactStats is null without commits", reactStats(probe()) === null);
  equal(
    "reactStats sums and maxes only numeric durations",
    reactStats(
      probe({
        commits: [
          { start: 0, duration: 4 },
          { start: 10, duration: 6 },
          { start: 20, duration: null },
        ],
      }),
    ),
    { commits: 3, totalRenderMs: 10, maxRenderMs: 6 },
  );
  equal(
    "interactionLatency picks the longest event and splits delay from processing",
    interactionLatency(
      probe({
        events: [
          { name: "click", start: 100, duration: 40, processingStart: 110 },
          { name: "keydown", start: 200, duration: 90, processingStart: 260 },
        ],
      }),
    ),
    { name: "keydown", inputDelayMs: 60, processingMs: 30, durationMs: 90 },
  );
  check(
    "splitResourceSizes counts TAO-less responses as unknown",
    (() => {
      const sizes = splitResourceSizes([
        {
          name: "a.js",
          initiatorType: "script",
          start: 0,
          duration: 1,
          transferSize: 500,
          encodedBodySize: 400,
        },
        {
          name: "b.css",
          initiatorType: "link",
          start: 0,
          duration: 1,
          transferSize: 0,
          encodedBodySize: 0,
        },
      ]);
      return sizes.knownBytes === 500 && sizes.unknownSizeCount === 1;
    })(),
  );
  check("round keeps two decimals by default", round(1.23456) === 1.23);
}

interface ProbeState {
  longTasks: Array<{ name?: unknown; duration?: unknown }>;
  events: Array<{ name?: unknown; processingStart?: unknown }>;
  resources: Array<{
    name?: unknown;
    initiatorType?: unknown;
    transferSize?: unknown;
  }>;
  commits: Array<{ start?: unknown; duration?: unknown }>;
  errors: string[];
  observers: unknown[];
}

interface DevtoolsHook {
  supportsFiber?: boolean;
  onCommitFiberRoot?: (...args: unknown[]) => void;
}

interface ProbeWindow {
  __wtPerf?: ProbeState;
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook;
}

interface ObserverSettings {
  type?: string;
  buffered?: boolean;
  durationThreshold?: number;
}

type ObserverCallback = (list: { getEntries(): unknown[] }) => void;

class FakePerformanceObserver {
  static supportedEntryTypes = ["longtask", "event", "resource"];
  static created: FakePerformanceObserver[] = [];
  settings: ObserverSettings = {};
  private readonly callback: ObserverCallback;
  constructor(callback: ObserverCallback) {
    this.callback = callback;
    FakePerformanceObserver.created.push(this);
  }
  observe(settings: ObserverSettings): void {
    this.settings = settings;
  }
  fire(entries: unknown[]): void {
    this.callback({ getEntries: () => entries });
  }
}

class ThrowingObserver extends FakePerformanceObserver {
  override observe(settings: ObserverSettings): void {
    if (settings.type === "event")
      throw new Error("this WebView refuses event timing");
    super.observe(settings);
  }
}

interface ProbeGlobals {
  window: ProbeWindow;
  PerformanceObserver: typeof FakePerformanceObserver;
  performance: { now(): number };
}

function probeGlobals(
  now: number,
  observer: typeof FakePerformanceObserver = FakePerformanceObserver,
): ProbeGlobals {
  return {
    window: {},
    PerformanceObserver: observer,
    performance: { now: () => now },
  };
}

function runProbe(globals: ProbeGlobals): void {
  FakePerformanceObserver.created = [];
  runInContext(PROBE_SCRIPT, createContext(globals));
}

/**
 * The probe travels to the browser as text, so nothing in the type system or
 * the gate suite would catch it breaking. This runs it for real, in a sandbox
 * whose only job is to be suspicious of it.
 */
function probeScript(): void {
  check(
    "PROBE_SCRIPT carries no bundler helper calls",
    !PROBE_SCRIPT.includes("__name"),
  );
  check(
    "probeInstalledScript reads the probe key",
    probeInstalledScript().includes(PROBE_KEY),
  );

  const globals = probeGlobals(500);
  runProbe(globals);
  equal(
    "one observer per supported stream is registered",
    FakePerformanceObserver.created.map((observer) => observer.settings.type),
    ["longtask", "event", "resource"],
  );
  check(
    "every observer asks for buffered entries",
    FakePerformanceObserver.created.every((o) => o.settings.buffered === true),
  );
  equal(
    "event timing is measured under the 104 ms default threshold",
    FakePerformanceObserver.created[1]?.settings.durationThreshold,
    16,
  );
  equal(
    "the probe holds its observers so they are not collected",
    globals.window.__wtPerf?.observers.length,
    3,
  );
  equal(
    "a clean install records no probe errors",
    globals.window.__wtPerf?.errors,
    [],
  );

  FakePerformanceObserver.created[0]?.fire([
    { startTime: 10, duration: 80, name: "longtask" },
  ]);
  FakePerformanceObserver.created[1]?.fire([
    { startTime: 20, duration: 30, name: "click", processingStart: 25 },
    { startTime: 40, duration: 5, name: "pointerover" },
  ]);
  FakePerformanceObserver.created[2]?.fire([
    { startTime: 1, duration: 2, name: "app.js", initiatorType: "script" },
  ]);
  equal(
    "long tasks land in their own stream",
    globals.window.__wtPerf?.longTasks,
    [{ start: 10, duration: 80, name: "longtask" }],
  );
  equal(
    "only events with timing detail are kept",
    globals.window.__wtPerf?.events,
    [{ name: "click", start: 20, duration: 30, processingStart: 25 }],
  );
  equal(
    "resources default their hidden sizes to zero",
    globals.window.__wtPerf?.resources,
    [
      {
        name: "app.js",
        initiatorType: "script",
        start: 1,
        duration: 2,
        transferSize: 0,
        encodedBodySize: 0,
      },
    ],
  );

  const drained = runInContext(
    probeDrainScript(0),
    createContext(globals),
  ) as ProbeState & {
    total: number;
  };
  equal(
    "the drain returns what the probe recorded",
    drained.longTasks.length,
    1,
  );
  equal(
    "the drain reports no commits when only the init script ran",
    drained.total,
    0,
  );
  check(
    "the drain leaves live observer handles behind",
    !("observers" in drained),
  );

  // React commit evidence comes from wrapping the hook the app installed, never
  // from installing one first: an init script that arrives before the refresh
  // preamble leaves it reading properties off a hook it did not create, and the
  // app does not boot at all.
  check(
    "the init script leaves the app's devtools hook alone",
    globals.window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === undefined,
  );

  let firstCalls = 0;
  let secondCalls = 0;
  const firstHandler = (..._args: unknown[]): void => {
    firstCalls += 1;
  };
  const secondHandler = (..._args: unknown[]): void => {
    secondCalls += 1;
  };
  const running = probeGlobals(900);
  runProbe(running);
  equal(
    "wrapping before a hook exists fails closed",
    runInContext(PROBE_COMMITS_SCRIPT, createContext(running)),
    false,
  );
  running.window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    onCommitFiberRoot: firstHandler,
  };
  check(
    "wrapping a hook the app installed reports success",
    runInContext(PROBE_COMMITS_SCRIPT, createContext(running)) === true,
  );
  const hook = running.window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  check(
    "the hook hands out a wrapper, not the assigned handler",
    typeof hook?.onCommitFiberRoot === "function" &&
      hook.onCommitFiberRoot !== firstHandler,
  );
  hook?.onCommitFiberRoot?.(1, { current: { actualDuration: 7 } }, 3, false);
  // react-refresh re-installs its handler whenever it re-injects, which must not
  // be able to cut the probe out of the loop.
  if (hook) hook.onCommitFiberRoot = secondHandler;
  hook?.onCommitFiberRoot?.(1, { current: { actualDuration: 2 } }, 3, false);
  equal(
    "commits stay counted across a later hook reassignment",
    running.window.__wtPerf?.commits,
    [
      { start: 900, duration: 7 },
      { start: 900, duration: 2 },
    ],
  );
  equal(
    "the handler in place at each commit still runs",
    [firstCalls, secondCalls],
    [1, 1],
  );

  const frozen = probeGlobals(0);
  runProbe(frozen);
  frozen.window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = Object.freeze({
    onCommitFiberRoot: (): void => undefined,
  });
  equal(
    "a hook that cannot be wrapped is reported, not thrown",
    runInContext(PROBE_COMMITS_SCRIPT, createContext(frozen)),
    false,
  );
  equal(
    "an unwrappable hook records why",
    frozen.window.__wtPerf?.errors.length,
    1,
  );

  FakePerformanceObserver.supportedEntryTypes = ["longtask", "resource"];
  const restricted = probeGlobals(0);
  runProbe(restricted);
  equal(
    "an unsupported stream is skipped without recording an error",
    FakePerformanceObserver.created.map((observer) => observer.settings.type),
    ["longtask", "resource"],
  );
  equal(
    "skipping a stream is not a failure",
    restricted.window.__wtPerf?.errors,
    [],
  );
  FakePerformanceObserver.supportedEntryTypes = [
    "longtask",
    "event",
    "resource",
  ];

  const failing = probeGlobals(0, ThrowingObserver);
  runProbe(failing);
  equal(
    "a refused stream is reported, not thrown",
    failing.window.__wtPerf?.errors,
    ["observer event: Error: this WebView refuses event timing"],
  );
  equal(
    "the remaining streams still register after one fails",
    failing.window.__wtPerf?.observers.length,
    2,
  );

  const absent = runInContext(
    probeDrainScript(0),
    createContext(probeGlobals(0)),
  ) as ProbeState & { total: number };
  equal(
    "a drain without a probe says so instead of inventing data",
    absent.errors,
    ["probe not installed"],
  );
  equal("a drain without a probe reports nothing", absent.total, 0);

  const arrow = (): number => 1;
  check(
    "assertSerializable passes a plain arrow",
    assertSerializable(arrow) === arrow,
  );
  const hostile = ((): number => 1) as (() => number) & { toString(): string };
  Object.defineProperty(hostile, "toString", {
    value: () => "() => { __name(inner, 'inner'); }",
  });
  check(
    "assertSerializable rejects a function carrying bundler helpers",
    (() => {
      try {
        assertSerializable(hostile);
        return false;
      } catch {
        return true;
      }
    })(),
  );
}

async function chartsAndRaster(): Promise<void> {
  const chart = breakdownChart(
    [{ label: "Script <x>", value: 12.5, unit: "ms" }],
    "self-test",
  );
  check("chart svg is non-empty", chart.svg.includes("<svg"));
  check(
    "chart escapes operator text instead of emitting markup",
    !chart.svg.includes("<x>"),
  );
  check("chart never embeds a script", !chart.svg.includes("<script"));

  const recovery = recoveryChart(
    [snapshot({ nodes: 1 }), snapshot({ nodes: 2 })],
    "self-test",
  );
  check(
    "recovery chart plots one point per sample",
    (recovery.svg.match(/<polyline/g) ?? []).length >= 1,
  );
  check(
    "rendering chart renders one group per cycle",
    renderingChart(
      [{ label: "c1", layout: 1, recalcStyle: 2, longTasks: 3 }],
      "self-test",
    ).svg.includes("c1"),
  );
  check(
    "timeline chart marks long tasks",
    timelineChart(
      [{ start: 10, duration: 80, name: "longtask" }],
      [{ label: "cycle 1", at: 50 }],
      200,
    ).svg.length > 100,
  );

  const dir = mkdtempSync(join(tmpdir(), "wt-selftest-"));
  try {
    const outPath = join(dir, "chart.png");
    const browser = await chromium.launch();
    try {
      await rasterise(browser, chart, outPath);
    } finally {
      await browser.close();
    }
    const bytes = readFileSync(outPath).subarray(0, 8);
    check(
      "rasterise writes a real PNG (data-URI-inlinable by report.py)",
      bytes.equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
      bytes.toString("hex"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function lighthouseResolver(): void {
  const dir = mkdtempSync(join(tmpdir(), "wt-lh-"));
  const previous = process.env.LIGHTHOUSE_BIN;
  try {
    delete process.env.LIGHTHOUSE_BIN;
    check(
      "resolveLighthouse returns null when nothing is installed",
      resolveLighthouse(dir) === null,
    );
    const fake = join(dir, "lighthouse");
    writeFileSync(fake, "#!/bin/sh\n");
    process.env.LIGHTHOUSE_BIN = fake;
    check(
      "resolveLighthouse honours an explicit LIGHTHOUSE_BIN",
      resolveLighthouse(dir) === fake,
    );
  } finally {
    if (previous === undefined) delete process.env.LIGHTHOUSE_BIN;
    else process.env.LIGHTHOUSE_BIN = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

interface AuditConfigModule {
  extends: string;
  settings: {
    pauseAfterLoadMs: number;
    formFactor?: string;
    screenEmulation?: { width: number };
    throttling?: { rttMs: number };
  };
}

async function loadAuditConfig(path: string): Promise<AuditConfigModule> {
  const loaded = (await import(pathToFileURL(path).href)) as {
    default: AuditConfigModule;
  };
  return loaded.default;
}

/**
 * The audit has to look at the route the scenario exercises, on an app the
 * scenario left rendered: Lighthouse stops gathering 1000 ms after the load
 * event, which on a dev server is still the i18next splash. Raising that wait
 * needs a config file, and `--config-path` makes the CLI ignore `--preset`, so
 * the desktop settings travel in the generated config instead.
 */
async function auditSetup(): Promise<void> {
  equal(
    "the default settle window outlasts the app's boot",
    DEFAULT_SETTLE_MS,
    5_000,
  );
  check(
    "a builtin scenario names the endpoint its cycle exercises",
    BUILTIN_SCENARIOS.some((scenario) => scenario.route === "/pdf-text-editor"),
    BUILTIN_SCENARIOS.map((scenario) => scenario.route).join(", "),
  );
  for (const scenario of BUILTIN_SCENARIOS) {
    equal(
      `no --route leaves ${scenario.id} on its own route`,
      resolveRoute("", scenario.route),
      scenario.route,
    );
  }
  equal(
    "--route overrides a scenario's own route",
    resolveRoute("/somewhere-else", "/pdf-text-editor"),
    "/somewhere-else",
  );

  const dir = mkdtempSync(join(tmpdir(), "wt-settle-"));
  try {
    const desktop = await loadAuditConfig(
      writeSettleConfig(dir, "desktop", DEFAULT_SETTLE_MS),
    );
    equal(
      "the audit config extends Lighthouse's own defaults",
      desktop.extends,
      "lighthouse:default",
    );
    equal(
      "the audit config keeps the trace open for the settle window",
      desktop.settings.pauseAfterLoadMs,
      DEFAULT_SETTLE_MS,
    );
    equal(
      "the desktop audit keeps its own screen emulation",
      desktop.settings.screenEmulation?.width,
      1350,
    );
    equal(
      "the desktop audit keeps its own form factor",
      desktop.settings.formFactor,
      "desktop",
    );
    equal(
      "the desktop audit keeps its own throttling",
      desktop.settings.throttling?.rttMs,
      40,
    );
    const mobile = await loadAuditConfig(
      writeSettleConfig(dir, "mobile", 2_000),
    );
    equal(
      "the mobile audit changes nothing but the settle window",
      Object.keys(mobile.settings).join(","),
      "pauseAfterLoadMs",
    );
    equal(
      "and that window is the one it asked for",
      mobile.settings.pauseAfterLoadMs,
      2_000,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The preview has to show the route, not the app's splash. Lighthouse's own
 * screenshot comes from the trace, whose frames stop while a dev server is still
 * booting, so the harness captures the audited route itself; this proves that
 * capture really renders the route and returns a JPEG `report.py` can inline.
 */
async function previewCapture(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "wt-preview-"));
  try {
    const base = join(dir, "preview");
    // The capture waits for `#root` to have children and for the splash text to
    // clear, so the fixture has to satisfy both or this would wait out its own
    // timeout instead of failing.
    const html = '<div id="root"><h1>ready</h1></div>';
    const captured = await captureRoutePreview(
      `data:text/html,${encodeURIComponent(html)}`,
      "desktop",
      base,
    );
    equal(
      "the harness screenshots the audited route itself",
      captured,
      `${base}.jpg`,
    );
    const bytes = captured ? readFileSync(captured) : Buffer.alloc(0);
    equal(
      "the capture is a JPEG, which report.py inlines",
      bytes.subarray(0, 2).toString("hex"),
      "ffd8",
    );
    check(
      "the capture is a rendered page, not an empty image",
      bytes.length > 1_000,
      `${bytes.length} bytes`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The measured fragment must survive report.py unchanged. */
async function fragmentRoundTrip(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "wt-roundtrip-"));
  try {
    writePng(join(dir, "view-light.png"));
    writePng(join(dir, "view-dark.png"), [30, 20, 10]);
    writePng(join(dir, "pic-timeline.png"), [1, 2, 3]);
    const manifest = {
      feature: "harness self-test",
      generated: "now",
      coverage: {
        expected: ["desktop-web"],
        mode: "partial",
        decisions: [
          {
            platform: "windows-tauri",
            status: "deferred",
            reason:
              "self-test: the webview loads this code but no Tauri runner exists here",
            basis: ["selftest.ts"],
          },
        ],
      },
      views: [
        {
          id: "editor",
          title: "Editor",
          platform: "desktop-web",
          runner: "chromium",
          light: "view-light.png",
          dark: "view-dark.png",
          captures: [],
        },
      ],
      findings: {
        perf: [
          {
            severity: "low",
            kind: "observation",
            title: "self-test finding",
            detail: "written by the harness self-test",
            evidence: "metrics.selftest=1",
            confidence: "the self-test wrote it",
            source: "performance harness",
          },
        ],
      },
      performance: {
        interactions: [
          {
            id: "editor-settings-cycle",
            name: "Editor · open Settings, switch section, close",
            platform: "desktop-web",
            window:
              "idle 4000 ms baseline + 5x open/use/close + 4000 ms recovery",
            provenance: { instrumentation: "selftest", build: "selftest" },
            metrics: {
              "rendering.longTaskCount": 0,
              states: { "renderer.poolBytes": "blocked" },
            },
            pictures: { timeline: "pic-timeline.png" },
          },
        ],
      },
      claims: [
        {
          claim: "retained storage is bounded",
          status: "not-measured",
          evidence: ["metrics.rendering.longTaskCount=0"],
          note: "written by the harness self-test",
        },
      ],
      lighthouse: {
        runs: [
          {
            route: "/editor",
            formFactor: "desktop",
            mode: "selftest",
            platform: "desktop-web",
            environment: { lighthouse: "lighthouse selftest" },
            scores: { performance: 90 },
          },
        ],
      },
    };
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const validate = spawnSync(
      "python3",
      [REPORT_PY, "validate", manifestPath],
      { encoding: "utf8" },
    );
    check(
      "a measured fragment passes report.py validate",
      validate.status === 0,
      (validate.stdout ?? "").trim(),
    );

    const reportPath = join(dir, "report.html");
    const build = spawnSync(
      "python3",
      [REPORT_PY, "build", "--manifest", manifestPath, "--out", reportPath],
      { encoding: "utf8" },
    );
    check(
      "the fragment builds a standalone report",
      build.status === 0,
      (build.stdout ?? build.stderr ?? "").trim(),
    );
    if (build.status === 0) {
      const selfTest = spawnSync(
        "python3",
        [REPORT_PY, "self-test", reportPath],
        { encoding: "utf8" },
      );
      check(
        "the built report passes self-test",
        selfTest.status === 0,
        (selfTest.stdout ?? selfTest.stderr ?? "").trim(),
      );
      await findingsTabRenders(reportPath);
    }

    const broken = JSON.parse(JSON.stringify(manifest)) as typeof manifest;
    delete (broken.performance.interactions[0] as { provenance?: unknown })
      .provenance;
    const brokenPath = join(dir, "broken.json");
    writeFileSync(brokenPath, `${JSON.stringify(broken)}\n`);
    const brokenCheck = spawnSync(
      "python3",
      [REPORT_PY, "validate", brokenPath],
      { encoding: "utf8" },
    );
    check(
      "a fragment without provenance is rejected",
      brokenCheck.status !== 0,
      `exit ${String(brokenCheck.status)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The verdicts must follow the recorded numbers, not a mood: a clean
 * measurement derives nothing, a crowded one names what it saw, an audit served
 * by the repo's stubs says its data was synthetic, and a backend state that
 * blocked the audit is reported as a gap instead of being blamed on the app.
 */
function findings(): void {
  const healthy: BackendState = {
    ok: true,
    source: "live",
    endpoint: "http://127.0.0.1:8080/api/v1/config/app-config",
    detail: "answered 200",
  };
  const offline: BackendState = {
    ok: false,
    source: "unavailable",
    endpoint: "http://127.0.0.1:8080/api/v1/config/app-config",
    detail: "did not answer (fetch failed)",
  };
  const stubbed: BackendState = stubbedState(
    "http://127.0.0.1:8080/api/v1/config/app-config",
    "answered by the repo's API stubs on port 8080 through http://127.0.0.1:5199",
  );
  const interaction = (metrics: Record<string, unknown>): PerfInteraction => ({
    id: "selftest",
    name: "self-test interaction",
    platform: "desktop-web",
    window: "self-test window",
    provenance: { instrumentation: "selftest" },
    metrics,
    pictures: { recovery: "pic-recovery.png", timeline: "pic-timeline.png" },
  });
  const count = (derived: ReturnType<typeof deriveFindings>): number =>
    derived.perf.length + derived.a11y.length + derived.behavior.length;

  const quiet = deriveFindings({
    interaction: interaction({
      "memory.jsHeapBaselineMB": 40,
      "memory.jsHeapFinalMB": 41,
      "dom.baselineNodes": 1000,
      "dom.finalNodes": 1010,
      "rendering.blockingMs": 0,
      "latency.durationMs": 20,
    }),
    cycles: 5,
    lighthouse: [],
    backend: healthy,
  });
  equal(
    "a measurement inside every budget derives no finding",
    count(quiet),
    0,
  );

  const crowded = deriveFindings({
    interaction: interaction({
      "memory.jsHeapBaselineMB": 24.5,
      "memory.jsHeapPeakMB": 63.4,
      "memory.jsHeapFinalMB": 54.2,
      "dom.baselineNodes": 227,
      "dom.finalNodes": 7723,
      "rendering.blockingMs": 371,
      "rendering.longTaskCount": 7,
      "rendering.longestTaskMs": 153,
      "latency.durationMs": 640,
      "latency.event": "click",
      "latency.inputDelayMs": 12,
      "latency.processingMs": 600,
      unavailable: ["layout shifts were not measured"],
    }),
    cycles: 5,
    lighthouse: [],
    backend: healthy,
  });
  const heap = crowded.perf.find((finding) =>
    finding.title.startsWith("JS heap keeps"),
  );
  const latency = crowded.perf.find((finding) =>
    finding.title.startsWith("Slowest interaction"),
  );
  const gap = crowded.perf.find((finding) => finding.kind === "gap");
  check("a heap that never returns to baseline is named", heap !== undefined);
  check(
    "a run with no settled reading says the retention is an upper bound",
    heap?.detail.includes("before any forced GC") === true,
    heap?.detail,
  );
  equal(
    "retention over 3 MB per cycle is high severity",
    heap?.severity,
    "high",
  );
  equal("retention is a regression, not a budget", heap?.kind, "regression");
  check(
    "the retention finding carries the numbers it was read from",
    heap?.evidence.includes("memory.jsHeapFinalMB") === true,
    heap?.evidence,
  );
  equal(
    "the retention finding points at the recovery curve",
    heap?.picture,
    "pic-recovery.png",
  );
  equal("a 640 ms interaction is high severity", latency?.severity, "high");
  check(
    "the slow interaction quotes its INP context",
    latency?.detail.includes("200 ms") === true,
  );
  check(
    "DOM growth is observed separately from the heap",
    crowded.perf.some((finding) =>
      finding.title.startsWith("DOM keeps 7496 nodes"),
    ),
  );
  // A settled run is the normal shape: the retention claim must then quote the
  // post-GC figure and say so, instead of the uncollected garbage peak.
  const settledRun = deriveFindings({
    interaction: interaction({
      "memory.jsHeapBaselineMB": 10.9,
      "memory.jsHeapPeakMB": 23.7,
      "memory.jsHeapFinalMB": 22.1,
      "memory.jsHeapSettledMB": 17.4,
      "memory.retainedFraction": 1.028,
      "memory.settledRetainedFraction": 0.596,
      "dom.baselineNodes": 1167,
      "dom.finalNodes": 1695,
      "dom.settledNodes": 1181,
      "rendering.blockingMs": 0,
      "rendering.longTaskCount": 0,
    }),
    cycles: 3,
    lighthouse: [],
    backend: healthy,
  });
  const settledHeap = settledRun.perf.find((finding) =>
    finding.title.startsWith("JS heap keeps"),
  );
  check(
    "a settled run measures retention after the forced GC",
    settledHeap?.title === "JS heap keeps 6.5 MB above baseline after 3 cycle(s)",
    settledHeap?.title,
  );
  check(
    "and says the figure is post-GC",
    settledHeap?.detail.includes("after a forced GC") === true,
    settledHeap?.detail,
  );
  check(
    "a settled DOM is not reported as growth",
    !settledRun.perf.some((finding) => finding.title.startsWith("DOM keeps")),
    settledRun.perf.map((finding) => finding.title).join(" | "),
  );
  // CDP's node counter also counts nodes the renderer kept outside the
  // document. When the page can be asked, the attached count decides, so a
  // detached-but-live pile does not read as DOM growth.
  const detachedPile = deriveFindings({
    interaction: interaction({
      "dom.baselineNodes": 1146,
      "dom.settledNodes": 3253,
      "dom.baselineAttachedNodes": 950,
      "dom.attachedNodes": 964,
      "rendering.blockingMs": 0,
      "rendering.longTaskCount": 0,
    }),
    cycles: 5,
    lighthouse: [],
    backend: healthy,
  });
  check(
    "attached elements decide DOM growth, so a detached pile is not growth",
    !detachedPile.perf.some((finding) => finding.title.startsWith("DOM keeps")),
    detachedPile.perf.map((finding) => finding.title).join(" | "),
  );
  const attachedGrowth = deriveFindings({
    interaction: interaction({
      "dom.baselineNodes": 1146,
      "dom.settledNodes": 3253,
      "dom.baselineAttachedNodes": 950,
      "dom.attachedNodes": 1850,
      "rendering.blockingMs": 0,
      "rendering.longTaskCount": 0,
    }),
    cycles: 5,
    lighthouse: [],
    backend: healthy,
  });
  const attachedFinding = attachedGrowth.perf.find((finding) =>
    finding.title.startsWith("DOM keeps"),
  );
  check(
    "an attached growth of 900 elements is named as such",
    attachedFinding?.title ===
      "DOM keeps 900 attached elements above the baseline it started from",
    attachedFinding?.title,
  );
  check(
    "and separates the element count from the renderer's node count",
    attachedFinding?.detail.includes("CDP counts 1146 → 3253 nodes") === true,
    attachedFinding?.detail,
  );
  const retentionClaim = deriveClaims({
    interaction: interaction({
      "memory.jsHeapBaselineMB": 10.9,
      "memory.jsHeapPeakMB": 23.7,
      "memory.jsHeapFinalMB": 22.1,
      "memory.jsHeapSettledMB": 17.4,
      "memory.retainedFraction": 1.028,
      "memory.settledRetainedFraction": 0.596,
      "dom.baselineNodes": 1167,
      "dom.finalNodes": 1695,
      "dom.settledNodes": 1181,
      "rendering.blockingMs": 0,
      "rendering.longTaskCount": 0,
    }),
    cycles: 3,
    lighthouse: [],
    backend: healthy,
  })[0];
  check(
    "the retention claim quotes the settled fraction",
    retentionClaim?.evidence.some((item) =>
      item.startsWith("memory.settledRetainedFraction"),
    ) === true,
    retentionClaim?.evidence.join("; "),
  );
  check(
    "and names its basis as post-GC",
    retentionClaim?.note.includes("after a forced GC") === true,
    retentionClaim?.note,
  );
  check(
    "an area the browser could not measure is a gap",
    gap !== undefined && gap.detail.includes("layout shifts"),
  );
  check(
    "a healthy backend is never blamed for the numbers",
    !crowded.perf.some((finding) => finding.title.includes("error state")),
  );
  check(
    "not running Lighthouse is not itself a finding when the backend answered",
    !crowded.perf.some(
      (finding) =>
        finding.kind === "gap" && finding.title.startsWith("No Lighthouse"),
    ),
  );

  const skipped = deriveFindings({
    interaction: interaction({}),
    cycles: 5,
    lighthouse: [],
    backend: offline,
  });
  check(
    "an interaction that stubs its own API is not told it measured an error state",
    !skipped.perf.some((finding) => finding.title.includes("error state")),
  );
  check(
    "the skipped audit is recorded as a gap",
    skipped.perf.some(
      (finding) =>
        finding.kind === "gap" && finding.title.startsWith("No Lighthouse run"),
    ),
  );

  const auditedByStubs = deriveFindings({
    interaction: interaction({}),
    cycles: 5,
    lighthouse: [],
    backend: stubbed,
  });
  check(
    "an audit served by the repo's stubs says so",
    auditedByStubs.perf.some((finding) =>
      finding.title.startsWith("The audit ran against the repo's API stubs"),
    ),
  );
  check(
    "a stubbed audit is not called an error state",
    !auditedByStubs.perf.some((finding) =>
      finding.title.includes("error state"),
    ),
  );
  check(
    "a stubbed audit is not a gap: the measurement exists",
    !auditedByStubs.perf.some((finding) => finding.kind === "gap"),
  );

  const audit = (
    scores: Record<string, number>,
  ): ReturnType<typeof deriveFindings> =>
    deriveFindings({
      interaction: interaction({}),
      cycles: 5,
      lighthouse: [
        {
          route: "/editor",
          formFactor: "desktop",
          mode: "selftest",
          platform: "desktop-web",
          environment: {
            lighthouse: "selftest",
            limitations: "local dev server",
          },
          scores,
        },
      ],
      backend: healthy,
    });
  const scored = audit({
    performance: 42,
    accessibility: 88,
    "best-practices": 95,
  });
  equal(
    "a Lighthouse category below budget lands in its viewer group",
    scored.a11y.length,
    1,
  );
  check(
    "the accessibility score is named with its value",
    scored.a11y[0]?.title === "Lighthouse accessibility 88 (desktop /editor)",
    scored.a11y[0]?.title,
  );
  equal(
    "a 42 performance score is high severity",
    scored.perf.find((finding) => finding.kind === "budget")?.severity,
    "high",
  );
  check(
    "a category above budget is not a finding",
    scored.behavior.length === 0,
  );
  check(
    "the audit's own limitations become the finding's confidence",
    scored.a11y[0]?.confidence === "local dev server",
    scored.a11y[0]?.confidence,
  );
  check(
    "an audit of the error state says so",
    deriveFindings({
      interaction: interaction({}),
      cycles: 5,
      lighthouse: [
        {
          route: "/editor",
          formFactor: "desktop",
          mode: "selftest",
          platform: "desktop-web",
          environment: { lighthouse: "selftest" },
          scores: { performance: 42 },
        },
      ],
      backend: offline,
    }).perf.some((finding) =>
      finding.title.startsWith("These scores describe"),
    ),
  );
}

/**
 * A claim is the other half of a verdict: a number can be quoted correctly and
 * still not answer the question the change was asked. The self-test pins which
 * statements the harness is allowed to make, and that an unanswered one says so
 * instead of reading as supported.
 */
function claims(): void {
  const healthy: BackendState = {
    ok: true,
    source: "live",
    endpoint: "http://127.0.0.1:8080/api/v1/config/app-config",
    detail: "answered 200",
  };
  const interaction = (metrics: Record<string, unknown>): PerfInteraction => ({
    id: "selftest",
    name: "self-test interaction",
    platform: "desktop-web",
    window: "self-test window",
    provenance: { instrumentation: "selftest" },
    metrics,
  });
  const audit = (performance: number): LighthouseRun => ({
    route: "/editor",
    formFactor: "desktop",
    mode: "selftest",
    platform: "desktop-web",
    environment: { lighthouse: "selftest" },
    scores: { performance },
  });
  const derived = (
    metrics: Record<string, unknown>,
    runs: LighthouseRun[] = [],
  ): ReturnType<typeof deriveClaims> =>
    deriveClaims({
      interaction: interaction(metrics),
      cycles: 5,
      lighthouse: runs,
      backend: healthy,
    });

  const quiet = derived(
    {
      "memory.jsHeapBaselineMB": 40,
      "memory.jsHeapFinalMB": 41,
      "rendering.blockingMs": 0,
      "latency.durationMs": 20,
    },
    [audit(95)],
  );
  equal(
    "a claim with a measurement behind it is supported",
    quiet.filter((claim) => claim.status === "supported").length,
    4,
  );
  equal(
    "only the reuse claim is left unanswered by these numbers",
    quiet.filter((claim) => claim.status === "not-measured").length,
    1,
  );
  check(
    "reuse is not claimed from heap counters",
    quiet
      .find((claim) => claim.claim.startsWith("Raster storage is reused"))
      ?.note.includes("raster pool") === true,
  );

  const retained = derived({
    "memory.jsHeapBaselineMB": 24.5,
    "memory.jsHeapFinalMB": 54.2,
  });
  const heap = retained.find((claim) =>
    claim.claim.startsWith("Retained JS heap"),
  );
  equal(
    "retention over the budget contradicts the claim",
    heap?.status,
    "unsupported",
  );
  check(
    "the contradicted claim quotes the numbers that contradicted it",
    (heap?.evidence ?? []).some((entry) =>
      entry.startsWith("memory.jsHeapFinalMB"),
    ),
    (heap?.evidence ?? []).join(", "),
  );
  check(
    "the note says what the retention bound does not prove",
    heap?.note.includes("bounds the retention") === true,
    heap?.note,
  );

  const blocked = derived({ "rendering.blockingMs": 371 });
  equal(
    "a blocked main thread contradicts the responsiveness claim",
    blocked.find((claim) =>
      claim.claim.startsWith("The main thread is not blocked"),
    )?.status,
    "unsupported",
  );

  const unmeasured = derived({});
  equal(
    "a claim whose metric was never recorded is not measured",
    unmeasured.filter((claim) => claim.status === "not-measured").length,
    5,
  );
  check(
    "an unmeasured claim says what was missing",
    unmeasured
      .find((claim) => claim.claim.startsWith("Retained JS heap"))
      ?.note.includes("no heap counter") === true,
  );
  check(
    "an unmeasured claim names the absent keys rather than dropping them",
    (
      unmeasured.find((claim) =>
        claim.claim.startsWith("The slowest recorded interaction"),
      )?.evidence ?? []
    ).some((entry) => entry.endsWith("=absent")),
  );
  check(
    "a claim with no audit behind it names the missing run",
    unmeasured
      .find((claim) => claim.claim.startsWith("The audited route"))
      ?.evidence.includes("lighthouse.runs=absent") === true,
  );
  check(
    "no audit means nothing answers the budget claim",
    unmeasured
      .find((claim) => claim.claim.startsWith("The audited route"))
      ?.note.includes("no audit ran") === true,
  );
}

/**
 * The stub backend is what makes an audit see the feature instead of an error
 * screen, so its routing and the server it actually starts are both checked: a
 * matcher that answers the wrong path is worse than no stub at all.
 */
async function stubBackend(): Promise<void> {
  check(
    "an exact stub glob matches its path",
    matchStubPath("**/api/v1/info/status", "/api/v1/info/status"),
  );
  check(
    "an exact stub glob does not match a longer path",
    !matchStubPath("**/api/v1/info/status", "/api/v1/info/status/extra"),
  );
  check(
    "a trailing-wildcard glob matches the endpoint slug it names",
    matchStubPath(
      "**/api/v1/config/endpoint-enabled*",
      "/api/v1/config/endpoint-enabled",
    ),
  );
  check(
    "a path-prefix glob matches everything below it",
    matchStubPath(
      "**/api/v1/admin/settings/section/**",
      "/api/v1/admin/settings/section/aiEngine",
    ),
  );
  const stubs = [
    { glob: "**/api/v1/proprietary/**", body: { from: "broad" } },
    { glob: "**/api/v1/proprietary/ui-data/login", body: { from: "narrow" } },
  ];
  const lastWins = stubFor("/api/v1/proprietary/ui-data/login", stubs);
  equal(
    "the last registered stub wins, as it does in Playwright",
    lastWins ? (lastWins.body as { from: string }).from : null,
    "narrow",
  );

  const server = await startStubBackend({ port: 0 });
  try {
    const { endpoint } = server;
    const config = await fetch(`${endpoint}${CONFIG_PATH}`);
    equal(
      "the stub backend serves the app's bootstrap config",
      config.status,
      200,
    );
    const body = (await config.json()) as Record<string, unknown>;
    check(
      "the stub config carries the shape the app reads",
      "enableLogin" in body,
      JSON.stringify(Object.keys(body).slice(0, 5)),
    );
    equal(
      "an unlisted API path answers the dead proxy's 500",
      (await fetch(`${endpoint}/api/v1/nothing/here`)).status,
      500,
    );
    equal(
      "a non-API path is not answered by the stubs",
      (await fetch(`${endpoint}/index.html`)).status,
      404,
    );
  } finally {
    await server.close();
  }
}

/**
 * The Findings tab is the surface the verdicts have to actually reach, and a
 * template change that throws only shows up in a browser.
 */
async function findingsTabRenders(reportPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(reportPath).href);
    await page.getByRole("button", { name: "Findings" }).click();
    const pane = page.locator("#summary-pane");
    await pane.locator(".rollup").waitFor();
    const roll = await pane.locator(".rollup").innerText();
    check(
      "the Findings tab rolls up what was measured",
      roll.includes("1 measured interaction(s)") &&
        roll.includes("1 Lighthouse run(s)"),
      roll,
    );
    equal(
      "a finding's kind is rendered as a chip",
      (await pane.locator(".card .kind").first().innerText()).toLowerCase(),
      "observation",
    );
    check(
      "a finding's evidence is rendered with it",
      (await pane.locator(".card .evidence").first().innerText()).includes(
        "metrics.selftest=1",
      ),
    );
    check(
      "an excluded platform's reason reaches the report, not just the manifest",
      (await pane.locator(".matrix").innerText()).includes(
        "the webview loads this code but no Tauri runner exists here",
      ),
      await pane.locator(".matrix").innerText(),
    );
  } finally {
    await browser.close();
  }
}

reductions();
probeScript();
findings();
claims();
await stubBackend();
await chartsAndRaster();
lighthouseResolver();
await auditSetup();
await previewCapture();
await fragmentRoundTrip();

process.stdout.write(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
  process.exit(1);
}
