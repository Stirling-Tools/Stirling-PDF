import type { HTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { folderKind, type FolderRecord } from "@app/types/folder";
import { getFileDate } from "@app/utils/fileUtils";
import { FolderThumbnail } from "@app/components/filesPage/FolderThumbnail";
import { FolderOriginBadge } from "@app/components/filesPage/FolderOriginBadge";
import { findFolderIcon } from "@app/components/filesPage/folderIcons";

interface FolderListRowProps extends HTMLAttributes<HTMLDivElement> {
  folder: FolderRecord;
  fileCount?: number;
  parentPath?: string;
  status?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  showModified?: boolean;
}

/** Library row presentation; the caller supplies selection, navigation, or management controls. */
export function FolderListRow({
  folder,
  fileCount,
  parentPath,
  status,
  leading,
  trailing,
  showModified = true,
  className = "",
  ...props
}: FolderListRowProps) {
  const { t } = useTranslation();
  const kind = folderKind(folder);
  return (
    <div role="row" className={`files-page-list-row ${className}`} {...props}>
      <span role="gridcell">{leading}</span>
      <span
        role="gridcell"
        style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
      >
        <FolderThumbnail
          color={folder.color}
          size="row"
          iconGlyph={findFolderIcon(folder.icon)?.glyph}
        />
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {folder.name}
          </span>
          {parentPath && (
            <span
              className="files-page-card-path"
              style={{ marginTop: 0 }}
              title={parentPath}
            >
              {t("filesPage.inPath", "in {{path}}", { path: parentPath })}
            </span>
          )}
        </span>
        <FolderOriginBadge folder={folder} />
      </span>
      <span role="gridcell">
        {status ??
          (kind === "virtual"
            ? t("filesPage.folderKind.virtual", "Browser folder")
            : kind === "local"
              ? t("filesPage.folderKind.local", "Local folder")
              : t("filesPage.folder", "Folder"))}
      </span>
      <span role="gridcell">
        {!fileCount
          ? "-"
          : t("filesPage.folderItems", "{{count}} items", { count: fileCount })}
      </span>
      {showModified && (
        <span role="gridcell">
          {getFileDate({ lastModified: folder.updatedAt })}
        </span>
      )}
      <span role="gridcell">{trailing}</span>
    </div>
  );
}
