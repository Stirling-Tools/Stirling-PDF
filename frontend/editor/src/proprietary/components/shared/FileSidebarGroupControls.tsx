// The Files-sidebar category picker: a "tune" button opening a modal that lists the fixed, shared
// categories and lets the user show or hide each one in their own sidebar. Device-local and
// presentational only — it never changes the shared categories or the label vocabulary; files in a
// hidden (or no) category fall back to "Other".

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import TuneIcon from "@mui/icons-material/Tune";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { Modal } from "@app/ui/Modal";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { ClassificationCategoryManager } from "@app/components/policies/ClassificationCategoryManager";
import { useClassificationEnabled } from "@app/hooks/useClassificationEnabled";
import { bucketStubsByLabel } from "@app/components/shared/fileSidebarGroupingLogic";
import {
  getSidebarCategories,
  resetHiddenCategories,
  setCategoryHidden,
  subscribeSidebarCategories,
} from "@app/services/fileSidebarCategories";
import type { StirlingFileStub } from "@app/types/fileContext";
import "@app/components/shared/FileSidebarGroupControls.css";

interface FileSidebarGroupControlsProps {
  /** The files currently listed, for live per-category counts. */
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

  // Files per category (deduped across its labels), from the same bucketing the sidebar groups use.
  const categoryCounts = useMemo(() => {
    const byLabel = bucketStubsByLabel(stubs);
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
  }, [stubs, categories]);

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
        width="md"
        title={t("fileSidebar.groupsModal.title", "Sidebar categories")}
        subtitle={t(
          "fileSidebar.groupsModal.subtitle",
          "Show or hide categories in the files sidebar.",
        )}
        footer={
          <div className="fsg-footer">
            <Button
              variant="tertiary"
              size="sm"
              leftSection={<RestartAltIcon sx={{ fontSize: "1rem" }} />}
              onClick={resetHiddenCategories}
            >
              {t("fileSidebar.groupsModal.reset", "Show all")}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
              {t("fileSidebar.groupsModal.done", "Done")}
            </Button>
          </div>
        }
      >
        <div className="fsg-body">
          <ClassificationCategoryManager
            categories={categories}
            onToggleHidden={setCategoryHidden}
            counts={categoryCounts}
          />
        </div>
      </Modal>
    </>
  );
}
