import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useFileState } from "@app/contexts/FileContext";
import { FileId } from "@app/types/file";
import { PageSize, TrackSource } from "@app/components/pageTracks/types";
import { ProcessedFilePage } from "@app/types/fileContext";
import { isPdfFile } from "@app/utils/fileUtils";
import { isPageImage } from "@app/components/pageTracks/trackFileKind";
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
  /** Open files the page editor can't edit (neither PDFs nor images); shown as disabled tracks. */
  unsupportedFileIds: FileId[];
  /** True when any open file can be expanded into a track (drives the empty state). */
  hasEditableFiles: boolean;
  changedFileIds: FileId[];
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/** PDFium reports the size as displayed, after the page's /Rotate. */
function unrotatedSize(page: ProcessedFilePage): PageSize {
  const width = page.width ?? 0;
  const height = page.height ?? 0;
  const quarterTurn = (page.rotation ?? 0) % 180 !== 0;
  return quarterTurn ? { width: height, height: width } : { width, height };
}

export function useTrackWorkspace(): TrackWorkspaceHook {
  const { state: fileState } = useFileState();
  const [state, dispatch] = useReducer(
    trackEditorReducer,
    initialTrackEditorState,
  );

  // Only files whose page metadata has been hydrated can be expanded into a
  // track: the per-page /Rotate baseline comes from it, and assuming 0 would
  // silently un-rotate pre-rotated pages on save.
  const { sources, pendingFileIds, unsupportedFileIds, hasEditableFiles } =
    useMemo(() => {
      const resolved: TrackSource[] = [];
      const pending: FileId[] = [];
      const unsupported: FileId[] = [];
      let anyEditable = false;

      for (const fileId of fileState.files.ids) {
        const stub = fileState.files.byId[fileId];
        if (!stub) {
          unsupported.push(fileId);
          continue;
        }
        const contentKey = `${stub.size}:${stub.lastModified}`;
        // An image has no metadata to wait for: it is one unrotated page whose
        // size is only known once decoded, which happens on save.
        if (isPageImage(stub)) {
          anyEditable = true;
          resolved.push({
            fileId,
            name: stub.name,
            pageCount: 1,
            rotations: [0],
            sizes: [{ width: 0, height: 0 }],
            contentKey,
          });
          continue;
        }
        // Other open files show as disabled tracks so they are visible but
        // clearly not editable here.
        if (!isPdfFile(stub)) {
          unsupported.push(fileId);
          continue;
        }
        anyEditable = true;

        const pages = stub.processedFile?.pages;
        if (!pages || pages.length === 0) {
          pending.push(fileId);
          continue;
        }

        resolved.push({
          fileId,
          name: stub.name,
          pageCount: pages.length,
          rotations: pages.map((page) => page.rotation ?? 0),
          sizes: pages.map(unrotatedSize),
          contentKey,
        });
      }

      return {
        sources: resolved,
        pendingFileIds: pending,
        unsupportedFileIds: unsupported,
        hasEditableFiles: anyEditable,
      };
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
    unsupportedFileIds,
    hasEditableFiles,
    changedFileIds,
    isDirty: changedFileIds.length > 0,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
