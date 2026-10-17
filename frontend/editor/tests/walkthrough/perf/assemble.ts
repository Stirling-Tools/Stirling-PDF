/**
 * Turns a raw measurement into the manifest fragment `report.py` validates.
 *
 * The reductions live here rather than in the collector so the numbers in the
 * report can be recomputed from the same sample set by `selftest.ts`, and so an
 * area the browser cannot measure is recorded under `metrics.unavailable`
 * instead of being flattened to `0`.
 */

import type { Browser } from "playwright";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  breakdownChart,
  recoveryChart,
  renderingChart,
  timelineChart,
  rasterise,
  type BarRow,
  type CycleRow,
} from "./charts";
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
import { splitResourceSizes } from "./probe";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { CollectResult, CollectOptions } from "./collect-web";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { CdpSnapshot, InteractionSample, PerfInteraction } from "./types";

export interface AssembleOptions {
  /** Human context for the provenance block, e.g. "uid=x; dependencies are shims asserted with lock". */
  fixture: string;
  build: string;
  /** Reported as-is; the collector cannot know whether a build was instrumented. */
  instrumentation: string;
  cycles: number;
  idleBaselineMs: number;
  sampleIntervalMs: number;
  browserVersion: string;
  pictureDir: string;
}

interface CpuProfileNode {
  callFrame?: { functionName?: string; url?: string; lineNumber?: number };
  hitCount?: number;
}

/** Self time from a V8 CPU profile, as `hitCount` (µs sampling) totals. */
export function topFunctions(
  profile: { nodes?: CpuProfileNode[]; samples?: number[] },
  limit = 8,
): { name: string; selfMs: number }[] {
  const nodes = Array.isArray(profile.nodes) ? profile.nodes : [];
  const samplingMicros = 1000;
  return nodes
    .map((node) => ({
      name: [
        node.callFrame?.functionName || "(anonymous)",
        node.callFrame?.url || "",
      ]
        .filter(Boolean)
        .join(" "),
      selfMs: ((node.hitCount ?? 0) * samplingMicros) / 1000,
    }))
    .filter((entry) => entry.selfMs > 0)
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, limit)
    .map((entry) => ({ name: entry.name, selfMs: round(entry.selfMs) }));
}

function cycleRows(sample: InteractionSample): CycleRow[] {
  const rows: CycleRow[] = [];
  const cycleMarks = sample.marks.filter((mark) =>
    mark.label.startsWith("cycle "),
  );
  cycleMarks.forEach((mark, index) => {
    const previous =
      index === 0
        ? sample.marks.find((m) => m.label === "cycles")
        : cycleMarks[index - 1];
    const from = previous ? previous.at : mark.at;
    const to = mark.at;
    const inside = sample.samples.filter((s) => s.at > from && s.at <= to);
    if (inside.length < 2) {
      rows.push({
        label: `c${index + 1}`,
        layout: 0,
        recalcStyle: 0,
        longTasks: 0,
      });
      return;
    }
    const delta = snapshotDelta(inside[0], inside[inside.length - 1]);
    rows.push({
      label: `c${index + 1}`,
      layout: delta.layout,
      recalcStyle: delta.recalcStyle,
      longTasks: sample.probe.longTasks.filter(
        (task) => task.start > from && task.start <= to,
      ).length,
    });
  });
  return rows;
}

function windowSpan(sample: InteractionSample): number {
  const marks = sample.marks;
  const end = marks.find((mark) => mark.label === "end");
  const start = marks.find((mark) => mark.label === "baseline");
  if (!end || !start) return 0;
  return Math.max(0, end.at - start.at);
}

function unavailableList(
  sample: InteractionSample,
  result: CollectResult,
  extra: string[],
): string[] {
  const items = new Set([...result.unavailable, ...extra]);
  if (sample.workers.targets.length === 0) {
    items.add(
      "Web Workers (no worker target was alive in the observed window)",
    );
  }
  if (sample.probe.resources.length === 0) {
    items.add("network requests (no resource timing entries in this window)");
  }
  return [...items];
}

