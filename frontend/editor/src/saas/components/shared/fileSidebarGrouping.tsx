// Classification override of the Files-sidebar grouping seam: Recent, one group per VISIBLE category (device-local, editable — default from the built-in label families), a standalone group for any label not yet in a category, then Other for files in none of those. Labels are cached on the stub via a lazy metadata backfill so grouping stays cheap.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { useClassificationEnabled } from "@app/hooks/useClassificationEnabled";
import { useClassificationLabels } from "@app/hooks/useClassificationLabels";
import { fileStorage } from "@app/services/fileStorage";
import { readStubClassificationLabels } from "@app/services/fileClassification";
import { hasInFlightPolicyRuns } from "@app/components/policies/policyRunStore";
import {
  getSidebarCategories,
  subscribeSidebarCategories,
} from "@app/services/fileSidebarCategories";
import { buildLabelGroups } from "@app/components/shared/fileSidebarGroupingLogic";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileSidebarGroup } from "@core/components/shared/fileSidebarGrouping";

export type { FileSidebarGroup };
// Pure grouping logic lives in a component-free module so tests don't drag in the picker's UI deps.
export {
  buildLabelGroups,
  bucketStubsByLabel,
} from "@app/components/shared/fileSidebarGroupingLogic";
// The sidebar's group-picker button + modal (core renders a null stub).
export { FileSidebarGroupControls } from "@app/components/shared/FileSidebarGroupControls";

/** Files read per effect pass, so a big library backfills over several ticks. */
const BACKFILL_BATCH = 3;
/** Recheck delay when the backfill yields to an active policy wave. */
const BACKFILL_BUSY_RETRY_MS = 4000;

/** Schedule work for the browser's idle time (or soon after, as a fallback). */
function scheduleIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(task, 200);
  return () => window.clearTimeout(timer);
}

export function useFileSidebarGroups(
  stubs: StirlingFileStub[],
): FileSidebarGroup[] | null {
  const { t } = useTranslation();
  // Classification off (AI disabled) → no grouping at all: return the flat list
  // like core, and don't fetch team labels or backfill from metadata. Gates the
  // whole feature so an AI-off SaaS tenant sees no Recent/Other/category chrome.
  const enabled = useClassificationEnabled();
  const { teamLabels: labelSet } = useClassificationLabels(enabled);
  const { bumpRevision } = useIndexedDB();
  // Attempted reads keyed by id+lastModified: a re-classified file (new version bumps lastModified) is re-read and leaves "Other" on its own, while a truly-unlabelled file keeps a stable key and is read once.
  const attempted = useRef<Set<string>>(new Set());
  const attemptKey = (s: StirlingFileStub) =>
    `${s.id as string}:${s.lastModified ?? 0}`;
  // Bumped to re-attempt a backfill pass that yielded to an active policy wave.
  const [retryTick, setRetryTick] = useState(0);

  // Fallback for files that arrive with labels already in metadata but no policy delivery (imports/shares): read+cache a few per idle pass, yielding while a policy wave is in flight since those stubs get stamped on delivery anyway.
  useEffect(() => {
    if (!enabled) return;
    const pending = stubs
      .filter(
        (s) => !s.classificationLabels && !attempted.current.has(attemptKey(s)),
      )
      .slice(0, BACKFILL_BATCH);
    if (pending.length === 0) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      // Deliveries stamp labels during a wave, so reading now is wasted parsing; recheck after it (a timer self-heals when a wave ends without a stubs change).
      if (hasInFlightPolicyRuns()) {
        retryTimer = window.setTimeout(() => {
          if (!cancelled) setRetryTick((n) => n + 1);
        }, BACKFILL_BUSY_RETRY_MS);
        return;
      }
      void (async () => {
        let wrote = false;
        for (const stub of pending) {
          attempted.current.add(attemptKey(stub));
          const labels = await readStubClassificationLabels(stub);
          if (cancelled) return;
          if (labels) {
            const ok = await fileStorage.updateFileMetadata(stub.id as FileId, {
              classificationLabels: labels,
            });
            if (ok) wrote = true;
          }
        }
        // One revision bump per batch → the sidebar re-reads and re-groups.
        if (!cancelled && wrote) bumpRevision();
      })();
    });
    return () => {
      cancelled = true;
      cancelIdle();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [enabled, stubs, bumpRevision, retryTick]);

  const categories = useSyncExternalStore(
    subscribeSidebarCategories,
    getSidebarCategories,
  );
  return useMemo(
    () => (enabled ? buildLabelGroups(stubs, labelSet, t, categories) : null),
    [enabled, stubs, labelSet, t, categories],
  );
}
