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
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { createContext, runInContext } from "node:vm";
import { chromium } from "playwright";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  breakdownChart,
  rasterise,
  recoveryChart,
  renderingChart,
  timelineChart,
} from "./charts";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { resolveLighthouse } from "./collect-lighthouse";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  domStats,
  heapStats,
  interactionLatency,
  longTaskStats,
  reactStats,
  round,
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
import { assertSerializable } from "./serialize";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { CdpSnapshot, PageProbe } from "./types";

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
      documents: 1,
      frames: 2,
      jsHeapUsedSize: 1000,
    }),
    snapshot({
      at: 750,
      nodes: 9,
      documents: 1,
      frames: 2,
      jsHeapUsedSize: 3000,
    }),
    snapshot({
      at: 1500,
      nodes: 7,
      documents: 1,
      frames: 2,
      jsHeapUsedSize: 2500,
    }),
  ];
  equal("domStats reports baseline/peak/final", domStats(samples), {
    baselineNodes: 5,
    peakNodes: 9,
    finalNodes: 7,
    documents: 1,
    frames: 2,
  });
  equal("heapStats reports growth against baseline", heapStats(samples), {
    baselineBytes: 1000,
    peakBytes: 3000,
    finalBytes: 2500,
    retainedFraction: 1.5,
  });
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

/** The measured fragment must survive report.py unchanged. */
function fragmentRoundTrip(): void {
  const dir = mkdtempSync(join(tmpdir(), "wt-roundtrip-"));
  try {
    writePng(join(dir, "view-light.png"));
    writePng(join(dir, "view-dark.png"), [30, 20, 10]);
    writePng(join(dir, "pic-timeline.png"), [1, 2, 3]);
    const manifest = {
      feature: "harness self-test",
      generated: "now",
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
      findings: {},
      performance: {
        interactions: [
          {
            id: "editor-settings-cycle",
            name: "Editor · open Settings, switch section, close",
            platform: "desktop-web",
            window:
              "idle 4000 ms baseline + 5x open/use/close + 4000 ms recovery",
            provenance: { instrumentation: "selftest", build: "selftest" },
            metrics: { "rendering.longTaskCount": 0 },
            pictures: { timeline: "pic-timeline.png" },
          },
        ],
      },
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

reductions();
probeScript();
await chartsAndRaster();
lighthouseResolver();
fragmentRoundTrip();

process.stdout.write(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
  process.exit(1);
}
