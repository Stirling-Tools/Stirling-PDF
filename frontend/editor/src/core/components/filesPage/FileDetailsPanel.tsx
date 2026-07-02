import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Badge, Button, Tooltip } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import HistoryIcon from "@mui/icons-material/History";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import LinkIcon from "@mui/icons-material/Link";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

import { FileId } from "@app/types/file";
import { FolderRecord } from "@app/types/folder";
import { StirlingFileStub } from "@app/types/fileContext";
import { formatFileSize, getFileDate } from "@app/utils/fileUtils";
import {
  downloadFileFromStorage,
  downloadMultipleFiles,
} from "@app/utils/downloadUtils";
import ShareManagementModal from "@app/components/shared/ShareManagementModal";
import { useSharingEnabled } from "@app/hooks/useSharingEnabled";
import { fileStorage } from "@app/services/fileStorage";
import { extractPDFMetadata } from "@app/services/pdfMetadataService";
import {
  VersionTimeline,
  DetailField,
} from "@app/components/filesPage/VersionTimeline";

/** Custom PDF Info-dictionary key the classify-and-tag tool writes (must match
 *  the backend's PdfMetadataService.CLASSIFICATION_KEY). */
const CLASSIFICATION_KEY = "StirlingPDFClassification";

/** Reading classification means loading the file's bytes through PDF.js, so cap
 *  the auto-read by size — the app handles very large PDFs and we won't pull a
 *  multi-GB file into memory just to surface a metadata tag. */
const MAX_CLASSIFICATION_READ_BYTES = 25 * 1024 * 1024;

interface DocumentClassification {
  category: string;
  categoryLabel: string;
  docType: string;
  docTypeLabel: string;
  typeConfidence?: number;
  tags: string[];
}

/** Parse the classification JSON stored in PDF metadata; null if absent/invalid. */
function parseClassification(value: string): DocumentClassification | null {
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    const category = typeof raw.category === "string" ? raw.category : "";
    const docType = typeof raw.docType === "string" ? raw.docType : "";
    if (!category && !docType) return null;
    // The classifier stores the human label alongside the id; older files
    // predate it, so fall back to prettifying the id.
    const categoryLabel =
      typeof raw.categoryLabel === "string" && raw.categoryLabel
        ? raw.categoryLabel
        : prettyLabel(category);
    const docTypeLabel =
      typeof raw.docTypeLabel === "string" && raw.docTypeLabel
        ? raw.docTypeLabel
        : prettyLabel(docType);
    return {
      category,
      categoryLabel,
      docType,
      docTypeLabel,
      typeConfidence:
        typeof raw.typeConfidence === "number" ? raw.typeConfidence : undefined,
      tags: Array.isArray(raw.tags)
        ? raw.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
    };
  } catch {
    return null;
  }
}

