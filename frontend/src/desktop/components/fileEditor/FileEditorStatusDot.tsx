import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { StirlingFileStub } from "@app/types/fileContext";
import styles from "@app/components/fileEditor/FileEditorThumbnail.module.css";

interface FileEditorStatusDotProps {
  file: StirlingFileStub;
}

export function FileEditorStatusDot({ file }: FileEditorStatusDotProps) {
  const { t } = useTranslation();

  const label = !file.localFilePath
    ? t("fileNotSavedToDisk", "Not saved to disk")
    : file.isDirty
      ? t("unsavedChanges", "Unsaved changes")
      : t("fileSavedToDisk", "Saved to disk");

  const color = !file.localFilePath
    ? "var(--mantine-color-red-6)"
    : file.isDirty
      ? "var(--mantine-color-yellow-6)"
      : "var(--mantine-color-green-6)";

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
