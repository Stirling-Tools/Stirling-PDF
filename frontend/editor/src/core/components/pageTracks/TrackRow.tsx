import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { FileId } from "@app/types/file";
import { Track } from "@app/components/pageTracks/types";
import { TrackThumbnailStore } from "@app/components/pageTracks/hooks/useTrackThumbnails";
import { PageClickModifiers } from "@app/components/pageTracks/hooks/useTrackSelection";
import TrackPageTile from "@app/components/pageTracks/TrackPageTile";
import {
  TRACK_GEOMETRY,
  rootFontSizePx,
} from "@app/components/pageTracks/constants";
import styles from "@app/components/pageTracks/PageTracks.module.css";

export const trackDroppableId = (fileId: FileId) => `track:${fileId}`;
/** Whole-track drop zone, used when a track header is being dragged. */
export const trackZoneId = (fileId: FileId) => `zone:${fileId}`;
export const trackHandleId = (fileId: FileId) => `trackhandle:${fileId}`;

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
  /** Pages wrap onto multiple rows instead of one horizontally scrolling row. */
  wrap: boolean;
  /** Scales the page tiles (and their gaps) without resizing the rest of the UI. */
  zoom: number;
  /** The scrolling container wrap-mode rows are virtualised against. */
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  /** Bumped by the parent when the stacked track heights change, forcing this
   *  lane to re-measure its offset within the scroller. */
  layoutVersion: number;
  /** Draw the track-reorder line above this track. */
  trackDropBefore: boolean;
  /** Draw it below (last track, moving to the end). */
  trackDropAfterLast: boolean;
  /** This track's header is the one being dragged. */
  trackDragging: boolean;
  changed: boolean;
  thumbnails: TrackThumbnailStore;
  onSelectPage: (
    fileId: FileId,
    pageId: string,
    modifiers: PageClickModifiers,
  ) => void;
  onSelectTrack: (fileId: FileId) => void;
  onOpenInViewer: (fileId: FileId) => void;
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
  wrap,
  zoom,
  scrollerRef,
  layoutVersion,
  trackDropBefore,
  trackDropAfterLast,
  trackDragging,
  changed,
  thumbnails,
  onSelectPage,
  onSelectTrack,
  onOpenInViewer,
  onClearSelection,
  onRotate,
  onDelete,
}: TrackRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: trackDroppableId(track.fileId),
    data: { type: "track", fileId: track.fileId },
  });

  // Reordering tracks: the header is the handle, the whole section the target.
  // Only the pointer listeners are applied, deliberately NOT dnd-kit's ARIA
  // attributes: those would make the header a role="button" whose accessible
  // name is everything inside it, with the real controls nested inside.
  const { listeners: handleListeners, setNodeRef: setHandleRef } = useDraggable(
    {
      id: trackHandleId(track.fileId),
      data: { type: "trackHandle", fileId: track.fileId },
    },
  );
  const { setNodeRef: setZoneRef } = useDroppable({
    id: trackZoneId(track.fileId),
    data: { type: "zone", fileId: track.fileId },
  });

  // A lane can hold hundreds of pages. Mounting them all is what made a single
  // click cost ~700ms and a drag ~300ms per pointer move: every tile is a
  // dnd-kit draggable AND droppable, so the whole set gets re-registered on
  // each render, re-measured on drag start and hit-tested on every move.
  const laneRef = useRef<HTMLDivElement | null>(null);
  const laneInnerRef = useRef<HTMLDivElement | null>(null);
  // Collapsed hides the lane, leaving just the header. Local (not lifted) so it
  // survives track reorder via the row's fileId key; a save remounts the row,
  // which reasonably reopens it.
  const [collapsed, setCollapsed] = useState(false);
  // Zoom scales the tile dimensions (and gaps) only; everything derived here,
  // and the CSS vars the tiles read, moves with it so the geometry and the
  // virtualiser stay in agreement at any zoom.
  const geometry = useMemo(() => {
    const px = rootFontSizePx();
    const tileWidthRem = TRACK_GEOMETRY.tileWidthRem * zoom;
    const tileHeightRem = TRACK_GEOMETRY.tileCanvasHeightRem * zoom;
    const tileFooterRem = TRACK_GEOMETRY.tileFooterHeightRem * zoom;
    const gapRem = TRACK_GEOMETRY.gapRem * zoom;
    return {
      gapPx: gapRem * px,
      tileWidthPx: tileWidthRem * px,
      // Distance between the left edges of adjacent tiles (tile + gap).
      colStride: (tileWidthRem + gapRem) * px,
      // Distance between the top edges of adjacent wrapped rows.
      rowStride: (tileHeightRem + tileFooterRem + gapRem) * px,
      cssVars: {
        "--pt-tile-w": `${tileWidthRem}rem`,
        "--pt-tile-h": `${tileHeightRem}rem`,
        "--pt-tile-footer-h": `${tileFooterRem}rem`,
      } as React.CSSProperties,
    };
  }, [zoom]);

  const pageCount = track.pages.length;

  // Wrap mode packs as many whole tiles as the lane's content width allows.
  const [laneWidth, setLaneWidth] = useState(0);
  // Seed the width synchronously before the first wrap paint so the column
  // count is right immediately; the observer keeps it current on resize.
  // 0.75rem matches the lane's horizontal padding in the stylesheet. Re-runs
  // when the lane remounts on expand so the width is right again straight away.
  useLayoutEffect(() => {
    const element = laneRef.current;
    if (!element) return;
    const padding = 2 * 0.75 * rootFontSizePx();
    setLaneWidth(Math.max(0, element.clientWidth - padding));
  }, [wrap, collapsed]);
  // Keyed on `collapsed` so the observer follows the lane element as it
  // unmounts (collapse) and remounts (expand).
  useEffect(() => {
    const element = laneRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setLaneWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [collapsed]);

  const columns = useMemo(() => {
    if (!wrap || laneWidth <= 0) return 1;
    return Math.max(
      1,
      Math.floor((laneWidth + geometry.gapPx) / geometry.colStride),
    );
  }, [wrap, laneWidth, geometry.gapPx, geometry.colStride]);

  const rowCount = wrap ? Math.ceil(pageCount / columns) : pageCount;

  // Spread the spare width so a wrapped row fills the lane edge to edge instead
  // of bunching left. The stride is per-column (not per-row), so a short last
  // row still lines its tiles up under the columns above it.
  const wrapColStride = useMemo(() => {
    if (!wrap || columns <= 1) return geometry.colStride;
    const gap = (laneWidth - columns * geometry.tileWidthPx) / (columns - 1);
    return geometry.tileWidthPx + Math.max(geometry.gapPx, gap);
  }, [
    wrap,
    columns,
    laneWidth,
    geometry.tileWidthPx,
    geometry.gapPx,
    geometry.colStride,
  ]);

  // Wrap-mode rows are virtualised against the shared outer scroller, so each
  // lane needs the offset of its content within that scroller's scroll height.
  // One track above growing or shrinking shifts this, which is why the parent
  // bumps layoutVersion on any height change.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (!wrap) {
      setScrollMargin((prev) => (prev === 0 ? prev : 0));
      return;
    }
    const inner = laneInnerRef.current;
    const scroller = scrollerRef.current;
    if (!inner || !scroller) return;
    const margin =
      inner.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    setScrollMargin((prev) => (Math.abs(prev - margin) > 0.5 ? margin : prev));
  }, [
    wrap,
    collapsed,
    layoutVersion,
    columns,
    rowCount,
    pageCount,
    scrollerRef,
  ]);

  const virtualizer = useVirtualizer({
    count: wrap ? rowCount : pageCount,
    horizontal: !wrap,
    getScrollElement: () => (wrap ? scrollerRef.current : laneRef.current),
    estimateSize: () => (wrap ? geometry.rowStride : geometry.colStride),
    overscan: wrap ? 3 : TRACK_GEOMETRY.overscan,
    scrollMargin: wrap ? scrollMargin : 0,
  });

  // Zoom changes every tile's size, so drop the cached measurements and
  // re-derive them from the new estimate.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, zoom, wrap]);

  const setLaneRef = useCallback(
    (element: HTMLDivElement | null) => {
      laneRef.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );

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
  const collapseLabel = collapsed
    ? t("pageTracks.track.expand", "Expand")
    : t("pageTracks.track.collapse", "Collapse");

  return (
    <section
      ref={setZoneRef}
      style={geometry.cssVars}
      className={[
        styles.track,
        isOver ? styles.trackDropActive : "",
        trackDragging ? styles.trackDragging : "",
        trackDropBefore ? styles.trackDropBefore : "",
        trackDropAfterLast ? styles.trackDropAfterLast : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-track-file-id={track.fileId}
      data-changed={changed}
      data-track-drop-before={trackDropBefore || undefined}
      aria-label={name}
    >
      <header
        ref={setHandleRef}
        className={styles.trackHeader}
        {...handleListeners}
      >
        <Tooltip content={collapseLabel}>
          <ActionIcon
            className={styles.trackCollapse}
            variant="quiet"
            size="sm"
            aria-label={collapseLabel}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <ChevronRightIcon sx={{ fontSize: "1.25rem" }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: "1.25rem" }} />
            )}
          </ActionIcon>
        </Tooltip>
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
        <Tooltip content={t("openInViewer", "Open in Viewer")}>
          <ActionIcon
            className={styles.trackLeadAction}
            variant="quiet"
            size="sm"
            aria-label={t("openInViewer", "Open in Viewer")}
            // An emptied track has nothing to show: saving closes the file.
            disabled={track.pages.length === 0}
            onClick={() => onOpenInViewer(track.fileId)}
          >
            <VisibilityOutlinedIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>

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

      {!collapsed && (
        <div
          ref={setLaneRef}
          data-track-lane={track.fileId}
          className={[
            styles.lane,
            wrap ? styles.laneWrap : "",
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
          {pageCount > 0 && (
            <div
              ref={laneInnerRef}
              className={styles.laneInner}
              style={
                wrap
                  ? { width: "100%", height: virtualizer.getTotalSize() }
                  : { width: virtualizer.getTotalSize() }
              }
            >
              {virtualizer.getVirtualItems().map((item) => {
                // Single row: each virtual item is a page, placed along the lane.
                if (!wrap) {
                  const page = track.pages[item.index];
                  if (!page) return null;
                  return (
                    <TrackPageTile
                      key={page.id}
                      page={page}
                      trackFileId={track.fileId}
                      position={item.index + 1}
                      offsetX={item.start}
                      offsetY={0}
                      selected={selectedIds.has(page.id)}
                      dragging={draggingIds.has(page.id)}
                      dropBefore={
                        hintActive && dropHint?.beforePageId === page.id
                      }
                      dropAfterLast={
                        hintActive &&
                        dropHint?.beforePageId == null &&
                        item.index === pageCount - 1
                      }
                      thumbnails={thumbnails}
                      onSelect={onSelectPage}
                      onRotate={onRotate}
                      onDelete={onDelete}
                    />
                  );
                }
                // Wrap: each virtual item is a row of up to `columns` pages.
                const rowTop = item.start - scrollMargin;
                const rowStartIndex = item.index * columns;
                return Array.from({ length: columns }, (_unused, col) => {
                  const pageIndex = rowStartIndex + col;
                  const page = track.pages[pageIndex];
                  if (!page) return null;
                  return (
                    <TrackPageTile
                      key={page.id}
                      page={page}
                      trackFileId={track.fileId}
                      position={pageIndex + 1}
                      offsetX={col * wrapColStride}
                      offsetY={rowTop}
                      selected={selectedIds.has(page.id)}
                      dragging={draggingIds.has(page.id)}
                      dropBefore={
                        hintActive && dropHint?.beforePageId === page.id
                      }
                      dropAfterLast={
                        hintActive &&
                        dropHint?.beforePageId == null &&
                        pageIndex === pageCount - 1
                      }
                      thumbnails={thumbnails}
                      onSelect={onSelectPage}
                      onRotate={onRotate}
                      onDelete={onDelete}
                    />
                  );
                });
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export const TrackRow = React.memo(TrackRowImpl);
export default TrackRow;
