/**
 * Delivers a sweep's results into the workbench, opening each run's results as it settles:
 * waiting for the whole sweep would hold everything behind the slowest file.
 */

import {
  fetchProcessingFolderRuns,
  fetchRunOutputFile,
  type ProcessingFolderRun,
  type ProcessingRunOutput,
} from "@app/services/processingFolderApi";

const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED"];
/** Fast polls first — the earliest finishes land within seconds — then a steady 1s,
 *  budgeted to ~15 minutes overall. */
const FAST_POLL_MS = 400;
const FAST_POLLS = 25;
const POLL_MS = 1000;
const MAX_POLLS = 925;
/** Result downloads run a few at a time: parallel enough to keep up with a burst
 *  of finishes, bounded so a hundred results don't open a hundred requests. */
const FETCH_CONCURRENCY = 4;
/** With no expected count, polls with zero runs before concluding nothing started. */
const NO_RUN_GRACE_POLLS = 20;

export interface SweepDeliveryProgress {
  /** Runs that completed successfully so far. */
  processed: number;
  /** Runs that failed or were cancelled so far. */
  failed: number;
  /** Result files opened into the workbench so far. */
  opened: number;
  /** True when the budget ran out with runs still unsettled. */
  stalled: boolean;
}

export interface RunSettlement {
  runId: string;
  /** The input document's display name, when the run's source recorded one. */
  fileName: string | null;
  failed: boolean;
  files: File[];
}

export interface SweepDeliveryCallbacks {
  /** Called after every poll with cumulative counts. */
  onProgress?: (progress: SweepDeliveryProgress) => void;
  /** Called after every poll with the folder's raw runs — live per-file state. */
  onRuns?: (runs: ProcessingFolderRun[]) => void;
  /** Called once per run as it settles, with the files opened for it. */
  onSettled?: (settlement: RunSettlement) => void;
  /** Polled each cycle; true stops the loop quietly (the caller cancelled). */
  isCancelled?: () => boolean;
  /** Runs to ignore entirely — a baseline captured before the sweep was triggered. */
  excludeRunIds?: ReadonlySet<string>;
  /** When set, only these runs count; everything else in the feed is ignored. */
  includeRunIds?: ReadonlySet<string>;
}

