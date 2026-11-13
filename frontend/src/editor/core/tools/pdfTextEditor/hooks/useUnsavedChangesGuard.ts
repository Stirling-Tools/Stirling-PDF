import { startTransition, useEffect, useLayoutEffect, useRef } from "react";
import {
  useNavigationActions,
  useNavigationState,
} from "@editor/contexts/NavigationContext";

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
  const { hasUnsavedChanges } = useNavigationState();
  const flagCaughtUpRef = useRef(false);

  useLayoutEffect(() => {
    if (!dirty) flagCaughtUpRef.current = false;
    else if (hasUnsavedChanges) flagCaughtUpRef.current = true;
  }, [dirty, hasUnsavedChanges]);

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
    // Only covers the pending flag: once it has landed, a discard clears it while the store stays dirty.
    registerUnsavedChangesChecker(() => isDirty() && !flagCaughtUpRef.current);
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
