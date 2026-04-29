import { useEffect, useRef } from "react";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";

/**
 * Hook that automatically stops read-aloud when navigating away from the viewer.
 * Monitors: workbench changes and active file changes.
 */
export function useStopReadAloudOnNavigation(
  isReadingAloud: boolean,
  onStop: () => void,
) {
  const { workbench } = useNavigationState();
  const viewer = useViewer();

  const previousStateRef = useRef({
    workbench,
    activeFileIndex: viewer.activeFileIndex,
  });

  // Monitor workbench and file changes
  useEffect(() => {
    // Stop on workbench change
    if (isReadingAloud && previousStateRef.current.workbench !== workbench) {
      onStop();
      previousStateRef.current.workbench = workbench;
      return;
    }

    // Stop on active file change
    if (
      isReadingAloud &&
      previousStateRef.current.activeFileIndex !== viewer.activeFileIndex
    ) {
      onStop();
      previousStateRef.current.activeFileIndex = viewer.activeFileIndex;
      return;
    }

    previousStateRef.current.workbench = workbench;
    previousStateRef.current.activeFileIndex = viewer.activeFileIndex;
  }, [workbench, viewer.activeFileIndex, isReadingAloud, onStop]);

  // Stop on page unload (F5, navigation, close)
  useEffect(() => {
    if (!isReadingAloud) return;

    const handleBeforeUnload = () => {
      onStop();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isReadingAloud, onStop]);
}
