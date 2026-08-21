import React, { useCallback, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { FileId } from "@app/types/file";
import { Track } from "@app/components/pageTracks/types";
import { TrackThumbnailStore } from "@app/components/pageTracks/hooks/useTrackThumbnails";
import { PageClickModifiers } from "@app/components/pageTracks/hooks/useTrackSelection";
import TrackPageTile from "@app/components/pageTracks/TrackPageTile";
import styles from "@app/components/pageTracks/PageTracks.module.css";

export const trackDroppableId = (fileId: FileId) => `track:${fileId}`;

export interface DropHint {
  fileId: FileId;
  /** Insert before this page, or append to the track when null. */
  beforePageId: string | null;
}

export interface TrackRowProps {
  track: Track;
  name: string;
  versionNumber: number | undefined;
  selectedIds: Set<string>;
  draggingIds: Set<string>;
  dropHint: DropHint | null;
  changed: boolean;
  thumbnails: TrackThumbnailStore;
  onSelectPage: (
    fileId: FileId,
    pageId: string,
    modifiers: PageClickModifiers,
  ) => void;
  onSelectTrack: (fileId: FileId) => void;
  /** Called when the click landed on empty lane surface, not on a page. */
  onClearSelection: () => void;
  onRotate: (pageIds: string[], delta: number) => void;
  onDelete: (pageIds: string[]) => void;
}

function TrackRowImpl({
  track,
  name,
  versionNumber,
  selectedIds,
  draggingIds,
  dropHint,
  changed,
  thumbnails,
  onSelectPage,
  onSelectTrack,
  onClearSelection,
  onRotate,
  onDelete,
}: TrackRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: trackDroppableId(track.fileId),
    data: { type: "track", fileId: track.fileId },
  });

  // Track-level actions apply to the selection inside this track, falling back
  // to the whole track so the buttons stay useful with nothing selected.
  const targetIds = useMemo(() => {
    const selectedHere = track.pages
      .filter((page) => selectedIds.has(page.id))
      .map((page) => page.id);
    return selectedHere.length > 0
      ? selectedHere
      : track.pages.map((page) => page.id);
  }, [track.pages, selectedIds]);

  const handleSelectTrack = useCallback(
    () => onSelectTrack(track.fileId),
    [onSelectTrack, track.fileId],
  );

  const hintActive = dropHint?.fileId === track.fileId;

  return (
    <section
      className={[styles.track, isOver ? styles.trackDropActive : ""]
        .filter(Boolean)
        .join(" ")}
      data-track-file-id={track.fileId}
      data-changed={changed}
      aria-label={name}
    >
      <header className={styles.trackHeader}>
        <span className={styles.trackName} title={name}>
          {name}
        </span>
        <span className={styles.trackMeta}>
          {[
            versionNumber != null && versionNumber > 1
              ? `v${versionNumber}`
              : null,
            t("pageTracks.pageCount", "{{count}} pages", {
              count: track.pages.length,
            }),
            changed ? t("pageTracks.edited", "edited") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>

        <div className={styles.trackActions}>
          <Tooltip
            content={t("pageTracks.track.toggleSelection", "Select all pages")}
          >
            <ActionIcon
              variant="quiet"
              size="sm"
              aria-label={t(
                "pageTracks.track.toggleSelection",
                "Select all pages",
              )}
              disabled={track.pages.length === 0}
              onClick={handleSelectTrack}
            >
              <SelectAllIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>
          </Tooltip>
          <Tooltip content={t("pageTracks.rotateLeft", "Rotate left")}>
            <ActionIcon
              variant="quiet"
              size="sm"
              aria-label={t("pageTracks.rotateLeft", "Rotate left")}
              disabled={targetIds.length === 0}
              onClick={() => onRotate(targetIds, -90)}
            >
              <RotateLeftIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>
          </Tooltip>
          <Tooltip content={t("pageTracks.rotateRight", "Rotate right")}>
            <ActionIcon
              variant="quiet"
              size="sm"
              aria-label={t("pageTracks.rotateRight", "Rotate right")}
              disabled={targetIds.length === 0}
              onClick={() => onRotate(targetIds, 90)}
            >
              <RotateRightIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>
          </Tooltip>
          <Tooltip content={t("pageTracks.delete.selected", "Delete pages")}>
            <ActionIcon
              variant="quiet"
              size="sm"
              accent="danger"
              aria-label={t("pageTracks.delete.selected", "Delete pages")}
              disabled={targetIds.length === 0}
              onClick={() => onDelete(targetIds)}
            >
              <DeleteOutlineIcon sx={{ fontSize: "1rem" }} />
            </ActionIcon>
          </Tooltip>
        </div>
      </header>

      <div
        ref={setNodeRef}
        data-track-lane={track.fileId}
        className={[
          styles.lane,
          track.pages.length === 0 ? styles.laneEmpty : "",
        ]
          .filter(Boolean)
          .join(" ")}
        // Only a click on the lane itself, never one that bubbled up from a
        // page: clicking a tile would otherwise select it and immediately
        // clear it again.
        onClick={(event) => {
          if (event.target === event.currentTarget) onClearSelection();
        }}
      >
        {track.pages.length === 0 && (
          <span className={styles.laneHint}>
            {t(
              "pageTracks.emptyTrack",
              "No pages left. Drag pages here, or save to close this file.",
            )}
          </span>
        )}
        {track.pages.map((page, index) => (
          <TrackPageTile
            key={page.id}
            page={page}
            trackFileId={track.fileId}
            position={index + 1}
            selected={selectedIds.has(page.id)}
            dragging={draggingIds.has(page.id)}
            dropBefore={hintActive && dropHint?.beforePageId === page.id}
            dropAfterLast={
              hintActive &&
              dropHint?.beforePageId == null &&
              index === track.pages.length - 1
            }
            thumbnails={thumbnails}
            onSelect={onSelectPage}
            onRotate={onRotate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

export const TrackRow = React.memo(TrackRowImpl);
export default TrackRow;
