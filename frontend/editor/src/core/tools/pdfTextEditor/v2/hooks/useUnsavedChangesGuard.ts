import { useEffect } from "react";

/**
 * Show the browser's native "unsaved changes" prompt while `dirty` is true.
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
