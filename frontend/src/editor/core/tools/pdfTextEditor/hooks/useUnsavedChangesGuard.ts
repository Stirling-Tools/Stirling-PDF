import { startTransition, useEffect } from "react";
import { useNavigationActions } from "@editor/contexts/NavigationContext";

// Guard unsaved edits on BOTH exit routes.
//
// `beforeunload` only covers a full-page unload (tab close / reload / external
// navigation). Switching tools inside the SPA never triggers it, so on its own
// this hook let the editor drop every edit silently. NavigationContext is the
// app's own in-app guard - it is what PageEditor uses - and it drives
// NavigationWarningModal.
/** `isDirty` must read the live state: navigation calls it while the `dirty` flag may still be pending. */
export function useUnsavedChangesGuard(
  dirty: boolean,
  isDirty: () => boolean,
): void {
  const { actions } = useNavigationActions();
  const {
    setHasUnsavedChanges,
    registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker,
  } = actions;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    registerUnsavedChangesChecker(isDirty);
    return () => unregisterUnsavedChangesChecker();
  }, [isDirty, registerUnsavedChangesChecker, unregisterUnsavedChangesChecker]);

  useEffect(() => {
    // The flag re-renders most of the app; urgent, it holds the first typed letter off screen.
    startTransition(() => setHasUnsavedChanges(dirty));
    // Clear on unmount so a stale flag cannot block navigation after the
    // editor is gone.
    return () => setHasUnsavedChanges(false);
  }, [dirty, setHasUnsavedChanges]);
}
