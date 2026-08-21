import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useFileState } from "@app/contexts/FileContext";
import { FileId } from "@app/types/file";
import { TrackSource } from "@app/components/pageTracks/types";
import {
  changedTrackIds,
  initialTrackEditorState,
  TrackEditorAction,
  TrackEditorState,
  trackEditorReducer,
} from "@app/components/pageTracks/trackWorkspaceReducer";

export interface TrackWorkspaceHook {
  state: TrackEditorState;
  dispatch: (action: TrackEditorAction) => void;
  /** PDFs that are open but whose page metadata hasn't been read yet. */
  pendingFileIds: FileId[];
  /** True when any open file is a PDF (drives the empty state). */
  hasPdfFiles: boolean;
  changedFileIds: FileId[];
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const isPdf = (name: string | undefined): boolean =>
  name?.toLowerCase().endsWith(".pdf") ?? false;

export function useTrackWorkspace(): TrackWorkspaceHook {
  const { state: fileState } = useFileState();
  const [state, dispatch] = useReducer(
    trackEditorReducer,
    initialTrackEditorState,
  );

  // Only files whose page metadata has been hydrated can be expanded into a
  // track: the per-page /Rotate baseline comes from it, and assuming 0 would
  // silently un-rotate pre-rotated pages on save.
  const { sources, pendingFileIds, hasPdfFiles } = useMemo(() => {
    const resolved: TrackSource[] = [];
    const pending: FileId[] = [];
    let anyPdf = false;

    for (const fileId of fileState.files.ids) {
      const stub = fileState.files.byId[fileId];
      if (!isPdf(stub?.name)) continue;
      anyPdf = true;

      const pages = stub?.processedFile?.pages;
      if (!pages || pages.length === 0) {
        pending.push(fileId);
        continue;
      }

      resolved.push({
        fileId,
        pageCount: pages.length,
        rotations: pages.map((page) => page.rotation ?? 0),
      });
    }

    return { sources: resolved, pendingFileIds: pending, hasPdfFiles: anyPdf };
  }, [fileState.files]);

  useEffect(() => {
    dispatch({ type: "sync", sources });
  }, [sources]);

  const changedFileIds = useMemo(() => changedTrackIds(state), [state]);

  const stableDispatch = useCallback(
    (action: TrackEditorAction) => dispatch(action),
    [],
  );

  return {
    state,
    dispatch: stableDispatch,
    pendingFileIds,
    hasPdfFiles,
    changedFileIds,
    isDirty: changedFileIds.length > 0,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
