import { useEffect } from "react";
import { useWorkbenchBar } from "@editor/contexts/WorkbenchBarContext";
import { WorkbenchViewFileActions } from "@editor/types/workbenchBar";

/** Registers a view's download and close for the bar while it is mounted.
 *  Pass a memoised object: a new one re-registers. */
export function useWorkbenchViewFileActions(actions: WorkbenchViewFileActions) {
  const { setViewFileActions } = useWorkbenchBar();
  useEffect(() => {
    setViewFileActions(actions);
    return () => setViewFileActions(null);
  }, [actions, setViewFileActions]);
}
