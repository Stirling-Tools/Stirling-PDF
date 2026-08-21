import React, { useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Group, Loader, Menu, Stack, Text, Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import HistoryIcon from "@mui/icons-material/History";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import type { FileId } from "@app/types/file";
import { FileDocIcon } from "@app/components/shared/FileDocIcon";
import {
  PolicyBadges,
  type FileItemPolicyRef,
} from "@app/components/shared/PolicyBadges";
import { getFileDocVariant } from "@app/components/shared/filePreview/getFileTypeIcon";
import { useLazyThumbnail } from "@app/hooks/useLazyThumbnail";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { formatFileSize, IMAGE_EXTENSIONS } from "@app/utils/fileUtils";
import "@app/components/shared/FileSidebarFileItem.css";

export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export type DateGroup =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "thisMonth"
  | "older";

export function getDateGroup(lastModified: number | undefined): DateGroup {
  if (!lastModified) return "older";
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const d = new Date(lastModified);
  const fileDay = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();
  const daysAgo = (today - fileDay) / 86400000;
  if (daysAgo < 1) return "today";
  if (daysAgo < 2) return "yesterday";
  if (daysAgo < 7) return "thisWeek";
  if (daysAgo < 30) return "thisMonth";
  return "older";
}

export function formatFileDate(lastModifiedTs: number): string {
  const lastModified = lastModifiedTs ? new Date(lastModifiedTs) : new Date();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fileDay = new Date(
    lastModified.getFullYear(),
    lastModified.getMonth(),
    lastModified.getDate(),
  );

  if (fileDay.getTime() === today.getTime()) {
    return lastModified
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .toLowerCase();
  }
  if (fileDay.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (fileDay >= weekAgo) {
    return lastModified.toLocaleDateString("en-US", { weekday: "long" });
  }
  return lastModified.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function CheckIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function getSidebarFileIcon(ext: string): React.ReactElement {
  const cls = "file-sidebar-file-icon file-sidebar-file-icon-hover-hide";
  return <FileDocIcon className={cls} variant={getFileDocVariant(ext)} />;
}

/** A Watched Folder this file currently belongs to, used for the membership dots. */
export interface FileItemFolderRef {
  id: string;
  name: string;
  accentColor: string;
}

export interface FileItemProps {
  fileId: FileId;
  name: string;
  size?: number;
  lastModified?: number;
  isSelected: boolean;
  isActive: boolean;
  isViewedInViewer: boolean;
  thumbnailUrl?: string;
  onClick: (fileId: FileId) => void;
  onEyeClick: (fileId: FileId, e: React.MouseEvent) => void;
  /** When true, the row can be dragged (e.g. onto a Watched Folder). */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, fileId: FileId) => void;
  /** Watched Folders this file is in — rendered as small accent dots. */
  folders?: FileItemFolderRef[];
  /** Clicking a membership dot opens that folder. */
  onFolderClick?: (folderId: string) => void;
  /** Policies that have run on this file — rendered as small shield badges. */
  policies?: FileItemPolicyRef[];
  /** The file's primary classification label (display name), shown in the meta
   *  row in place of the file type when present. */
  primaryLabel?: string;
  /** Delete (local only) from the kebab menu. Omit to hide the menu's delete. */
  onDelete?: (fileId: FileId) => void;
  /** Download a copy (desktop: save a copy) from the kebab menu. */
  onDownload?: (fileId: FileId) => void;
  /** Rename the file from the kebab menu. */
  onRename?: (fileId: FileId) => void;
  /** Save a second copy of the file into the library. */
  onDuplicate?: (fileId: FileId) => void;
  /** Desktop only: open the file in its own window. Omit where unsupported. */
  onOpenInNewWindow?: (fileId: FileId) => void;
  /** Save to cloud from the kebab menu. */
  onSaveToCloud?: (fileId: FileId) => void;
  /** Whether the upload-to-server menu item is offered (storage on, signed in). */
  canSaveToCloud?: boolean;
  /** File already lives on the server - shows a cloud badge + "Update" label. */
  isUploadedToCloud?: boolean;
  /** Open the version-history modal. Only shown when hasVersionHistory. */
  onVersionHistory?: (fileId: FileId) => void;
  /** Whether this file has more than one version (drives the menu item). */
  hasVersionHistory?: boolean;
  /** The stored bytes are gone (WebKit lost the blob's backing store). The row
   *  says so instead of pretending the file can open. */
  dataUnavailable?: boolean;
}

const MAX_VISIBLE_FOLDER_TAGS = 2;

/** One kebab row. `disabledReason`, when set, greys the row out and says why. */
function FileMenuItem({
  disabledReason,
  icon,
  color,
  onClick,
  children,
}: {
  disabledReason?: React.ReactNode;
  icon: React.ReactNode;
  color?: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip
      label={disabledReason}
      disabled={!disabledReason}
      position="left"
      offset={6}
      withArrow
    >
      {/* Disabled items swallow pointer events, so the tooltip needs a live wrapper. */}
      <div>
        <Menu.Item
          disabled={Boolean(disabledReason)}
          color={color}
          leftSection={icon}
          onClick={(e) => {
            e.stopPropagation();
            onClick(e);
          }}
        >
          {children}
        </Menu.Item>
      </div>
    </Tooltip>
  );
}

// Memoized: sidebar rows bail out unless THEIR props change, so one file's
// update (e.g. a new version landing) re-renders one row, not the whole list.
export const FileItem = React.memo(function FileItem({
  fileId,
  name,
  size,
  lastModified,
  isSelected,
  isActive,
  isViewedInViewer,
  dataUnavailable,
  thumbnailUrl,
  onClick,
  onEyeClick,
  draggable,
  onDragStart,
  folders = [],
  onFolderClick,
  policies = [],
  primaryLabel,
  onDelete,
  onDownload,
  onRename,
  onDuplicate,
  onOpenInNewWindow,
  onSaveToCloud,
  canSaveToCloud = false,
  isUploadedToCloud = false,
  onVersionHistory,
  hasVersionHistory = false,
}: FileItemProps) {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const DownloadIcon = useFileActionIcons().download;
  const ext = getFileExtension(name);
  const dateLabel = lastModified ? formatFileDate(lastModified) : "";
  const typeLabel = ext ? ext.toUpperCase() : "File";
  const metaLine = [typeLabel, size ? formatFileSize(size) : null, dateLabel]
    .filter(Boolean)
    .join(" · ");

  const policyEnforcing = policies.some((p) => p.enforcing);
  const enforcingTooltip = (action: string): React.ReactNode => (
    <Stack gap={6} py={2} w={200}>
      <Group gap={6} wrap="nowrap">
        <ShieldOutlinedIcon style={{ fontSize: 13 }} />
        <Text size="xs" fw={600}>
          {t(
            "policy.blockingAction",
            "{{action}} blocked while enforcing policy, please wait...",
            { action },
          )}
        </Text>
      </Group>
      <Loader size="xs" />
    </Stack>
  );

  // Why an action can't run right now: a policy is rewriting the file, or its
  // bytes are gone. `needsBytes` actions are the ones that read the file.
  const blockedReason = (
    action: string,
    needsBytes = true,
  ): React.ReactNode | null => {
    if (policyEnforcing) return enforcingTooltip(action);
    if (needsBytes && dataUnavailable)
      return t(
        "fileSidebar.fileItem.dataLostTooltip",
        "This browser lost this file's contents. Upload it again to keep working with it.",
      );
    return null;
  };

  const viewerLabel = isViewedInViewer
    ? t("fileSidebar.fileItem.closeViewer", "Close viewer")
    : t("fileSidebar.fileItem.openInViewer", "Open in viewer");

  const visibleFolders = folders.slice(0, MAX_VISIBLE_FOLDER_TAGS);
  const overflowFolders = folders.slice(MAX_VISIBLE_FOLDER_TAGS);

  // Only use raster thumbnails for PDFs and images — everything else uses scalable SVG icons
  const useRasterThumb = ext === "pdf" || IMAGE_EXTENSIONS.has(ext);
  const resolvedThumbnail = useLazyThumbnail(
    fileId,
    size ?? 0,
    useRasterThumb ? thumbnailUrl : undefined,
  );

  const itemRef = useRef<HTMLDivElement>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [menuOpened, setMenuOpened] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setHoverRect(itemRef.current?.getBoundingClientRect() ?? null);
  }, []);

  const handleMouseLeave = useCallback(() => setHoverRect(null), []);

  // Reactive: tooltip appears as soon as both hover rect and thumbnail are ready.
  // The kebab suppresses it - two cards floating off one row read as a glitch.
  const thumbPos =
    hoverRect && resolvedThumbnail && !menuOpened
      ? {
          top: hoverRect.top + hoverRect.height / 2,
          left: hoverRect.right + 10,
        }
      : null;

  return (
    <>
      <div
        id={`file-tab-${fileId}`}
        ref={itemRef}
        className={`file-sidebar-file-item${isSelected ? " selected" : ""}${isActive ? " active" : ""}${isViewedInViewer ? " viewed" : ""}`}
        onClick={() => onClick(fileId)}
        draggable={draggable}
        onDragStart={
          draggable && onDragStart ? (e) => onDragStart(e, fileId) : undefined
        }
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        onKeyDown={(e) => e.key === "Enter" && onClick(fileId)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="file-sidebar-file-icon-wrapper">
          {isSelected ? (
            <div className="file-sidebar-file-check">
              <CheckIcon className="file-sidebar-check-svg" />
            </div>
          ) : (
            <>
              <div className="file-sidebar-file-checkbox-hover" />
              {getSidebarFileIcon(ext)}
            </>
          )}
        </div>
        <div className="file-sidebar-file-info">
          <span
            className={`file-sidebar-file-name${isSelected ? " selected" : ""}`}
          >
            {name}
          </span>
          <span className="file-sidebar-file-meta-row">
            <span className="file-sidebar-file-meta">
              {primaryLabel ? (
                <>
                  {primaryLabel}
                  {primaryLabel && dateLabel ? " • " : ""}
                  {dateLabel}
                </>
              ) : (
                <>
                  {dateLabel}
                  {dateLabel && typeLabel ? " · " : ""}
                  {typeLabel}
                </>
              )}
            </span>
            {dataUnavailable && (
              <Tooltip
                label={t(
                  "fileSidebar.fileItem.dataLostTooltip",
                  "This browser lost this file's contents. Upload it again to keep working with it.",
                )}
                withArrow
                position="top"
              >
                <span className="file-sidebar-datalost-badge" data-no-select>
                  <ErrorOutlineIcon sx={{ fontSize: "0.85rem" }} />
                  {t("fileSidebar.fileItem.dataLost", "Data lost")}
                </span>
              </Tooltip>
            )}
            {isUploadedToCloud && (
              <Tooltip
                label={t(
                  "fileSidebar.fileItem.savedToServer",
                  "Saved to server",
                )}
                withArrow
                position="top"
              >
                <span className="file-sidebar-cloud-badge" data-no-select>
                  <CloudDoneIcon sx={{ fontSize: "0.85rem" }} />
                </span>
              </Tooltip>
            )}
            <PolicyBadges policies={policies} />
          </span>
          {folders.length > 0 && (
            <span className="file-sidebar-folder-tags" data-no-select>
              {visibleFolders.map((folder) => (
                <Tooltip
                  key={folder.id}
                  label={folder.name}
                  withArrow
                  position="top"
                  withinPortal
                >
                  <span
                    className="file-sidebar-folder-tag"
                    style={{
                      backgroundColor: `${folder.accentColor}1f`,
                      borderColor: `${folder.accentColor}55`,
                    }}
                    role="button"
                    tabIndex={-1}
                    aria-label={folder.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFolderClick?.(folder.id);
                    }}
                  >
                    <span
                      className="file-sidebar-folder-tag-dot"
                      style={{ backgroundColor: folder.accentColor }}
                    />
                    <span className="file-sidebar-folder-tag-label">
                      {folder.name}
                    </span>
                  </span>
                </Tooltip>
              ))}
              {overflowFolders.length > 0 && (
                <Tooltip
                  label={overflowFolders.map((f) => f.name).join(", ")}
                  withArrow
                  position="top"
                  withinPortal
                >
                  <span className="file-sidebar-folder-tag-more">
                    +{overflowFolders.length}
                  </span>
                </Tooltip>
              )}
            </span>
          )}
        </div>
        <div className="file-sidebar-file-actions">
          <ActionIcon
            variant="tertiary"
            size="sm"
            className="file-sidebar-eye-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEyeClick(fileId, e);
            }}
            tabIndex={-1}
            aria-label={viewerLabel}
          >
            <VisibilityOutlinedIcon
              className="file-sidebar-eye-open"
              sx={{ fontSize: "1.1rem" }}
            />
            <VisibilityOffOutlinedIcon
              className="file-sidebar-eye-closed"
              sx={{ fontSize: "1.1rem" }}
            />
          </ActionIcon>
          <Menu
            position="bottom-end"
            withinPortal
            shadow="md"
            width={220}
            onChange={setMenuOpened}
          >
            <Menu.Target>
              <ActionIcon
                variant="tertiary"
                size="sm"
                className="file-sidebar-kebab-btn"
                onClick={(e) => e.stopPropagation()}
                tabIndex={-1}
                aria-label={t(
                  "fileSidebar.fileItem.moreActions",
                  "More actions",
                )}
              >
                <MoreVertIcon sx={{ fontSize: "1.1rem" }} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
              {/* Rows truncate long names; the menu header is where the whole
                  name (and the size the row has no space for) is readable. */}
              <Menu.Label className="file-sidebar-kebab-header">
                <span className="file-sidebar-kebab-header-name">{name}</span>
                <span className="file-sidebar-kebab-header-meta">
                  {metaLine}
                </span>
              </Menu.Label>

              <FileMenuItem
                disabledReason={blockedReason(viewerLabel)}
                icon={
                  isViewedInViewer ? (
                    <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                  )
                }
                onClick={(e) => onEyeClick(fileId, e)}
              >
                {viewerLabel}
              </FileMenuItem>

              {onOpenInNewWindow && (
                <FileMenuItem
                  disabledReason={blockedReason(
                    t("openInNewWindow", "Open in new window"),
                  )}
                  icon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                  onClick={() => onOpenInNewWindow(fileId)}
                >
                  {t("openInNewWindow", "Open in new window")}
                </FileMenuItem>
              )}

              {(onDownload || onRename || onDuplicate) && <Menu.Divider />}

              {onDownload && (
                <FileMenuItem
                  disabledReason={blockedReason(terminology.download)}
                  icon={<DownloadIcon sx={{ fontSize: 16 }} />}
                  onClick={() => onDownload(fileId)}
                >
                  {terminology.download}
                </FileMenuItem>
              )}

              {onRename && (
                <FileMenuItem
                  disabledReason={blockedReason(
                    t("fileSidebar.fileItem.rename", "Rename"),
                    false,
                  )}
                  icon={<DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />}
                  onClick={() => onRename(fileId)}
                >
                  {t("fileSidebar.fileItem.rename", "Rename")}
                </FileMenuItem>
              )}

              {onDuplicate && (
                <FileMenuItem
                  disabledReason={blockedReason(
                    t("fileSidebar.fileItem.duplicate", "Duplicate"),
                  )}
                  icon={<ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />}
                  onClick={() => onDuplicate(fileId)}
                >
                  {t("fileSidebar.fileItem.duplicate", "Duplicate")}
                </FileMenuItem>
              )}

              {((canSaveToCloud && onSaveToCloud) ||
                (hasVersionHistory && onVersionHistory)) && <Menu.Divider />}

              {canSaveToCloud &&
                onSaveToCloud &&
                (() => {
                  const uploadLabel = isUploadedToCloud
                    ? t(
                        "fileSidebar.fileItem.updateOnServer",
                        "Update on server",
                      )
                    : t(
                        "fileSidebar.fileItem.uploadToServer",
                        "Upload to server",
                      );
                  return (
                    <FileMenuItem
                      disabledReason={blockedReason(uploadLabel)}
                      icon={<CloudUploadOutlinedIcon sx={{ fontSize: 16 }} />}
                      onClick={() => onSaveToCloud(fileId)}
                    >
                      {uploadLabel}
                    </FileMenuItem>
                  );
                })()}

              {hasVersionHistory && onVersionHistory && (
                <FileMenuItem
                  disabledReason={blockedReason(
                    t("fileSidebar.fileItem.versionHistory", "Version history"),
                    false,
                  )}
                  icon={<HistoryIcon sx={{ fontSize: 16 }} />}
                  onClick={() => onVersionHistory(fileId)}
                >
                  {t("fileSidebar.fileItem.versionHistory", "Version history")}
                </FileMenuItem>
              )}

              {onDelete && (
                <>
                  <Menu.Divider />
                  <FileMenuItem
                    disabledReason={blockedReason(
                      t("fileSidebar.fileItem.delete", "Delete"),
                      false,
                    )}
                    color="red"
                    icon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
                    onClick={() => onDelete(fileId)}
                  >
                    {t("fileSidebar.fileItem.delete", "Delete")}
                  </FileMenuItem>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>

      {useRasterThumb &&
        thumbPos &&
        resolvedThumbnail &&
        createPortal(
          <div
            className="file-sidebar-thumb-tooltip"
            style={{ top: thumbPos.top, left: thumbPos.left }}
          >
            <img
              src={resolvedThumbnail}
              alt=""
              className="file-sidebar-thumb-img"
            />
          </div>,
          document.body,
        )}
    </>
  );
});
