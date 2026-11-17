import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { StirlingFileStub } from "@editor/types/fileContext";
import { diskLinkState } from "@editor/services/diskLinkState";
import styles from "@editor/components/fileEditor/FileEditorThumbnail.module.css";
import {
  TargetStatusDot,
  type TargetStatus,
} from "@editor/components/fileEditor/TargetStatusDot";

interface FileEditorStatusDotProps {
  file: StirlingFileStub;
  /** Set when Save sends this file to a save target. */
  target?: TargetStatus;
}

export function FileEditorStatusDot({
  file,
  target,
}: FileEditorStatusDotProps) {
  const { t } = useTranslation();
  if (target) return <TargetStatusDot {...target} />;

  // Orphaned needs its own case: sharing "not saved to disk" would make a
  // deleted original indistinguishable from a file never saved.
  const { label, color } = (() => {
    switch (diskLinkState(file)) {
      case "orphaned":
        return {
          label: t(
            "fileOriginalDeleted",
            "Original deleted - save to keep a copy",
          ),
          color: "var(--mantine-color-red-6)",
        };
      case "conflict":
        return {
          label: t("fileChangedOnDisk", "Changed on disk since you edited it"),
          color: "var(--mantine-color-orange-6)",
        };
      case "unavailable":
        return {
          label: t("fileDiskUnavailable", "Cannot reach the file on disk"),
          color: "var(--mantine-color-gray-5)",
        };
      case "none":
        return {
          label: t("fileNotSavedToDisk", "Not saved to disk"),
          color: "var(--mantine-color-red-6)",
        };
      default:
        return file.isDirty
          ? {
              label: t("unsavedChanges", "Unsaved changes"),
              color: "var(--mantine-color-yellow-6)",
            }
          : {
              label: t("fileSavedToDisk", "Saved to disk"),
              color: "var(--mantine-color-green-6)",
            };
    }
  })();

  return (
    <div className={styles.thumbBadgesRight}>
      <Tooltip label={label}>
        <span
          className={styles.statusDot}
          style={{ backgroundColor: color }}
          aria-label={label}
        />
      </Tooltip>
    </div>
  );
}
