/**
 * Delivery of a processing-folder sweep's results into the workbench.
 *
 * A sweep runs server-side, so without this the user is left with a finished
 * job and an unchanged screen — the results exist (on disk or in storage) but
 * nothing shows them. This polls the folder's runs until the sweep's own runs
 * have settled, opening each run's results as soon as that run finishes
 * rather than at the end: a single slow or stuck file would otherwise hold
 * back everything that already succeeded, and a timeout would throw all of it
 * away.
 */

import {
  fetchProcessingFolderRuns,
  fetchRunOutputFile,
  type ProcessingFolderRun,
  type ProcessingRunOutput,
} from "@app/services/processingFolderApi";

const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED"];
/**
 * Poll cadence: fast at first — the sweep takes smallest files first, so the
 * earliest finishes land within seconds and the user is watching hardest right
 * after clicking — then a steady 1s. The budget allows ~15 minutes overall, as
 * sweeps are per-file jobs.
 */
const FAST_POLL_MS = 400;
const FAST_POLLS = 25;
const POLL_MS = 1000;
const MAX_POLLS = 925;
/** Result downloads run a few at a time: parallel enough to keep up with a burst
 *  of finishes, bounded so a hundred results don't open a hundred requests. */
const FETCH_CONCURRENCY = 4;

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
          // Logged rather than swallowed: a fetch that fails for every file is
          // indistinguishable from the pipeline producing nothing, and looks
          // like the feature simply not working.
          console.warn("[processing folders] could not open a result", e);
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Poll `policyId`'s runs until `expected` of them have settled, opening each
 * completed run's outputs into the workbench via `addFiles`. `expected` is
 * what the server reported starting, so this never waits on runs that were
 * never going to appear. Progress is reported after every poll; the final
 * state is also returned.
 */
export async function deliverSweepResults(
  policyId: string,
  expected: number,
  addFiles: (
    files: File[],
    options?: { selectFiles?: boolean },
  ) => Promise<unknown>,
  callbacks?:
    | SweepDeliveryCallbacks
    | ((progress: SweepDeliveryProgress) => void),
): Promise<SweepDeliveryProgress> {
  const { onProgress, onRuns, onSettled, isCancelled } =
    typeof callbacks === "function"
      ? { onProgress: callbacks }
      : (callbacks ?? {});
  const alreadySettled = new Set<string>();
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
    const runs = await fetchProcessingFolderRuns(policyId).catch(() => []);
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
    if (opened.length > 0) {
      // One addFiles per poll batch, and never selecting what is delivered: a
      // selection isn't meaningful across a folderful of results, and both
      // choices avoid re-rendering the whole growing file list per result.
      await addFiles(opened);
      progress.opened += opened.length;
    }
    onProgress?.({ ...progress });

    if (settled.length >= expected) return progress;
    await delay(attempt < FAST_POLLS ? FAST_POLL_MS : POLL_MS);
  }
  progress.stalled = true;
  onProgress?.({ ...progress });
  return progress;
}