/** The folder's current run ids — captured before a sweep so its delivery can ignore them. */
export async function currentRunIds(
  policyId: string,
): Promise<ReadonlySet<string>> {
  const runs = await fetchProcessingFolderRuns(policyId).catch(() => []);
  return new Set(
    runs.map((run) => run.runId).filter((id): id is string => id != null),
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Map with a bounded number of in-flight promises; failed items resolve null. */
async function mapBounded<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        try {
          results[index] = await fn(items[index]);
        } catch (e) {
          // Logged rather than swallowed: a fetch failing for every file looks like
          // the feature simply not working.
          console.warn("[processing folders] could not open a result", e);
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * In-flight delivery per policy id. A second callback-less trigger for a folder joins the
 * running loop rather than starting its own.
 */
const deliveriesInFlight = new Map<string, Promise<SweepDeliveryProgress>>();

/**
 * Runs whose outputs are already in the workbench, per folder, held while any delivery for that
 * folder is live. Two deliveries for one folder overlap by design (a caller passing callbacks
 * must run its own loop to receive them) and both see the same settled run; the workbench
 * cannot dedup the result away, because a disk output File has no stable lastModified, so its
 * `name|size|lastModified` key differs on each fetch. Callbacks fire for both loops; only the
 * opening is claimed once.
 */
const openedRuns = new Map<string, Set<string>>();

/** Live deliveries per folder; the last one out releases that folder's opened set. */
const liveDeliveries = new Map<string, number>();

function enterDelivery(policyId: string): void {
  liveDeliveries.set(policyId, (liveDeliveries.get(policyId) ?? 0) + 1);
}

function leaveDelivery(policyId: string): void {
  const remaining = (liveDeliveries.get(policyId) ?? 1) - 1;
  if (remaining > 0) {
    liveDeliveries.set(policyId, remaining);
    return;
  }
  // Released with the last delivery, so a later sweep of the same folder is free to
  // open its results again rather than being suppressed by a stale set.
  liveDeliveries.delete(policyId);
  openedRuns.delete(policyId);
}

function claimRunForOpening(policyId: string, runId: string): boolean {
  let opened = openedRuns.get(policyId);
  if (!opened) {
    opened = new Set();
    openedRuns.set(policyId, opened);
  }
  if (opened.has(runId)) {
    return false;
  }
  opened.add(runId);
  return true;
}

/**
 * Poll `policyId`'s runs until they settle, opening each completed run's outputs into the
 * workbench via `addFiles`. A numeric `expected` stops there; `null` is for callers with no
 * count yet (the sweep runs behind the create response) and stops once every observed run is
 * terminal and stable, or after a grace period with no runs.
 *
 * A callback-less caller joins a delivery already running for the folder ({@link
 * deliveriesInFlight}); one that passes callbacks runs its own, so its callbacks always fire.
 */
export function deliverSweepResults(
  policyId: string,
  expected: number | null,
  addFiles: (
    files: File[],
    options?: { selectFiles?: boolean },
  ) => Promise<unknown>,
  callbacks?:
    | SweepDeliveryCallbacks
    | ((progress: SweepDeliveryProgress) => void),
): Promise<SweepDeliveryProgress> {
  if (callbacks) {
    return deliverSweepResultsUntracked(
      policyId,
      expected,
      addFiles,
      callbacks,
    );
  }
  const running = deliveriesInFlight.get(policyId);
  if (running) {
    return running;
  }
  const started = deliverSweepResultsUntracked(
    policyId,
    expected,
    addFiles,
  ).finally(() => {
    if (deliveriesInFlight.get(policyId) === started) {
      deliveriesInFlight.delete(policyId);
    }
  });
  deliveriesInFlight.set(policyId, started);
  return started;
}

async function deliverSweepResultsUntracked(
  policyId: string,
  expected: number | null,
  addFiles: (
    files: File[],
    options?: { selectFiles?: boolean },
  ) => Promise<unknown>,
  callbacks?:
    | SweepDeliveryCallbacks
    | ((progress: SweepDeliveryProgress) => void),
): Promise<SweepDeliveryProgress> {
  enterDelivery(policyId);
  try {
    return await deliverSweepResultsLoop(
      policyId,
      expected,
      addFiles,
      callbacks,
    );
  } finally {
    leaveDelivery(policyId);
  }
}

async function deliverSweepResultsLoop(
  policyId: string,
  expected: number | null,
  addFiles: (
    files: File[],
    options?: { selectFiles?: boolean },
  ) => Promise<unknown>,
  callbacks?:
    | SweepDeliveryCallbacks
    | ((progress: SweepDeliveryProgress) => void),
): Promise<SweepDeliveryProgress> {
  const {
    onProgress,
    onRuns,
    onSettled,
    isCancelled,
    excludeRunIds,
    includeRunIds,
  } =
    typeof callbacks === "function"
      ? { onProgress: callbacks }
      : (callbacks ?? {});
  const alreadySettled = new Set<string>();
  let quietPolls = 0;
  let seenAnyRun = false;
  const progress: SweepDeliveryProgress = {
    processed: 0,
    failed: 0,
    opened: 0,
    stalled: false,
  };

  const fetchRunFiles = async (
    outputs: ProcessingRunOutput[],
  ): Promise<File[]> =>
    (await mapBounded(outputs, FETCH_CONCURRENCY, fetchRunOutputFile)).filter(
      (file): file is File => file !== null,
    );

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    if (isCancelled?.()) {
      return progress;
    }
    const fetched = await fetchProcessingFolderRuns(policyId).catch(() => []);
    // The registry retains finished runs for a while, so the feed can carry earlier
    // sweeps' history; unscoped, an old run would re-deliver its results and the stop
    // conditions would fire against work this call never started.
    const runs = fetched.filter((run) =>
      includeRunIds
        ? run.runId != null && includeRunIds.has(run.runId)
        : !(run.runId != null && excludeRunIds?.has(run.runId)),
    );
    if (runs.length > 0) {
      seenAnyRun = true;
    }
    onRuns?.(runs);
    const settled = runs.filter((run) => TERMINAL.includes(run.status));
    const done = settled.filter((run) => run.status === "COMPLETED");
    progress.processed = done.length;
    progress.failed = settled.length - done.length;

    const fresh = settled.filter(
      (run) => run.runId && !alreadySettled.has(run.runId),
    );
    fresh.forEach((run) => alreadySettled.add(run.runId!));

    const opened: File[] = [];
    for (const run of fresh) {
      const failed = run.status !== "COMPLETED";
      const files = failed ? [] : await fetchRunFiles(run.outputs ?? []);
      // Fetched either way so this loop's onSettled still carries the result; only
      // the first delivery to claim the run puts it into the workbench.
      if (claimRunForOpening(policyId, run.runId!)) {
        opened.push(...files);
      }
      onSettled?.({
        runId: run.runId!,
        fileName: run.fileName ?? null,
        failed,
        files,
      });
    }
    if (
      expected == null &&
      !seenAnyRun &&
      runs.length === 0 &&
      attempt >= NO_RUN_GRACE_POLLS
    ) {
      // Nothing ever started: the sweep found no claimable files.
      onProgress?.({ ...progress });
      return progress;
    }
    if (opened.length > 0) {
      // One addFiles per poll batch, never selecting: a selection isn't meaningful
      // across a folderful of results.
      await addFiles(opened);
      progress.opened += opened.length;
    }
    onProgress?.({ ...progress });

    if (expected != null) {
      if (settled.length >= expected) return progress;
    } else if (runs.length > 0 && settled.length === runs.length) {
      quietPolls += 1;
      // Two stable all-terminal polls: a sweep still claiming would have shown
      // a new run by now.
      if (quietPolls >= 2) return progress;
    } else {
      quietPolls = 0;
    }
    await delay(attempt < FAST_POLLS ? FAST_POLL_MS : POLL_MS);
  }
  progress.stalled = true;
  onProgress?.({ ...progress });
  return progress;
}