/** Builds the `performance.interactions[]` entry, pictures included. */
export async function assembleInteraction(
  browser: Browser,
  options: CollectOptions,
  result: CollectResult,
  assemble: AssembleOptions,
): Promise<PerfInteraction> {
  const sample = result.sample;
  const cycles = cycleRows(sample);
  const span = windowSpan(sample);
  const unavailable: string[] = [];
  // How each metric came to be, or failed to. A key with no value at all is
  // still a fact worth recording: `blocked` and `not-collected` say why the
  // number is missing, which is not the same as a measured zero.
  const states: Record<string, string> = {};
  const longTasks = longTaskStats(sample.probe.longTasks);
  const dom = domStats(sample.samples);
  const heap = heapStats(sample.samples);
  const react = reactStats(sample.probe);
  const latency = interactionLatency(sample.probe);
  const sizes = splitResourceSizes(sample.probe.resources);
  // Counter deltas stop at the last unsettled sample: the closing forced-GC
  // pause would otherwise be charged to the interaction as task time.
  const counterSamples = sample.samples.filter((entry) => !entry.settled);
  const firstSample: CdpSnapshot | null = counterSamples.length
    ? counterSamples[0]
    : null;
  const lastSample: CdpSnapshot | null = counterSamples.length
    ? counterSamples[counterSamples.length - 1]
    : null;

  const cpuProfilePath = result.artifacts.find((path) =>
    path.endsWith(".cpuprofile"),
  );
  let hotspot = "";
  if (cpuProfilePath) {
    const loaded = await import("node:fs").then(
      (fs) =>
        JSON.parse(fs.readFileSync(cpuProfilePath, "utf8")) as {
          nodes?: CpuProfileNode[];
        },
      () => null,
    );
    if (loaded) {
      const top = topFunctions(loaded);
      hotspot = top
        .map((entry) => `${entry.name} ${entry.selfMs}ms`)
        .join(" | ");
    }
  }

  const metrics: Record<string, unknown> = {};
  metrics["harness.api"] =
    "the page's API calls are answered by the repo's Playwright route stubs, which is how the app renders without a backend; nothing here measures a live backend";
  metrics["dom.baselineNodes"] = dom.baselineNodes;
  metrics["dom.peakNodes"] = dom.peakNodes;
  metrics["dom.finalNodes"] = dom.finalNodes;
  metrics["dom.settledNodes"] = dom.settledNodes;
  metrics["dom.baselineAttachedNodes"] = dom.baselineAttachedNodes;
  metrics["dom.attachedNodes"] =
    dom.settledAttachedNodes ?? dom.finalAttachedNodes;
  metrics["dom.note"] =
    "`dom.*Nodes` are CDP DomCounter nodes, which include nodes the renderer holds outside the document; `settledNodes` is read after a forced GC. `dom.attachedNodes` is `document.querySelectorAll('*').length`, the elements a reader would count, taken with the settled sample when the run produced one.";
  metrics["dom.documents"] = dom.documents;
  metrics["dom.frames"] = dom.frames;
  metrics["dom.retentionComparable"] = dom.comparable;
  if (!dom.comparable) {
    metrics["dom.reloadNote"] =
      "`dom.baseline*` and `dom.attachedNodes` come from different documents: the run navigated, so the two counts are two page loads, not growth.";
  }
  if (react) {
    metrics["react.commits"] = react.commits;
    metrics["react.renderTotalMs"] = react.totalRenderMs;
    metrics["react.renderMaxMs"] = react.maxRenderMs;
    metrics["react.note"] =
      "root commit actualDuration for the hooked renderer; not total interaction time";
  }
  metrics["memory.jsHeapBaselineMB"] =
    heap.baselineBytes === null ? null : round(heap.baselineBytes / 1048576);
  metrics["memory.jsHeapPeakMB"] =
    heap.peakBytes === null ? null : round(heap.peakBytes / 1048576);
  metrics["memory.jsHeapFinalMB"] =
    heap.finalBytes === null ? null : round(heap.finalBytes / 1048576);
  metrics["memory.retainedFraction"] = heap.retainedFraction;
  metrics["memory.jsHeapSettledMB"] =
    heap.settledBytes === null ? null : round(heap.settledBytes / 1048576);
  metrics["memory.settledRetainedFraction"] = heap.settledRetainedFraction;
  metrics["memory.note"] =
    "browser JS heap only; native/process memory is not visible to CDP; `jsHeapSettledMB` is read after a forced GC, so it is what the cycle kept rather than the garbage still pending collection";
  metrics["memory.retentionComparable"] = heap.comparable;
  if (!heap.comparable) {
    metrics["memory.reloadNote"] =
      "the run navigated: a reload cannot retain heap, so `jsHeapBaselineMB` and `jsHeapSettledMB` belong to two different documents and their difference is not retention.";
  }
  // A run that reloaded the page cannot speak about retention: its baseline and
  // its closing reading are two documents, so their difference describes two
  // page loads. The numbers stay, flagged, and the areas list says why.
  if (!dom.comparable || !heap.comparable) {
    unavailable.push(
      "retention across a document reload (the run navigated, so its before/after readings are two page loads)",
    );
    for (const key of [
      "dom.baselineNodes",
      "dom.finalNodes",
      "dom.settledNodes",
      "dom.baselineAttachedNodes",
      "dom.attachedNodes",
      "memory.jsHeapBaselineMB",
      "memory.jsHeapFinalMB",
      "memory.jsHeapSettledMB",
      "memory.retainedFraction",
      "memory.settledRetainedFraction",
    ]) {
      states[key] = "incomparable";
    }
  }
  if (firstSample && lastSample) {
    const delta = snapshotDelta(firstSample, lastSample);
    metrics["cpu.taskDurationMs"] = delta.taskDurationMs;
    metrics["cpu.scriptDurationMs"] = delta.scriptDurationMs;
    metrics["cpu.scriptShareOfTask"] =
      delta.taskDurationMs > 0
        ? round(delta.scriptDurationMs / delta.taskDurationMs, 3)
        : null;
    metrics["rendering.layoutCount"] = delta.layout;
    metrics["rendering.recalcStyleCount"] = delta.recalcStyle;
    metrics["rendering.layoutMs"] = delta.layoutDurationMs;
    metrics["rendering.recalcStyleMs"] = delta.recalcStyleDurationMs;
    metrics["rendering.framesRendered"] = delta.frames;
  } else {
    unavailable.push("CPU/rendering counters (no CDP snapshot was captured)");
    // The counters exist in the protocol; the run never got a snapshot to read
    // them from, so nothing about the page blocked them.
    for (const key of [
      "cpu.taskDurationMs",
      "cpu.scriptDurationMs",
      "cpu.scriptShareOfTask",
      "rendering.layoutCount",
      "rendering.recalcStyleCount",
      "rendering.layoutMs",
      "rendering.recalcStyleMs",
      "rendering.framesRendered",
    ]) {
      states[key] = "blocked";
    }
  }
  metrics["rendering.longTaskCount"] = longTasks.count;
  metrics["rendering.longestTaskMs"] = longTasks.longestMs;
  metrics["rendering.longTaskTotalMs"] = longTasks.totalMs;
  metrics["rendering.blockingMs"] = longTasks.blockingMs;
  metrics["rendering.note"] =
    "blocking = sum(duration - 50ms) for tasks over 50ms; not Lighthouse Total Blocking Time";
  if (latency) {
    metrics["latency.event"] = latency.name;
    metrics["latency.inputDelayMs"] = latency.inputDelayMs;
    metrics["latency.processingMs"] = latency.processingMs;
    metrics["latency.durationMs"] = latency.durationMs;
  } else {
    unavailable.push(
      "interaction latency (event timing reported no interaction in this window)",
    );
    // The scenario drove no input this window, so the browser never observed an
    // interaction to time: not collected, not blocked.
    for (const key of [
      "latency.event",
      "latency.inputDelayMs",
      "latency.processingMs",
      "latency.durationMs",
    ]) {
      states[key] = "not-collected";
    }
  }
  metrics["network.requests"] = sample.probe.resources.length;
  metrics["network.knownBytes"] = sizes.knownBytes;
  if (sizes.unknownSizeCount) {
    metrics["network.unknownSizeRequests"] = sizes.unknownSizeCount;
    metrics["network.note"] =
      "cross-origin responses without Timing-Allow-Origin report 0 bytes; they are counted as unknown, not zero-byte";
  }
  metrics["resources.workerTargets"] = sample.workers.targets.length;
  metrics["resources.workerUrls"] = sample.workers.urls.length
    ? sample.workers.urls
    : "none observed";
  metrics["window.totalMs"] = round(span);
  metrics["window.samples"] = sample.samples.length;
  if (hotspot) metrics["cpu.hotspots"] = hotspot;

  // Everything the run recorded is `measured`; a key that is present but null
  // says the browser could not report it. States recorded in the branches above
  // stand, and prose keys are left out: a sentence is not a measurement.
  for (const [key, value] of Object.entries(metrics)) {
    if (
      states[key] ||
      key.endsWith(".note") ||
      key.endsWith("Note") ||
      key === "harness.api"
    ) {
      continue;
    }
    states[key] =
      value === null || value === undefined ? "unsupported" : "measured";
  }
  metrics["states"] = states;

  const pictures: Record<string, string> = {};
  const suffix = `${options.scenario.platform}-${options.scenario.id}`;
  const timelinePath = `${assemble.pictureDir}/${suffix}-timeline.png`;
  const breakdownPath = `${assemble.pictureDir}/${suffix}-breakdown.png`;
  const renderingPath = `${assemble.pictureDir}/${suffix}-rendering.png`;
  const recoveryPath = `${assemble.pictureDir}/${suffix}-recovery.png`;
  await rasterise(
    browser,
    timelineChart(
      sample.probe.longTasks,
      sample.marks.filter((mark) => mark.label !== "end"),
      span,
    ),
    timelinePath,
  );
  pictures.timeline = timelinePath;
  const breakdownRows: BarRow[] = [
    {
      label: "Script (CDP scriptDuration)",
      value:
        firstSample && lastSample
          ? snapshotDelta(firstSample, lastSample).scriptDurationMs
          : 0,
      unit: "ms",
    },
    {
      label: "Layout",
      value:
        firstSample && lastSample
          ? snapshotDelta(firstSample, lastSample).layoutDurationMs
          : 0,
      unit: "ms",
    },
    {
      label: "Style recalc",
      value:
        firstSample && lastSample
          ? snapshotDelta(firstSample, lastSample).recalcStyleDurationMs
          : 0,
      unit: "ms",
    },
    {
      label: "Long-task total",
      value: longTasks.totalMs,
      unit: "ms",
      tone: "warn",
    },
    {
      label: "Blocking (>50ms share)",
      value: longTasks.blockingMs,
      unit: "ms",
      tone: "warn",
    },
  ];
  await rasterise(
    browser,
    breakdownChart(
      breakdownRows.filter((row) => Number(row.value) > 0),
      `measured across the ${round(span)} ms window; categories come from CDP Performance counters, so they are additive only within that metric set`,
    ),
    breakdownPath,
  );
  pictures.breakdown = breakdownPath;
  await rasterise(
    browser,
    renderingChart(
      cycles,
      `${cycles.length} open/use/close cycle(s); counts are CDP deltas per cycle, long tasks by start time`,
    ),
    renderingPath,
  );
  pictures.rendering = renderingPath;
  const attachedEnd = dom.settledAttachedNodes ?? dom.finalAttachedNodes;
  const attachedCaption =
    attachedEnd === null || dom.baselineAttachedNodes === null
      ? ""
      : `; attached elements ${dom.baselineAttachedNodes} → ${attachedEnd}`;
  await rasterise(
    browser,
    recoveryChart(
      sample.samples,
      `baseline ${dom.baselineNodes} nodes / ${heap.baselineBytes === null ? "?" : round(heap.baselineBytes / 1048576)} MB → peak ${dom.peakNodes} nodes → final ${dom.finalNodes} nodes → settled ${dom.settledNodes ?? "?"} nodes / ${heap.settledBytes === null ? "?" : round(heap.settledBytes / 1048576)} MB after a forced GC${attachedCaption}`,
    ),
    recoveryPath,
  );
  pictures.recovery = recoveryPath;

  return {
    id: options.scenario.id,
    name: options.scenario.name,
    platform: options.scenario.platform,
    window: `idle ${assemble.idleBaselineMs} ms baseline + ${assemble.cycles}x open/use/close + ${assemble.idleBaselineMs} ms recovery`,
    provenance: {
      instrumentation: assemble.instrumentation,
      build: assemble.build,
      fixture: assemble.fixture,
      input: `${assemble.cycles} open/use/close cycles driven by scenario ${options.scenario.id}`,
      gesture: result.drivenBy || "scenario reported no gesture",
      profile: `${options.scenario.platform}, chromium ${assemble.browserVersion}, sampled every ${assemble.sampleIntervalMs} ms`,
      windowMs: round(span),
      note: "counters and the CPU profile are collected while the same browser drives the UI; overhead is present and the numbers are not uninstrumented production performance",
    },
    metrics: {
      ...metrics,
      unavailable: unavailableList(sample, result, unavailable),
    },
    pictures,
    artifacts: result.artifacts,
  } satisfies PerfInteraction;
}
