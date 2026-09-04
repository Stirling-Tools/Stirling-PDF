import React, { useCallback, useMemo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import { Checkbox } from "@app/ui/Checkbox";
import HoverActionMenu, {
  HoverAction,
} from "@app/components/shared/HoverActionMenu";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { FileId } from "@app/types/file";
import { TrackPage } from "@app/components/pageTracks/types";
import {
  TrackThumbnailStore,
  useTrackThumbnail,
} from "@app/components/pageTracks/hooks/useTrackThumbnails";
import styles from "@app/components/pageTracks/PageTracks.module.css";

export const pageDroppableId = (pageId: string) => `page:${pageId}`;

export interface TrackPageTileProps {
  page: TrackPage;
  /** The track this tile currently sits in. */
  trackFileId: FileId;
  /** 1-based position within the track. */
  position: number;
  /** Horizontal offset within the lane, from the virtualiser. */
  offsetX: number;
  /** Vertical offset within the lane (0 in single-row mode; row top in wrap). */
  offsetY: number;
  selected: boolean;
  dragging: boolean;
  /** Draw the insertion line on this tile's leading edge. */
  dropBefore: boolean;
  /** Draw it on the trailing edge (last tile, appending to the track). */
  dropAfterLast: boolean;
  thumbnails: TrackThumbnailStore;
  onSelect: (
    fileId: FileId,
    pageId: string,
    modifiers: { shift: boolean },
  ) => void;
  onRotate: (pageIds: string[], delta: number) => void;
  onDelete: (pageIds: string[]) => void;
}

function TrackPageTileImpl({
  page,
  trackFileId,
  position,
  offsetX,
  offsetY,
  selected,
  dragging,
  dropBefore,
  dropAfterLast,
  thumbnails,
  onSelect,
  onRotate,
  onDelete,
}: TrackPageTileProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const dragData = { type: "page", pageId: page.id, fileId: trackFileId };
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: pageDroppableId(page.id), data: dragData });
  const { setNodeRef: setDropRef } = useDroppable({
    id: pageDroppableId(page.id),
    data: dragData,
  });

  const setRefs = useCallback(
    (element: HTMLElement | null) => {
      setDragRef(element);
      setDropRef(element);
      thumbnails.observe(page)(element);
    },
    [setDragRef, setDropRef, thumbnails, page],
  );

  const thumbnail = useTrackThumbnail(thumbnails, page);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      onSelect(trackFileId, page.id, { shift: event.shiftKey });
    },
    [onSelect, trackFileId, page.id],
  );

  const stop = (event: React.MouseEvent) => event.stopPropagation();
  const quarterTurn = page.rotation === 90 || page.rotation === 270;

  const hoverActions = useMemo<HoverAction[]>(
    () => [
      {
        id: "rotate-left",
        icon: <RotateLeftIcon style={{ fontSize: 16 }} />,
        label: t("pageTracks.rotateLeft", "Rotate left"),
        onClick: (event) => {
          event.stopPropagation();
          onRotate([page.id], -90);
        },
      },
      {
        id: "rotate-right",
        icon: <RotateRightIcon style={{ fontSize: 16 }} />,
        label: t("pageTracks.rotateRight", "Rotate right"),
        onClick: (event) => {
          event.stopPropagation();
          onRotate([page.id], 90);
        },
      },
      {
        id: "delete",
        icon: <DeleteOutlineIcon style={{ fontSize: 16 }} />,
        label: t("pageTracks.delete.page", "Delete page"),
        color: "var(--c-danger)",
        onClick: (event) => {
          event.stopPropagation();
          onDelete([page.id]);
        },
      },
    ],
    [t, onRotate, onDelete, page.id],
  );

  return (
    <div
      ref={setRefs}
      className={[
        styles.tile,
        selected ? styles.tileSelected : "",
        dragging ? styles.tileDragging : "",
        dropBefore ? styles.dropBefore : "",
        dropAfterLast ? styles.dropAfterLast : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ left: offsetX, top: offsetY }}
      {...attributes}
      {...listeners}
      data-page-id={page.id}
      data-selected={selected}
      data-drop-before={dropBefore || undefined}
      data-drop-after-last={dropAfterLast || undefined}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={t("pageTracks.page", "Page {{number}}", {
        number: position,
      })}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(trackFileId, page.id, { shift: false });
        }
      }}
    >
      <div className={styles.thumbBox}>
        <div className={styles.tileCheckbox} onClick={stop}>
          <Checkbox
            checked={selected}
            aria-label={t("pageTracks.selectPage", "Select page {{number}}", {
              number: position,
            })}
            onChange={() => onSelect(trackFileId, page.id, { shift: false })}
          />
        </div>

        {thumbnail ? (
          <PrivateContent>
            <img
              className={[
                styles.thumb,
                quarterTurn ? styles.thumbQuarterTurn : "",
                "ph-no-capture",
              ]
                .filter(Boolean)
                .join(" ")}
              src={thumbnail}
              alt=""
              draggable={false}
              data-original-rotation={page.rotation}
              style={{ transform: `rotate(${page.rotation}deg)` }}
            />
          </PrivateContent>
        ) : (
          <div className={styles.thumbPending} />
        )}

        <HoverActionMenu
          show={isMobile}
          actions={hoverActions}
          position="inside"
          visibility="cssHover"
          className={styles.pagePill}
        />
      </div>

      <div className={styles.pageNumber} data-page-index={position}>
        {position}
      </div>
    </div>
  );
}

export const TrackPageTile = React.memo(TrackPageTileImpl);
export default TrackPageTile;
