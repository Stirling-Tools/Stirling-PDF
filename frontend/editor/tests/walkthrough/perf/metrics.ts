/**
 * Pure reductions over recorded samples. Kept free of browser and Playwright
 * imports so `selftest.ts` can check the arithmetic on synthetic input — a
 * wrong reduction would silently misreport every future walkthrough.
 */

// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { CdpSnapshot, LongTaskEntry, PageProbe } from "./types";

/** A task over this is "long" (RAIL); its blocking share is the excess. */
export const LONG_TASK_MS = 50;

export interface LongTaskStats {
  count: number;
  totalMs: number;
  longestMs: number;
  /** Sum of `duration - 50` for tasks over 50 ms. */
  blockingMs: number;
}

export function longTaskStats(entries: LongTaskEntry[]): LongTaskStats {
  let totalMs = 0;
  let longestMs = 0;
  let blockingMs = 0;
  for (const entry of entries) {
    totalMs += entry.duration;
    if (entry.duration > longestMs) longestMs = entry.duration;
    if (entry.duration > LONG_TASK_MS)
      blockingMs += entry.duration - LONG_TASK_MS;
  }
  return {
    count: entries.length,
    totalMs: round(totalMs),
    longestMs: round(longestMs),
    blockingMs: round(blockingMs),
  };
}

export function peak<T extends CdpSnapshot>(
  samples: T[],
  pick: (snapshot: CdpSnapshot) => number,
): number | null {
  let best: number | null = null;
  for (const sample of samples) {
    const value = pick(sample);
    if (best === null || value > best) best = value;
  }
  return best;
}

export function first<T>(samples: T[]): T | null {
  return samples.length ? samples[0] : null;
}

export function last<T>(samples: T[]): T | null {
  return samples.length ? samples[samples.length - 1] : null;
}

export interface CounterDelta {
  layout: number;
  recalcStyle: number;
  script: number;
  task: number;
  layoutDurationMs: number;
  recalcStyleDurationMs: number;
  scriptDurationMs: number;
  taskDurationMs: number;
  frames: number;
}

export function snapshotDelta(
  from: CdpSnapshot,
  to: CdpSnapshot,
): CounterDelta {
  return {
    layout: to.layoutCount - from.layoutCount,
    recalcStyle: to.recalcStyleCount - from.recalcStyleCount,
    script: round(to.scriptDuration - from.scriptDuration),
    task: round(to.taskDuration - from.taskDuration),
    layoutDurationMs: round((to.layoutDuration - from.layoutDuration) * 1000),
    recalcStyleDurationMs: round(
      (to.recalcStyleDuration - from.recalcStyleDuration) * 1000,
    ),
    scriptDurationMs: round((to.scriptDuration - from.scriptDuration) * 1000),
    taskDurationMs: round((to.taskDuration - from.taskDuration) * 1000),
    frames: to.frames - from.frames,
  };
}

export interface HeapStats {
  baselineBytes: number | null;
  peakBytes: number | null;
  finalBytes: number | null;
  /** Final minus baseline, as a share of baseline; null when baseline is 0. */
  retainedFraction: number | null;
  /** Final reading taken after a forced GC, when the run produced one. */
  settledBytes: number | null;
  settledRetainedFraction: number | null;
  /**
   * False when the run reloaded the page: a reload cannot retain heap, so a
   * baseline taken before it and a reading after it are two page loads, and
   * their difference must not be reported as what a cycle kept.
   */
  comparable: boolean;
}

function settledLast(samples: CdpSnapshot[]): CdpSnapshot | null {
  const settled = samples.filter((sample) => sample.settled);
  return settled.length ? settled[settled.length - 1] : null;
}

/**
 * Whether the first and last samples came from the same document, read from
 * `performance.timeOrigin`, which changes on every navigation.
 */
