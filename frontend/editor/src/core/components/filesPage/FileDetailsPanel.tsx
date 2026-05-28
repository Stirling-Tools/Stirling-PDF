import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Badge, Button, Menu, Tooltip } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import HistoryIcon from "@mui/icons-material/History";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import LinkIcon from "@mui/icons-material/Link";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

import { FileId, ToolOperation } from "@app/types/file";
import { ToolId } from "@app/types/toolId";
import { FolderRecord } from "@app/types/folder";
import { StirlingFileStub } from "@app/types/fileContext";
import { formatFileSize, getFileDate } from "@app/utils/fileUtils";
import {
  downloadFileFromStorage,
  downloadMultipleFiles,
} from "@app/utils/downloadUtils";
import ToolChain from "@app/components/shared/ToolChain";
import ShareManagementModal from "@app/components/shared/ShareManagementModal";
import { useSharingEnabled } from "@app/hooks/useSharingEnabled";
import { fileStorage } from "@app/services/fileStorage";

interface FileDetailsPanelProps {
  selectedFileIds: FileId[];
  fileMap: Map<FileId, StirlingFileStub>;
  currentFolder: FolderRecord | null;
  onClose: () => void;
  onAddToWorkspace: (fileIds: FileId[]) => void;
  onQuickView: (fileId: FileId) => void;
  onMove: (fileIds: FileId[]) => void;
  onRemove: (fileIds: FileId[]) => void;
  /** Save to server; only shown when at least one selected file is local-only. */
  onSaveToServer?: (files: StirlingFileStub[]) => void;
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
  onSaveToServer,
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
            <div className="files-page-details-thumb">
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
            {/* Version journey. Each tool run writes a new StirlingFile
                with the same `originalFileId` and an incremented
                `versionNumber`, so the chain reconstructs the edit
                timeline. The previous file manager exposed this and the
                refactored one had silently dropped it; this revival also
                shows WHICH tool was added at each step (the delta from
                the prior version) so the user can read the journey
                top-to-bottom. Long chains (> 6) collapse the middle. */}
            {versionChain.length > 1 && (
              <VersionTimeline
                chain={versionChain}
                currentId={single.id}
                onQuickView={onQuickView}
                onAddToWorkspace={onAddToWorkspace}
                onRemove={onRemove}
              />
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

        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
        >
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
          {/* Save to server; shown when any selected file is local-only. */}
          {onSaveToServer && localOnlyFiles.length > 0 && (
            <Button
              leftSection={<CloudUploadIcon fontSize="small" />}
              variant="default"
              onClick={() => onSaveToServer(localOnlyFiles)}
            >
              {t("filesPage.saveToServer", "Save to server")}
            </Button>
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="files-page-details-field">
      <span className="files-page-details-field-label">{label}</span>
      <span className="files-page-details-field-value">{value}</span>
    </div>
  );
}

/** Tool that produced `version` from `prior`; null for v1. */
function deltaToolFor(
  version: StirlingFileStub,
  prior: StirlingFileStub | null,
): ToolOperation | null {
  if (!prior) return null;
  const priorLen = prior.toolHistory?.length ?? 0;
  const curr = version.toolHistory ?? [];
  return curr[priorLen] ?? null;
}

interface VersionTimelineProps {
  /** Chain sorted oldest-first. */
  chain: StirlingFileStub[];
  /** Currently selected version. */
  currentId: FileId;
  onQuickView: (fileId: FileId) => void;
  onAddToWorkspace: (fileIds: FileId[]) => void;
  onRemove: (fileIds: FileId[]) => void;
}

/** Version timeline with per-row tool deltas and collapse-when-long. */
function VersionTimeline({
  chain,
  currentId,
  onQuickView,
  onAddToWorkspace,
  onRemove,
}: VersionTimelineProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<FileId>>(new Set());
  const [showAllCollapsed, setShowAllCollapsed] = useState(false);

  // Newest-first ordering.
  const ordered = useMemo(
    () =>
      [...chain].sort(
        (a, b) => (b.versionNumber ?? 1) - (a.versionNumber ?? 1),
      ),
    [chain],
  );

  // Index by versionNumber for prior-version lookup.
  const byVersionNumber = useMemo(() => {
    const map = new Map<number, StirlingFileStub>();
    for (const v of chain) {
      map.set(v.versionNumber ?? 1, v);
    }
    return map;
  }, [chain]);

  // Collapse middle when long: 3 newest + ellipsis + 2 oldest.
  const COLLAPSE_THRESHOLD = 6;
  const collapsible = ordered.length > COLLAPSE_THRESHOLD;
  type Row =
    | { kind: "version"; version: StirlingFileStub }
    | {
        kind: "ellipsis";
        hidden: number;
      };
  const rows: Row[] = useMemo(() => {
    if (!collapsible || showAllCollapsed) {
      return ordered.map((v) => ({ kind: "version", version: v }) as Row);
    }
    const head = ordered
      .slice(0, 3)
      .map((v) => ({ kind: "version", version: v }) as Row);
    const tail = ordered
      .slice(-2)
      .map((v) => ({ kind: "version", version: v }) as Row);
    const hidden = ordered.length - 5;
    return [...head, { kind: "ellipsis", hidden }, ...tail];
  }, [collapsible, showAllCollapsed, ordered]);

  const toggleExpand = (id: FileId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="files-page-details-version-timeline">
      <div className="files-page-details-version-timeline-label">
        <HistoryIcon fontSize="small" />
        <span>{t("filesPage.field.versionHistory", "Version journey")}</span>
        <span className="files-page-details-version-timeline-count">
          {t("filesPage.versionsCount", "{{count}} versions", {
            count: ordered.length,
          })}
        </span>
      </div>
      <ol className="files-page-details-version-timeline-list">
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;
          if (row.kind === "ellipsis") {
            return (
              <li
                key="ellipsis"
                className="files-page-details-version-timeline-ellipsis"
              >
                <div className="files-page-details-version-timeline-rail">
                  <span className="files-page-details-version-timeline-rail-dot is-ellipsis" />
                  {!isLast && (
                    <span className="files-page-details-version-timeline-rail-line" />
                  )}
                </div>
                <button
                  type="button"
                  className="files-page-details-version-timeline-ellipsis-btn"
                  onClick={() => setShowAllCollapsed(true)}
                >
                  {t(
                    "filesPage.versionShowHidden",
                    "Show {{count}} earlier versions",
                    { count: row.hidden },
                  )}
                </button>
              </li>
            );
          }
          const v = row.version;
          const isActive = v.id === currentId;
          const isExpanded = expandedIds.has(v.id);
          const prior = byVersionNumber.get((v.versionNumber ?? 1) - 1) ?? null;
          const delta = deltaToolFor(v, prior);
          return (
            <li
              key={v.id}
              className={`files-page-details-version-timeline-row${
                isActive ? " is-active" : ""
              }`}
            >
              <div className="files-page-details-version-timeline-rail">
                <span
                  className={`files-page-details-version-timeline-rail-dot${
                    isActive ? " is-active" : ""
                  }`}
                />
                {!isLast && (
                  <span className="files-page-details-version-timeline-rail-line" />
                )}
              </div>
              <div className="files-page-details-version-timeline-body">
                <button
                  type="button"
                  className="files-page-details-version-timeline-summary"
                  onClick={() => toggleExpand(v.id)}
                  aria-expanded={isExpanded}
                >
                  <Badge
                    size="xs"
                    variant={isActive ? "filled" : "outline"}
                    color="blue"
                  >
                    v{v.versionNumber ?? 1}
                  </Badge>
                  {delta ? (
                    <span className="files-page-details-version-timeline-delta">
                      <span className="files-page-details-version-timeline-delta-plus">
                        +
                      </span>
                      <ToolLabel toolId={delta.toolId} />
                    </span>
                  ) : (
                    <span className="files-page-details-version-timeline-delta is-origin">
                      {t("filesPage.versionOrigin", "Original upload")}
                    </span>
                  )}
                  <span className="files-page-details-version-timeline-spacer" />
                  <KeyboardArrowDownIcon
                    className={`files-page-details-version-timeline-chevron${
                      isExpanded ? " is-expanded" : ""
                    }`}
                    fontSize="small"
                  />
                </button>
                <div className="files-page-details-version-timeline-meta-line">
                  <span>{formatFileSize(v.size)}</span>
                  {v.lastModified ? (
                    <>
                      <span>·</span>
                      <span>
                        {getFileDate({ lastModified: v.lastModified })}
                      </span>
                    </>
                  ) : null}
                  {!isActive && (
                    <>
                      <span className="files-page-details-version-timeline-spacer" />
                      <Menu position="bottom-end" withinPortal shadow="md">
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label={t(
                              "filesPage.versionActions",
                              "Version actions",
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertIcon fontSize="small" />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<VisibilityIcon fontSize="small" />}
                            onClick={() => onQuickView(v.id)}
                          >
                            {t("filesPage.viewVersion", "View this version")}
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<OpenInNewIcon fontSize="small" />}
                            onClick={() => onAddToWorkspace([v.id])}
                          >
                            {t(
                              "filesPage.openVersionInWorkspace",
                              "Open in workspace",
                            )}
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<DownloadIcon fontSize="small" />}
                            onClick={() => {
                              void downloadFileFromStorage(v);
                            }}
                          >
                            {t(
                              "filesPage.downloadVersion",
                              "Download this version",
                            )}
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            color="red"
                            leftSection={<DeleteIcon fontSize="small" />}
                            onClick={() => onRemove([v.id])}
                          >
                            {t(
                              "filesPage.removeVersion",
                              "Remove this version",
                            )}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </>
                  )}
                </div>
                {isExpanded && (
                  // Filename + full cumulative tool chain.
                  <div className="files-page-details-version-timeline-expanded">
                    <DetailField
                      label={t("filesPage.field.name", "Name")}
                      value={v.name}
                    />
                    {v.toolHistory && v.toolHistory.length > 0 && (
                      <div className="files-page-details-version-timeline-toolchain">
                        <span className="files-page-details-version-timeline-toolchain-label">
                          {t(
                            "filesPage.field.toolHistoryAtVersion",
                            "Cumulative tool chain",
                          )}
                        </span>
                        <ToolChain
                          toolChain={v.toolHistory}
                          displayStyle="badges"
                          size="xs"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {collapsible && showAllCollapsed && (
        <button
          type="button"
          className="files-page-details-version-timeline-collapse-btn"
          onClick={() => setShowAllCollapsed(false)}
        >
          {t("filesPage.versionCollapse", "Collapse middle versions")}
        </button>
      )}
    </div>
  );
}

/** Translated tool name via `home.{toolId}.title`. */
function ToolLabel({ toolId }: { toolId: ToolId }) {
  const { t } = useTranslation();
  return <span>{t(`home.${toolId}.title`, toolId)}</span>;
}
