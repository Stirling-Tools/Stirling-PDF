import { useTranslation } from "react-i18next";

interface FilesToolbarCountProps {
  loading: boolean;
  totalCount: number;
  selectedCount: number;
}

/** Status text at the head of the files toolbar. */
export function FilesToolbarCount({
  loading,
  totalCount,
  selectedCount,
}: FilesToolbarCountProps) {
  const { t } = useTranslation();

  const selected = t("filesPage.selectedCount", "{{count}} selected", {
    count: selectedCount,
  });

  return (
    <span className="files-page-toolbar-info">
      {loading
        ? t("filesPage.loading", "Loading…")
        : t("filesPage.summary", "{{count}} items", { count: totalCount })}
      {selectedCount > 0 && <span> · {selected}</span>}
    </span>
  );
}

export default FilesToolbarCount;
