import { useTranslation } from "react-i18next";

interface FilesToolbarCountProps {
  totalCount: number;
  selectedCount: number;
}

export function FilesToolbarCount({
  totalCount,
  selectedCount,
}: FilesToolbarCountProps) {
  const { t } = useTranslation();

  const selected = t("filesPage.selectedCount", "{{count}} selected", {
    count: selectedCount,
  });

  return (
    <span className="files-page-toolbar-info">
      {t("filesPage.summary", "{{count}} items", { count: totalCount })}
      {selectedCount > 0 && <span> · {selected}</span>}
    </span>
  );
}

export default FilesToolbarCount;
