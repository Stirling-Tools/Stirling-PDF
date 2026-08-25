import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { StirlingFileStub } from "@app/types/fileContext";
import { diskLinkState } from "@app/services/diskFileSync";
import styles from "@app/components/fileEditor/FileEditorThumbnail.module.css";

interface FileEditorStatusDotProps {
  file: StirlingFileStub;
}

export function FileEditorStatusDot({ file }: FileEditorStatusDotProps) {
  const { t } = useTranslation();

  // Orphaned needs its own case: it used to read "not saved to disk", making a
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
