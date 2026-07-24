import { useEffect } from "react";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";

const KEY = "__v2_editor_store";

/**
 * Expose the editor store on `window` for Playwright. Mounted once per
 * `PdfTextEditorV2` instance and cleaned up on unmount.
 */
export function useEditorTestGlobal(store: EditorStore): void {
  useEffect(() => {
    (window as unknown as Record<string, unknown>)[KEY] = store;
    return () => {
      delete (window as unknown as Record<string, unknown>)[KEY];
    };
  }, [store]);
}
