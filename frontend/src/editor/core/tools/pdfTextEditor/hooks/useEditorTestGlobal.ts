import { useEffect } from "react";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { fontCompletionFor } from "@editor/tools/pdfTextEditor/util/documentFontCompletion";

const KEY = "__editor_store";
const FONT_COMPLETION_KEY = "__editor_font_completion";
/** Editors mounted now: one leaving as another mounts must not remove the global. */
let holders = 0;

/** Expose the editor store, and the face each document font is completed with, on `window` for Playwright. */
export function useEditorTestGlobal(store: EditorStore): void {
  useEffect(() => {
    holders += 1;
    const w = window as unknown as Record<string, unknown>;
    w[KEY] = store;
    w[FONT_COMPLETION_KEY] = fontCompletionFor;
    return () => {
      holders -= 1;
      if (holders === 0) {
        delete w[KEY];
        delete w[FONT_COMPLETION_KEY];
      }
    };
  }, [store]);
}
