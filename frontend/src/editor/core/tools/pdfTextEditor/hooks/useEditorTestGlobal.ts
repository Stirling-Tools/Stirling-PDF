import { useEffect } from "react";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

const KEY = "__editor_store";
/** Editors mounted now: one leaving as another mounts must not remove the global. */
let holders = 0;

/** Expose the editor store on `window` for Playwright. */
export function useEditorTestGlobal(store: EditorStore): void {
  useEffect(() => {
    holders += 1;
    (window as unknown as Record<string, unknown>)[KEY] = store;
    return () => {
      holders -= 1;
      if (holders === 0)
        delete (window as unknown as Record<string, unknown>)[KEY];
    };
  }, [store]);
}
