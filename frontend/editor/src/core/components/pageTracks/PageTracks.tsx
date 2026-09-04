import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Center, Loader, LoadingOverlay, Stack, Text } from "@mantine/core";
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useFileActions, useFileState } from "@app/contexts/FileContext";
import {
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useWheelZoom } from "@app/hooks/useWheelZoom";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { truncateCenter } from "@app/utils/textUtils";
import { FileId } from "@app/types/file";
import { useTrackWorkspace } from "@app/components/pageTracks/hooks/useTrackWorkspace";
import { useTrackSelection } from "@app/components/pageTracks/hooks/useTrackSelection";
import { useTrackThumbnails } from "@app/components/pageTracks/hooks/useTrackThumbnails";
import { useTrackSave } from "@app/components/pageTracks/hooks/useTrackSave";
import { usePageTracksWorkbenchBarButtons } from "@app/components/pageTracks/hooks/usePageTracksWorkbenchBarButtons";
import { totalPageCount } from "@app/components/pageTracks/types";
import TrackRow, { DropHint } from "@app/components/pageTracks/TrackRow";
import styles from "@app/components/pageTracks/PageTracks.module.css";

const PAGE_PREFIX = "page:";
const TRACK_PREFIX = "track:";
const ZONE_PREFIX = "zone:";
const HANDLE_PREFIX = "trackhandle:";

const isPdfName = (name: string | undefined): boolean =>
  name?.toLowerCase().endsWith(".pdf") ?? false;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;
// Rounded each step so repeated +/- 0.1 doesn't drift off the bounds.
const clampZoom = (value: number): number =>
  Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 10) / 10;

/**
 * Droppables nest (zone > lane > page), so the hit has to be picked by what is
 * being dragged: a track header only ever lands on a whole track, while a page
 * prefers the tile under the pointer and falls back to the track around it.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const first = (prefix: string) =>
    within.find((c) => String(c.id).startsWith(prefix));

  if (args.active.data.current?.type === "trackHandle") {
    const zone = first(ZONE_PREFIX);
    return zone ? [zone] : [];
  }

  const page = first(PAGE_PREFIX);
  if (page) return [page];
  const lane = first(TRACK_PREFIX);
  if (lane) return [lane];
  const zone = first(ZONE_PREFIX);
  if (zone) return [zone];
  return rectIntersection(args);
};

const sameHint = (a: DropHint | null, b: DropHint | null): boolean =>
  a === b ||
  (a != null &&
    b != null &&
    a.fileId === b.fileId &&
    a.beforePageId === b.beforePageId);

/**
 * The pointer x dnd-kit is itself working from: the activator's position plus
 * the drag delta. Using this rather than a live pointermove listener keeps the
 * side-of-tile decision consistent with the reported collision.
 */
function pointerYOf(event: DragMoveEvent | DragEndEvent): number {
  const activator = event.activatorEvent;
  const originY =
    activator instanceof MouseEvent
      ? activator.clientY
      : activator instanceof TouchEvent && activator.touches.length > 0
        ? activator.touches[0].clientY
        : 0;
  return originY + event.delta.y;
}

function pointerXOf(event: DragMoveEvent | DragEndEvent): number {
  const activator = event.activatorEvent;
  const originX =
    activator instanceof MouseEvent
      ? activator.clientX
      : activator instanceof TouchEvent && activator.touches.length > 0
        ? activator.touches[0].clientX
        : 0;
  return originX + event.delta.x;
}

