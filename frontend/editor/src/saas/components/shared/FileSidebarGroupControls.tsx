// The Files-sidebar category manager: a "tune" button opening a modal that hosts
// the shared {@link ClassificationCategoryManager} to shape the parent categories
// your files group under. All device-local (grouping only — it never changes the
// team's label vocabulary), applied live; files in no visible category fall back
// to "Other".

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import TuneIcon from "@mui/icons-material/Tune";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { Modal } from "@app/ui/Modal";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { ClassificationCategoryManager } from "@app/components/policies/ClassificationCategoryManager";
import { useClassificationEnabled } from "@app/hooks/useClassificationEnabled";
import { useClassificationLabels } from "@app/hooks/useClassificationLabels";
import { bucketStubsByLabel } from "@app/components/shared/fileSidebarGroupingLogic";
import {
  getHiddenLabels,
  getSidebarCategories,
  resetSidebarCategories,
  setHiddenLabels,
  setSidebarCategories,
  subscribeHiddenLabels,
  subscribeSidebarCategories,
} from "@app/services/fileSidebarCategories";
import type { ClassificationLabel } from "@app/data/classificationLabels";
import type { StirlingFileStub } from "@app/types/fileContext";
import "@app/components/shared/FileSidebarGroupControls.css";

interface FileSidebarGroupControlsProps {
  /** The files currently listed, for live per-label counts. */
  stubs: StirlingFileStub[];
}

export function FileSidebarGroupControls({
  stubs,
}: FileSidebarGroupControlsProps) {
  const { t } = useTranslation();
  const enabled = useClassificationEnabled();
  const [open, setOpen] = useState(false);
  const categories = useSyncExternalStore(
    subscribeSidebarCategories,
    getSidebarCategories,
  );
  const hiddenLabels = useSyncExternalStore(
    subscribeHiddenLabels,
    getHiddenLabels,
  );
  const hiddenSet = useMemo(() => new Set(hiddenLabels), [hiddenLabels]);
  // Only fetch the team label set while the picker is open.
  const { teamLabels: labelSet } = useClassificationLabels(open);

  // Bucketed once and reused for both the per-label and per-category counts below.
  const byLabel = useMemo(() => bucketStubsByLabel(stubs), [stubs]);

  // Per-label file counts from the same bucketing the sidebar groups use.
  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [key, bucket] of byLabel) counts.set(key, bucket.stubs.length);
    return counts;
  }, [byLabel]);

  // Files per category (deduped across its labels).
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      const ids = new Set<string>();
      for (const key of category.labelKeys) {
        for (const stub of byLabel.get(key)?.stubs ?? []) {
          ids.add(stub.id as string);
        }
      }
      counts.set(category.id, ids.size);
    }
    return counts;
  }, [byLabel, categories]);

  const labelDisplay = (label: ClassificationLabel) =>
    t(`classification.labels.${label.id}`, label.name);

  // Classification off (non-AI SaaS tenant) → no "customize groups" affordance,
  // matching the flat, ungrouped list. (All hooks above run unconditionally.)
  if (!enabled) return null;

  return (
    <>
      {/* -external: revealed on section-header hover, like the Browse button. */}
      <ActionIcon
        variant="quiet"
        className="file-sidebar-section-btn file-sidebar-section-btn-external"
        onClick={() => setOpen(true)}
        aria-label={t("fileSidebar.customizeGroups", "Customize groups")}
        data-testid="customize-groups"
      >
        <TuneIcon sx={{ fontSize: "1rem" }} />
      </ActionIcon>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="xl"
        className="fsg-modal"
        title={t("fileSidebar.groupsModal.title", "Sidebar categories")}
        subtitle={t(
          "fileSidebar.groupsModal.subtitle",
          "Group your files into parent categories. Add existing labels to a category, rename it, or create your own. Files in none of your categories appear under “Other”.",
        )}
        footer={
          <div className="fsg-footer">
            <Button
              variant="tertiary"
              size="sm"
              leftSection={<RestartAltIcon sx={{ fontSize: "1rem" }} />}
              onClick={resetSidebarCategories}
            >
              {t("fileSidebar.groupsModal.reset", "Reset to defaults")}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
              {t("fileSidebar.groupsModal.done", "Done")}
            </Button>
          </div>
        }
      >
        <div className="fsg-body">
          {/* Grouping-only (no onLabelsChange): the editor can't edit the team
              vocabulary. Applied live to the device-local store. */}
          <ClassificationCategoryManager
            labels={labelSet}
            categories={categories}
            onCategoriesChange={setSidebarCategories}
            hiddenLabels={hiddenSet}
            onHiddenLabelsChange={setHiddenLabels}
            labelCounts={labelCounts}
            categoryCounts={categoryCounts}
            canHide
            searchable
            labelDisplay={labelDisplay}
          />
        </div>
      </Modal>
    </>
  );
}