export function sameDocument(samples: CdpSnapshot[]): boolean {
  const firstSample = first(samples);
  const lastSample = last(samples);
  if (firstSample?.timeOrigin == null || lastSample?.timeOrigin == null) {
    return true;
  }
  return firstSample.timeOrigin === lastSample.timeOrigin;
}

export function heapStats(samples: CdpSnapshot[]): HeapStats {
  const baseline = first(samples);
  const finalSample = last(samples);
  const peakBytes = peak(samples, (snapshot) => snapshot.jsHeapUsedSize);
  const baselineBytes = baseline ? baseline.jsHeapUsedSize : null;
  const finalBytes = finalSample ? finalSample.jsHeapUsedSize : null;
  const settledBytes = settledLast(samples)?.jsHeapUsedSize ?? null;
  return {
    baselineBytes,
    peakBytes,
    finalBytes,
    retainedFraction:
      baselineBytes && finalBytes !== null
        ? round((finalBytes - baselineBytes) / baselineBytes, 3)
        : null,
    settledBytes,
    settledRetainedFraction:
      baselineBytes && settledBytes !== null
        ? round((settledBytes - baselineBytes) / baselineBytes, 3)
        : null,
    comparable: sameDocument(samples),
  };
}

export interface DomStats {
  baselineNodes: number | null;
  peakNodes: number | null;
  finalNodes: number | null;
  /** Node count after a forced GC, when the run produced one. */
  settledNodes: number | null;
  /** Attached element counts, read from the page rather than from CDP. */
  baselineAttachedNodes: number | null;
  finalAttachedNodes: number | null;
  settledAttachedNodes: number | null;
  documents: number | null;
  frames: number | null;
  /** False when the run reloaded the page; see `HeapStats.comparable`. */
  comparable: boolean;
}

export function domStats(samples: CdpSnapshot[]): DomStats {
  const baseline = first(samples);
  const finalSample = last(samples);
  const settled = settledLast(samples);
  const peakNodes = peak(samples, (snapshot) => snapshot.nodes);
  return {
    baselineNodes: baseline ? baseline.nodes : null,
    peakNodes,
    finalNodes: finalSample ? finalSample.nodes : null,
    settledNodes: settled?.nodes ?? null,
    baselineAttachedNodes: baseline ? baseline.attachedNodes : null,
    finalAttachedNodes: finalSample ? finalSample.attachedNodes : null,
    settledAttachedNodes: settled ? settled.attachedNodes : null,
    documents: baseline ? baseline.documents : null,
    frames: baseline ? baseline.frames : null,
    comparable: sameDocument(samples),
  };
}

export interface ReactStats {
  commits: number;
  /** Sum of committed root `actualDuration`, when the renderer reported it. */
  totalRenderMs: number | null;
  maxRenderMs: number | null;
}

export function reactStats(probe: PageProbe): ReactStats | null {
  if (!probe.commits.length) return null;
  const durations = probe.commits
    .map((commit) => commit.duration)
    .filter((value): value is number => typeof value === "number");
  return {
    commits: probe.commits.length,
    totalRenderMs: durations.length ? round(sum(durations)) : null,
    maxRenderMs: durations.length ? round(Math.max(...durations)) : null,
  };
}

/** Longest input→next-paint candidate in the event-timing entries. */
export function interactionLatency(probe: PageProbe): {
  name: string;
  inputDelayMs: number;
  processingMs: number;
  durationMs: number;
} | null {
  let best: {
    name: string;
    inputDelayMs: number;
    processingMs: number;
    durationMs: number;
  } | null = null;
  for (const event of probe.events) {
    if (best === null || event.duration > best.durationMs) {
      best = {
        name: event.name,
        inputDelayMs: round(event.processingStart - event.start),
        processingMs: round(
          Math.max(0, event.start + event.duration - event.processingStart),
        ),
        durationMs: round(event.duration),
      };
    }
  }
  return best;
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function ms(value: number): string {
  return `${round(value)} ms`;
}

export function mb(bytes: number): string {
  return `${round(bytes / (1024 * 1024))} MB`;
}
