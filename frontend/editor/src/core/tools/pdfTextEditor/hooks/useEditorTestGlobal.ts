import { useEffect } from "react";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";

const KEY = "__editor_store";

/** Expose the editor store on `window` for Playwright. */
export function useEditorTestGlobal(store: EditorStore): void {
  useEffect(() => {
    (window as unknown as Record<string, unknown>)[KEY] = store;
    return () => {
      delete (window as unknown as Record<string, unknown>)[KEY];
    };
  }, [store]);
}