/** "lab_result" / "lab-result" → "Lab result" — fallback for pre-label files. */
function prettyLabel(id: string): string {
  return id
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

interface FileDetailsPanelProps {
  selectedFileIds: FileId[];
  fileMap: Map<FileId, StirlingFileStub>;
  currentFolder: FolderRecord | null;
  onClose: () => void;
  onAddToWorkspace: (fileIds: FileId[]) => void;
  onMove: (fileIds: FileId[]) => void;
  onRemove: (fileIds: FileId[]) => void;
  /** Save to server; only shown when at least one selected file is local-only. */
  onSaveToServer?: (files: StirlingFileStub[]) => void;
  /** When set, Save to server renders disabled with this tooltip (storage off). */
  saveToServerDisabledReason?: string | null;
  /** On small screens, show a compact "Version journey" button instead of the
   *  full inline timeline (which opens onOpenVersionHistory). */
  compactVersions?: boolean;
  onOpenVersionHistory?: () => void;
}

export function FileDetailsPanel({
  selectedFileIds,
  fileMap,
  currentFolder,
  onClose,
  onAddToWorkspace,
  onMove,
  onRemove,
  onSaveToServer,
  saveToServerDisabledReason,
  compactVersions = false,
  onOpenVersionHistory,
}: FileDetailsPanelProps) {
  const { t } = useTranslation();
  const { sharingEnabled } = useSharingEnabled();
  const files = useMemo(
    () =>
      selectedFileIds
        .map((id) => fileMap.get(id))
        .filter((f): f is StirlingFileStub => Boolean(f)),
    [selectedFileIds, fileMap],
  );

  // Hooks must run before any early return.
  const [downloading, setDownloading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  // Metadata (size/type/dates) is collapsed by default so the panel stays
  // short and the action buttons keep their pinned footer in view.
  const [fieldsOpen, setFieldsOpen] = useState(false);
  // Version journey is collapsed by default so the panel stays short.
  const [versionsOpen, setVersionsOpen] = useState(false);
  // Document classification read from PDF metadata, plus its (collapsed) section.
  const [classification, setClassification] =
    useState<DocumentClassification | null>(null);
  const [classificationOpen, setClassificationOpen] = useState(false);
  // Version chain for the selected file; empty for v1 or multi-select.
  const [versionChain, setVersionChain] = useState<StirlingFileStub[]>([]);
  const singleFileForChain = files.length === 1 ? files[0] : null;
  useEffect(() => {
    if (!singleFileForChain) {
      setVersionChain([]);
      return;
    }
    let cancelled = false;
    const rootId = (singleFileForChain.originalFileId ??
      singleFileForChain.id) as FileId;
    fileStorage
      .getHistoryChainStubs(rootId)
      .then((chain) => {
        if (!cancelled) setVersionChain(chain);
      })
      .catch((err) => {
        console.error("Failed to load version history", err);
        if (!cancelled) setVersionChain([]);
      });
    return () => {
      cancelled = true;
    };
  }, [singleFileForChain]);

  // Read the classification the policy wrote into PDF metadata
  useEffect(() => {
    setClassification(null);
    const stub = singleFileForChain;
    if (!stub) return;
    if (stub.type && !stub.type.toLowerCase().includes("pdf")) return;
    if (stub.size > MAX_CLASSIFICATION_READ_BYTES) return;
    let cancelled = false;
    (async () => {
      try {
        const file = await fileStorage.getStirlingFile(stub.id);
        if (cancelled || !file) return;
        const result = await extractPDFMetadata(file);
        if (cancelled || !result.success) return;
        const entry = result.metadata.customMetadata.find(
          (item) => item.key === CLASSIFICATION_KEY,
        );
        if (!entry) return;
        const parsed = parseClassification(entry.value);
        if (parsed && !cancelled) setClassification(parsed);
      } catch (err) {
        console.error("Failed to read classification metadata", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [singleFileForChain]);

  if (files.length === 0) {
    return null;
  }

  const single = files.length === 1 ? files[0]! : null;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const ext = single ? (single.name.split(".").pop() ?? "").toUpperCase() : "";
  // Files still needing a server upload; drives Save-to-server visibility.
  const localOnlyFiles = files.filter((f) => f.remoteStorageId == null);

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
    <aside
      className="files-page-details"
      aria-label={t("filesPage.details", "Details")}
    >
      <div className="files-page-details-header">
        <strong>
          {single
            ? t("filesPage.details", "Details")
            : t("filesPage.detailsCount", "{{count}} files selected", {
                count: files.length,
              })}
        </strong>
        <Tooltip
          label={t("filesPage.closeDetails", "Close details")}
          withinPortal
        >
          <ActionIcon variant="subtle" size="sm" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </ActionIcon>
        </Tooltip>
      </div>

      <div className="files-page-details-body">
        {single ? (
          <>
            <div
              className={`files-page-details-thumb${
                compactVersions ? " is-compact" : ""
              }`}
            >
              {single.thumbnailUrl ? (
                <img src={single.thumbnailUrl} alt="" />
              ) : (
                <PictureAsPdfIcon
                  style={{ fontSize: "3rem", color: "var(--text-muted)" }}
                />
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <h3 style={{ margin: 0, wordBreak: "break-word", flex: 1 }}>
                {single.name}
              </h3>
              {ext && (
                // Custom span; Mantine Badge default rendered invisible in dark mode.
                <span className="files-page-details-ext-tag">{ext}</span>
              )}
              {(single.versionNumber ?? 1) > 1 && (
                <Badge size="sm" variant="filled" color="blue">
                  v{single.versionNumber}
                </Badge>
              )}
            </div>
            <button
              type="button"
              className="files-page-details-collapse-toggle"
              onClick={() => setFieldsOpen((o) => !o)}
              aria-expanded={fieldsOpen}
            >
              <span>{t("filesPage.fileInfo", "File info")}</span>
              <KeyboardArrowDownIcon
                className={`files-page-details-collapse-chevron${
                  fieldsOpen ? " is-open" : ""
                }`}
                fontSize="small"
              />
            </button>
            {fieldsOpen && (
              <div className="files-page-details-fieldlist">
                <DetailField
                  label={t("filesPage.field.size", "Size")}
                  value={formatFileSize(single.size)}
                />
                <DetailField
                  label={t("filesPage.field.type", "Type")}
                  value={single.type || "-"}
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
                      : "-"
                  }
                />
                <DetailField
                  label={t("filesPage.field.folder", "Folder")}
                  value={
                    currentFolder
                      ? currentFolder.name
                      : t("filesPage.allFiles", "All files")
                  }
                />
              </div>
            )}
            {classification && (
              <>
                <button
                  type="button"
                  className="files-page-details-collapse-toggle"
                  onClick={() => setClassificationOpen((o) => !o)}
                  aria-expanded={classificationOpen}
                >
                  <span>{t("filesPage.classification", "Classification")}</span>
                  <KeyboardArrowDownIcon
                    className={`files-page-details-collapse-chevron${
                      classificationOpen ? " is-open" : ""
                    }`}
                    fontSize="small"
                  />
                </button>
                {classificationOpen && (
                  <div className="files-page-details-fieldlist">
                    {classification.category && (
                      <DetailField
                        label={t("filesPage.field.category", "Category")}
                        value={classification.categoryLabel}
                      />
                    )}
                    {classification.docType && (
                      <DetailField
                        label={t("filesPage.field.type", "Type")}
                        value={classification.docTypeLabel}
                      />
                    )}
                    {classification.typeConfidence != null && (
                      <DetailField
                        label={t("filesPage.field.confidence", "Confidence")}
                        value={`${Math.round(
                          classification.typeConfidence * 100,
                        )}%`}
                      />
                    )}
                    {classification.tags.length > 0 && (
                      <div className="files-page-details-field">
                        <span className="files-page-details-field-label">
                          {t("filesPage.field.tags", "Tags")}
                        </span>
                        <span
                          className="files-page-details-field-value"
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.25rem",
                            justifyContent: "flex-end",
                          }}
                        >
                          {classification.tags.map((tag) => (
                            <Badge
                              key={tag}
                              size="xs"
                              variant="light"
                              color="orange"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {/* Version journey. Each tool run writes a new StirlingFile
                with the same `originalFileId` and an incremented
                `versionNumber`, so the chain reconstructs the edit
                timeline. The previous file manager exposed this and the
                refactored one had silently dropped it; this revival also
                shows WHICH tool was added at each step (the delta from
                the prior version) so the user can read the journey
                top-to-bottom. Long chains (> 6) collapse the middle. */}
            {versionChain.length > 1 &&
              (compactVersions && onOpenVersionHistory ? (
                <Button
                  leftSection={<HistoryIcon fontSize="small" />}
                  variant="default"
                  onClick={onOpenVersionHistory}
                >
                  {t(
                    "filesPage.viewVersionHistory",
                    "Version journey ({{count}})",
                    { count: versionChain.length },
                  )}
                </Button>
              ) : (
                <>
                  <button
                    type="button"
                    className="files-page-details-collapse-toggle"
                    onClick={() => setVersionsOpen((o) => !o)}
                    aria-expanded={versionsOpen}
                  >
                    <span>
                      {t(
                        "filesPage.viewVersionHistory",
                        "Version journey ({{count}})",
                        { count: versionChain.length },
                      )}
                    </span>
                    <KeyboardArrowDownIcon
                      className={`files-page-details-collapse-chevron${
                        versionsOpen ? " is-open" : ""
                      }`}
                      fontSize="small"
                    />
                  </button>
                  {versionsOpen && (
                    <VersionTimeline
                      chain={versionChain}
                      currentId={single.id}
                      onAddToWorkspace={onAddToWorkspace}
                      onRemove={onRemove}
                      hideHeader
                    />
                  )}
                </>
              ))}
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
      </div>

      <div className="files-page-details-actions">
        <Button
          leftSection={<OpenInNewIcon fontSize="small" />}
          variant="filled"
          onClick={() => onAddToWorkspace(selectedFileIds)}
        >
          {files.length === 1
            ? t("filesPage.addToWorkspace", "Add to workspace")
            : t("filesPage.addToWorkspaceCount", "Add {{count}} to workspace", {
                count: files.length,
              })}
        </Button>
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
        {/* Share is single-file only. When sharing is disabled in
              server config (storage.sharing.enabled=false) we still
              render the button - disabled with an explanatory tooltip -
              so users discover the feature exists and know how to
              enable it, rather than wondering why "share" is missing
              from the action stack on their build. */}
        {single && (
          <Tooltip
            label={t(
              "filesPage.shareDisabledHint",
              "File sharing isn't enabled on this server. Ask your admin to enable it.",
            )}
            disabled={sharingEnabled}
            withinPortal
            multiline
            w={260}
          >
            <Button
              leftSection={<LinkIcon fontSize="small" />}
              variant="default"
              disabled={!sharingEnabled}
              onClick={() => setShareModalOpen(true)}
              styles={{
                root: {
                  // Keep tooltip hoverable while button is disabled.
                  pointerEvents: sharingEnabled ? undefined : "auto",
                },
              }}
            >
              {t("filesPage.shareManage", "Manage sharing")}
            </Button>
          </Tooltip>
        )}
        <Button
          leftSection={<DriveFileMoveIcon fontSize="small" />}
          variant="default"
          onClick={() => onMove(selectedFileIds)}
        >
          {t("filesPage.moveTo", "Move to…")}
        </Button>
        {/* Save to server; shown when any selected file is local-only. When
              storage is off it stays visible but disabled with a tooltip (same
              treatment as Manage sharing above). */}
        {onSaveToServer && localOnlyFiles.length > 0 && (
          <Tooltip
            label={saveToServerDisabledReason}
            disabled={!saveToServerDisabledReason}
            withinPortal
            multiline
            w={260}
          >
            <Button
              leftSection={<CloudUploadIcon fontSize="small" />}
              variant="default"
              disabled={Boolean(saveToServerDisabledReason)}
              onClick={() => onSaveToServer(localOnlyFiles)}
              styles={{
                root: {
                  // Keep tooltip hoverable while button is disabled.
                  pointerEvents: saveToServerDisabledReason
                    ? "auto"
                    : undefined,
                },
              }}
            >
              {t("filesPage.saveToServer", "Save to server")}
            </Button>
          </Tooltip>
        )}
        <Button
          leftSection={<DeleteIcon fontSize="small" />}
          color="red"
          variant="light"
          onClick={() => onRemove(selectedFileIds)}
        >
          {t("filesPage.remove", "Delete")}
        </Button>
      </div>
      {/* Single panel-level mount; gated on sharingEnabled. */}
      {single && sharingEnabled && (
        <ShareManagementModal
          opened={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          file={single}
        />
      )}
    </aside>
  );
}
