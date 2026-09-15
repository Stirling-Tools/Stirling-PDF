import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
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
import { readStubClassificationLabels } from "@app/services/fileClassification";
import { useLabelName } from "@app/data/labelDisplay";
import { useClassificationEnabled } from "@app/hooks/useClassificationEnabled";
import {
  VersionTimeline,
  DetailField,
} from "@app/components/filesPage/VersionTimeline";

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
  // Stored as label ids; resolve to display names via the seam.
  const [classification, setClassification] = useState<string[] | null>(null);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const classificationEnabled = useClassificationEnabled();
  const labelName = useLabelName();
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

  // Show the file's classification labels: the stub's cached copy when present
  // (free — no byte load), else read the PDF metadata via the shared service.
  // Gated on classification being enabled (SaaS + AI): off-feature we never read
  // the metadata or show the section, so a PDF that happens to carry the
  // StirlingPDFClassification key never reveals the feature in a build without it.
  useEffect(() => {
    setClassification(null);
    if (!classificationEnabled) return;
    const stub = singleFileForChain;
    if (!stub) return;
    if (stub.classificationLabels && stub.classificationLabels.length > 0) {
      setClassification(stub.classificationLabels);
      return;
    }
    let cancelled = false;
    void readStubClassificationLabels(stub).then((labels) => {
      if (!cancelled && labels) setClassification(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [singleFileForChain, classificationEnabled]);

  if (files.length === 0) {
    return null;
  }

  const single = files.length === 1 ? files[0] : null;
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
          <ActionIcon
            variant="tertiary"
            size="sm"
            onClick={onClose}
            aria-label={t("filesPage.closeDetails", "Close details")}
          >
            <Icon name="x" size={20} />
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
                <Icon
                  name="file-pdf"
                  size={"3rem"}
                  style={{ color: "var(--c-text-subtle)" }}
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
                <Badge size="sm" color="blue">
                  v{single.versionNumber}
                </Badge>
              )}
            </div>
            <Button
              variant="tertiary"
              className="files-page-details-collapse-toggle"
              onClick={() => setFieldsOpen((o) => !o)}
              aria-expanded={fieldsOpen}
              rightSection={
                <Icon
                  name="chevron-down"
                  size={20}
                  className={`files-page-details-collapse-chevron${
                    fieldsOpen ? " is-open" : ""
                  }`}
                />
              }
            >
              <span>{t("filesPage.fileInfo", "File info")}</span>
            </Button>
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
                <Button
                  variant="quiet"
                  fullWidth
                  justify="between"
                  className="files-page-details-collapse-toggle"
                  onClick={() => setClassificationOpen((o) => !o)}
                  aria-expanded={classificationOpen}
                  rightSection={
                    <Icon
                      name="chevron-down"
                      size={20}
                      className={`files-page-details-collapse-chevron${
                        classificationOpen ? " is-open" : ""
                      }`}
                    />
                  }
                >
                  <span>{t("filesPage.classification", "Classification")}</span>
                </Button>
                {classificationOpen && (
                  <div className="files-page-details-fieldlist">
                    <div className="files-page-details-field">
                      <span className="files-page-details-field-label">
                        {t("filesPage.field.labels", "Labels")}
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
                        {classification.map((label) => (
                          <Badge
                            key={label}
                            size="xs"
                            variant="light"
                            color="orange"
                          >
                            {labelName(label)}
                          </Badge>
                        ))}
                      </span>
                    </div>
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
                  leftSection={<Icon name="rotate-ccw-clock" size={20} />}
                  variant="secondary"
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
                  <Button
                    variant="quiet"
                    fullWidth
                    justify="between"
                    className="files-page-details-collapse-toggle"
                    onClick={() => setVersionsOpen((o) => !o)}
                    aria-expanded={versionsOpen}
                    rightSection={
                      <Icon
                        name="chevron-down"
                        size={20}
                        className={`files-page-details-collapse-chevron${
                          versionsOpen ? " is-open" : ""
                        }`}
                      />
                    }
                  >
                    <span>
                      {t(
                        "filesPage.viewVersionHistory",
                        "Version journey ({{count}})",
                        { count: versionChain.length },
                      )}
                    </span>
                  </Button>
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
          leftSection={<Icon name="external-link" size={20} />}
          onClick={() => onAddToWorkspace(selectedFileIds)}
        >
          {files.length === 1
            ? t("filesPage.addToWorkspace", "Add to workspace")
            : t("filesPage.addToWorkspaceCount", "Add {{count}} to workspace", {
                count: files.length,
              })}
        </Button>
        <Button
          leftSection={<Icon name="download" size={20} />}
          variant="secondary"
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
              leftSection={<Icon name="link" size={20} />}
              variant="secondary"
              disabled={!sharingEnabled}
              onClick={() => setShareModalOpen(true)}
              style={{
                // Keep tooltip hoverable while button is disabled.
                pointerEvents: sharingEnabled ? undefined : "auto",
              }}
            >
              {t("filesPage.shareManage", "Manage sharing")}
            </Button>
          </Tooltip>
        )}
        <Button
          leftSection={<Icon name="folder-input" size={20} />}
          variant="secondary"
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
              leftSection={<Icon name="cloud-upload" size={20} />}
              variant="secondary"
              disabled={Boolean(saveToServerDisabledReason)}
              onClick={() => onSaveToServer(localOnlyFiles)}
              style={{
                // Keep tooltip hoverable while button is disabled.
                pointerEvents: saveToServerDisabledReason ? "auto" : undefined,
              }}
            >
              {t("filesPage.saveToServer", "Save to server")}
            </Button>
          </Tooltip>
        )}
        <Button
          leftSection={<Icon name="trash" size={20} />}
          accent="danger"
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
