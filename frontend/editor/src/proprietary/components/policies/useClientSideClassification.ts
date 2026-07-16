/**
 * Client-side classification for non-AI systems. When the AI engine is off, the Classification
 * policy's work runs here in the browser (the heuristic engine) instead of on the server: it labels
 * each new upload, stamps the label onto the file, and meters the run so billing + audit match the
 * AI path. When AI is on this is inert - the server-side policy run classifies (see usePolicyAutoRun).
 *
 * Headless - mount once from PolicyAutoRunController so it runs regardless of the sidebar, matching
 * the AI path's upload trigger. Reads a few files per idle pass so a big library backfills smoothly.
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
import type { StirlingFileStub } from "@app/types/fileContext";

/** The category id of the Classification policy (see policyDefinitions). */
const CLASSIFICATION_CATEGORY = "classification";
/** Files classified per idle pass, so a large library drains over several ticks. */
const CLASSIFY_BATCH = 3;

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
  // Files we've already tried, keyed id+lastModified so a new version is retried once.
  const attempted = useRef<Set<string>>(new Set());
  // Bumped after each batch to drain the next one (files yielding no label don't change stubs).
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
    const attemptKey = (s: StirlingFileStub) =>
      `${s.id as string}:${s.lastModified ?? 0}`;
    const pending = fileStubs
      .filter(
        (s) =>
          !s.derivedFromTool &&
          !s.classificationLabels &&
          !isDispatched(CLASSIFICATION_CATEGORY, s.id) &&
          !attempted.current.has(attemptKey(s)),
      )
      .slice(0, CLASSIFY_BATCH);
    if (pending.length === 0) return;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      void (async () => {
        let wrote = false;
        for (const stub of pending) {
          if (cancelled) return;
          attempted.current.add(attemptKey(stub));
          const labels = await classifyStub(stub.id as FileId);
          if (cancelled) return;
          if (labels && labels.length > 0) {
            updateStirlingFileStub(stub.id as FileId, {
              classificationLabels: labels,
            });
            const ok = await fileStorage.updateFileMetadata(stub.id as FileId, {
              classificationLabels: labels,
            });
            if (ok) wrote = true;
          }
        }
        if (cancelled) return;
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
 * Classify one file in the browser and meter the run. Marks the file dispatched exactly once (even
 * when unreadable or unlabelled) so it never re-bills, and returns its labels (or null).
 */
async function classifyStub(fileId: FileId): Promise<string[] | null> {
  const file = await fileStorage.getStirlingFile(fileId).catch(() => null);
  markDispatched(CLASSIFICATION_CATEGORY, fileId);
  if (!file) return null;
  try {
    const { labels } = await classifyFileHeuristically(file);
    // Meter every run (billed like the AI classify step), labelled or not.
    meterClassificationRun({
      policyName: "Classification",
      documentCount: 1,
      labels,
    });
    return labels;
  } catch {
    return null; // unreadable PDF; already marked so it won't loop.
  }
}
