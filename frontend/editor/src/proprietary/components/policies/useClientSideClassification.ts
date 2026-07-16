/**
 * Client-side classification for non-AI systems. When the AI engine is off, the Classification
 * policy's work runs here in the browser (the heuristic engine) instead of on the server: it labels
 * each new upload, stamps the label onto the file, and meters the run so billing + audit match the
 * AI path. When AI is on this is inert - the server-side policy run classifies (see usePolicyAutoRun).
 *
 * Headless - mount once from PolicyAutoRunController so it runs regardless of the sidebar, matching
 * the AI path's upload trigger. Reads a few files per idle pass so a big library backfills smoothly.
 *
 * Delivery guarantees: a computed result is always written, even if the effect re-fires mid-batch
 * (an upload wave mutates fileStubs constantly); a definitive no-label verdict is persisted as []
 * so it isn't re-tried; and a file whose result was never delivered (crash, reload) is retried on
 * the next load without re-metering.
 */

import { useEffect, useRef, useState } from "react";
import { useAllFiles, useFileManagement } from "@app/contexts/FileContext";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { fileStorage } from "@app/services/fileStorage";
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import { useClassificationEnabled } from "@app/hooks/useClassificationEnabled";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { usePolicies } from "@app/hooks/usePolicies";
import { classifyFileHeuristically } from "@app/services/heuristic/heuristicClassification";
import { meterClassificationRun } from "@app/services/classificationMeter";
import {
  isDispatched,
  markDispatched,
} from "@app/components/policies/policyRunStore";
import type { FileId } from "@app/types/file";
import type {
  StirlingFile,
  StirlingFileStub,
} from "@app/types/fileContext";

/** The category id of the Classification policy (see policyDefinitions). */
const CLASSIFICATION_CATEGORY = "classification";
/** Files classified per idle pass, so a large library drains over several ticks. */
const CLASSIFY_BATCH = 3;
/** How long to wait for an upload's bytes to land in IndexedDB (20 × 250ms ≈ 5s).
 *  The stub can surface in the file list a beat before its bytes are committed. */
const FILE_WAIT_TRIES = 20;
const FILE_WAIT_MS = 250;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Schedule work for the browser's idle time (or soon after, as a fallback). */
function scheduleIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(task, 200);
  return () => window.clearTimeout(timer);
}

export function useClientSideClassification(): void {
  const { fileStubs } = useAllFiles();
  const { updateStirlingFileStub } = useFileManagement();
  const { bumpRevision } = useIndexedDB();
  const { policies } = usePolicies();
  const classificationEnabled = useClassificationEnabled();
  const aiEnabled = useAiEngineEnabled();
  // Files claimed this session, keyed id+lastModified so a new version is retried once. A claim is
  // taken synchronously right before classifying, so overlapping batches never double-classify.
  const claimed = useRef<Set<string>>(new Set());
  // Bumped after each batch to drain the next one.
  const [tick, setTick] = useState(0);

  const policy = policies[CLASSIFICATION_CATEGORY];
  // Only when the admin has an active Classification policy - the same gate the AI path uses.
  const active = Boolean(
    policy?.configured &&
      policy.status === "active" &&
      policy.backendId &&
      (!policy.sources ||
        policy.sources.length === 0 ||
        policy.sources.includes("editor")),
  );

  useEffect(() => {
    if (!POLICIES_ENABLED || !classificationEnabled || aiEnabled || !active) {
      return;
    }
    const claimKey = (s: StirlingFileStub) =>
      `${s.id as string}:${s.lastModified ?? 0}`;
    // null/undefined labels = never delivered (fresh upload, or a result lost to a crash/reload —
    // those retry here and heal). [] = definitive no-label verdict; skipped for good.
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
          const labels = await classifyStub(stub.id as FileId);
          // Bytes never landed (file removed mid-wait): leave undelivered so a
          // reload (or new version) retries; the claim stops churn this session.
          if (labels == null) continue;
          // Deliver unconditionally - a re-render must never discard a computed
          // (and already metered) result. Writes are idempotent.
          updateStirlingFileStub(stub.id as FileId, {
            classificationLabels: labels,
          });
          const ok = await fileStorage.updateFileMetadata(stub.id as FileId, {
            classificationLabels: labels,
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
    aiEnabled,
    updateStirlingFileStub,
    bumpRevision,
    tick,
  ]);
}

/**
 * Classify one file in the browser: wait briefly for a fresh upload's bytes, classify, and meter
 * exactly once per file (dispatch-marked, so a delivery retry after a crash never re-bills).
 * Returns the labels ([] = definitively unlabelled, including unreadable), or null when the
 * file's bytes never became available.
 */
async function classifyStub(fileId: FileId): Promise<string[] | null> {
  let file: StirlingFile | null = null;
  for (let i = 0; i < FILE_WAIT_TRIES; i++) {
    file = await fileStorage.getStirlingFile(fileId).catch(() => null);
    if (file) break;
    await delay(FILE_WAIT_MS);
  }
  if (!file) return null;
  try {
    const { labels } = await classifyFileHeuristically(file);
    // Meter on the first classification only; a healing re-run of an undelivered
    // result (already dispatched) is not a new billable run.
    if (!isDispatched(CLASSIFICATION_CATEGORY, fileId)) {
      meterClassificationRun({
        policyName: "Classification",
        documentCount: 1,
        labels,
      });
    }
    markDispatched(CLASSIFICATION_CATEGORY, fileId);
    return labels;
  } catch {
    // Unreadable PDF: a definitive verdict, recorded so it isn't re-parsed forever.
    markDispatched(CLASSIFICATION_CATEGORY, fileId);
    return [];
  }
}
