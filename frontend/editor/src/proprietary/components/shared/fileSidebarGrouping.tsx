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
import type {
  CategoryFilterOption,
  FileSidebarGroup,
  LabelBadge,
} from "@core/components/shared/fileSidebarGrouping";
import { DEFAULT_CLASSIFICATION_LABELS } from "@app/data/classificationLabels";
import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import { accentColor, accentCycleColor } from "@app/utils/accentColors";

export type { FileSidebarGroup };
export type {
  CategoryFilterOption,
  LabelBadge,
} from "@core/components/shared/fileSidebarGrouping";
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

/**
 * The visible categories as filter options, in the sidebar's own display
 * order — the files-page category filter and the sidebar groups must name
 * and order the world identically.
 */
export function useCategoryFilterOptions(): CategoryFilterOption[] {
  const categories = useSyncExternalStore(
    subscribeSidebarCategories,
    getSidebarCategories,
  );
  return useMemo(
    () =>
      categories
        .filter((category) => !category.hidden)
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        )
        .map((category) => ({
          id: category.id,
          name: category.name,
          labelKeys: [...category.labelKeys],
        })),
    [categories],
  );
}

/**
 * Badge descriptors for a file's labels: each label's own icon from the
 * classification vocabulary, coloured with the accent its category cycles to
 * in the sidebar (visible categories in display order — the same order the
 * groups render in, so a badge and its group read as one colour). Labels
 * under a hidden category wear the same neutral grey as the "Other" group.
 */
export function useLabelBadges(labels?: string[] | null): LabelBadge[] {
  const { t } = useTranslation();
  const categories = useSyncExternalStore(
    subscribeSidebarCategories,
    getSidebarCategories,
  );
  return useMemo(() => {
    if (!labels || labels.length === 0) return [];
    const visible = categories
      .filter((category) => !category.hidden)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
    const accentByLabel = new Map<string, string>();
    visible.forEach((category, index) => {
      for (const labelKey of category.labelKeys) {
        if (!accentByLabel.has(labelKey)) {
          accentByLabel.set(labelKey, accentCycleColor(index));
        }
      }
    });
    const byId = new Map(
      DEFAULT_CLASSIFICATION_LABELS.map((label) => [label.id, label]),
    );
    return labels.map((id) => {
      const label = byId.get(id);
      return {
        id,
        name: t(`classification.labels.${id}`, label?.name ?? id),
        icon: label?.icon ?? DEFAULT_LABEL_ICON,
        color: accentByLabel.get(id) ?? accentColor("gray"),
      };
    });
  }, [labels, categories, t]);
}
