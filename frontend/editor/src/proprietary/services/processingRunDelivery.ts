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
  type ProcessingRunOutput,
} from "@app/services/processingFolderApi";

const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED"];
/** Poll cadence and budget: up to ~15 minutes of 1s polls, as sweeps are per-file jobs. */
const POLL_MS = 1000;
const MAX_POLLS = 900;

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  onProgress?: (progress: SweepDeliveryProgress) => void,
): Promise<SweepDeliveryProgress> {
  const alreadyOpened = new Set<string>();
  const progress: SweepDeliveryProgress = {
    processed: 0,
    failed: 0,
    opened: 0,
    stalled: false,
  };

  const openInWorkbench = async (outputs: ProcessingRunOutput[]) => {
    if (outputs.length === 0) return;
    const files: File[] = [];
    for (const output of outputs) {
      // Downloads are sequential so a hundred results don't open a hundred
      // parallel requests, and one failure costs one file rather than the
      // batch — it still exists where the run put it either way.
      try {
        files.push(await fetchRunOutputFile(output));
      } catch (e) {
        // Logged rather than swallowed: a fetch that fails for every file is
        // indistinguishable from the pipeline producing nothing, and looks
        // like the feature simply not working.
        console.warn(
          `[processing folders] could not open result ${output.fileId}`,
          e,
        );
      }
    }
    if (files.length === 0) return;
    await addFiles(files, { selectFiles: true });
    progress.opened += files.length;
  };

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const runs = await fetchProcessingFolderRuns(policyId).catch(() => []);
    const settled = runs.filter((run) => TERMINAL.includes(run.status));
    const done = settled.filter((run) => run.status === "COMPLETED");
    progress.processed = done.length;
    progress.failed = settled.length - done.length;

    const fresh = done.filter(
      (run) => run.runId && !alreadyOpened.has(run.runId),
    );
    fresh.forEach((run) => alreadyOpened.add(run.runId!));
    await openInWorkbench(fresh.flatMap((run) => run.outputs ?? []));
    onProgress?.({ ...progress });

    if (settled.length >= expected) return progress;
    await delay(POLL_MS);
  }
  progress.stalled = true;
  onProgress?.({ ...progress });
  return progress;
}
