import { useEffect } from "react";
import { useNavigationActions } from "@app/contexts/NavigationContext";

// Guard unsaved edits on BOTH exit routes.
//
// `beforeunload` only covers a full-page unload (tab close / reload / external
// navigation). Switching tools inside the SPA never triggers it, so on its own
// this hook let the editor drop every edit silently. NavigationContext is the
// app's own in-app guard - it is what PageEditor uses - and it drives
// NavigationWarningModal.
export function useUnsavedChangesGuard(dirty: boolean): void {
  const { actions } = useNavigationActions();
  const setHasUnsavedChanges = actions.setHasUnsavedChanges;

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
    setHasUnsavedChanges(dirty);
    // Clear on unmount so a stale flag cannot block navigation after the
    // editor is gone.
    return () => setHasUnsavedChanges(false);
  }, [dirty, setHasUnsavedChanges]);
}
