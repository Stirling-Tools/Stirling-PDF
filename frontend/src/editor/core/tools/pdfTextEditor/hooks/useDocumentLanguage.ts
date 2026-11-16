import { useCallback, useMemo } from "react";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import { SetDocumentLanguageCommand } from "@editor/tools/pdfTextEditor/commands/SetDocumentLanguageCommand";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";

/** The document's language and a way to change it. */
export interface DocumentLanguageControl {
  /** Null when the file names none, so a screen reader guesses. */
  language: string | null;
  /** False when the save cannot write it, as for an encrypted file. */
  editable: boolean;
  onSet: (lang: string | null) => void;
}

/** The open document's language control; null when accessibility editing is off or nothing is open. */
export function useDocumentLanguage(
  store: EditorStore,
  state: EditorViewState,
): DocumentLanguageControl | null {
  const onSet = useCallback(
    (lang: string | null) =>
      store.dispatch(new SetDocumentLanguageCommand({ lang })),
    [store],
  );
  const doc = store.document;
  return useMemo(
    () =>
      ACCESSIBILITY_EDITING && doc && state.hasDocument
        ? {
            language: state.documentLanguage,
            editable: doc.cannotSetDocumentLanguage() === null,
            onSet,
          }
        : null,
    [doc, state.hasDocument, state.documentLanguage, onSet],
  );
}