export default function PageTracks() {
  const { t } = useTranslation();
  const { state: fileState } = useFileState();
  const {
    state,
    dispatch,
    pendingFileIds,
    hasPdfFiles,
    changedFileIds,
    isDirty,
    canUndo,
    canRedo,
  } = useTrackWorkspace();
  const workspace = state.present;

  const selection = useTrackSelection(workspace);
  const thumbnails = useTrackThumbnails();
  const { actions: navActions } = useNavigationActions();
  const { setActiveFileId } = useViewer();

  // The file the user asked to view, held across a save: committing gives it a
  // new id, and the viewer drops an active file that has left the workbench.
  const viewTargetRef = useRef<FileId | null>(null);
  const handleVersioned = useCallback(
    (previousId: FileId, nextId: FileId) => {
      if (viewTargetRef.current !== previousId) return;
      viewTargetRef.current = nextId;
      setActiveFileId(nextId as string);
    },
    [setActiveFileId],
  );

  const { saving, progress, save } = useTrackSave(workspace, changedFileIds, {
    onVersioned: handleVersioned,
  });

  /**
   * Opens one track's file in the Viewer. Routed through setWorkbench so the
   * unsaved-changes prompt still fires: viewing a file whose pending edits
   * haven't been written would show stale pages.
   */
  const openInViewer = useCallback(
    (fileId: FileId) => {
      viewTargetRef.current = fileId;
      setActiveFileId(fileId as string);
      navActions.setWorkbench("viewer");
    },
    [navActions, setActiveFileId],
  );

  const [draggingIds, setDraggingIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [draggingTrack, setDraggingTrack] = useState<FileId | null>(null);
  // undefined = no target, null = append to the end.
  const [trackDropTarget, setTrackDropTarget] = useState<
    FileId | null | undefined
  >(undefined);

  // Off = one horizontally scrolling row per track (virtualised along its
  // lane). On = pages wrap onto as many rows as fit and each track grows as
  // tall as it needs, with the rows virtualised against the outer scroller.
  const [wrap, setWrap] = useState<boolean>(
    () =>
      fileState.files.ids.filter((id) =>
        isPdfName(fileState.files.byId[id]?.name),
      ).length === 1,
  );
  const toggleWrap = useCallback(() => setWrap((prev) => !prev), []);

  // Scales the page tiles only: the tracks, headers and bar keep their size.
  const [zoom, setZoom] = useState(1);
  const zoomIn = useCallback(
    () => setZoom((z) => clampZoom(z + ZOOM_STEP)),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((z) => clampZoom(z - ZOOM_STEP)),
    [],
  );

  // The scrolling container each wrap-mode lane virtualises its rows against.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Bumped whenever the stacked height of the tracks changes, so every lane
  // re-measures its offset within the scroller: one track growing shifts the
  // ones below it, and their row positions depend on that offset.
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setLayoutVersion((version) => version + 1);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Ctrl/Cmd + wheel zooms, matching the Multi-Tool page editor.
  useWheelZoom({ ref: scrollerRef, onZoomIn: zoomIn, onZoomOut: zoomOut });

  // Ctrl/Cmd + '+' / '-' zoom, '0' resets. Matches the Multi-Tool shortcuts.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        setZoom(1);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut]);

  const totalPages = useMemo(() => totalPageCount(workspace), [workspace]);
  const changedSet = useMemo(() => new Set(changedFileIds), [changedFileIds]);

  // ── Operations ───────────────────────────────────────────────────────────

  const rotatePages = useCallback(
    (pageIds: string[], delta: number) =>
      dispatch({ type: "rotate", pageIds, delta }),
    [dispatch],
  );

  const deletePages = useCallback(
    (pageIds: string[]) => dispatch({ type: "delete", pageIds }),
    [dispatch],
  );

  const rotateSelection = useCallback(
    (delta: number) => rotatePages(Array.from(selection.selectedIds), delta),
    [rotatePages, selection.selectedIds],
  );

  const deleteSelection = useCallback(
    () => deletePages(Array.from(selection.selectedIds)),
    [deletePages, selection.selectedIds],
  );

  const clearSelection = selection.clear;

  const { actions: fileActions } = useFileActions();

  /**
   * Moves one track before `beforeFileId` (or to the end when null). Track
   * order IS the workbench file order, and REORDER_FILES replaces the whole id
   * list, so non-PDFs (which have no track) must be written back in place or
   * they would drop out of the workbench entirely.
   */
  const reorderTracks = useCallback(
    (sourceFileId: FileId, beforeFileId: FileId | null) => {
      if (sourceFileId === beforeFileId) return;
      const trackOrder = workspace.order.filter((id) => id !== sourceFileId);
      const at =
        beforeFileId == null
          ? trackOrder.length
          : trackOrder.indexOf(beforeFileId);
      const insertAt = at === -1 ? trackOrder.length : at;
      const nextTrackOrder = [
        ...trackOrder.slice(0, insertAt),
        sourceFileId,
        ...trackOrder.slice(insertAt),
      ];
      if (nextTrackOrder.every((id, i) => workspace.order[i] === id)) return;

      const isTrack = new Set(workspace.order);
      let next = 0;
      const merged = fileState.files.ids.map((id) =>
        isTrack.has(id) ? nextTrackOrder[next++] : id,
      );
      fileActions.reorderFiles(merged);
    },
    [fileActions, fileState.files.ids, workspace.order],
  );

  // ── Drag and drop ────────────────────────────────────────────────────────

  const sensors = useSensors(
    // A short distance threshold keeps plain clicks (select) from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Rebuilt per edit rather than scanned per drag-over event: resolving the
  // hovered page by walking every track is O(pages) on every pointer move.
  const trackByPageId = useMemo(() => {
    const map = new Map<string, FileId>();
    workspace.order.forEach((fileId) => {
      workspace.tracks[fileId]?.pages.forEach((page) =>
        map.set(page.id, fileId),
      );
    });
    return map;
  }, [workspace]);

  /**
   * Resolves the pointer position to "insert before this page". An anchor that
   * is itself being dragged is fine: the reducer skips past the moved pages.
   */
  const resolveHint = useCallback(
    (overId: string | null, pointerX: number): DropHint | null => {
      if (!overId) return null;

      // The lane, or anywhere else on the track: append to it.
      for (const prefix of [TRACK_PREFIX, ZONE_PREFIX]) {
        if (!overId.startsWith(prefix)) continue;
        const fileId = overId.slice(prefix.length) as FileId;
        if (!workspace.tracks[fileId]) return null;
        return { fileId, beforePageId: null };
      }

      if (!overId.startsWith(PAGE_PREFIX)) return null;
      const overPageId = overId.slice(PAGE_PREFIX.length);
      const fileId = trackByPageId.get(overPageId);
      if (!fileId) return null;

      const pages = workspace.tracks[fileId]?.pages ?? [];
      const overIndex = pages.findIndex((page) => page.id === overPageId);
      if (overIndex === -1) return null;

      const element = document.querySelector<HTMLElement>(
        `[data-page-id="${overPageId}"]`,
      );
      const rect = element?.getBoundingClientRect();
      const dropAfter = rect ? pointerX > rect.left + rect.width / 2 : false;

      const anchor = pages[dropAfter ? overIndex + 1 : overIndex];
      return { fileId, beforePageId: anchor?.id ?? null };
    },
    [trackByPageId, workspace],
  );

  /**
   * Track reorder target: insert before this file, or append when null.
   */
  const resolveTrackHint = useCallback(
    (overId: string | null, pointerY: number): FileId | null | undefined => {
      if (!overId || !overId.startsWith(ZONE_PREFIX)) return undefined;
      const overFileId = overId.slice(ZONE_PREFIX.length) as FileId;
      const index = workspace.order.indexOf(overFileId);
      if (index === -1) return undefined;

      const element = document.querySelector<HTMLElement>(
        `[data-track-file-id="${overFileId}"]`,
      );
      const rect = element?.getBoundingClientRect();
      const dropAfter = rect ? pointerY > rect.top + rect.height / 2 : false;
      return workspace.order[dropAfter ? index + 1 : index] ?? null;
    },
    [workspace.order],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = String(event.active.id);
      if (activeId.startsWith(HANDLE_PREFIX)) {
        setDraggingTrack(activeId.slice(HANDLE_PREFIX.length) as FileId);
        return;
      }
      const pageId = activeId.slice(PAGE_PREFIX.length);
      // Dragging a page that is part of the selection moves the whole
      // selection; dragging an unselected page moves only that page.
      const ids = selection.selectedIds.has(pageId)
        ? Array.from(selection.selectedIds)
        : [pageId];
      setDraggingIds(new Set(ids));
    },
    [selection.selectedIds],
  );

  // onDragMove, not onDragOver: which side of a tile the pointer is on changes
  // WITHOUT the hovered droppable changing, and onDragOver only fires on the
  // latter. Recomputing per move is what keeps the marker and the drop in sync.
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (draggingTrack) {
        const target = resolveTrackHint(
          event.over ? String(event.over.id) : null,
          pointerYOf(event),
        );
        setTrackDropTarget(target === undefined ? undefined : target);
        return;
      }
      const next = resolveHint(
        event.over ? String(event.over.id) : null,
        pointerXOf(event),
      );
      // Most moves land on the same side of the same tile. Keeping the previous
      // object bails the re-render out, so only a real change costs anything.
      setDropHint((prev) => (sameHint(prev, next) ? prev : next));
    },
    [draggingTrack, resolveHint, resolveTrackHint],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (draggingTrack) {
        const target = resolveTrackHint(
          event.over ? String(event.over.id) : null,
          pointerYOf(event),
        );
        const source = draggingTrack;
        setDraggingTrack(null);
        setTrackDropTarget(undefined);
        if (target !== undefined) reorderTracks(source, target);
        return;
      }

      const hint = resolveHint(
        event.over ? String(event.over.id) : null,
        pointerXOf(event),
      );
      setDraggingIds(new Set());
      setDropHint(null);
      if (!hint || draggingIds.size === 0) return;
      dispatch({
        type: "move",
        pageIds: Array.from(draggingIds),
        targetFileId: hint.fileId,
        beforePageId: hint.beforePageId,
      });
    },
    [
      dispatch,
      draggingIds,
      draggingTrack,
      reorderTracks,
      resolveHint,
      resolveTrackHint,
    ],
  );

  const handleDragCancel = useCallback(() => {
    setDraggingIds(new Set());
    setDropHint(null);
    setDraggingTrack(null);
    setTrackDropTarget(undefined);
  }, []);

  // ── Save + navigation guard ──────────────────────────────────────────────

  const {
    setHasUnsavedChanges,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  } = useNavigationGuard();

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
  }, [isDirty, setHasUnsavedChanges]);

  useEffect(() => {
    // Only the save route is offered: edits live in memory, so "discard" needs
    // no handler, and there is no separate export step to leave via.
    registerNavigationWarningHandlers({
      onApplyAndContinue: async () => {
        await save();
      },
    });
    return () => unregisterNavigationWarningHandlers();
  }, [
    save,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  ]);

  useEffect(
    () => () => {
      setHasUnsavedChanges(false);
    },
    [setHasUnsavedChanges],
  );

  const undo = useCallback(() => dispatch({ type: "undo" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "redo" }), [dispatch]);
  const saveNow = useCallback(() => {
    void save();
  }, [save]);

  usePageTracksWorkbenchBarButtons({
    totalPages,
    selectedCount: selection.selectedCount,
    canUndo,
    canRedo,
    isDirty,
    saving,
    wrap,
    onToggleWrap: toggleWrap,
    canZoomIn: zoom < ZOOM_MAX,
    canZoomOut: zoom > ZOOM_MIN,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onSelectAll: selection.selectAll,
    onDeselectAll: selection.clear,
    onRotate: rotateSelection,
    onDelete: deleteSelection,
    onUndo: undo,
    onRedo: redo,
    onSave: saveNow,
  });

  // ── Render ───────────────────────────────────────────────────────────────

  if (!hasPdfFiles) {
    return (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <Text c="dimmed">
            {t("pageTracks.empty.title", "No PDF files loaded")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "pageTracks.empty.body",
              "Add PDFs to expand them into editable page tracks",
            )}
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <div className={styles.root} data-testid="page-tracks">
      <LoadingOverlay
        visible={saving}
        loaderProps={{
          children: (
            <Stack align="center" gap="xs">
              <Loader />
              <Text size="sm">
                {progress
                  ? t(
                      "pageTracks.savingProgress",
                      "Saving {{done}} of {{total}}",
                      {
                        done: progress.done,
                        total: progress.total,
                      },
                    )
                  : t("pageTracks.saving", "Saving...")}
              </Text>
            </Stack>
          ),
        }}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={scrollerRef}
          className={styles.scroller}
          data-scrolling-container="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) clearSelection();
          }}
        >
          <div
            ref={contentRef}
            className={styles.scrollerContent}
            onClick={(event) => {
              if (event.target === event.currentTarget) clearSelection();
            }}
          >
            {workspace.order.map((fileId) => {
              const track = workspace.tracks[fileId];
              if (!track) return null;
              const stub = fileState.files.byId[fileId];
              return (
                <TrackRow
                  key={fileId}
                  track={track}
                  name={stub?.name ?? fileId}
                  versionNumber={stub?.versionNumber}
                  selectedIds={selection.selectedIds}
                  draggingIds={draggingIds}
                  dropHint={dropHint}
                  wrap={wrap}
                  zoom={zoom}
                  scrollerRef={scrollerRef}
                  layoutVersion={layoutVersion}
                  trackDropBefore={
                    draggingTrack != null && trackDropTarget === fileId
                  }
                  trackDropAfterLast={
                    draggingTrack != null &&
                    trackDropTarget === null &&
                    fileId === workspace.order[workspace.order.length - 1]
                  }
                  trackDragging={draggingTrack === fileId}
                  changed={changedSet.has(fileId)}
                  thumbnails={thumbnails}
                  onSelectPage={selection.selectPage}
                  onSelectTrack={selection.selectTrack}
                  onOpenInViewer={openInViewer}
                  onClearSelection={clearSelection}
                  onRotate={rotatePages}
                  onDelete={deletePages}
                />
              );
            })}

            {pendingFileIds.map((fileId) => (
              <div key={fileId} className={styles.track}>
                <header className={styles.trackHeader}>
                  <span className={styles.trackName}>
                    <PrivateContent>
                      {truncateCenter(
                        fileState.files.byId[fileId]?.name ?? fileId,
                        40,
                      )}
                    </PrivateContent>
                  </span>
                  <span className={styles.trackMeta}>
                    {t("pageTracks.readingPages", "Reading pages...")}
                  </span>
                </header>
                <div className={`${styles.lane} ${styles.laneEmpty}`}>
                  <Loader size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingIds.size > 0 && (
            <div className={styles.dragBadge}>
              {t("pageTracks.dragging", "{{count}} pages", {
                count: draggingIds.size,
              })}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
