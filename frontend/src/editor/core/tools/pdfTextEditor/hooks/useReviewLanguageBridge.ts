import { useEffect } from "react";
import type { FileId } from "@editor/types/file";
import { useDocumentLanguage } from "@editor/tools/pdfTextEditor/hooks/useDocumentLanguage";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import { reviewLanguage } from "@editor/tools/pdfTextEditor/store/reviewLanguage";
import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";

/**
 * While reviewing, publishes the open file's language for the report, and applies a
 * language the report picked for that file once its document is open, saving it.
 */
export function useReviewLanguageBridge(
  store: EditorStore,
  state: EditorViewState,
  sourceFileId: FileId | null,
  reviewing: boolean,
): void {
  const control = useDocumentLanguage(store, state);
  const ready = reviewing && !state.loading && control !== null;

  useEffect(() => {
    if (!ready || !sourceFileId || !control) return;
    const sync = () => {
      const { requested, open } = reviewLanguage.get();
      if (requested?.fileId === sourceFileId) {
        reviewLanguage.set({ requested: null });
        if (control.editable && requested.language !== control.language) {
          // The dispatch changes the control, and this effect runs again with it.
          control.onSet(requested.language);
          currentEditorSession()?.autosave();
          return;
        }
      }
      if (
        open?.fileId !== sourceFileId ||
        open.language !== control.language ||
        open.editable !== control.editable
      ) {
        reviewLanguage.set({
          open: {
            fileId: sourceFileId,
            language: control.language,
            editable: control.editable,
          },
        });
      }
    };
    sync();
    const unsubscribe = reviewLanguage.subscribe(sync);
    return () => {
      unsubscribe();
      if (reviewLanguage.get().open?.fileId === sourceFileId) {
        reviewLanguage.set({ open: null });
      }
    };
  }, [ready, sourceFileId, control]);
}
