import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Center, Loader, LoadingOverlay, Stack, Text } from "@mantine/core";
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useFileState } from "@app/contexts/FileContext";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { FileId } from "@app/types/file";
import { getFileColor } from "@app/components/pageEditor/fileColors";
import { useFileColorMap } from "@app/components/pageEditor/hooks/useFileColorMap";
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

/**
 * Prefer the page under the pointer over the track that contains it: the
 * lane is a droppable too, so nested hits need an explicit ordering.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const page = within.find((c) => String(c.id).startsWith(PAGE_PREFIX));
  if (page) return [page];
  const track = within.find((c) => String(c.id).startsWith(TRACK_PREFIX));
  if (track) return [track];
  return rectIntersection(args);
};

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
  const { saving, progress, save } = useTrackSave(workspace, changedFileIds);

  const [draggingIds, setDraggingIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const pointerXRef = useRef(0);

  const colorIndexes = useFileColorMap(workspace.order);
  const colorForFile = useCallback(
    (fileId: FileId) => getFileColor(colorIndexes.get(fileId) ?? 0),
    [colorIndexes],
  );

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

  // ── Drag and drop ────────────────────────────────────────────────────────

  const sensors = useSensors(
    // A short distance threshold keeps plain clicks (select) from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // dnd-kit reports which droppable is under the cursor but not where in it, so
  // the pointer's x is tracked separately to pick a side of the hovered tile.
  // Only while a drag is live: no listener on the idle view.
  const dragging = draggingIds.size > 0;
  useEffect(() => {
    if (!dragging) return;
    const trackPointer = (event: PointerEvent) => {
      pointerXRef.current = event.clientX;
    };
    window.addEventListener("pointermove", trackPointer, { passive: true });
    return () => window.removeEventListener("pointermove", trackPointer);
  }, [dragging]);

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
    (overId: string | null): DropHint | null => {
      if (!overId) return null;

      if (overId.startsWith(TRACK_PREFIX)) {
        const fileId = overId.slice(TRACK_PREFIX.length) as FileId;
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
      const dropAfter = rect
        ? pointerXRef.current > rect.left + rect.width / 2
        : false;

      const anchor = pages[dropAfter ? overIndex + 1 : overIndex];
      return { fileId, beforePageId: anchor?.id ?? null };
    },
    [trackByPageId, workspace],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      // Seed from where the drag began, so the very first drag-over already has
      // a sane x even before the listener above sees a move.
      if (event.activatorEvent instanceof PointerEvent) {
        pointerXRef.current = event.activatorEvent.clientX;
      }
      const pageId = String(event.active.id).slice(PAGE_PREFIX.length);
      // Dragging a page that is part of the selection moves the whole
      // selection; dragging an unselected page moves only that page.
      const ids = selection.selectedIds.has(pageId)
        ? Array.from(selection.selectedIds)
        : [pageId];
      setDraggingIds(new Set(ids));
    },
    [selection.selectedIds],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      setDropHint(resolveHint(event.over ? String(event.over.id) : null));
    },
    [resolveHint],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const hint = resolveHint(event.over ? String(event.over.id) : null);
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
    [dispatch, draggingIds, resolveHint],
  );

  const handleDragCancel = useCallback(() => {
    setDraggingIds(new Set());
    setDropHint(null);
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
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.scroller} data-scrolling-container="true">
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
                color={colorForFile(fileId)}
                colorForFile={colorForFile}
                selectedIds={selection.selectedIds}
                draggingIds={draggingIds}
                dropHint={dropHint}
                changed={changedSet.has(fileId)}
                thumbnails={thumbnails}
                onSelectPage={selection.selectPage}
                onSelectTrack={selection.selectTrack}
                onRotate={rotatePages}
                onDelete={deletePages}
              />
            );
          })}

          {pendingFileIds.map((fileId) => (
            <div key={fileId} className={styles.track}>
              <header className={styles.trackHeader}>
                <span className={styles.trackName}>
                  {fileState.files.byId[fileId]?.name ?? fileId}
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
