import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileId } from "@app/types/file";
import { TrackWorkspace, allPages } from "@app/components/pageTracks/types";

export interface PageClickModifiers {
  /** Extend the selection from the last clicked page in the same track. */
  shift: boolean;
}

export interface TrackSelectionHook {
  selectedIds: Set<string>;
  selectedCount: number;
  selectPage: (
    fileId: FileId,
    pageId: string,
    modifiers: PageClickModifiers,
  ) => void;
  setSelection: (pageIds: string[]) => void;
  selectAll: () => void;
  selectTrack: (fileId: FileId) => void;
  clear: () => void;
  /** Selected pages that live in this track, in track order. */
  idsInTrack: (fileId: FileId) => string[];
}

export function useTrackSelection(
  workspace: TrackWorkspace,
): TrackSelectionHook {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const anchorRef = useRef<{ fileId: FileId; pageId: string } | null>(null);
  // Read through a ref so the click handler stays referentially stable: it is
  // passed down to every tile, and a new identity per edit would re-render the
  // whole workspace.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const livePageIds = useMemo(
    () => new Set(allPages(workspace).map((page) => page.id)),
    [workspace],
  );

  // Deleted, undone and re-synced pages must drop out of the selection or the
  // action buttons stay enabled for pages that no longer exist.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (livePageIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
    if (anchorRef.current && !livePageIds.has(anchorRef.current.pageId)) {
      anchorRef.current = null;
    }
  }, [livePageIds]);

  /**
   * A click toggles the page in or out of the selection, so pages accumulate
   * without a modifier: picking a set to rotate or move is the whole job here,
   * and replace-on-click would make anything past the first page a fight.
   * Shift extends from the last clicked page instead.
   */
  const selectPage = useCallback(
    (fileId: FileId, pageId: string, modifiers: PageClickModifiers) => {
      const trackPages = workspaceRef.current.tracks[fileId]?.pages ?? [];
      const anchor = anchorRef.current;

      // Shift only ranges within one track: a range across tracks has no
      // single ordering the user could predict.
      if (modifiers.shift && anchor && anchor.fileId === fileId) {
        const from = trackPages.findIndex((p) => p.id === anchor.pageId);
        const to = trackPages.findIndex((p) => p.id === pageId);
        if (from !== -1 && to !== -1) {
          const [start, end] = from <= to ? [from, to] : [to, from];
          const range = trackPages.slice(start, end + 1).map((p) => p.id);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            range.forEach((id) => next.add(id));
            return next;
          });
          // Anchor stays put so repeated shift-clicks re-extend from it.
          return;
        }
      }

      anchorRef.current = { fileId, pageId };
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(pageId)) next.delete(pageId);
        else next.add(pageId);
        return next;
      });
    },
    [],
  );

  const setSelection = useCallback((pageIds: string[]) => {
    setSelectedIds(new Set(pageIds));
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(livePageIds));
  }, [livePageIds]);

  const selectTrack = useCallback(
    (fileId: FileId) => {
      const trackPages = workspaceRef.current.tracks[fileId]?.pages ?? [];
      const ids = trackPages.map((p) => p.id);
      const allSelected =
        ids.length > 0 && ids.every((id) => selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
        return next;
      });
    },
    [selectedIds],
  );

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    anchorRef.current = null;
  }, []);

  const idsInTrack = useCallback(
    (fileId: FileId) =>
      (workspace.tracks[fileId]?.pages ?? [])
        .filter((page) => selectedIds.has(page.id))
        .map((page) => page.id),
    [workspace, selectedIds],
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    selectPage,
    setSelection,
    selectAll,
    selectTrack,
    clear,
    idsInTrack,
  };
}
