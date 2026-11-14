import { useEffect } from "react";
import { useNavigationActions } from "@editor/contexts/NavigationContext";

// Guard unsaved edits on BOTH exit routes.
//
// `beforeunload` only covers a full-page unload (tab close / reload / external
// navigation). Switching tools inside the SPA never triggers it, so on its own
// this hook let the editor drop every edit silently. NavigationContext is the
// app's own in-app guard - it is what PageEditor uses - and it drives
// NavigationWarningModal.
//
// `onDiscard` runs when the user discards there. It must leave the editor clean:
// the guard then lets the navigation through, and an editor still dirty would
// ask again when it follows the move to another file. Pass null where a host
// registers the guard's handlers on the editor's behalf, as the viewer does:
// the guard holds one set, and the last to register wins.
export function useUnsavedChangesGuard(
  dirty: boolean,
  onDiscard: (() => void) | null,
): void {
  const { actions } = useNavigationActions();
  const {
    setHasUnsavedChanges,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
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
    setHasUnsavedChanges(dirty);
    // Clear on unmount so a stale flag cannot block navigation after the
    // editor is gone.
    return () => setHasUnsavedChanges(false);
  }, [dirty, setHasUnsavedChanges]);

  // Save is not offered there: a save can stop at its risk prompt, and the
  // guard would navigate on regardless.
  useEffect(() => {
    if (!onDiscard) return;
    registerNavigationWarningHandlers({
      onDiscardAndContinue: async () => onDiscard(),
    });
    return () => unregisterNavigationWarningHandlers();
  }, [
    onDiscard,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  ]);
}
