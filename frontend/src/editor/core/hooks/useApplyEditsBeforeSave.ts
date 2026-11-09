import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { hasUnsavedWork } from "@editor/services/unsavedWork";

/**
 * Wraps a save so that, in the viewer, unapplied edits first become a version and
 * the app's copy matches what gets saved. Applies only when there are edits,
 * because every apply adds a version. Runs the latest `save`, not the one from
 * the render that started it.
 */
export function useApplyEditsBeforeSave(
  save: () => Promise<void> | void,
): () => Promise<void> {
  const { workbench } = useNavigationState();
  const { applyChanges } = useViewer();
  const saveRef = useRef(save);
  saveRef.current = save;
  const [savesQueued, setSavesQueued] = useState(0);
  const savesRun = useRef(0);

  // The applied version reaches the file selectors on the next render, so the
  // save runs from an effect rather than straight after the apply.
  useEffect(() => {
    if (savesQueued === savesRun.current) return;
    savesRun.current = savesQueued;
    void saveRef.current();
  }, [savesQueued]);

  return useCallback(async () => {
    if (workbench !== "viewer" || !hasUnsavedWork()) {
      await saveRef.current();
      return;
    }
    try {
      await applyChanges?.();
    } catch {
      return; // applyChanges has already told the user
    }
    setSavesQueued((count) => count + 1);
  }, [workbench, applyChanges]);
}
