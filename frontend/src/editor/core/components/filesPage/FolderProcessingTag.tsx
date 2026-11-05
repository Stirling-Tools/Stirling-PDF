import { useTranslation } from "react-i18next";

export function FolderProcessingTag({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="files-page-processing-tag">
      {enabled
        ? t("filesPage.processing.active", "Processing folder")
        : t("filesPage.processing.paused", "Processing paused")}
    </span>
  );
}
