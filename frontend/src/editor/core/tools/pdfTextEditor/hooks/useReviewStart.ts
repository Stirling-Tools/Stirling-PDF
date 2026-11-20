import { useEffect } from "react";
import type { FileId } from "@editor/types/file";
import { useEditorState } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  reviewMode,
  type ReviewModeState,
} from "@editor/tools/pdfTextEditor/store/reviewMode";
import { goToFix } from "@editor/tools/pdfTextEditor/util/reviewFix";

interface Options {
  store: EditorStore;
  startAt: ReviewModeState["startAt"];
  sourceFileId: FileId | null;
  setActiveFileId: (fileId: FileId) => void;
}

/**
 * Opens a review where the accessibility report pointed: the file first, by
 * moving the viewer to it, then the fix it asked for (goToFix).
 */
export function useReviewStart({
  store,
  startAt,
  sourceFileId,
  setActiveFileId,
}: Options): void {
  // Not while a file switch is still settling: the store can report a
  // document before it has its pages, which hold no runs or tags until read.
  const ready = useEditorState(
    store,
    (s) => s.hasDocument && !s.loading && s.pages.length > 0,
  );
  useEffect(() => {
    if (!startAt) return;
    if (startAt.fileId !== sourceFileId) {
      setActiveFileId(startAt.fileId);
      return;
    }
    const doc = store.document;
    if (!ready || !doc) return;
    reviewMode.set({ startAt: null });
    goToFix(store, startAt.pageIndex, startAt.target);
  }, [startAt, sourceFileId, ready, store, setActiveFileId]);
}
