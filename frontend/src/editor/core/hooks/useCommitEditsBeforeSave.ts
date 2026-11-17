import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { hasUnsavedWork } from "@editor/services/unsavedWork";

/**
 * Wraps a save so the open editor's uncommitted edits (viewer annotations, page
 * edits, form values) first become a version, and the saved file is the one the
 * app holds. Commits through the navigation prompt's apply handler, and only when
 * there are edits, because every commit adds a version. With `commitEdits` false
 * it saves straight away. Runs the latest `save`, not the one from the render
 * that started it.
 */
export function useCommitEditsBeforeSave(
  save: () => Promise<void> | void,
  { commitEdits = true }: { commitEdits?: boolean } = {},
): () => Promise<void> {
  const {
    actions: { navigationWarningHandlersRef },
  } = useNavigationActions();
  const saveRef = useRef(save);
  saveRef.current = save;
  const [savesQueued, setSavesQueued] = useState(0);
  const savesRun = useRef(0);

  // The committed version reaches the file selectors on the next render, so the
  // save runs from an effect rather than straight after the commit.
  useEffect(() => {
    if (savesQueued === savesRun.current) return;
    savesRun.current = savesQueued;
    void saveRef.current();
  }, [savesQueued]);

  return useCallback(async () => {
    const commit = navigationWarningHandlersRef.current?.onApplyAndContinue;
    if (!commitEdits || !commit || !hasUnsavedWork()) {
      await saveRef.current();
      return;
    }
    try {
      await commit();
    } catch {
      return; // the editor has already told the user
    }
    setSavesQueued((count) => count + 1);
  }, [commitEdits, navigationWarningHandlersRef]);
}
