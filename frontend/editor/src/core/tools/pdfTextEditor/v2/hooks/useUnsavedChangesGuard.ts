import { useEffect } from "react";

/**
 * Show the browser's native "unsaved changes" prompt on full-page unload
 * (tab close / reload / navigation away) while `dirty` is true. This only
 * covers beforeunload; client-side tool switches and workbench file replace
 * are React state changes and are guarded separately (see PageStage).
 * The message string is required by the spec but ignored by Chrome/Firefox.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
