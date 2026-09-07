import { useTranslation } from "react-i18next";

interface FilesToolbarCountProps {
  loading: boolean;
  totalCount: number;
  selectedCount: number;
  /**
   * Selection-bar mode: report only the selection. A phone spends the room on
   * the actions rather than on "3 items · 3 selected".
   */
  selectionOnly: boolean;
}

/** Status text at the head of the files toolbar. */
export function FilesToolbarCount({
  loading,
  totalCount,
  selectedCount,
  selectionOnly,
}: FilesToolbarCountProps) {
  const { t } = useTranslation();

  const selected = t("filesPage.selectedCount", "{{count}} selected", {
    count: selectedCount,
  });

  if (selectionOnly) {
    return <span className="files-page-toolbar-info">{selected}</span>;
  }

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
