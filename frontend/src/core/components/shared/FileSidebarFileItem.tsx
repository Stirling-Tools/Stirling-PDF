import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import type { FileId } from "@app/types/file";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";
import "@app/components/shared/FileSidebarFileItem.css";

const THUMBNAIL_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB

/** Generate + persist a thumbnail for a sidebar file that doesn't have one yet. */
function useLazyThumbnail(fileId: FileId, size: number, thumbnailUrl?: string): string | undefined {
  const [thumb, setThumb] = useState<string | undefined>(thumbnailUrl);
  const attempted = useRef(false);
  const indexedDB = useIndexedDB();

  // Sync prop changes (e.g. thumbnail arrives after TTL bump)
  useEffect(() => {
    if (thumbnailUrl) setThumb(thumbnailUrl);
  }, [thumbnailUrl]);

  useEffect(() => {
    if (thumbnailUrl || attempted.current || size >= THUMBNAIL_SIZE_LIMIT) return;
    attempted.current = true;
    let cancelled = false;

    (async () => {
      try {
        const file = await indexedDB.loadFile(fileId);
        if (!file || cancelled) return;
        const thumbnail = await generateThumbnailForFile(file);
        if (cancelled || !thumbnail) return;
        setThumb(thumbnail);
        void indexedDB.updateThumbnail(fileId, thumbnail);
      } catch {
        // non-critical
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, size, thumbnailUrl, indexedDB]);

  return thumb;
}

export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function formatFileDate(lastModifiedTs: number): string {
  const lastModified = lastModifiedTs ? new Date(lastModifiedTs) : new Date();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fileDay = new Date(lastModified.getFullYear(), lastModified.getMonth(), lastModified.getDate());

  if (fileDay.getTime() === today.getTime()) {
    return lastModified.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  }
  if (fileDay.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (fileDay >= weekAgo) {
    return lastModified.toLocaleDateString("en-US", { weekday: "long" });
  }
  return lastModified.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FilePdfIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <path d="M9 13h.01" />
      <path d="M9 17h.01" />
      <path d="M13 13h2" />
      <path d="M13 17h2" />
    </svg>
  );
}

function FileGenericIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
    </svg>
  );
}

function CheckIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
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
}

export function FileItem({
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
}: FileItemProps) {
  const ext = getFileExtension(name);
  const isPdf = ext === "pdf";
  const dateLabel = lastModified ? formatFileDate(lastModified) : "";
  const typeLabel = ext ? ext.toUpperCase() : "File";

  const resolvedThumbnail = useLazyThumbnail(fileId, size ?? 0, thumbnailUrl);

  const itemRef = useRef<HTMLDivElement>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);

  const handleMouseEnter = useCallback(() => {
    setHoverRect(itemRef.current?.getBoundingClientRect() ?? null);
  }, []);

  const handleMouseLeave = useCallback(() => setHoverRect(null), []);

  // Reactive: tooltip appears as soon as both hover rect and thumbnail are ready
  const thumbPos =
    hoverRect && resolvedThumbnail ? { top: hoverRect.top + hoverRect.height / 2, left: hoverRect.right + 10 } : null;

  return (
    <>
      <div
        ref={itemRef}
        className={`file-sidebar-file-item${isSelected ? " selected" : ""}${isActive ? " active" : ""}${isViewedInViewer ? " viewed" : ""}`}
        onClick={() => onClick(fileId)}
        role="button"
        tabIndex={0}
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
              {isPdf ? (
                <FilePdfIcon
                  className="file-sidebar-file-icon file-sidebar-file-icon-hover-hide"
                  style={{ color: "#3B82F6" }}
                />
              ) : (
                <FileGenericIcon
                  className="file-sidebar-file-icon file-sidebar-file-icon-hover-hide"
                  style={{ color: "#71717A" }}
                />
              )}
            </>
          )}
        </div>
        <div className="file-sidebar-file-info">
          <span className={`file-sidebar-file-name${isSelected ? " selected" : ""}`}>{name}</span>
          <span className="file-sidebar-file-meta">
            {dateLabel}
            {dateLabel && typeLabel ? " · " : ""}
            {typeLabel}
          </span>
        </div>
        <button
          className="file-sidebar-eye-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEyeClick(fileId, e);
          }}
          tabIndex={-1}
          type="button"
          aria-label={isViewedInViewer ? "Close viewer" : "Open in viewer"}
        >
          <VisibilityOutlinedIcon className="file-sidebar-eye-open" sx={{ fontSize: "1.1rem" }} />
          <VisibilityOffOutlinedIcon className="file-sidebar-eye-closed" sx={{ fontSize: "1.1rem" }} />
        </button>
      </div>

      {thumbPos &&
        resolvedThumbnail &&
        createPortal(
          <div className="file-sidebar-thumb-tooltip" style={{ top: thumbPos.top, left: thumbPos.left }}>
            <img src={resolvedThumbnail} alt="" className="file-sidebar-thumb-img" />
          </div>,
          document.body,
        )}
    </>
  );
}
