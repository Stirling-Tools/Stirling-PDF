/**
 * The Classification policy's browser-side fast path, as a {@link LocalPass} the generic local-pass
 * engine runs. Everything classification-specific lives here: the heuristic, the label/confidence it
 * writes, metering, and the browser-local run it records. The engine only sees the generic result
 * (fields to write + whether the AI server run is still needed).
 */

import { fileStorage } from "@app/services/fileStorage";
import { classifyFileHeuristically } from "@app/services/heuristic/heuristicClassification";
import { meterClassificationRun } from "@app/services/classificationMeter";
import {
  isDispatched,
  markDispatched,
  recordRunStart,
  updateRun,
} from "@app/components/policies/policyRunStore";
import type { FileId } from "@app/types/file";
import type { StirlingFile } from "@app/types/fileContext";
import type { HeuristicConfidence } from "@app/services/heuristic/types";
import {
  CLASSIFICATION_CATEGORY_ID,
  localVerdictNeedsEscalation,
} from "@app/data/classificationPolicy";
import type { LocalPass } from "@app/components/policies/policyLocalPass";

/** How long to wait for an upload's bytes to land in IndexedDB (20 × 250ms ≈ 5s).
 *  The stub can surface in the file list a beat before its bytes are committed. */
const FILE_WAIT_TRIES = 20;
const FILE_WAIT_MS = 250;

/** localStorage flag: set to "true" for a full per-file scoring breakdown in the console. */
const DEBUG_FLAG = "stirling-classification-debug";

function isClassificationDebug(): boolean {
  try {
    return localStorage.getItem(DEBUG_FLAG) === "true";
  } catch {
    return false;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const classificationLocalPass: LocalPass = {
  // A new document that has not been classified yet. Tool outputs inherit their input's verdict via
  // the file reducer, so they are never classified afresh here.
  eligible: (stub) =>
    !stub.derivedFromTool && stub.classificationLabels == null,
  run: async (fileId, stub) => {
    const verdict = await classifyStub(fileId, stub.name, stub.size ?? 0);
    // Bytes never landed (file removed mid-wait): leave unclassified so a reload retries.
    if (verdict == null) return null;
    return {
      stubUpdates: {
        classificationLabels: verdict.labels,
        classificationConfidence: verdict.confidence,
      },
      // A confident local verdict stands; anything less asks the AI engine, which overwrites it.
      needsServerRun: localVerdictNeedsEscalation(verdict.confidence),
    };
  },
};

/** Classify one file, metering exactly once; null = no verdict, retried later. */
async function classifyStub(
  fileId: FileId,
  fileName: string,
  fileSize: number,
): Promise<{ labels: string[]; confidence: HeuristicConfidence } | null> {
  let file: StirlingFile | null = null;
  for (let i = 0; i < FILE_WAIT_TRIES; i++) {
    file = await fileStorage.getStirlingFile(fileId).catch(() => null);
    if (file) break;
    await delay(FILE_WAIT_MS);
  }
  if (!file) {
    console.warn(
      `[Classify] ${fileName}: bytes never arrived in storage; will retry on next load`,
    );
    return null;
  }
  const debug = isClassificationDebug();
  const startedAt = performance.now();
  // A local run is still a billable policy run, so it belongs in the activity feed; recorded only
  // once the bytes are in hand, so a file whose bytes never land leaves no phantom row.

  // Read before recordRunStart, which takes the dispatch key itself and would otherwise always
  // answer "already dispatched", silently stopping metering.
  const alreadyMetered = isDispatched(CLASSIFICATION_CATEGORY_ID, fileId);
  const runId = `local-${CLASSIFICATION_CATEGORY_ID}-${fileId}-${Date.now()}`;
  recordRunStart({
    runId,
    categoryId: CLASSIFICATION_CATEGORY_ID,
    fileId: fileId as string,
    fileName,
    fileSize,
    target: "local",
    // The heuristic ran in the browser - there is no server run to poll (see the poll effect).
    browserLocal: true,
    status: "RUNNING",
    outputs: [],
    error: null,
    startedAt: Date.now(),
  });
  try {
    const result = await classifyFileHeuristically(file, { explain: debug });
    const { labels } = result;
    const ms = Math.round(performance.now() - startedAt);
    const verdict =
      labels.length > 0
        ? labels.join(", ")
        : result.isEnglish
          ? "no label"
          : "no label (not English)";
    console.debug(
      `[Classify] ${fileName} -> ${verdict} (${result.confidence}, score ${result.score}, ${ms}ms)` +
        (alreadyMetered ? " [heal: not re-metered]" : ""),
    );
    if (debug && result.explain) logExplanation(fileName, result);
    // Meter on the first classification only; a healing re-run of an undelivered
    // result (already dispatched) is not a new billable run.
    if (!alreadyMetered) {
      meterClassificationRun({
        policyName: "Classification",
        documentCount: 1,
        labels,
      });
    }
    markDispatched(CLASSIFICATION_CATEGORY_ID, fileId);
    // Labels, no output file - the same settle shape the server-run classification uses.
    updateRun(runId, {
      status: "COMPLETED",
      imported: true,
      outputFileIds: [fileId as string],
    });
    return { labels, confidence: result.confidence };
  } catch (err) {
    // Never persist a verdict for an unreadable file - the failure may be
    // environmental, so it must stay eligible to retry (and meter) later.
    console.warn(`[Classify] ${fileName}: could not be read, will retry`, err);
    updateRun(runId, {
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Full scoring breakdown, one collapsed console group per file (debug flag only). */
function logExplanation(
  fileName: string,
  result: Awaited<ReturnType<typeof classifyFileHeuristically>>,
): void {
  const ex = result.explain;
  if (!ex) return;
  console.groupCollapsed(
    `[Classify] ${fileName} scoring (english=${ex.isEnglish}, lowText=${ex.lowText})`,
  );
  if (ex.candidates.length === 0) {
    console.log("no label scored above zero");
  }
  for (const c of ex.candidates) {
    console.log(
      `${c.id}${c.emit ? "" : " (suppressed)"}: score ${c.score}, ${c.distinct} distinct signals`,
    );
    for (const s of c.signals) console.log(`  ${s}`);
  }
  console.groupEnd();
}
