import { useEffect } from 'react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * ScrollAPIBridge manages scroll state and exposes scroll actions.
 * Registers with ViewerContext to provide scroll functionality to UI components.
 */
export function ScrollAPIBridge() {
  const { provides: scroll, state: scrollState } = useScroll();
  const { registerBridge, triggerImmediateScrollUpdate } = useViewer();

  useEffect(() => {
    if (scroll && scrollState) {
      const newState = {
        currentPage: scrollState.currentPage,
        totalPages: scrollState.totalPages,
      };
      
      // Trigger immediate update for responsive UI
      triggerImmediateScrollUpdate(newState.currentPage, newState.totalPages);

      registerBridge('scroll', {
        state: newState,
        api: scroll
      });
    }
  }, [scroll, scrollState]);

  return null;
}
