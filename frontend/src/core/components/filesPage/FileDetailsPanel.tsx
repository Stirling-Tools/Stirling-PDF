import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Badge, Button, Tooltip } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

import { FileId } from "@app/types/file";
import { FolderRecord } from "@app/types/folder";
import { StirlingFileStub } from "@app/types/fileContext";
import { formatFileSize, getFileDate } from "@app/utils/fileUtils";
import {
  downloadFileFromStorage,
  downloadMultipleFiles,
} from "@app/utils/downloadUtils";
import ToolChain from "@app/components/shared/ToolChain";

interface FileDetailsPanelProps {
  selectedFileIds: FileId[];
  fileMap: Map<FileId, StirlingFileStub>;
  currentFolder: FolderRecord | null;
  onClose: () => void;
  onAddToWorkspace: (fileIds: FileId[]) => void;
  onQuickView: (fileId: FileId) => void;
  onMove: (fileIds: FileId[]) => void;
  onRemove: (fileIds: FileId[]) => void;
}

export function FileDetailsPanel({
  selectedFileIds,
  fileMap,
  currentFolder,
  onClose,
  onAddToWorkspace,
  onQuickView,
  onMove,
  onRemove,
}: FileDetailsPanelProps) {
  const { t } = useTranslation();
  const files = useMemo(
    () =>
      selectedFileIds
        .map((id) => fileMap.get(id))
        .filter((f): f is StirlingFileStub => Boolean(f)),
    [selectedFileIds, fileMap],
  );

  // Hooks must run unconditionally — declare state before the early return.
  const [downloading, setDownloading] = useState(false);

  if (files.length === 0) {
    return null;
  }

  const single = files.length === 1 ? files[0]! : null;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const ext = single ? (single.name.split(".").pop() ?? "").toUpperCase() : "";

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (single) {
        await downloadFileFromStorage(single);
      } else {
        await downloadMultipleFiles(files);
      }
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <aside className="files-page-details" aria-label={t("filesPage.details", "Details")}>
      <div className="files-page-details-header">
        <strong>
          {single
            ? t("filesPage.details", "Details")
            : t("filesPage.detailsCount", "{{count}} files selected", {
                count: files.length,
              })}
        </strong>
        <Tooltip label={t("filesPage.closeDetails", "Close details")} withinPortal>
          <ActionIcon variant="subtle" size="sm" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </ActionIcon>
        </Tooltip>
      </div>

      <div className="files-page-details-body">
        {single ? (
          <>
            <div className="files-page-details-thumb">
              {single.thumbnailUrl ? (
                <img src={single.thumbnailUrl} alt="" />
              ) : (
                <PictureAsPdfIcon style={{ fontSize: "3rem", color: "var(--text-muted)" }} />
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, wordBreak: "break-word", flex: 1 }}>
                {single.name}
              </h3>
              {ext && (
                <Badge size="sm" variant="light" color="gray">
                  {ext}
                </Badge>
              )}
              {(single.versionNumber ?? 1) > 1 && (
                <Badge size="sm" variant="light" color="blue">
                  v{single.versionNumber}
                </Badge>
              )}
            </div>
            <div className="files-page-details-fieldlist">
              <DetailField
                label={t("filesPage.field.size", "Size")}
                value={formatFileSize(single.size)}
              />
              <DetailField
                label={t("filesPage.field.type", "Type")}
                value={single.type || "—"}
              />
              <DetailField
                label={t("filesPage.field.modified", "Modified")}
                value={getFileDate({ lastModified: single.lastModified })}
              />
              <DetailField
                label={t("filesPage.field.added", "Added")}
                value={
                  single.createdAt
                    ? getFileDate({ lastModified: single.createdAt })
                    : "—"
                }
              />
              <DetailField
                label={t("filesPage.field.folder", "Folder")}
                value={currentFolder ? currentFolder.name : t("filesPage.allFiles", "All files")}
              />
            </div>
            {single.toolHistory && single.toolHistory.length > 0 && (
              <div className="files-page-details-tool-history">
                <div className="files-page-details-tool-history-label">
                  {t("filesPage.field.toolHistory", "Tool history")}
                </div>
                <ToolChain
                  toolChain={single.toolHistory}
                  displayStyle="badges"
                  size="xs"
                />
              </div>
            )}
          </>
        ) : (
          <div className="files-page-details-fieldlist">
            <DetailField
              label={t("filesPage.field.totalSize", "Total size")}
              value={formatFileSize(totalSize)}
            />
            <DetailField
              label={t("filesPage.field.count", "Files")}
              value={String(files.length)}
            />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <Button
            leftSection={<OpenInNewIcon fontSize="small" />}
            variant="filled"
            onClick={() => onAddToWorkspace(selectedFileIds)}
          >
            {files.length === 1
              ? t("filesPage.addToWorkspace", "Add to workspace")
              : t(
                  "filesPage.addToWorkspaceCount",
                  "Add {{count}} to workspace",
                  { count: files.length },
                )}
          </Button>
          {single && (
            <Button
              leftSection={<VisibilityIcon fontSize="small" />}
              variant="subtle"
              onClick={() => onQuickView(single.id)}
            >
              {t("filesPage.quickView", "Quick view")}
            </Button>
          )}
          <Button
            leftSection={<DownloadIcon fontSize="small" />}
            variant="default"
            onClick={handleDownload}
            loading={downloading}
          >
            {single
              ? t("filesPage.download", "Download")
              : t("filesPage.downloadAll", "Download all")}
          </Button>
          <Button
            leftSection={<DriveFileMoveIcon fontSize="small" />}
            variant="default"
            onClick={() => onMove(selectedFileIds)}
          >
            {t("filesPage.moveTo", "Move to…")}
          </Button>
          <Button
            leftSection={<DeleteIcon fontSize="small" />}
            color="red"
            variant="light"
            onClick={() => onRemove(selectedFileIds)}
          >
            {t("filesPage.remove", "Remove from storage")}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="files-page-details-field">
      <span className="files-page-details-field-label">{label}</span>
      <span className="files-page-details-field-value">{value}</span>
    </div>
  );
}
