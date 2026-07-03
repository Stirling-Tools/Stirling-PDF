import { memo, useState, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Menu, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import HistoryIcon from "@mui/icons-material/History";
import type { FileId } from "@app/types/file";
import { FileDocIcon } from "@app/components/shared/FileDocIcon";
import { getFileDocVariant } from "@app/components/shared/filePreview/getFileTypeIcon";
import { useLazyThumbnail } from "@app/hooks/useLazyThumbnail";
import { IMAGE_EXTENSIONS } from "@app/utils/fileUtils";
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

export const DATE_GROUP_ORDER: DateGroup[] = [
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "older",
];

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

/** A policy that has run on (or is running on) this file — drives the activity
 *  badges and the in-progress spinner. */
export interface FileItemPolicyRef {
  id: string;
  name: string;
  /** Badge glyph — the policy's own icon; falls back to a shield. */
  icon?: ReactNode;
  /** CSS colour for the badge (matches the policy's accent). */
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
  /** Policy currently working on this file — swaps the file icon for a spinner
   *  in the policy's colour with its badge inside. Omit when nothing is running. */
  processingPolicy?: FileItemPolicyRef;
  /** Delete (local only) from the kebab menu. Omit to hide the menu's delete. */
  onDelete?: (fileId: FileId) => void;
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
  /** When set (SaaS grouped sidebar), the meta line shows "{category} • {date}"
   *  instead of "{date} · {type}". */
  categoryLabel?: string;
}

const MAX_VISIBLE_FOLDER_TAGS = 2;

// Memoized: the sidebar re-renders constantly during a policy wave / bulk add
// (store emits, poll ticks, thumbnail hydrations), but most rows' props are
// unchanged — memo keeps a 300-file list from re-rendering wholesale each time.
// Parent must pass stable identities for arrays/callbacks (see FileSidebar's
// NO_POLICIES/NO_FOLDERS + useCallback'd handlers).
export const FileItem = memo(function FileItem({
  fileId,
  name,
  size,
  lastModified,
  isSelected,
  isActive,
  isViewedInViewer,
  thumbnailUrl,
  onClick,
  onEyeClick,
  draggable,
  onDragStart,
  folders = [],
  onFolderClick,
  processingPolicy,
  onDelete,
  onSaveToCloud,
  canSaveToCloud = false,
  isUploadedToCloud = false,
  onVersionHistory,
  hasVersionHistory = false,
  categoryLabel,
}: FileItemProps) {
  const { t } = useTranslation();
  const ext = getFileExtension(name);
  const dateLabel = lastModified ? formatFileDate(lastModified) : "";
  const typeLabel = ext ? ext.toUpperCase() : "File";

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

  const handleMouseEnter = useCallback(() => {
    setHoverRect(itemRef.current?.getBoundingClientRect() ?? null);
  }, []);

  const handleMouseLeave = useCallback(() => setHoverRect(null), []);

  // Reactive: tooltip appears as soon as both hover rect and thumbnail are ready
  const thumbPos =
    hoverRect && resolvedThumbnail
      ? {
          top: hoverRect.top + hoverRect.height / 2,
          left: hoverRect.right + 10,
        }
      : null;

  return (
    <>
      <div
        ref={itemRef}
        className={`file-sidebar-file-item${isSelected ? " selected" : ""}${isActive ? " active" : ""}${isViewedInViewer ? " viewed" : ""}`}
        onClick={() => onClick(fileId)}
        draggable={draggable}
        onDragStart={
          draggable && onDragStart ? (e) => onDragStart(e, fileId) : undefined
        }
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onClick(fileId)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="file-sidebar-file-icon-wrapper">
          {processingPolicy ? (
            <Tooltip
              label={t(
                "fileSidebar.fileItem.policyRunning",
                "{{name}} policy is running…",
                { name: processingPolicy.name },
              )}
              withArrow
              position="top"
            >
              <span
                className="file-sidebar-file-spinner"
                style={{ color: processingPolicy.accentColor }}
                aria-label={t(
                  "fileSidebar.fileItem.policyRunning",
                  "{{name}} policy is running…",
                  { name: processingPolicy.name },
                )}
              >
                <span className="file-sidebar-file-spinner-ring" />
                <span className="file-sidebar-file-spinner-badge">
                  {processingPolicy.icon ?? (
                    <ShieldOutlinedIcon sx={{ fontSize: "0.7rem" }} />
                  )}
                </span>
              </span>
            </Tooltip>
          ) : isSelected ? (
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
              {categoryLabel ? (
                <>
                  {categoryLabel}
                  {categoryLabel && dateLabel ? " • " : ""}
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
        <button
          className="file-sidebar-eye-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEyeClick(fileId, e);
          }}
          tabIndex={-1}
          type="button"
          aria-label={
            isViewedInViewer
              ? t("fileSidebar.fileItem.closeViewer", "Close viewer")
              : t("fileSidebar.fileItem.openInViewer", "Open in viewer")
          }
        >
          <VisibilityOutlinedIcon
            className="file-sidebar-eye-open"
            sx={{ fontSize: "1.1rem" }}
          />
          <VisibilityOffOutlinedIcon
            className="file-sidebar-eye-closed"
            sx={{ fontSize: "1.1rem" }}
          />
        </button>

        {(onDelete ||
          onSaveToCloud ||
          (hasVersionHistory && onVersionHistory)) && (
          <Menu position="bottom-end" withinPortal shadow="md" width={190}>
            <Menu.Target>
              <button
                className="file-sidebar-kebab-btn"
                onClick={(e) => e.stopPropagation()}
                tabIndex={-1}
                type="button"
                aria-label={t(
                  "fileSidebar.fileItem.moreActions",
                  "More actions",
                )}
              >
                <MoreVertIcon sx={{ fontSize: "1.1rem" }} />
              </button>
            </Menu.Target>
            <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
              {hasVersionHistory && onVersionHistory && (
                <Menu.Item
                  leftSection={<HistoryIcon sx={{ fontSize: 16 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onVersionHistory(fileId);
                  }}
                >
                  {t("fileSidebar.fileItem.versionHistory", "Version history")}
                </Menu.Item>
              )}
              {canSaveToCloud && onSaveToCloud && (
                <Menu.Item
                  leftSection={
                    <CloudUploadOutlinedIcon sx={{ fontSize: 16 }} />
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onSaveToCloud(fileId);
                  }}
                >
                  {isUploadedToCloud
                    ? t(
                        "fileSidebar.fileItem.updateOnServer",
                        "Update on server",
                      )
                    : t(
                        "fileSidebar.fileItem.uploadToServer",
                        "Upload to server",
                      )}
                </Menu.Item>
              )}
              {onDelete && (
                <Menu.Item
                  color="red"
                  leftSection={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(fileId);
                  }}
                >
                  {t("fileSidebar.fileItem.delete", "Delete")}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
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
