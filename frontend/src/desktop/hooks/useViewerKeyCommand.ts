import { useViewer } from "@app/contexts/ViewerContext";
import { useCallback } from "react";

export function useViewerKeyCommand(): (event: KeyboardEvent) => boolean {
  const { rotationActions } = useViewer();
  return useCallback(
    (event: KeyboardEvent): boolean => {
      switch (event.key) {
        case "r":
        case "R":
          event.preventDefault();
          if (event.shiftKey) {
            rotationActions.rotateBackward();
          } else {
            rotationActions.rotateForward();
          }
          return true;
      }
      return false;
    },
    [rotationActions],
  );
}
