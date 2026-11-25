import { useEffect } from "react";
import type { FileId } from "@editor/types/file";
import { useEditorState } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  reviewMode,
  type ReviewModeState,
} from "@editor/tools/pdfTextEditor/store/reviewMode";
import { goToFix } from "@editor/tools/pdfTextEditor/util/reviewFix";
import { reviewLanguage } from "@editor/tools/pdfTextEditor/store/reviewLanguage";
import { tagAllPages } from "@editor/tools/pdfTextEditor/hooks/useBulkTagging";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";

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
  // goToFix falls back to the session's page reveal, registered after first commit.
  const session = useEditorSession();
  useEffect(() => {
    if (!startAt) return;
    if (startAt.fileId !== sourceFileId) {
      setActiveFileId(startAt.fileId);
      return;
    }
    const doc = store.document;
    if (!ready || !doc || !session) return;
    reviewMode.set({ startAt: null });
    if (startAt.autoTag) {
      void autoTag(store).then(() =>
        goToFix(store, startAt.pageIndex, startAt.target),
      );
    } else {
      void goToFix(store, startAt.pageIndex, startAt.target);
    }
  }, [startAt, sourceFileId, ready, session, store, setActiveFileId]);

  // A file that can't open leaves nothing to fix, and a request left pending
  // would pull the viewer back to it on the next file switch. Only this file's
  // load counts: an error still showing from the last file is not its failure.
  const waiting = !!startAt && startAt.fileId === sourceFileId;
  useEffect(() => {
    if (!waiting) return;
    let loadStarted = store.getState().loading;
    return store.subscribe((s) => {
      if (s.loading) loadStarted = true;
      else if (loadStarted && s.error) {
        reviewMode.set({ startAt: null });
        reviewLanguage.set({ requested: null });
      }
    });
  }, [waiting, store]);
}

/**
 * Tags every page, mirroring its progress into reviewMode: the editor's own
 * progress shows in its sidebar, which a review keeps hidden.
 */
async function autoTag(store: EditorStore): Promise<void> {
  reviewMode.set({ autoTagProgress: { current: 0, total: 1 } });
  const stop = store.subscribe(({ progress }) => {
    if (progress) {
      reviewMode.set({
        autoTagProgress: { current: progress.current, total: progress.total },
      });
    }
  });
  try {
    await tagAllPages(store);
  } finally {
    stop();
    reviewMode.set({ autoTagProgress: null });
  }
}
