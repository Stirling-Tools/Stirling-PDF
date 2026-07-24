// Classification override of the Files-sidebar grouping seam: Recent, one group
// per visible category, then Other. Labels cache onto stubs via a lazy backfill.

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
import { fileStorage } from "@app/services/fileStorage";
import { readStubClassificationLabels } from "@app/services/fileClassification";
import { hasInFlightPolicyRuns } from "@app/components/policies/policyRunStore";
import {
  getSidebarCategories,
  subscribeSidebarCategories,
} from "@app/services/fileSidebarCategories";
import { buildLabelGroups } from "@app/components/shared/fileSidebarGroupingLogic";
import { scheduleIdle } from "@app/utils/scheduleIdle";
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

export function useFileSidebarGroups(
  stubs: StirlingFileStub[],
): FileSidebarGroup[] | null {
  const { t } = useTranslation();
  // Classification off (core): flat list, no category fetch or backfill.
  const enabled = useClassificationEnabled();
  const { bumpRevision } = useIndexedDB();
  // Reads keyed by id+lastModified, so a new file version is re-read exactly once.
  const attempted = useRef<Set<string>>(new Set());
  const attemptKey = (s: StirlingFileStub) =>
    `${s.id as string}:${s.lastModified ?? 0}`;
  // Bumped to re-attempt a backfill pass that yielded to an active policy wave.
  const [retryTick, setRetryTick] = useState(0);

  // Backfill labels from file metadata onto stubs, a few per idle pass; yields
  // while a policy wave is in flight. The heuristic path stamps stubs directly.
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
      // Reading during a wave is wasted parsing; recheck after it. The timer
      // self-heals when a wave ends without a stubs change.
      if (hasInFlightPolicyRuns()) {
        retryTimer = window.setTimeout(() => {
          if (!cancelled) setRetryTick((n) => n + 1);
        }, BACKFILL_BUSY_RETRY_MS);
        return;
      }
      void (async () => {
        let wrote = false;
        for (const stub of pending) {
          const labels = await readStubClassificationLabels(stub);
          if (cancelled) return;
          attempted.current.add(attemptKey(stub));
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
    () => (enabled ? buildLabelGroups(stubs, t, categories) : null),
    [enabled, stubs, t, categories],
  );
}
