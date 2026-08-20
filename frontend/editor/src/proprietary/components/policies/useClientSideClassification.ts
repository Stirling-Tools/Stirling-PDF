// The Classification policy's first pass: every upload is labelled locally before the AI is asked.
// The confidence reported here decides whether the AI is asked at all - see usePolicyAutoRun.

import { useEffect, useRef, useState } from "react";
import { useAllFiles, useFileManagement } from "@app/contexts/FileContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { fileStorage } from "@app/services/fileStorage";
import { useClassificationEnabled } from "@app/hooks/useClassificationEnabled";
import { scheduleIdle } from "@app/utils/scheduleIdle";
import { usePolicies } from "@app/hooks/usePolicies";
import { classifyFileHeuristically } from "@app/services/heuristic/heuristicClassification";
import { meterClassificationRun } from "@app/services/classificationMeter";
import {
  isDispatched,
  markDispatched,
  recordRunStart,
  updateRun,
} from "@app/components/policies/policyRunStore";
import type { FileId } from "@app/types/file";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import type { HeuristicConfidence } from "@app/services/heuristic/types";
import { CLASSIFICATION_CATEGORY_ID } from "@app/data/classificationPolicy";

/** Files classified per idle pass, so a large library drains over several ticks. */
const CLASSIFY_BATCH = 3;
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

export function useClientSideClassification(): void {
  const { fileStubs } = useAllFiles();
  const { updateStirlingFileStub } = useFileManagement();
  const { bumpRevision } = useIndexedDB();
  const { policies } = usePolicies();
  const classificationEnabled = useClassificationEnabled();
  // Still waited on: a verdict written before app-config lands would be acted on by the
  // escalation decision before it knows whether the AI engine is even available.
  const { loading: configLoading } = useAppConfig();
  // Files claimed this session, keyed id+lastModified so a new version is retried once. A claim is
  // taken synchronously right before classifying, so overlapping batches never double-classify.
  const claimed = useRef<Set<string>>(new Set());
  // Bumped after each batch to drain the next one.
  const [tick, setTick] = useState(0);

  // TODO: keyed on the Classification CATEGORY, so a pipeline that merely contains a classify
  // step gets no local pass - suppressing one step of a chain is not expressible today.
  const policy = policies[CLASSIFICATION_CATEGORY_ID];
  // Only when the admin has an active Classification policy - the same gate the AI path uses.
  const active = Boolean(
    policy?.configured &&
    policy.status === "active" &&
    policy.backendId &&
    policy.runsOnEditor,
  );

  useEffect(() => {
    // Runs whether or not the AI engine is on: it is the first pass either way, not a fallback.
    if (configLoading || !classificationEnabled || !active) {
      return;
    }
    const claimKey = (s: StirlingFileStub) =>
      `${s.id as string}:${s.lastModified ?? 0}`;
    // null labels = never delivered, retried here; [] = definitive no-label verdict.
    const pending = fileStubs
      .filter(
        (s) =>
          !s.derivedFromTool &&
          s.classificationLabels == null &&
          !claimed.current.has(claimKey(s)),
      )
      .slice(0, CLASSIFY_BATCH);
    if (pending.length === 0) return;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      // Superseded before starting: the newer effect instance owns the queue.
      if (cancelled) return;
      void (async () => {
        let wrote = false;
        for (const stub of pending) {
          const key = claimKey(stub);
          // Re-validate at execution time - another batch may have claimed it since.
          if (claimed.current.has(key)) continue;
          claimed.current.add(key);
          const verdict = await classifyStub(
            stub.id as FileId,
            stub.name,
            stub.size ?? 0,
          );
          // Bytes never landed (file removed mid-wait): leave undelivered so a
          // reload (or new version) retries; the claim stops churn this session.
          if (verdict == null) continue;
          // Deliver unconditionally - a re-render must never discard a computed
          // (and already metered) result. Writes are idempotent.
          updateStirlingFileStub(stub.id as FileId, {
            classificationLabels: verdict.labels,
            classificationConfidence: verdict.confidence,
          });
          const ok = await fileStorage.updateFileMetadata(stub.id as FileId, {
            classificationLabels: verdict.labels,
            classificationConfidence: verdict.confidence,
          });
          if (ok) wrote = true;
        }
        if (wrote) bumpRevision();
        // Drain the next batch; the terminal pass finds nothing pending and stops.
        setTick((n) => n + 1);
      })();
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [
    fileStubs,
    active,
    classificationEnabled,
    configLoading,
    updateStirlingFileStub,
    bumpRevision,
    tick,
  ]);
}

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
