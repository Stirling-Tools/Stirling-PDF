import { useEffect } from 'react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { DEFAULT_DOCUMENT_ID } from '@app/components/viewer/viewerConstants';

export function ScrollAPIBridge() {
  const { provides: scroll, state: scrollState } = useScroll(DEFAULT_DOCUMENT_ID);
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
