/**
 * Delivers a sweep's results into the workbench: polls the folder's runs and opens each
 * run's results as soon as it settles — waiting for the whole sweep would hold everything
 * behind the slowest file.
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

/** One run's outcome, with the result files that were opened for it. */
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
 * Poll `policyId`'s runs until they have settled, opening each completed
 * run's outputs into the workbench via `addFiles`. With a known `expected`
 * count it stops exactly there; with null (the sweep runs behind the create
 * response, so no count exists up front) it stops once every observed run is
 * terminal and stable, or once a grace period passes with no runs at all.
 */
export async function deliverSweepResults(
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
      opened.push(...files);
      onSettled?.({
        runId: run.runId!,
        fileName: run.fileName ?? null,
        failed,
        files,
      });
    }
    if (
      expected == null &&
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
